"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRepairRouter = createRepairRouter;
const express_1 = require("express");
function createRepairRouter(controller) {
    const router = (0, express_1.Router)();
    router.get('/', controller.getRepairs);
    router.post('/', controller.createRepair);
    router.put('/:id', controller.updateRepair);
    router.delete('/:id', controller.deleteRepair);
    return router;
}
//# sourceMappingURL=repair.routes.js.map