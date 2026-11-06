"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityController = exports.SecurityController = void 0;
const zod_1 = require("zod");
const security_service_1 = require("./security.service");
const installation_service_1 = require("../system/installation.service");
const auth_service_1 = require("../auth/auth.service");
const prisma_1 = require("../../infrastructure/database/prisma");
const errors_1 = require("../../errors");
const pinSetupSchema = zod_1.z.object({
    pin: zod_1.z.string().min(1, 'PIN is required').max(20),
    deviceId: zod_1.z.string().optional(),
});
const pinVerifySchema = zod_1.z.object({
    pin: zod_1.z.string().min(1, 'PIN is required').max(20),
    deviceId: zod_1.z.string().optional(),
});
const pinChangeSchema = zod_1.z.object({
    currentPin: zod_1.z.string().min(1, 'Current PIN is required').max(20),
    newPin: zod_1.z.string().min(1, 'New PIN is required').max(20),
    deviceId: zod_1.z.string().optional(),
});
const lockSchema = zod_1.z.object({
    deviceId: zod_1.z.string().optional(),
});
const unlockSchema = zod_1.z.object({
    pin: zod_1.z.string().min(1, 'PIN is required').max(20),
    deviceId: zod_1.z.string().optional(),
});
const bindDeviceSchema = zod_1.z.object({
    deviceId: zod_1.z.string().optional(),
});
class SecurityController {
    constructor() {
        this.getSecurityStatus = async (req, res, next) => {
            try {
                const deviceId = req.query.deviceId;
                const status = await security_service_1.securityService.getStatus(deviceId);
                res.status(200).json(status);
            }
            catch (err) {
                next(err);
            }
        };
        this.setupPin = async (req, res, next) => {
            try {
                const parsed = pinSetupSchema.safeParse(req.body);
                if (!parsed.success) {
                    throw new errors_1.ValidationError('Invalid PIN setup request', parsed.error.format());
                }
                const authoritativeDeviceId = security_service_1.securityService.resolveAuthoritativeDeviceId(parsed.data.deviceId);
                await this.canConfigureInitialPin(req, authoritativeDeviceId);
                const meta = this.getAuditMeta(req);
                const result = await security_service_1.securityService.setupPin(parsed.data.pin, authoritativeDeviceId, meta);
                res.status(201).json(result);
            }
            catch (err) {
                next(err);
            }
        };
        this.verifyPin = async (req, res, next) => {
            try {
                const parsed = pinVerifySchema.safeParse(req.body);
                if (!parsed.success) {
                    throw new errors_1.ValidationError('Invalid PIN verify request', parsed.error.format());
                }
                const meta = this.getAuditMeta(req);
                const result = await security_service_1.securityService.verifyPin(parsed.data.pin, parsed.data.deviceId, meta);
                // Return 200 with result status (success/locked/remainingAttempts)
                res.status(200).json(result);
            }
            catch (err) {
                next(err);
            }
        };
        this.changePin = async (req, res, next) => {
            try {
                await this.canChangePin(req);
                const parsed = pinChangeSchema.safeParse(req.body);
                if (!parsed.success) {
                    throw new errors_1.ValidationError('Invalid PIN change request', parsed.error.format());
                }
                const meta = this.getAuditMeta(req);
                const result = await security_service_1.securityService.changePin(parsed.data.currentPin, parsed.data.newPin, parsed.data.deviceId, meta);
                res.status(200).json(result);
            }
            catch (err) {
                next(err);
            }
        };
        this.lock = async (req, res, next) => {
            try {
                const parsed = lockSchema.safeParse(req.body);
                const deviceId = parsed.success ? parsed.data.deviceId : undefined;
                const meta = this.getAuditMeta(req);
                const result = await security_service_1.securityService.lock(deviceId, meta);
                res.status(200).json(result);
            }
            catch (err) {
                next(err);
            }
        };
        this.unlock = async (req, res, next) => {
            try {
                const parsed = unlockSchema.safeParse(req.body);
                if (!parsed.success) {
                    throw new errors_1.ValidationError('Invalid unlock request', parsed.error.format());
                }
                const meta = this.getAuditMeta(req);
                const result = await security_service_1.securityService.unlock(parsed.data.pin, parsed.data.deviceId, meta);
                res.status(200).json(result);
            }
            catch (err) {
                next(err);
            }
        };
        this.bindDevice = async (req, res, next) => {
            try {
                await this.canBindDevice(req);
                const parsed = bindDeviceSchema.safeParse(req.body);
                const deviceId = parsed.success ? parsed.data.deviceId : undefined;
                const meta = this.getAuditMeta(req);
                const result = await security_service_1.securityService.bind(deviceId, meta);
                res.status(200).json(result);
            }
            catch (err) {
                next(err);
            }
        };
    }
    getAuditMeta(req) {
        const user = req.user;
        return {
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            userId: user?.userId || user?.id,
            sessionId: user?.sessionId,
        };
    }
    /**
     * Helper: Extracts active authenticated user and validates session is not revoked.
     */
    async getAuthenticatedUser(req) {
        let user = req.user;
        if (user && user.id !== 'default-admin') {
            return user;
        }
        const authHeader = req.headers?.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const payload = auth_service_1.authService.verifyToken(token);
            if (payload) {
                const dbUser = await prisma_1.systemPrisma.user.findUnique({
                    where: { id: payload.userId },
                });
                if (dbUser && dbUser.isActive && dbUser.tokenVersion === payload.tokenVersion) {
                    if (payload.sessionId) {
                        const session = await prisma_1.systemPrisma.session.findUnique({
                            where: { id: payload.sessionId },
                        });
                        if (!session || session.revokedAt || session.expiresAt < new Date()) {
                            return null;
                        }
                    }
                    return {
                        id: dbUser.id,
                        userId: dbUser.id,
                        username: dbUser.username,
                        role: dbUser.role,
                        sessionId: payload.sessionId,
                    };
                }
            }
        }
        return null;
    }
    /**
     * Predicate: Can configure initial PIN.
     * Disallowed if PIN is already configured (ConflictError).
     * In READY state, requires an active authenticated session.
     */
    async canConfigureInitialPin(req, deviceId) {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        // Check if device already has a PIN
        const sec = await prisma_1.systemPrisma.deviceSecurity.findUnique({
            where: { deviceId },
        });
        if (sec?.pinHash) {
            throw new errors_1.ConflictError('PIN is already configured for this device. Use PIN change instead.');
        }
        if (install.lifecycleState === 'READY') {
            const user = await this.getAuthenticatedUser(req);
            if (!user) {
                throw new errors_1.AuthorizationError('Installation is READY. Authenticated authorization required to configure initial PIN.');
            }
        }
    }
    /**
     * Predicate: Can change PIN.
     * In READY state, PIN change requires an active authenticated session.
     */
    async canChangePin(req) {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        if (install.lifecycleState === 'READY') {
            const user = await this.getAuthenticatedUser(req);
            if (!user) {
                throw new errors_1.AuthorizationError('Authentication required: PIN change requires an active authenticated session once installation is in READY state.');
            }
        }
    }
    /**
     * Predicate: Can bind device.
     * In READY state, device binding requires an active authenticated session.
     */
    async canBindDevice(req) {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        if (install.lifecycleState === 'READY') {
            const user = await this.getAuthenticatedUser(req);
            if (!user) {
                throw new errors_1.AuthorizationError('Authentication required: Device binding requires an authenticated session in READY state.');
            }
        }
    }
}
exports.SecurityController = SecurityController;
exports.securityController = new SecurityController();
//# sourceMappingURL=security.controller.js.map