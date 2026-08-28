"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLedgerRouter = createLedgerRouter;
const express_1 = require("express");
function createLedgerRouter(controller) {
    const router = (0, express_1.Router)();
    router.get('/', controller.getAll.bind(controller));
    router.get('/stocks', controller.getStockNames.bind(controller));
    router.get('/parties', controller.getParties.bind(controller));
    router.post('/', controller.create.bind(controller));
    router.put('/:id', controller.update.bind(controller));
    router.delete('/:id', controller.delete.bind(controller));
    return router;
}
//# sourceMappingURL=ledger.routes.js.map