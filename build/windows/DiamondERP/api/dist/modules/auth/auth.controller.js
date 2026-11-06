"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = exports.AuthController = void 0;
const crypto_1 = __importDefault(require("crypto"));
const auth_service_1 = require("./auth.service");
const prisma_1 = require("../../infrastructure/database/prisma");
const zod_1 = require("zod");
// ── Validation Schemas ──────────────────────────────────────────────────
const loginSchema = zod_1.z.object({
    username: zod_1.z.string().min(1, 'Username is required').max(100),
    password: zod_1.z.string().min(1, 'Password is required').max(200),
});
const createUserSchema = zod_1.z.object({
    username: zod_1.z.string().min(3, 'Username must be at least 3 characters').max(50),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters').max(200),
    displayName: zod_1.z.string().min(1, 'Display name is required').max(100),
    role: zod_1.z.string().min(1, 'Role is required'),
    profiles: zod_1.z.array(zod_1.z.string()).optional(),
});
const changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, 'Current password is required'),
    newPassword: zod_1.z.string().min(8, 'New password must be at least 8 characters').max(200),
});
const bootstrapSchema = zod_1.z.object({
    username: zod_1.z.string().min(3, 'Username must be at least 3 characters').max(50),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters').max(200),
    displayName: zod_1.z.string().min(1, 'Display name is required').max(100),
});
// ── Controller ──────────────────────────────────────────────────────────
class AuthController {
    constructor() {
        /**
         * POST /api/auth/login
         * Authenticate user, create session, and return JWT token.
         */
        this.login = async (req, res, next) => {
            try {
                const parsed = loginSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const { username, password } = parsed.data;
                const deviceIdHeader = req.headers['x-device-id'];
                const result = await auth_service_1.authService.login(username, password, {
                    ip: req.ip,
                    userAgent: req.headers['user-agent'],
                    deviceId: deviceIdHeader,
                });
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (error) {
                if (error instanceof Error && error.name === 'AuthenticationError') {
                    res.status(401).json({
                        success: false,
                        error: error.message,
                    });
                    return;
                }
                next(error);
            }
        };
        /**
         * GET /api/auth/me
         * Return current authenticated user info.
         */
        this.me = async (req, res, _next) => {
            const user = req.user;
            res.json({
                success: true,
                data: {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    role: user.role,
                    profiles: user.profiles,
                },
            });
        };
        /**
         * POST /api/auth/users
         * Create a new user (admin only).
         */
        this.createUser = async (req, res, next) => {
            try {
                const parsed = createUserSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const { username, password, displayName, role, profiles } = parsed.data;
                const user = await auth_service_1.authService.createUser(username, password, displayName, role, profiles);
                res.status(201).json({
                    success: true,
                    data: user,
                });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/auth/change-password
         * Change the current user's password.
         */
        this.changePassword = async (req, res, next) => {
            try {
                const parsed = changePasswordSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const user = req.user;
                const { currentPassword, newPassword } = parsed.data;
                await auth_service_1.authService.changePassword(user.id, currentPassword, newPassword);
                res.json({
                    success: true,
                    message: 'Password changed successfully',
                });
            }
            catch (error) {
                if (error instanceof Error && error.name === 'AuthenticationError') {
                    res.status(401).json({
                        success: false,
                        error: error.message,
                    });
                    return;
                }
                next(error);
            }
        };
        /**
         * POST /api/auth/logout
         * Invalidate the current session or all sessions.
         */
        this.logout = async (req, res, next) => {
            try {
                const user = req.user;
                const logoutAll = req.query.all === 'true';
                if (logoutAll) {
                    await auth_service_1.authService.invalidateSessions(user.id);
                }
                else if (user.sessionId) {
                    await auth_service_1.authService.revokeSession(user.sessionId);
                }
                else {
                    await auth_service_1.authService.invalidateSessions(user.id);
                }
                res.json({
                    success: true,
                    message: logoutAll ? 'Logged out successfully from all devices' : 'Logged out successfully',
                });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/auth/bootstrap
         * Secure initialization: requires BOOTSTRAP_SECRET header, verifies system uninitialized,
         * atomically creates the first administrator, and permanently disables the endpoint.
         */
        this.bootstrap = async (req, res, next) => {
            try {
                const configuredSecret = process.env.BOOTSTRAP_SECRET;
                // In production or when BOOTSTRAP_SECRET is not configured, endpoint is completely disabled
                if (!configuredSecret) {
                    res.status(403).json({
                        success: false,
                        error: 'Bootstrap endpoint is disabled. Configure BOOTSTRAP_SECRET to enable initial setup.',
                    });
                    return;
                }
                // 1. Verify bootstrap secret from dedicated header via constant-time comparison
                const rawHeaderSecret = req.headers['x-bootstrap-secret'];
                const providedSecret = typeof rawHeaderSecret === 'string' ? rawHeaderSecret.trim() : '';
                if (!providedSecret ||
                    providedSecret.length !== configuredSecret.length ||
                    !crypto_1.default.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(configuredSecret))) {
                    res.status(403).json({ success: false, error: 'Access denied: invalid bootstrap authorization.' });
                    return;
                }
                // 2. Validate payload
                const parsed = bootstrapSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Validation failed',
                        details: parsed.error.flatten().fieldErrors,
                    });
                    return;
                }
                const { username, password, displayName } = parsed.data;
                // 3. Concurrency-safe atomic initialization
                const result = await prisma_1.systemPrisma.$transaction(async (tx) => {
                    // Check atomic marker
                    const initMarker = await tx.setting.findUnique({
                        where: { key: 'system.bootstrapped' },
                    });
                    const userCount = await tx.user.count();
                    if (initMarker?.value === 'true' || userCount > 0) {
                        throw new Error('SYSTEM_ALREADY_INITIALIZED');
                    }
                    // Create default profile record if missing
                    let defaultProf = await tx.profile.findUnique({ where: { code: prisma_1.defaultProfile } });
                    if (!defaultProf) {
                        defaultProf = await tx.profile.create({
                            data: {
                                code: prisma_1.defaultProfile,
                                name: prisma_1.defaultProfile,
                                isActive: true,
                            },
                        });
                    }
                    // Hash password
                    const passwordHash = await auth_service_1.authService.hashPassword(password);
                    const adminUser = await tx.user.create({
                        data: {
                            username: username.toLowerCase().trim(),
                            displayName,
                            passwordHash,
                            role: auth_service_1.ROLES.SUPER_ADMIN,
                            isActive: true,
                        },
                    });
                    // Link admin to default profile
                    await tx.userProfile.create({
                        data: {
                            userId: adminUser.id,
                            profileId: defaultProf.id,
                            role: auth_service_1.ROLES.SUPER_ADMIN,
                            isActive: true,
                        },
                    });
                    // Permanently mark bootstrap complete
                    await tx.setting.create({
                        data: {
                            key: 'system.bootstrapped',
                            value: 'true',
                        },
                    });
                    return {
                        id: adminUser.id,
                        username: adminUser.username,
                        displayName: adminUser.displayName,
                        role: adminUser.role,
                    };
                });
                res.status(201).json({
                    success: true,
                    data: result,
                    message: 'System bootstrap successful. Endpoint is now permanently closed.',
                });
            }
            catch (error) {
                if (error.message === 'SYSTEM_ALREADY_INITIALIZED') {
                    res.status(403).json({
                        success: false,
                        error: 'System is already initialized. Bootstrap cannot be run again.',
                    });
                    return;
                }
                next(error);
            }
        };
        /**
         * POST /api/auth/users/:userId/deactivate or DELETE /api/auth/users/:userId
         * Safe user soft-deactivation (Admin only).
         */
        this.deactivateUser = async (req, res, next) => {
            try {
                const rawUserId = req.params.userId;
                const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
                if (!userId) {
                    res.status(400).json({ success: false, error: 'User ID is required' });
                    return;
                }
                const currentUser = req.user;
                if (currentUser && currentUser.id === userId) {
                    res.status(400).json({
                        success: false,
                        error: 'Cannot deactivate your own active user account.',
                        message: 'Cannot deactivate your own active user account.',
                    });
                    return;
                }
                const result = await auth_service_1.authService.deactivateUser(userId);
                res.json({ success: true, data: result });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/auth/users/:userId/reactivate
         * Reactivate previously deactivated user (Admin only).
         */
        this.reactivateUser = async (req, res, next) => {
            try {
                const rawUserId = req.params.userId;
                const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
                if (!userId) {
                    res.status(400).json({ success: false, error: 'User ID is required' });
                    return;
                }
                const result = await auth_service_1.authService.reactivateUser(userId);
                res.json({ success: true, data: result });
            }
            catch (error) {
                next(error);
            }
        };
    }
}
exports.AuthController = AuthController;
exports.authController = new AuthController();
//# sourceMappingURL=auth.controller.js.map