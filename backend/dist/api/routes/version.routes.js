"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVersionRouter = createVersionRouter;
const express_1 = require("express");
function createVersionRouter(controller) {
    const router = (0, express_1.Router)();
    // Get version history for an entity
    router.get('/:entityType/:entityId', controller.getHistory);
    // Diff two versions
    router.get('/:idA/diff/:idB', controller.diff);
    // Get a single version
    router.get('/:id', controller.getOne);
    // Restore a version
    router.post('/:id/restore', controller.restore);
    return router;
}
//# sourceMappingURL=version.routes.js.map