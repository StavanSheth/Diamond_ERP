import { Router } from 'express';
import { activationController } from './activation.controller';

const router = Router();

router.get('/activation-status', activationController.getActivationStatus);
router.post('/activate', activationController.activate);

export default router;
