"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSettingsRouter = createSettingsRouter;
const express_1 = require("express");
function createSettingsRouter(controller) {
    const router = (0, express_1.Router)();
    router.get('/', controller.getSettings);
    router.put('/', controller.updateSettings);
    return router;
}
//# sourceMappingURL=settings.routes.js.map