import { Router } from 'express';
import { userLifecycleController } from './user-lifecycle.controller';
import { authenticate } from '../../../middleware/auth';
import { authorize } from '../../../middleware/authorize';

const router = Router();

router.post('/:id/deactivate', authenticate, authorize('users.manage'), userLifecycleController.deactivateUser);
router.post('/:id/delete', authenticate, authorize('users.manage'), userLifecycleController.deleteUser);
router.delete('/:id', authenticate, authorize('users.manage'), userLifecycleController.deleteUser);

export const userLifecycleRoutes = router;
