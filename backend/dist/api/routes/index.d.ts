import { Router } from 'express';
import { StockController } from '../controllers/stock.controller';
import { HealthController } from '../controllers/health.controller';
import { DashboardController } from '../controllers/dashboard.controller';
import { LedgerController } from '../controllers/ledger.controller';
import { CertificateController } from '../controllers/certificate.controller';
import { PartyController } from '../controllers/party.controller';
import { RepairController } from '../controllers/repair.controller';
import { SettingsController } from '../controllers/settings.controller';
import { DraftController } from '../controllers/draft.controller';
import { VersionController } from '../controllers/version.controller';
/**
 * Route aggregator — registers all application routes.
 */
export declare function createRoutes(stockController: StockController, healthController: HealthController, dashboardController: DashboardController, ledgerController: LedgerController, certificateController: CertificateController, partyController: PartyController, repairController: RepairController, settingsController: SettingsController, draftController: DraftController, versionController: VersionController): Router;
//# sourceMappingURL=index.d.ts.map