"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLedgerRouter = createLedgerRouter;
const express_1 = require("express");
const validate_1 = require("../../middleware/validate");
const transaction_validator_1 = require("../../validation/transaction.validator");
function createLedgerRouter(controller) {
    const router = (0, express_1.Router)();
    router.get('/', controller.getAll.bind(controller));
    router.get('/stocks', controller.getStockNames.bind(controller));
    router.get('/parties', controller.getParties.bind(controller));
    router.get('/payment-summary', controller.getPaymentSummary.bind(controller));
    // Note: ledger entries are typically created implicitly via transactions
    router.post('/', (0, validate_1.validateRequest)(transaction_validator_1.createTransactionSchema), controller.create.bind(controller));
    // Ledger entries are immutable once posted; updates are rejected
    router.put('/:id', controller.update.bind(controller));
    // Ledger entries are immutable, but maintaining the route for now until full deprecation
    router.delete('/:id', controller.delete.bind(controller));
    return router;
}
//# sourceMappingURL=ledger.routes.js.map