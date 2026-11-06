"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const activation_controller_1 = require("./activation.controller");
const lifecycle_controller_1 = require("./lifecycle.controller");
const security_1 = require("../security");
const onboarding_1 = require("./onboarding");
const backup_1 = require("./backup");
const recovery_1 = require("./recovery");
const export_1 = require("./export");
const uninstall_1 = require("./uninstall");
const user_lifecycle_1 = require("./user-lifecycle");
const auth_1 = require("../../middleware/auth");
const idempotency_1 = require("../../middleware/idempotency");
const router = (0, express_1.Router)();
// ── Public / Bootstrap routes ──────────────────────────────────────────
// Public lifecycle probe (always unauthenticated)
router.get('/lifecycle', lifecycle_controller_1.lifecycleController.getLifecycleStatus);
// First-run onboarding routes (status, user discovery, database discovery/attachment)
router.use('/onboarding', onboarding_1.onboardingRoutes);
// Recovery & reinstall routes (candidates, inspect, prepare, restore, fresh-install)
router.use('/recovery', recovery_1.recoveryRoutes);
// Bootstrap onboarding mutations (guarded by lifecycle state: allowed pre-READY, authenticated post-READY)
router.post('/lifecycle-state', lifecycle_controller_1.lifecycleController.updateLifecycleState);
router.post('/device', lifecycle_controller_1.lifecycleController.registerDevice);
router.post('/device/bind', security_1.securityController.bindDevice);
router.post('/database/validate', lifecycle_controller_1.lifecycleController.validateDatabase);
// Security foundation routes (PIN setup, verification, lock/unlock, status)
router.use('/security', security_1.securityRoutes);
// Data preservation, backup, export & uninstall routes
router.use('/backup', backup_1.backupRoutes);
router.use('/export', export_1.exportRoutes);
router.use('/uninstall', uninstall_1.uninstallRoutes);
router.use('/users', user_lifecycle_1.userLifecycleRoutes);
// ── Protected administrative system routes ─────────────────────────────
// System routes manage Control DB resources (Installation, Device, DatabaseRegistry)
// and must NOT use profileMiddleware to prevent accidental profile DB auto-provisioning.
const protectedAdminStack = [auth_1.authenticate, idempotency_1.idempotencyMiddleware];
// Activation & software lock
router.get('/activation-status', protectedAdminStack, activation_controller_1.activationController.getActivationStatus);
router.post('/activate', protectedAdminStack, activation_controller_1.activationController.activate);
// Installation & device lifecycle management
router.get('/installation', protectedAdminStack, lifecycle_controller_1.lifecycleController.getInstallation);
router.post('/device/:deviceId/revoke', protectedAdminStack, lifecycle_controller_1.lifecycleController.revokeDevice);
router.post('/device/:deviceId/reactivate', protectedAdminStack, lifecycle_controller_1.lifecycleController.reactivateDevice);
// Database registry management
router.post('/database/register', protectedAdminStack, lifecycle_controller_1.lifecycleController.registerDatabase);
router.get('/database/list', protectedAdminStack, lifecycle_controller_1.lifecycleController.listDatabases);
// Installation ↔ User association management
router.post('/users/associate', protectedAdminStack, lifecycle_controller_1.lifecycleController.associateUser);
router.post('/users/disassociate', protectedAdminStack, lifecycle_controller_1.lifecycleController.disassociateUser);
router.get('/users', protectedAdminStack, lifecycle_controller_1.lifecycleController.getInstallationUsers);
exports.default = router;
//# sourceMappingURL=system.routes.js.map