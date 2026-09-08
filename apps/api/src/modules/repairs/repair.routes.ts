import { Router } from 'express';
import { RepairController } from '../../modules/repairs/repair.controller';

export function createRepairRouter(controller: RepairController): Router {
  const router = Router();

  router.get('/', controller.getRepairs);
  router.post('/', controller.createRepair);
  router.put('/:id', controller.updateRepair);
  router.delete('/:id', controller.deleteRepair);

  return router;
}
