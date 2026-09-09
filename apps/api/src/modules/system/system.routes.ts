import { Router } from 'express';
import { activationController } from './activation.controller';
import { authorize } from '../../middleware/authorize';

const router = Router();

// Notice: activation-status and activate are typically used before the app is fully configured
// But they are mounted under /api/system which requires authenticate in routes.ts
// Depending on design, these might need to be moved to public routes if they should be accessible
// before the first user logs in. For now, requiring system.activate role.

router.get('/activation-status', authorize('system.activate'), activationController.getActivationStatus);
router.post('/activate', authorize('system.activate'), activationController.activate);

export default router;
