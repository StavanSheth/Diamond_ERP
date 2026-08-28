import { Router } from 'express';
import { VersionController } from '../controllers/version.controller';

export function createVersionRouter(controller: VersionController): Router {
  const router = Router();

  // Get version history for an entity
  router.get('/:entityType/:entityId', controller.getHistory);

  // Diff two versions
  router.get('/:idA/diff/:idB', controller.diff);

  // Get a single version
  router.get('/:id', controller.getOne);

  // Restore a version
  router.post('/:id/restore', controller.restore);

  return router;
}
