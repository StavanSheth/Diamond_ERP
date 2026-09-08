import { Router } from 'express';
import { PartyController } from '../../modules/parties/party.controller';

export function createPartyRouter(controller: PartyController): Router {
  const router = Router();

  router.get('/', controller.getParties);
  router.post('/', controller.createParty);
  router.put('/:id', controller.updateParty);
  router.delete('/:id', controller.deleteParty);

  return router;
}
