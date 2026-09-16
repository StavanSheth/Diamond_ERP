import { Router } from 'express';
import { activationController } from './activation.controller';
import { lifecycleController } from './lifecycle.controller';
import { authorize } from '../../middleware/authorize';

const router = Router();

// Notice: activation-status and activate are used for software lock
router.get('/activation-status', authorize('system.activate'), activationController.getActivationStatus);
router.post('/activate', authorize('system.activate'), activationController.activate);

// Protected installation & device lifecycle management
router.get('/installation', authorize('settings.read'), lifecycleController.getInstallation);
router.post('/lifecycle-state', authorize('settings.update'), lifecycleController.updateLifecycleState);
router.post('/device', authorize('settings.update'), lifecycleController.registerDevice);
router.post('/database/validate', authorize('settings.read'), lifecycleController.validateDatabase);
router.post('/database/register', authorize('settings.update'), lifecycleController.registerDatabase);
router.get('/database/list', authorize('settings.read'), lifecycleController.listDatabases);

export default router;
