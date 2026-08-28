import { Router } from 'express';
import { StockController } from '../controllers/stock.controller';
import { HealthController } from '../controllers/health.controller';
import { DashboardController } from '../controllers/dashboard.controller';
import { LedgerController } from '../controllers/ledger.controller';
import { createStockRouter } from './stock.routes';
import { createHealthRouter } from './health.routes';
import { createDashboardRouter } from './dashboard.routes';
import { createLedgerRouter } from './ledger.routes';
import { CertificateController } from '../controllers/certificate.controller';
import { createCertificateRouter } from './certificate.routes';
import { PartyController } from '../controllers/party.controller';
import { createPartyRouter } from './party.routes';
import { RepairController } from '../controllers/repair.controller';
import { createRepairRouter } from './repair.routes';
import { SettingsController } from '../controllers/settings.controller';
import { createSettingsRouter } from './settings.routes';
import diamondRouter from './diamond.routes';
import { DraftController } from '../controllers/draft.controller';
import { createDraftRouter } from './draft.routes';
import { VersionController } from '../controllers/version.controller';
import { createVersionRouter } from './version.routes';
import reportsRoutes from './reports.routes';

/**
 * Route aggregator — registers all application routes.
 */
export function createRoutes(
  stockController: StockController,
  healthController: HealthController,
  dashboardController: DashboardController,
  ledgerController: LedgerController,
  certificateController: CertificateController,
  partyController: PartyController,
  repairController: RepairController,
  settingsController: SettingsController,
  draftController: DraftController,
  versionController: VersionController,
): Router {
  const router = Router();

  router.use('/api/stocks', createStockRouter(stockController));
  router.use('/api/dashboard', createDashboardRouter(dashboardController));
  router.use('/api/ledger', createLedgerRouter(ledgerController));
  router.use('/api/certificates', createCertificateRouter(certificateController));
  router.use('/api/parties', createPartyRouter(partyController));
  router.use('/api/repairs', createRepairRouter(repairController));
  router.use('/api/settings', createSettingsRouter(settingsController));
  router.use('/api/diamonds', diamondRouter);
  router.use('/api/drafts', createDraftRouter(draftController));
  router.use('/api/versions', createVersionRouter(versionController));
  router.use('/api/reports', reportsRoutes);
  router.use('/health', createHealthRouter(healthController));

  return router;
}
