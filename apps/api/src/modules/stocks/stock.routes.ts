import { Router } from 'express';
import { StockController } from '../../modules/stocks/stock.controller';
import { validateCreateStock, validateUpdateStock } from '../../validation/stock.validator';
import { authorize } from '../../middleware/authorize';

/**
 * Create stock routes.
 *
 * GET    /api/stocks      — Retrieve all stock items
 * POST   /api/stocks      — Create a new stock item
 * PUT    /api/stocks/:id  — Update a stock item
 * DELETE /api/stocks/:id  — Archive a stock item (soft-delete)
 */
export function createStockRouter(controller: StockController): Router {
  const router = Router();

  router.get('/', authorize('stock.read'), controller.getStocks);
  router.post('/', authorize('stock.create'), validateCreateStock, controller.createStock);
  router.put('/:id', authorize('stock.update'), validateUpdateStock, controller.updateStock);
  router.delete('/:id', authorize('stock.archive'), controller.deleteStock);

  return router;
}
