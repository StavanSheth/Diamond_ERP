"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDashboardRouter = createDashboardRouter;
const express_1 = require("express");
/**
 * Create dashboard route.
 *
 * GET /api/dashboard — Returns computed KPIs
 */
function createDashboardRouter(controller) {
    const router = (0, express_1.Router)();
    router.get('/', controller.getDashboard);
    return router;
}
//# sourceMappingURL=dashboard.routes.js.map