"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRoutes = createRoutes;
const express_1 = require("express");
const stock_routes_1 = require("./stock.routes");
const health_routes_1 = require("./health.routes");
const dashboard_routes_1 = require("./dashboard.routes");
const ledger_routes_1 = require("./ledger.routes");
const certificate_routes_1 = require("./certificate.routes");
const party_routes_1 = require("./party.routes");
const repair_routes_1 = require("./repair.routes");
const settings_routes_1 = require("./settings.routes");
const diamond_routes_1 = __importDefault(require("./diamond.routes"));
const draft_routes_1 = require("./draft.routes");
const version_routes_1 = require("./version.routes");
/**
 * Route aggregator — registers all application routes.
 */
function createRoutes(stockController, healthController, dashboardController, ledgerController, certificateController, partyController, repairController, settingsController, draftController, versionController) {
    const router = (0, express_1.Router)();
    router.use('/api/stocks', (0, stock_routes_1.createStockRouter)(stockController));
    router.use('/api/dashboard', (0, dashboard_routes_1.createDashboardRouter)(dashboardController));
    router.use('/api/ledger', (0, ledger_routes_1.createLedgerRouter)(ledgerController));
    router.use('/api/certificates', (0, certificate_routes_1.createCertificateRouter)(certificateController));
    router.use('/api/parties', (0, party_routes_1.createPartyRouter)(partyController));
    router.use('/api/repairs', (0, repair_routes_1.createRepairRouter)(repairController));
    router.use('/api/settings', (0, settings_routes_1.createSettingsRouter)(settingsController));
    router.use('/api/diamonds', diamond_routes_1.default);
    router.use('/api/drafts', (0, draft_routes_1.createDraftRouter)(draftController));
    router.use('/api/versions', (0, version_routes_1.createVersionRouter)(versionController));
    router.use('/health', (0, health_routes_1.createHealthRouter)(healthController));
    return router;
}
//# sourceMappingURL=index.js.map