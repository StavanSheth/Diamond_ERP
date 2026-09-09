import express from 'express';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.config';

import { config, validateConfig } from './config';
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
import { profileMiddleware } from './middleware/profile';
import { authService, validateAuthConfig } from './modules/auth/auth.service';
import prisma, { disconnectAllClients } from './infrastructure/database/prisma';

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

  // 2. Database connection check
  try {
    await prisma.$connect();
    logger.info('Connected to SQLite database via Prisma');
  } catch (err) {
    logger.error('Failed to connect to database', undefined, err);
  }

  // 3. Seed default admin user and default profile if database is uninitialized
  try {
    await authService.seedDefaultAdmin();
  } catch (err) {
    logger.warn(`Failed to seed default admin: ${err}`);
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
  app.use(profileMiddleware);

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
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

  // Uploads directory setup (certificates, etc.)
  const uploadsDir = path.join(__dirname, '../uploads');
  const certsDir = path.join(uploadsDir, 'certs');
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

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

  // 9. Error handler (must be last)
  app.use(errorHandler);

  // 10. Start listening
  const server = app.listen(config.port, () => {
    logger.info(`✅ DiamondERP V3.0 Backend running on http://localhost:${config.port}`);
    logger.info(`🔐 Authentication: ${process.env.JWT_SECRET ? 'ENABLED' : 'DEVELOPMENT MODE'}`);
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`📖 API docs at http://localhost:${config.port}/api-docs`);
    }
    logger.info(`❤️  Health check at http://localhost:${config.port}/health`);
  });

  // 11. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);

    server.close(async () => {
      logger.info('HTTP server stopped accepting new requests.');

      try {
        await disconnectAllClients();
        logger.info('All database clients cleanly disconnected.');
      } catch (err) {
        logger.error('Error disconnecting database clients', undefined, err);
      }

      process.exit(0);
    });

    // Force exit after 10 seconds if hanging
    setTimeout(() => {
      logger.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  logger.error('Fatal: Failed to start server', undefined, error);
  process.exit(1);
});
