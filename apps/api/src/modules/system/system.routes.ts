import { Router } from 'express';
import { activationController } from './activation.controller';
import { lifecycleController } from './lifecycle.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { optionalProfileMiddleware } from '../../middleware/profile';
import { idempotencyMiddleware } from '../../middleware/idempotency';

const router = Router();

// ── Public / Bootstrap routes ──────────────────────────────────────────
// Public lifecycle probe (always unauthenticated)
router.get('/lifecycle', lifecycleController.getLifecycleStatus);

// Bootstrap onboarding mutations (guarded by lifecycle state: allowed pre-READY, authenticated post-READY)
router.post('/lifecycle-state', lifecycleController.updateLifecycleState);
router.post('/device', lifecycleController.registerDevice);
router.post('/database/validate', lifecycleController.validateDatabase);

// ── Protected administrative system routes ─────────────────────────────
const protectedAdminStack = [authenticate, optionalProfileMiddleware, idempotencyMiddleware];

// Activation & software lock
router.get('/activation-status', protectedAdminStack, authorize('system.activate'), activationController.getActivationStatus);
router.post('/activate', protectedAdminStack, authorize('system.activate'), activationController.activate);

// Installation & device lifecycle management
router.get('/installation', protectedAdminStack, authorize('settings.read'), lifecycleController.getInstallation);
router.post('/device/:deviceId/revoke', protectedAdminStack, authorize('settings.update'), lifecycleController.revokeDevice);
router.post('/device/:deviceId/reactivate', protectedAdminStack, authorize('settings.update'), lifecycleController.reactivateDevice);

// Database registry management
router.post('/database/register', protectedAdminStack, authorize('settings.update'), lifecycleController.registerDatabase);
router.get('/database/list', protectedAdminStack, authorize('settings.read'), lifecycleController.listDatabases);

// Installation ↔ User association management
router.post('/users/associate', protectedAdminStack, authorize('settings.update'), lifecycleController.associateUser);
router.post('/users/disassociate', protectedAdminStack, authorize('settings.update'), lifecycleController.disassociateUser);
router.get('/users', protectedAdminStack, authorize('settings.read'), lifecycleController.getInstallationUsers);

export default router;
