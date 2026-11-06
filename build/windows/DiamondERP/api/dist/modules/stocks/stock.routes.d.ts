import { Router } from 'express';
import { StockController } from '../../modules/stocks/stock.controller';
/**
 * Create stock routes.
 *
 * GET    /api/stocks      — Retrieve all stock items
 * POST   /api/stocks      — Create a new stock item
 * PUT    /api/stocks/:id  — Update a stock item
 * DELETE /api/stocks/:id  — Archive a stock item (soft-delete)
 */
export declare function createStockRouter(controller: StockController): Router;
//# sourceMappingURL=stock.routes.d.ts.map