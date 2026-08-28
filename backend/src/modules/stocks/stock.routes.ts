import { Router } from 'express';
import { StockController } from '../controllers/stock.controller';
import { validateCreateStock, validateUpdateStock } from '../../validation/stock.validator';

/**
 * Create stock routes.
 *
 * GET    /api/stocks      — Retrieve all stock items
 * POST   /api/stocks      — Create a new stock item
 * PUT    /api/stocks/:id  — Update a stock item
 * DELETE /api/stocks/:id  — Delete a stock item
 */
export function createStockRouter(controller: StockController): Router {
  const router = Router();

  router.get('/', controller.getStocks);
  router.post('/', validateCreateStock, controller.createStock);
  

  router.put('/:id', validateUpdateStock, controller.updateStock);
  router.delete('/:id', controller.deleteStock);

  return router;
}
