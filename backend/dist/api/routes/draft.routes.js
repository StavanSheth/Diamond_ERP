"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDraftRouter = createDraftRouter;
const express_1 = require("express");
function createDraftRouter(controller) {
    const router = (0, express_1.Router)();
    router.get('/', controller.getAll);
    router.get('/:id', controller.getOne);
    router.post('/', controller.create);
    router.put('/:id', controller.saveRevision);
    router.post('/:id/commit', controller.commit);
    router.delete('/:id', controller.abandon);
    return router;
}
//# sourceMappingURL=draft.routes.js.map