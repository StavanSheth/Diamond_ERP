import { Router } from 'express';
import { StockController } from './modules/stocks/stock.controller';
import { HealthController } from './modules/system/health.controller';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { LedgerController } from './modules/ledger/ledger.controller';
import { createStockRouter } from './modules/stocks/stock.routes';
import { createHealthRouter } from './modules/system/health.routes';
import { createDashboardRouter } from './modules/dashboard/dashboard.routes';
import { createLedgerRouter } from './modules/ledger/ledger.routes';
import { CertificateController } from './modules/certificates/certificate.controller';
import { createCertificateRouter } from './modules/certificates/certificate.routes';
import { PartyController } from './modules/parties/party.controller';
import { createPartyRouter } from './modules/parties/party.routes';
import { RepairController } from './modules/repairs/repair.controller';
import { createRepairRouter } from './modules/repairs/repair.routes';
import { SettingsController } from './modules/settings/settings.controller';
import { createSettingsRouter } from './modules/settings/settings.routes';
import diamondRouter from './modules/diamonds/diamond.routes';
import reportsRoutes from './modules/reports/reports.routes';
import systemRoutes from './modules/system/system.routes';

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
  settingsController: SettingsController
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
  router.use('/api/reports', reportsRoutes);
  router.use('/api/system', systemRoutes);
  router.use('/health', createHealthRouter(healthController));

  return router;
}
