import { Router } from 'express';
import { DraftController } from '../controllers/draft.controller';

export function createDraftRouter(controller: DraftController): Router {
  const router = Router();

  router.get('/', controller.getAll);
  router.get('/:id', controller.getOne);
  router.post('/', controller.create);
  router.put('/:id', controller.saveRevision);
  router.post('/:id/commit', controller.commit);
  router.delete('/:id', controller.abandon);

  return router;
}
