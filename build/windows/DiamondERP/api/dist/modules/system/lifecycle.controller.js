"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lifecycleController = exports.LifecycleController = void 0;
const installation_service_1 = require("./installation.service");
const database_registry_service_1 = require("./database/database-registry.service");
const database_validation_service_1 = require("./database/database-validation.service");
const zod_1 = require("zod");
const auth_service_1 = require("../auth/auth.service");
const updateStateSchema = zod_1.z.object({
    lifecycleState: zod_1.z.enum([
        'NOT_INITIALIZED',
        'APP_SETUP',
        'PIN_SETUP',
        'DEVICE_SETUP',
        'USER_DISCOVERY',
        'DATABASE_DISCOVERY',
        'DATABASE_VALIDATION',
        'DATABASE_SETUP',
        'READY',
    ]),
    isReset: zod_1.z.boolean().optional(),
    resetReason: zod_1.z.enum([
        'ADMINISTRATIVE_RESET',
        'RECOVERY_RESET',
        'FAILED_ONBOARDING_RECOVERY',
        'DEVELOPMENT_TEST_RESET',
    ]).optional(),
});
const registerDeviceSchema = zod_1.z.object({
    deviceId: zod_1.z.string().optional(),
    deviceName: zod_1.z.string().min(1).max(100),
    platform: zod_1.z.string().max(50).optional(),
    osVersion: zod_1.z.string().max(100).optional(),
});
const validateDatabaseSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
});
const registerDatabaseSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
    displayName: zod_1.z.string().max(100).optional(),
    databaseType: zod_1.z.string().max(50).optional(),
    profileId: zod_1.z.string().optional(),
});
const associateUserSchema = zod_1.z.object({
    userId: zod_1.z.string().min(1),
    installationId: zod_1.z.string().optional(),
});
class LifecycleController {
    constructor() {
        /**
         * GET /api/system/lifecycle
         * Public probe returning the current installation status and lifecycle state.
         */
        this.getLifecycleStatus = async (_req, res, next) => {
            try {
                const status = await installation_service_1.installationService.getLifecycleStatus();
                res.json({ success: true, data: status });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * GET /api/system/installation
         * Returns complete installation details and registered devices.
         */
        this.getInstallation = async (_req, res, next) => {
            try {
                const install = await installation_service_1.installationService.getOrCreateInstallation();
                res.json({ success: true, data: install });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/system/lifecycle-state
         * Update the authoritative lifecycle state machine.
         */
        this.updateLifecycleState = async (req, res, next) => {
            try {
                if (!(await this.checkBootstrapAccess(req, res)))
                    return;
                const parsed = updateStateSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                if (parsed.data.lifecycleState === 'NOT_INITIALIZED') {
                    if (!parsed.data.isReset || !parsed.data.resetReason) {
                        res.status(400).json({
                            success: false,
                            error: 'Controlled reset policy violation',
                            message: 'Resetting lifecycle to NOT_INITIALIZED requires isReset=true and a valid resetReason.',
                        });
                        return;
                    }
                }
                const updated = await installation_service_1.installationService.updateLifecycleState(parsed.data.lifecycleState, {
                    isReset: parsed.data.isReset,
                    resetReason: parsed.data.resetReason,
                    enforceInvariants: true,
                });
                res.json({ success: true, data: updated });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/system/device
         * Register or update the local desktop Device.
         */
        this.registerDevice = async (req, res, next) => {
            try {
                if (!(await this.checkBootstrapAccess(req, res)))
                    return;
                const parsed = registerDeviceSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const device = await installation_service_1.installationService.registerDevice({
                    deviceId: parsed.data.deviceId,
                    deviceName: parsed.data.deviceName,
                    platform: parsed.data.platform,
                    osVersion: parsed.data.osVersion,
                });
                res.status(201).json({ success: true, data: device });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/system/database/validate
         * Read-only inspection of a candidate SQLite database file.
         */
        this.validateDatabase = async (req, res, next) => {
            try {
                const parsed = validateDatabaseSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const result = await database_validation_service_1.databaseValidationService.validateDatabase(parsed.data.path);
                res.json({ success: true, data: result });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/system/database/register
         * Register a database file in the control database registry.
         */
        this.registerDatabase = async (req, res, next) => {
            try {
                if (!(await this.checkBootstrapAccess(req, res)))
                    return;
                const parsed = registerDatabaseSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const install = await installation_service_1.installationService.getOrCreateInstallation();
                const registered = await database_registry_service_1.databaseRegistryService.registerDatabase({
                    rawPath: parsed.data.path,
                    displayName: parsed.data.displayName,
                    databaseType: parsed.data.databaseType,
                    profileId: parsed.data.profileId,
                    installationId: install.id,
                });
                res.status(201).json({ success: true, data: registered });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * GET /api/system/database/list
         * List all registered databases for the local installation.
         */
        this.listDatabases = async (_req, res, next) => {
            try {
                const install = await installation_service_1.installationService.getOrCreateInstallation();
                const list = await database_registry_service_1.databaseRegistryService.listDatabases(install.id);
                res.json({ success: true, data: list });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/system/device/:deviceId/revoke
         */
        this.revokeDevice = async (req, res, next) => {
            try {
                const rawDeviceId = req.params.deviceId;
                const deviceId = Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId;
                const device = await installation_service_1.installationService.revokeDevice(deviceId);
                res.json({ success: true, data: device });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/system/device/:deviceId/reactivate
         */
        this.reactivateDevice = async (req, res, next) => {
            try {
                const rawDeviceId = req.params.deviceId;
                const deviceId = Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId;
                const device = await installation_service_1.installationService.reactivateDevice(deviceId);
                res.json({ success: true, data: device });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/system/users/associate
         */
        this.associateUser = async (req, res, next) => {
            try {
                if (!(await this.checkBootstrapAccess(req, res)))
                    return;
                const parsed = associateUserSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const install = await installation_service_1.installationService.getOrCreateInstallation();
                if (parsed.data.installationId && parsed.data.installationId !== install.id && parsed.data.installationId !== install.installationId) {
                    res.status(409).json({
                        success: false,
                        error: 'Conflict',
                        message: 'Target installation ID does not match current local installation.',
                    });
                    return;
                }
                const result = await installation_service_1.installationService.associateUser(install.id, parsed.data.userId);
                res.status(201).json({ success: true, data: result });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/system/users/disassociate
         */
        this.disassociateUser = async (req, res, next) => {
            try {
                if (!(await this.checkBootstrapAccess(req, res)))
                    return;
                const parsed = associateUserSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const install = await installation_service_1.installationService.getOrCreateInstallation();
                if (parsed.data.installationId && parsed.data.installationId !== install.id && parsed.data.installationId !== install.installationId) {
                    res.status(409).json({
                        success: false,
                        error: 'Conflict',
                        message: 'Target installation ID does not match current local installation.',
                    });
                    return;
                }
                await installation_service_1.installationService.disassociateUser(install.id, parsed.data.userId);
                res.json({ success: true, message: 'User disassociated from installation' });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * GET /api/system/users
         */
        this.getInstallationUsers = async (_req, res, next) => {
            try {
                const install = await installation_service_1.installationService.getOrCreateInstallation();
                const users = await installation_service_1.installationService.getInstallationUsers(install.id);
                res.json({ success: true, data: users });
            }
            catch (error) {
                next(error);
            }
        };
    }
    /**
     * Helper: Enforce bootstrap security boundary.
     * If installation is already READY, mutations require authenticated caller.
     */
    async checkBootstrapAccess(req, res) {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        let user = req.user;
        if (!user && req.headers?.authorization?.startsWith('Bearer ')) {
            const token = req.headers.authorization.substring(7);
            const payload = auth_service_1.authService.verifyToken(token);
            if (payload) {
                user = payload;
            }
        }
        if (install.lifecycleState === 'READY' && (!user || user.id === 'default-admin')) {
            res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'Installation is fully initialized. Lifecycle modifications require authentication.',
            });
            return false;
        }
        return true;
    }
}
exports.LifecycleController = LifecycleController;
exports.lifecycleController = new LifecycleController();
//# sourceMappingURL=lifecycle.controller.js.map