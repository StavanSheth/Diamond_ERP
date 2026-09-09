import { Router } from 'express';
import { StockController } from './modules/stocks/stock.controller';
import { HealthController } from './modules/system/health.controller';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { LedgerController } from './modules/ledger/ledger.controller';
import { CertificateController } from './modules/certificates/certificate.controller';
import { PartyController } from './modules/parties/party.controller';
import { RepairController } from './modules/repairs/repair.controller';
import { SettingsController } from './modules/settings/settings.controller';
import { createStockRouter } from './modules/stocks/stock.routes';
import { createHealthRouter } from './modules/system/health.routes';
import { createDashboardRouter } from './modules/dashboard/dashboard.routes';
import { createLedgerRouter } from './modules/ledger/ledger.routes';
import { createCertificateRouter } from './modules/certificates/certificate.routes';
import { createPartyRouter } from './modules/parties/party.routes';
import { createRepairRouter } from './modules/repairs/repair.routes';
import { createSettingsRouter } from './modules/settings/settings.routes';
import { createAuthRouter } from './modules/auth/auth.routes';
import diamondRouter from './modules/diamonds/diamond.routes';
import reportsRoutes from './modules/reports/reports.routes';
import systemRoutes from './modules/system/system.routes';
import { authenticate } from './middleware/auth';

/**
 * Route aggregator — registers all application routes.
 * 
 * Security architecture:
 *   - /health and /api/auth/login are PUBLIC (no auth required)
 *   - All other /api/* routes require authentication via JWT Bearer token
 *   - Individual routes further enforce RBAC permissions via authorize() middleware
 */
export function createRoutes(
  stockController: StockController,
  healthController: HealthController,
  dashboardController: DashboardController,
  ledgerController: LedgerController,
  certificateController: CertificateController,
  partyController: PartyController,
  repairController: RepairController,
  settingsController: SettingsController
): Router {
  const router = Router();

  // ── Public routes (no authentication) ────────────────────────────────
  router.use('/health', createHealthRouter(healthController));
  router.use('/api/auth', createAuthRouter());

  // ── Protected routes (authentication required) ───────────────────────
  // All routes below require a valid JWT Bearer token.
  router.use('/api/stocks', authenticate, createStockRouter(stockController));
  router.use('/api/dashboard', authenticate, createDashboardRouter(dashboardController));
  router.use('/api/ledger', authenticate, createLedgerRouter(ledgerController));
  router.use('/api/certificates', authenticate, createCertificateRouter(certificateController));
  router.use('/api/parties', authenticate, createPartyRouter(partyController));
  router.use('/api/repairs', authenticate, createRepairRouter(repairController));
  router.use('/api/settings', authenticate, createSettingsRouter(settingsController));
  router.use('/api/diamonds', authenticate, diamondRouter);
  router.use('/api/reports', authenticate, reportsRoutes);
  router.use('/api/system', authenticate, systemRoutes);

  return router;
}
