import { Router } from 'express';
import { activationController } from './activation.controller';
import { lifecycleController } from './lifecycle.controller';
import { securityRoutes, securityController } from '../security';
import { onboardingRoutes } from './onboarding';
import { backupRoutes } from './backup';
import { recoveryRoutes } from './recovery';
import { exportRoutes } from './export';
import { uninstallRoutes } from './uninstall';
import { userLifecycleRoutes } from './user-lifecycle';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { idempotencyMiddleware } from '../../middleware/idempotency';

const router = Router();

// ── Public / Bootstrap routes ──────────────────────────────────────────
// Public lifecycle probe (always unauthenticated)
router.get('/lifecycle', lifecycleController.getLifecycleStatus);

// First-run onboarding routes (status, user discovery, database discovery/attachment)
router.use('/onboarding', onboardingRoutes);

// Recovery & reinstall routes (candidates, inspect, prepare, restore, fresh-install)
router.use('/recovery', recoveryRoutes);

// Bootstrap onboarding mutations (guarded by lifecycle state: allowed pre-READY, authenticated post-READY)
router.post('/lifecycle-state', lifecycleController.updateLifecycleState);
router.post('/device', lifecycleController.registerDevice);
router.post('/device/bind', securityController.bindDevice);
router.post('/database/validate', lifecycleController.validateDatabase);

// Security foundation routes (PIN setup, verification, lock/unlock, status)
router.use('/security', securityRoutes);

// Data preservation, backup, export & uninstall routes
router.use('/backup', backupRoutes);
router.use('/export', exportRoutes);
router.use('/uninstall', uninstallRoutes);
router.use('/users', userLifecycleRoutes);

// ── Protected administrative system routes ─────────────────────────────
// System routes manage Control DB resources (Installation, Device, DatabaseRegistry)
// and must NOT use profileMiddleware to prevent accidental profile DB auto-provisioning.
const protectedAdminStack = [authenticate, idempotencyMiddleware];

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
