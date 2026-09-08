import express from 'express';
import path from 'path';
import fs from 'fs';
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
import prisma from './infrastructure/database/prisma';

/**
 * Bootstrap and start the application.
 */
async function bootstrap(): Promise<void> {
  logger.info('Starting DiamondERP V3.0 Backend...');

  // 1. Validate configuration
  validateConfig();
  logger.info(`Port: ${config.port} | Retry: ${config.retry.maxAttempts} attempts, ${config.retry.baseDelayMs}ms base delay`);

  // 2. Database connection check
  try {
    await prisma.$connect();
    logger.info('Connected to SQLite database via Prisma');
  } catch (err) {
    logger.error('Failed to connect to database', undefined, err);
  }

  // 3. Controllers
  const stockController = new StockController();
  const healthController = new HealthController();
  const dashboardController = new DashboardController();
  const ledgerController = new LedgerController();
  const certificateController = new CertificateController();
  const partyController = new PartyController();
  const repairController = new RepairController();
  const settingsController = new SettingsController();

  // 4. Create Express app
  const app = express();

  // 5. Register middleware (order matters)
  app.use(requestIdMiddleware);
  app.use(corsMiddleware);
  app.use(express.json());
  app.use(performanceMiddleware);
  
  // Serve uploads statically
  const uploadsDir = path.join(__dirname, '../uploads');
  const certsDir = path.join(uploadsDir, 'certs');
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // 6. Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // 7. Register routes
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

  // 8. Error handler (must be last)
  app.use(errorHandler);

  // 9. Start listening
  app.listen(config.port, () => {
    logger.info(`✅ DiamondERP V3.0 Backend running on http://localhost:${config.port}`);
    logger.info(`📖 API docs at http://localhost:${config.port}/api-docs`);
    logger.info(`❤️  Health check at http://localhost:${config.port}/health`);
    logger.info(`💎 Stocks API at http://localhost:${config.port}/api/stocks`);
    logger.info(`📊 Dashboard API at http://localhost:${config.port}/api/dashboard`);
    logger.info(`📒 Ledger API at http://localhost:${config.port}/api/ledger`);
    logger.info(`📝 Drafts API at http://localhost:${config.port}/api/drafts`);
    logger.info(`🕐 Versions API at http://localhost:${config.port}/api/versions`);
  });
}

bootstrap().catch((error) => {
  logger.error('Fatal: Failed to start server', undefined, error);
  process.exit(1);
});
