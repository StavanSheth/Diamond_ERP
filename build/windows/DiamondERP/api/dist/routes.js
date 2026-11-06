"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRoutes = createRoutes;
const express_1 = require("express");
const stock_routes_1 = require("./modules/stocks/stock.routes");
const health_routes_1 = require("./modules/system/health.routes");
const dashboard_routes_1 = require("./modules/dashboard/dashboard.routes");
const ledger_routes_1 = require("./modules/ledger/ledger.routes");
const certificate_routes_1 = require("./modules/certificates/certificate.routes");
const party_routes_1 = require("./modules/parties/party.routes");
const repair_routes_1 = require("./modules/repairs/repair.routes");
const settings_routes_1 = require("./modules/settings/settings.routes");
const auth_routes_1 = require("./modules/auth/auth.routes");
const diamond_routes_1 = __importDefault(require("./modules/diamonds/diamond.routes"));
const reports_routes_1 = __importDefault(require("./modules/reports/reports.routes"));
const system_routes_1 = __importDefault(require("./modules/system/system.routes"));
const auth_1 = require("./middleware/auth");
const profile_1 = require("./middleware/profile");
const idempotency_1 = require("./middleware/idempotency");
const lifecycle_ready_1 = require("./middleware/lifecycle-ready");
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
function createRoutes(stockController, healthController, dashboardController, ledgerController, certificateController, partyController, repairController, settingsController) {
    const router = (0, express_1.Router)();
    // ── Public routes (no authentication) ────────────────────────────────
    router.use('/health', (0, health_routes_1.createHealthRouter)(healthController));
    router.use('/api/auth', (0, auth_routes_1.createAuthRouter)());
    // ── System & Lifecycle routes (handles public bootstrap and protected admin internally) ──
    router.use('/api/system', system_routes_1.default);
    // ── Protected routes requiring explicit profile context & READY lifecycle ───────────────
    const protectedStack = [lifecycle_ready_1.lifecycleReadyMiddleware, auth_1.authenticate, profile_1.profileMiddleware, idempotency_1.idempotencyMiddleware];
    router.use('/api/stocks', protectedStack, (0, stock_routes_1.createStockRouter)(stockController));
    router.use('/api/dashboard', protectedStack, (0, dashboard_routes_1.createDashboardRouter)(dashboardController));
    router.use('/api/ledger', protectedStack, (0, ledger_routes_1.createLedgerRouter)(ledgerController));
    router.use('/api/certificates', protectedStack, (0, certificate_routes_1.createCertificateRouter)(certificateController));
    router.use('/api/parties', protectedStack, (0, party_routes_1.createPartyRouter)(partyController));
    router.use('/api/repairs', protectedStack, (0, repair_routes_1.createRepairRouter)(repairController));
    router.use('/api/diamonds', protectedStack, diamond_routes_1.default);
    router.use('/api/reports', protectedStack, reports_routes_1.default);
    // ── Protected routes with optional profile context ──────────────────
    // Settings includes profile listing/switching; handles profile context internally when needed.
    const adminStack = [auth_1.authenticate, profile_1.optionalProfileMiddleware, idempotency_1.idempotencyMiddleware];
    router.use('/api/settings', adminStack, (0, settings_routes_1.createSettingsRouter)(settingsController));
    return router;
}
//# sourceMappingURL=routes.js.map