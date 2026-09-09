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
import { profileMiddleware } from './middleware/profile';
import { idempotencyMiddleware } from './middleware/idempotency';

/**
 * Route aggregator — registers all application routes.
 * 
 * Security architecture:
 *   - /health (with /liveness and /readiness) and /api/auth (login, bootstrap) are PUBLIC
 *   - All other /api/* routes run through `protectedStack` [authenticate, profileMiddleware, idempotencyMiddleware]:
 *       1. Authenticate user via JWT & session check
 *       2. Verify requested X-Profile-Id against user's authorized profile memberships (reject 403)
 *       3. Establish canonical profile DB context
 *       4. Support Idempotency-Key header on mutating requests
 *       5. Individual routes enforce RBAC via authorize()
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

  // ── Protected routes (Authentication + Profile Authorization + Idempotency) ───
  const protectedStack = [authenticate, profileMiddleware, idempotencyMiddleware];

  router.use('/api/stocks', protectedStack, createStockRouter(stockController));
  router.use('/api/dashboard', protectedStack, createDashboardRouter(dashboardController));
  router.use('/api/ledger', protectedStack, createLedgerRouter(ledgerController));
  router.use('/api/certificates', protectedStack, createCertificateRouter(certificateController));
  router.use('/api/parties', protectedStack, createPartyRouter(partyController));
  router.use('/api/repairs', protectedStack, createRepairRouter(repairController));
  router.use('/api/settings', protectedStack, createSettingsRouter(settingsController));
  router.use('/api/diamonds', protectedStack, diamondRouter);
  router.use('/api/reports', protectedStack, reportsRoutes);
  router.use('/api/system', protectedStack, systemRoutes);

  return router;
}
