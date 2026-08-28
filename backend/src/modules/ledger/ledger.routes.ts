import { Router } from 'express';
import { LedgerController } from '../controllers/ledger.controller';

export function createLedgerRouter(controller: LedgerController): Router {
  const router = Router();

  router.get('/', controller.getAll.bind(controller));
  router.get('/stocks', controller.getStockNames.bind(controller));
  router.get('/parties', controller.getParties.bind(controller));
  router.get('/payment-summary', controller.getPaymentSummary.bind(controller));
  router.post('/', controller.create.bind(controller));
  router.put('/:id', controller.update.bind(controller));
  router.delete('/:id', controller.delete.bind(controller));

  return router;
}
