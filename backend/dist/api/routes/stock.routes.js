"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStockRouter = createStockRouter;
const express_1 = require("express");
const stock_validator_1 = require("../../validation/stock.validator");
/**
 * Create stock routes.
 *
 * GET    /api/stocks      — Retrieve all stock items
 * POST   /api/stocks      — Create a new stock item
 * PUT    /api/stocks/:id  — Update a stock item
 * DELETE /api/stocks/:id  — Delete a stock item
 */
function createStockRouter(controller) {
    const router = (0, express_1.Router)();
    router.get('/', controller.getStocks);
    router.post('/', stock_validator_1.validateCreateStock, controller.createStock);
    router.put('/:id', stock_validator_1.validateUpdateStock, controller.updateStock);
    router.delete('/:id', controller.deleteStock);
    return router;
}
//# sourceMappingURL=stock.routes.js.map