import { Router } from 'express';
import { StockController } from './modules/stocks/stock.controller';
import { HealthController } from './modules/system/health.controller';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { LedgerController } from './modules/ledger/ledger.controller';
import { CertificateController } from './modules/certificates/certificate.controller';
import { PartyController } from './modules/parties/party.controller';
import { RepairController } from './modules/repairs/repair.controller';
import { SettingsController } from './modules/settings/settings.controller';
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
 */
export declare function createRoutes(stockController: StockController, healthController: HealthController, dashboardController: DashboardController, ledgerController: LedgerController, certificateController: CertificateController, partyController: PartyController, repairController: RepairController, settingsController: SettingsController): Router;
//# sourceMappingURL=routes.d.ts.map