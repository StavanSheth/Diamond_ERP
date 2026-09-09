import { Router } from 'express';
import { RepairController } from '../../modules/repairs/repair.controller';
import { authorize } from '../../middleware/authorize';

export function createRepairRouter(controller: RepairController): Router {
  const router = Router();

  router.get('/', authorize('repair.read'), controller.getRepairs);
  router.post('/', authorize('repair.create'), controller.createRepair);
  router.put('/:id', authorize('repair.update'), controller.updateRepair);
  // Re-evaluating delete, typically better to just cancel/archive
  router.delete('/:id', authorize('repair.update'), controller.deleteRepair);

  return router;
}
