import { Router } from 'express';
import { StockController } from '../controllers/stock.controller';
/**
 * Create stock routes.
 *
 * GET    /api/stocks      — Retrieve all stock items
 * POST   /api/stocks      — Create a new stock item
 * PUT    /api/stocks/:id  — Update a stock item
 * DELETE /api/stocks/:id  — Delete a stock item
 */
export declare function createStockRouter(controller: StockController): Router;
//# sourceMappingURL=stock.routes.d.ts.map