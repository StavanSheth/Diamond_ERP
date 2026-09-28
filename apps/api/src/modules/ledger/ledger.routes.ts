import { Router } from 'express';
import { LedgerController } from '../../modules/ledger/ledger.controller';
import { validateRequest } from '../../middleware/validate';
import { createTransactionSchema } from '../../validation/transaction.validator';

export function createLedgerRouter(controller: LedgerController): Router {
  const router = Router();

  router.get('/', controller.getAll.bind(controller));
  router.get('/stocks', controller.getStockNames.bind(controller));
  router.get('/parties', controller.getParties.bind(controller));
  router.get('/payment-summary', controller.getPaymentSummary.bind(controller));
  
  // Note: ledger entries are typically created implicitly via transactions
  router.post('/', validateRequest(createTransactionSchema), controller.create.bind(controller));
  
  // Ledger entries are immutable once posted; updates are rejected
  router.put('/:id', controller.update.bind(controller));
  
  // Ledger entries are immutable, but maintaining the route for now until full deprecation
  router.delete('/:id', controller.delete.bind(controller));

  return router;
}
