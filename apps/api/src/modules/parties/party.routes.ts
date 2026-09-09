import { Router } from 'express';
import { PartyController } from '../../modules/parties/party.controller';
import { authorize } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/validate';
import { createPartySchema, updatePartySchema } from '../../validation/party.validator';

export function createPartyRouter(controller: PartyController): Router {
  const router = Router();

  router.get('/', authorize('party.read'), controller.getParties);
  router.post('/', authorize('party.create'), validateRequest(createPartySchema), controller.createParty);
  router.put('/:id', authorize('party.update'), validateRequest(updatePartySchema), controller.updateParty);
  router.delete('/:id', authorize('party.delete'), controller.deleteParty);

  return router;
}
