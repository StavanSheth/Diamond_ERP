import { Router } from 'express';
import { securityController } from './security.controller';

const router = Router();

// Device security status query
router.get('/', securityController.getSecurityStatus);
router.get('/status', securityController.getSecurityStatus);

// PIN management
router.post('/pin/setup', securityController.setupPin);
router.post('/pin/verify', securityController.verifyPin);
router.post('/pin/change', securityController.changePin);

// Workstation App Lock / Unlock
router.post('/lock', securityController.lock);
router.post('/unlock', securityController.unlock);

// Device binding
router.post('/bind', securityController.bindDevice);

export default router;
