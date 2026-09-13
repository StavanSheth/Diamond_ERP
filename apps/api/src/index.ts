import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { swaggerSpec } from './config/swagger.config';

import { config, validateConfig } from './config';
import { fileStorageService } from './infrastructure/storage/file-storage.service';
import { ensureAllDataDirs, getWebDistDir } from './infrastructure/paths';
import { logger } from './infrastructure/logging';
import { StockController } from './modules/stocks/stock.controller';
import { HealthController } from './modules/system/health.controller';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { LedgerController } from './modules/ledger/ledger.controller';
import { CertificateController } from './modules/certificates/certificate.controller';
import { PartyController } from './modules/parties/party.controller';
import { RepairController } from './modules/repairs/repair.controller';
import { SettingsController } from './modules/settings/settings.controller';
import { createRoutes } from './routes';
import { requestIdMiddleware } from './middleware/request-id';
import { performanceMiddleware } from './middleware/performance';
import { errorHandler } from './middleware/error-handler';
import { corsMiddleware } from './middleware/cors';
import { enforceContentType } from './middleware/content-type';
import { authService, validateAuthConfig } from './modules/auth/auth.service';
import prisma, { systemPrisma, disconnectAllClients } from './infrastructure/database/prisma';

/**
 * Bootstrap and start the application.
 */
async function bootstrap(): Promise<void> {
  logger.info('Starting DiamondERP V3.0 Backend...');

  // 1. Fail fast on missing or insecure production configuration
  try {
    validateConfig();
    validateAuthConfig();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('FATAL: Startup configuration validation failed in production', undefined, err);
      process.exit(1);
    } else {
      logger.warn('Non-production configuration warning: ' + (err as Error).message);
    }
  }

  logger.info(`Port: ${config.port} | Retry: ${config.retry.maxAttempts} attempts, ${config.retry.baseDelayMs}ms base delay`);

  // 2. Database connection check - MUST fail fast if database is unreachable (Finding 57)
  try {
    await prisma.$connect();
    logger.info('Connected to SQLite database via Prisma');
  } catch (err) {
    logger.error('FATAL: Failed to connect to database during bootstrap', undefined, err);
    process.exit(1);
  }

  // 3. Seed default admin user and default profile if database is uninitialized (Finding 58)
  // Controlled by environment / non-production to avoid unexpected state mutation in production
  if (process.env.AUTO_SEED_DEFAULT_ADMIN === 'true' || process.env.NODE_ENV !== 'production') {
    try {
      await authService.seedDefaultAdmin();
    } catch (err) {
      logger.warn(`Failed to seed default admin: ${err}`);
    }
  } else {
    logger.info('Auto-seeding default admin is disabled in production.');
  }

  // 4. Controllers
  const stockController = new StockController();
  const healthController = new HealthController();
  const dashboardController = new DashboardController();
  const ledgerController = new LedgerController();
  const certificateController = new CertificateController();
  const partyController = new PartyController();
  const repairController = new RepairController();
  const settingsController = new SettingsController();

  // 5. Create Express app
  const app = express();

  // 6. Register middleware (order matters)
  app.use(requestIdMiddleware);
  app.use(corsMiddleware);
  app.use('/api', enforceContentType);

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      frameguard: { action: 'deny' },
      noSniff: true,
      xssFilter: true,
      hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(performanceMiddleware);

  // ── Layered Rate Limiting ──────────────────────────────────────────────
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 600, // Reasonable ERP limit
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again after 15 minutes' },
  });
  app.use('/api/', apiLimiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30, // 30 login attempts per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many login attempts, please try again later' },
  });
  app.use('/api/auth/login', authLimiter);

  const bootstrapLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Strict 5 requests per 15 min for bootstrap
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many bootstrap attempts, access temporarily suspended' },
  });
  app.use('/api/auth/bootstrap', bootstrapLimiter);

  const factoryResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many factory reset attempts' },
  });
  app.use('/api/settings/factory-reset', factoryResetLimiter);

  // Mutable directories setup — ensures databases, uploads, backups, logs, config exist
  ensureAllDataDirs();
  fileStorageService.ensureUploadsDir();

  // 7. Swagger UI (only in development)
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  }

  // 8. Register routes
  app.use(
    '/',
    createRoutes(
      stockController,
      healthController,
      dashboardController,
      ledgerController,
      certificateController,
      partyController,
      repairController,
      settingsController
    )
  );

  // 9. Graceful shutdown handler & desktop lifecycle management
  let server: ReturnType<typeof app.listen>;
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);

    if (server) {
      server.close(async () => {
        logger.info('HTTP server stopped accepting new requests.');

        try {
          await systemPrisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
          logger.info('SQLite WAL checkpoint (TRUNCATE) completed successfully.');
        } catch (walErr) {
          logger.warn('Warning: Could not flush SQLite WAL during shutdown: ' + String(walErr));
        }

        try {
          await disconnectAllClients();
          logger.info('All database clients cleanly disconnected.');
        } catch (err) {
          logger.error('Error disconnecting database clients', undefined, err);
        }

        process.exit(0);
      });
    } else {
      process.exit(0);
    }

    // Force exit after 10 seconds if hanging
    setTimeout(() => {
      logger.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  // Loopback-only graceful shutdown endpoint for desktop launcher
  app.post('/api/system/shutdown', (req, res) => {
    const remoteIp = req.socket.remoteAddress;
    const isLoopback = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
    if (isLoopback) {
      res.json({ success: true, message: 'Server shutting down gracefully.' });
      setTimeout(() => shutdown('HTTP_SHUTDOWN'), 50);
    } else {
      res.status(403).json({ success: false, error: 'Shutdown endpoint restricted to local loopback.' });
    }
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Stdin EOF listener for parent process crash/termination safety when spawned by desktop launcher
  if (process.env.NODE_ENV === 'production' && process.env.DIAMOND_DESKTOP_PARENT_PID && !process.stdin.isTTY) {
    process.stdin.on('end', () => shutdown('STDIN_CLOSED'));
    process.stdin.resume();
  }

  // 10. API 404 Guard — Ensure unmatched API calls return JSON error, never falling through to SPA HTML
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
  });

  // 11. Production Static Frontend Serving & SPA Fallback
  const webDistDir = getWebDistDir();
  if (webDistDir) {
    logger.info(`Serving production web UI from: ${webDistDir}`);
    app.use(
      express.static(webDistDir, {
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.includes('/assets/') || filePath.includes('\\assets\\')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );

    // SPA fallback: any non-API, non-health GET returns index.html
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/api-docs')) {
        return next();
      }
      res.sendFile(path.join(webDistDir, 'index.html'));
    });
  }

  // 12. Error handler (must be last)
  app.use(errorHandler);

  // 13. Start listening (strictly on local loopback by default to prevent LAN exposure)
  const host = config.host || '127.0.0.1';
  server = app.listen(config.port, host, () => {
    logger.info(`✅ DiamondERP V3.0 Backend running on http://${host}:${config.port}`);
    logger.info(`🔐 Authentication: ${process.env.JWT_SECRET ? 'ENABLED' : 'DESKTOP SECURE MODE'}`);
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`📖 API docs at http://${host}:${config.port}/api-docs`);
    }
    logger.info(`❤️  Health check at http://${host}:${config.port}/health`);
  });
}

bootstrap().catch((error) => {
  logger.error('Fatal: Failed to start server', undefined, error);
  process.exit(1);
});
