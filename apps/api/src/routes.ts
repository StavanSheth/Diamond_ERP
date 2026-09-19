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
import { profileMiddleware, optionalProfileMiddleware } from './middleware/profile';
import { idempotencyMiddleware } from './middleware/idempotency';
import { lifecycleReadyMiddleware } from './middleware/lifecycle-ready';

/**
 * Route aggregator — registers all application routes.
 * 
 * Security architecture:
 *   - /health, /api/auth, and /api/system (bootstrap/public probes) are handled at route level
 *   - All other /api/* routes run through `protectedStack` [lifecycleReadyMiddleware, authenticate, profileMiddleware, idempotencyMiddleware]:
 *       1. Enforce lifecycle READY state before business access
 *       2. Authenticate user via JWT & session check
 *       3. Verify requested X-Profile-Id against user's authorized profile memberships (reject 403)
 *       4. Establish canonical profile DB context
 *       5. Support Idempotency-Key header on mutating requests
 *       6. Individual routes enforce RBAC via authorize()
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

  // ── System & Lifecycle routes (handles public bootstrap and protected admin internally) ──
  router.use('/api/system', systemRoutes);

  // ── Protected routes requiring explicit profile context & READY lifecycle ───────────────
  const protectedStack = [lifecycleReadyMiddleware, authenticate, profileMiddleware, idempotencyMiddleware];

  router.use('/api/stocks', protectedStack, createStockRouter(stockController));
  router.use('/api/dashboard', protectedStack, createDashboardRouter(dashboardController));
  router.use('/api/ledger', protectedStack, createLedgerRouter(ledgerController));
  router.use('/api/certificates', protectedStack, createCertificateRouter(certificateController));
  router.use('/api/parties', protectedStack, createPartyRouter(partyController));
  router.use('/api/repairs', protectedStack, createRepairRouter(repairController));
  router.use('/api/diamonds', protectedStack, diamondRouter);
  router.use('/api/reports', protectedStack, reportsRoutes);

  // ── Protected routes with optional profile context ──────────────────
  // Settings includes profile listing/switching; handles profile context internally when needed.
  const adminStack = [authenticate, optionalProfileMiddleware, idempotencyMiddleware];

  router.use('/api/settings', adminStack, createSettingsRouter(settingsController));

  return router;
}
