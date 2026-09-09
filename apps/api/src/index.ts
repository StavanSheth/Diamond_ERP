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
import { authenticate } from './middleware/auth';
import { authService, validateAuthConfig } from './modules/auth/auth.service';
import prisma from './infrastructure/database/prisma';

/**
 * Bootstrap and start the application.
 */
async function bootstrap(): Promise<void> {
  logger.info('Starting DiamondERP V3.0 Backend...');

  // 1. Validate configuration (including auth secrets)
  validateConfig();
  try {
    validateAuthConfig();
  } catch (err) {
    if (err instanceof Error) {
      logger.error(err.message);
    }
    logger.warn(
      'JWT_SECRET not set. Authentication will not work. ' +
      'Set JWT_SECRET in your .env file for production use.'
    );
  }
  logger.info(`Port: ${config.port} | Retry: ${config.retry.maxAttempts} attempts, ${config.retry.baseDelayMs}ms base delay`);

  // 2. Database connection check
  try {
    await prisma.$connect();
    logger.info('Connected to SQLite database via Prisma');
  } catch (err) {
    logger.error('Failed to connect to database', undefined, err);
  }

  // 3. Seed default admin user if needed
  try {
    await authService.seedDefaultAdmin();
  } catch (err) {
    logger.warn('Failed to seed default admin (this is OK on first run if User table does not exist yet)');
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

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled to avoid breaking the frontend
    crossOriginEmbedderPolicy: false,
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(performanceMiddleware);
  
  // Phase 19: Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // limit each IP to 300 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests from this IP, please try again after 15 minutes' }
  });
  app.use('/api/', apiLimiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 20 auth requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many login attempts, please try again later' }
  });
  app.use('/api/auth/', authLimiter);
  
  // Uploads directory setup (certificates, etc.)
  const uploadsDir = path.join(__dirname, '../uploads');
  const certsDir = path.join(uploadsDir, 'certs');
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  // ⚠️ SECURITY FIX: Removed public static file serving for /uploads
  // Certificates are now served through authenticated API endpoint:
  //   GET /api/certificates/:id/file
  // This prevents unauthorized access to sensitive certificate documents.
  // 
  // Previously: app.use('/uploads', express.static(uploadsDir));
  
  // Authenticated file access for uploads
  app.use('/uploads', authenticate, express.static(uploadsDir));

  // 7. Swagger UI (only in development)
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  }

  // 8. Register routes (auth is handled per-route in createRoutes)
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
    ),
  );

  // 9. Error handler (must be last)
  app.use(errorHandler);

  // 10. Start listening
  const server = app.listen(config.port, () => {
    logger.info(`✅ DiamondERP V3.0 Backend running on http://localhost:${config.port}`);
    logger.info(`🔐 Authentication: ${process.env.JWT_SECRET ? 'ENABLED' : 'DISABLED (set JWT_SECRET)'}`);
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`📖 API docs at http://localhost:${config.port}/api-docs`);
    }
    logger.info(`❤️  Health check at http://localhost:${config.port}/health`);
  });

  // 11. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    
    server.close(async () => {
      logger.info('HTTP server closed');
      
      try {
        await prisma.$disconnect();
        logger.info('Database disconnected');
      } catch (err) {
        logger.error('Error disconnecting database', undefined, err);
      }

      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
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
