"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHealthRouter = createHealthRouter;
const express_1 = require("express");
/**
 * Create health route.
 *
 * GET /health — Returns application health status
 */
function createHealthRouter(controller) {
    const router = (0, express_1.Router)();
    router.get('/', controller.getHealth);
    return router;
}
//# sourceMappingURL=health.routes.js.map