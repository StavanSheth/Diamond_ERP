import { Router } from 'express';
import { userLifecycleController } from './user-lifecycle.controller';
import { authenticate } from '../../../middleware/auth';

const router = Router();

router.post('/:id/deactivate', authenticate, userLifecycleController.deactivateUser);
router.post('/:id/delete', authenticate, userLifecycleController.deleteUser);
router.delete('/:id', authenticate, userLifecycleController.deleteUser);

export const userLifecycleRoutes = router;
