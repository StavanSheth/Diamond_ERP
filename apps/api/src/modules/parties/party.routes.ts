import { Router } from 'express';
import { PartyController } from '../../modules/parties/party.controller';
import { validateRequest } from '../../middleware/validate';
import { createPartySchema, updatePartySchema } from '../../validation/party.validator';

export function createPartyRouter(controller: PartyController): Router {
  const router = Router();

  router.get('/', controller.getParties);
  router.post('/', validateRequest(createPartySchema), controller.createParty);
  router.put('/:id', validateRequest(updatePartySchema), controller.updateParty);
  router.delete('/:id', controller.deleteParty);

  return router;
}
