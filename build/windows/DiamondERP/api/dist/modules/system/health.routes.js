"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHealthRouter = createHealthRouter;
const express_1 = require("express");
/**
 * Health and observability routes.
 *
 * GET /health — Comprehensive health report
 * GET /health/liveness — Fast liveness probe
 * GET /health/readiness — Dependency readiness check
 */
function createHealthRouter(controller) {
    const router = (0, express_1.Router)();
    router.get('/', controller.getHealth);
    router.get('/liveness', controller.getLiveness);
    router.get('/readiness', controller.getReadiness);
    return router;
}
//# sourceMappingURL=health.routes.js.map