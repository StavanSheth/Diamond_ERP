import { Router } from 'express';
import { LedgerController } from '../../modules/ledger/ledger.controller';
import { authorize } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/validate';
import { createTransactionSchema } from '../../validation/transaction.validator';

export function createLedgerRouter(controller: LedgerController): Router {
  const router = Router();

  router.get('/', authorize('ledger.read'), controller.getAll.bind(controller));
  router.get('/stocks', authorize('stock.read'), controller.getStockNames.bind(controller));
  router.get('/parties', authorize('party.read'), controller.getParties.bind(controller));
  router.get('/payment-summary', authorize('ledger.read'), controller.getPaymentSummary.bind(controller));
  
  // Note: ledger entries are typically created implicitly via transactions
  router.post('/', authorize('ledger.create'), validateRequest(createTransactionSchema), controller.create.bind(controller));
  
  // Reusing the create schema for updates for now since they are structurally similar
  router.put('/:id', authorize('ledger.update'), validateRequest(createTransactionSchema), controller.update.bind(controller));
  
  // Ledger entries are immutable, but maintaining the route for now until full deprecation
  router.delete('/:id', authorize('SUPER_ADMIN'), controller.delete.bind(controller));

  return router;
}
