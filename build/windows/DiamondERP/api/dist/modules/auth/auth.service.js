"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.ValidationError = exports.ConflictError = exports.AuthorizationError = exports.AuthenticationError = exports.AuthService = exports.ROLES = exports.AUTH_CONFIG = void 0;
exports.validateAuthConfig = validateAuthConfig;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../../infrastructure/database/prisma");
const logging_1 = require("../../infrastructure/logging");
const paths_1 = require("../../infrastructure/paths");
const errors_1 = require("../../errors");
Object.defineProperty(exports, "AuthenticationError", { enumerable: true, get: function () { return errors_1.AuthenticationError; } });
Object.defineProperty(exports, "AuthorizationError", { enumerable: true, get: function () { return errors_1.AuthorizationError; } });
Object.defineProperty(exports, "ConflictError", { enumerable: true, get: function () { return errors_1.ConflictError; } });
Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return errors_1.ValidationError; } });
// ── Configuration ───────────────────────────────────────────────────────
exports.AUTH_CONFIG = {
    ACCESS_TOKEN_TTL: process.env.JWT_EXPIRES_IN || '24h',
    SESSION_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
    BCRYPT_ROUNDS: 12,
    MIN_PASSWORD_LENGTH: 8,
    MAX_FAILED_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes
};
/**
 * Resolves the JWT signing secret according to strict environment rules.
 * Finding 6.1: Production MUST provide or persist JWT_SECRET (>= 32 chars).
 * Standalone Windows installations automatically generate and persist an instance secret.
 * Non-production environments use explicit fallback secrets.
 */
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (secret) {
        if (process.env.NODE_ENV === 'production' && secret.length < 32) {
            throw new Error('FATAL: JWT_SECRET must be at least 32 characters in production.');
        }
        return secret;
    }
    if (process.env.NODE_ENV === 'production') {
        // For standalone offline desktop mode: load or generate instance-isolated secret
        try {
            const secretFile = path_1.default.join((0, paths_1.getConfigDir)(), '.jwt_secret');
            if (fs_1.default.existsSync(secretFile)) {
                const stored = fs_1.default.readFileSync(secretFile, 'utf-8').trim();
                if (stored && stored.length >= 32) {
                    return stored;
                }
            }
            // Generate cryptographically strong secret and persist to config
            const dir = path_1.default.dirname(secretFile);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            const generated = crypto_1.default.randomBytes(32).toString('hex');
            fs_1.default.writeFileSync(secretFile, generated, { encoding: 'utf-8', mode: 0o600 });
            logging_1.logger.info('Generated and stored persistent instance JWT secret in user configuration.');
            return generated;
        }
        catch (persistErr) {
            throw new Error('FATAL: JWT_SECRET environment variable is missing and could not be initialized: ' +
                persistErr.message);
        }
    }
    if (process.env.NODE_ENV === 'test') {
        return process.env.TEST_JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long-diamond-erp';
    }
    return process.env.DEVELOPMENT_JWT_SECRET || 'dev-jwt-secret-at-least-32-chars-long-diamond-erp';
}
/**
 * Validates that required auth configuration is present.
 * Must fail fast in production.
 */
function validateAuthConfig() {
    const secret = getJwtSecret();
    if (!secret || secret.length < 32) {
        throw new Error('FATAL: JWT signing secret is invalid or less than 32 characters. ' +
            'Production server cannot start without a secure JWT signing secret.');
    }
}
const accountAttempts = new Map();
// ── Roles ───────────────────────────────────────────────────────────────
exports.ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    ACCOUNTANT: 'ACCOUNTANT',
    INVENTORY_MANAGER: 'INVENTORY_MANAGER',
    SALES: 'SALES',
    VIEWER: 'VIEWER',
};
// ── Helpers ─────────────────────────────────────────────────────────────
function hashToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
// ── Service ─────────────────────────────────────────────────────────────
class AuthService {
    /**
     * Hash a plaintext password with bcrypt.
     */
    async hashPassword(password) {
        return bcryptjs_1.default.hash(password, exports.AUTH_CONFIG.BCRYPT_ROUNDS);
    }
    /**
     * Verify a plaintext password against a bcrypt hash.
     */
    async verifyPassword(password, hash) {
        return bcryptjs_1.default.compare(password, hash);
    }
    /**
     * Generate a JWT access token.
     */
    generateToken(payload) {
        const secret = getJwtSecret();
        return jsonwebtoken_1.default.sign(payload, secret, {
            expiresIn: exports.AUTH_CONFIG.ACCESS_TOKEN_TTL,
        });
    }
    /**
     * Verify and decode a JWT token.
     * Returns null if invalid or expired.
     */
    verifyToken(token) {
        const secret = getJwtSecret();
        try {
            const decoded = jsonwebtoken_1.default.verify(token, secret);
            return decoded;
        }
        catch {
            return null;
        }
    }
    /**
     * Records a failed login attempt for account-based brute force protection.
     */
    recordFailedAttempt(username) {
        const record = accountAttempts.get(username) || { failures: 0 };
        record.failures += 1;
        if (record.failures >= exports.AUTH_CONFIG.MAX_FAILED_LOGIN_ATTEMPTS) {
            record.lockoutUntil = new Date(Date.now() + exports.AUTH_CONFIG.LOCKOUT_DURATION_MS);
            logging_1.logger.warn(`Account "${username}" temporarily locked out due to ${record.failures} consecutive failures.`);
        }
        accountAttempts.set(username, record);
    }
    /**
     * Authenticate a user with username and password.
     * Creates a tracked database session and returns accessible profiles.
     */
    async login(username, password, meta) {
        const normalizedUsername = username.toLowerCase().trim();
        // Account-level brute-force check (Finding 10)
        const attemptRecord = accountAttempts.get(normalizedUsername);
        if (attemptRecord?.lockoutUntil && attemptRecord.lockoutUntil > new Date()) {
            const remainingMinutes = Math.ceil((attemptRecord.lockoutUntil.getTime() - Date.now()) / 60000);
            logging_1.logger.warn(`Login rejected: account "${normalizedUsername}" is locked for ${remainingMinutes} more minute(s).`);
            throw new errors_1.AuthenticationError('Account is temporarily locked due to repeated failed login attempts. Please try again later.');
        }
        // Query from system/primary database
        const user = await prisma_1.systemPrisma.user.findUnique({
            where: { username: normalizedUsername },
            include: {
                userProfiles: {
                    include: { profile: true },
                },
            },
        });
        if (!user || !user.isActive) {
            this.recordFailedAttempt(normalizedUsername);
            logging_1.logger.warn(`Failed login attempt: user not found or inactive`);
            throw new errors_1.AuthenticationError('Invalid username or password');
        }
        const isValid = await this.verifyPassword(password, user.passwordHash);
        if (!isValid) {
            this.recordFailedAttempt(normalizedUsername);
            logging_1.logger.warn(`Failed login attempt for account ID: ${user.id}`);
            throw new errors_1.AuthenticationError('Invalid username or password');
        }
        // Login succeeded: reset brute force failure counter
        accountAttempts.delete(normalizedUsername);
        // Invariant (Section 19): If deviceId is provided, reject session creation on a REVOKED device
        if (meta?.deviceId) {
            const device = await prisma_1.systemPrisma.device.findUnique({
                where: { deviceId: meta.deviceId },
            });
            if (device && device.status === 'REVOKED') {
                logging_1.logger.warn(`Login rejected: device ${meta.deviceId} is REVOKED.`);
                throw new errors_1.AuthorizationError('Device has been revoked. Access denied.');
            }
        }
        // User-Profile Isolation:
        // Non-super-admin users are strictly scoped to their assigned profiles in userProfiles.
        // SUPER_ADMIN has access to all registered profiles.
        const userProfileCodes = user.userProfiles?.filter((up) => up.isActive).map((up) => up.profile.code) || [];
        const sortedUserProfiles = [
            ...userProfileCodes.filter((p) => p.toLowerCase() !== prisma_1.defaultProfile.toLowerCase()),
            ...userProfileCodes.filter((p) => p.toLowerCase() === prisma_1.defaultProfile.toLowerCase()),
        ];
        const accessibleProfiles = user.role === exports.ROLES.SUPER_ADMIN
            ? Array.from(new Set([...sortedUserProfiles, ...(0, prisma_1.getAllProfiles)()]))
            : (sortedUserProfiles.length > 0 ? sortedUserProfiles : [prisma_1.defaultProfile]);
        const activeProfile = sortedUserProfiles[0] || accessibleProfiles[0] || prisma_1.defaultProfile;
        // Generate unique session identifier
        const sessionId = crypto_1.default.randomUUID();
        const sessionSecret = crypto_1.default.randomBytes(32).toString('hex');
        const tokenHash = hashToken(sessionSecret);
        // Persist session in database ATOMICALLY - if session creation fails, login MUST fail
        const expiresAt = new Date(Date.now() + exports.AUTH_CONFIG.SESSION_TTL_MS);
        try {
            await prisma_1.systemPrisma.session.create({
                data: {
                    id: sessionId,
                    userId: user.id,
                    tokenHash,
                    deviceId: meta?.deviceId || null,
                    expiresAt,
                    ipAddress: meta?.ip,
                    userAgent: meta?.userAgent,
                    lastUsedAt: new Date(),
                },
            });
        }
        catch (sessionErr) {
            logging_1.logger.error(`Failed to record session in DB for user ${user.id}: ${sessionErr.message}`);
            throw new Error('Authentication system failed to persist session. Please try again.');
        }
        const token = this.generateToken({
            userId: user.id,
            username: user.username,
            role: user.role,
            tokenVersion: user.tokenVersion,
            sessionId,
        });
        // Update last login timestamp with explicit logging (Finding 8)
        try {
            await prisma_1.systemPrisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });
        }
        catch (updateErr) {
            logging_1.logger.warn(`Failed to record lastLoginAt for user ${user.id}: ${updateErr?.message || updateErr}`);
        }
        logging_1.logger.info(`User logged in: ${user.username} (role: ${user.role}, profiles: [${accessibleProfiles.join(', ')}])`);
        return {
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                role: user.role,
                profiles: accessibleProfiles,
                activeProfile,
            },
        };
    }
    /**
     * Create a new user account with optional profile memberships.
     */
    async createUser(username, password, displayName, role = 'ADMIN', profileCodes) {
        const effectiveRole = role && Object.values(exports.ROLES).includes(role) ? role : 'ADMIN';
        if (password.length < exports.AUTH_CONFIG.MIN_PASSWORD_LENGTH) {
            throw new errors_1.ValidationError(`Password must be at least ${exports.AUTH_CONFIG.MIN_PASSWORD_LENGTH} characters long`);
        }
        const normalizedUsername = username.toLowerCase().trim();
        const existing = await prisma_1.systemPrisma.user.findUnique({
            where: { username: normalizedUsername },
        });
        if (existing) {
            throw new errors_1.ConflictError(`User with username "${username}" already exists`);
        }
        const passwordHash = await this.hashPassword(password);
        // Atomic creation of user and profile memberships
        const user = await prisma_1.systemPrisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    username: normalizedUsername,
                    displayName,
                    passwordHash,
                    role: effectiveRole,
                    isActive: true,
                },
            });
            // Ensure default profiles exist in Profile table (only default when profileCodes is omitted and defaultProfile is set)
            // Enforce: Each user will be attached with only one DB and no other DB
            const targetProfiles = profileCodes !== undefined
                ? profileCodes.slice(0, 1)
                : (prisma_1.defaultProfile ? [prisma_1.defaultProfile] : []);
            for (const pCode of targetProfiles) {
                let prof = await tx.profile.findUnique({ where: { code: pCode } });
                if (!prof) {
                    prof = await tx.profile.create({
                        data: {
                            code: pCode,
                            name: pCode,
                            isActive: true,
                        },
                    });
                }
                await tx.userProfile.create({
                    data: {
                        userId: newUser.id,
                        profileId: prof.id,
                        role,
                        isActive: true,
                    },
                });
            }
            return newUser;
        });
        logging_1.logger.info(`User created: ${user.username} (role: ${user.role})`);
        return {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            profiles: profileCodes || [prisma_1.defaultProfile],
        };
    }
    /**
     * Change a user's password and invalidate existing sessions.
     */
    async changePassword(userId, currentPassword, newPassword) {
        const user = await prisma_1.systemPrisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new errors_1.AuthenticationError('User not found');
        }
        const isValid = await this.verifyPassword(currentPassword, user.passwordHash);
        if (!isValid) {
            throw new errors_1.AuthenticationError('Current password is incorrect');
        }
        if (newPassword.length < 8) {
            throw new errors_1.ValidationError('New password must be at least 8 characters long');
        }
        const passwordHash = await this.hashPassword(newPassword);
        await prisma_1.systemPrisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: {
                    passwordHash,
                    tokenVersion: { increment: 1 },
                },
            });
            // Revoke all active sessions
            await tx.session.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
        });
        logging_1.logger.info(`Password changed and all sessions revoked for user: ${user.username}`);
    }
    /**
     * Invalidate all sessions globally for a user.
     */
    async invalidateSessions(userId) {
        await prisma_1.systemPrisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: { tokenVersion: { increment: 1 } },
            });
            await tx.session.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
        });
        logging_1.logger.info(`All sessions invalidated for user ID: ${userId}`);
    }
    /**
     * Revoke a specific single session (device logout).
     */
    async revokeSession(sessionId) {
        await prisma_1.systemPrisma.session.updateMany({
            where: { id: sessionId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        logging_1.logger.info(`Session revoked: ${sessionId}`);
    }
    /**
     * Safe user deactivation (Phase 2 foundation).
     * Soft-deletes user record and revokes sessions without touching SQLite database files.
     * Guarantees: DELETE USER != DELETE DATABASE.
     */
    async deactivateUser(userId) {
        const user = await prisma_1.systemPrisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new errors_1.NotFoundError(`User not found: ${userId}`);
        }
        // Idempotent: if already inactive, ensure sessions remain revoked and return current state
        if (!user.isActive) {
            await prisma_1.systemPrisma.session.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            logging_1.logger.info(`User ${user.username} (${user.id}) was already deactivated. Re-confirmed session revocation.`);
            return {
                id: user.id,
                username: user.username,
                isActive: false,
                deletedAt: user.deletedAt,
            };
        }
        const now = new Date();
        await prisma_1.systemPrisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: {
                    isActive: false,
                    deletedAt: now,
                    tokenVersion: { increment: 1 },
                },
            });
            // Revoke all active sessions
            await tx.session.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: now },
            });
        });
        logging_1.logger.info(`User deactivated (soft-deleted): ${user.username} (${user.id}). Database files remain strictly preserved.`);
        return {
            id: user.id,
            username: user.username,
            isActive: false,
            deletedAt: now,
        };
    }
    /**
     * Reactivate a previously deactivated user.
     */
    async reactivateUser(userId) {
        const user = await prisma_1.systemPrisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new errors_1.NotFoundError(`User not found: ${userId}`);
        }
        if (user.isActive) {
            return {
                id: user.id,
                username: user.username,
                isActive: true,
            };
        }
        await prisma_1.systemPrisma.user.update({
            where: { id: userId },
            data: {
                isActive: true,
                deletedAt: null,
            },
        });
        logging_1.logger.info(`User reactivated: ${user.username} (${user.id})`);
        return {
            id: user.id,
            username: user.username,
            isActive: true,
        };
    }
    /**
     * Seed a default admin user and default profile if database contains no users.
     */
    async seedDefaultAdmin() {
        if (process.env.AUTO_SEED_DEFAULT_ADMIN !== 'true') {
            return;
        }
        const userCount = await prisma_1.systemPrisma.user.count();
        if (userCount > 0)
            return;
        const isProd = process.env.NODE_ENV === 'production';
        const envPassword = process.env.DEFAULT_ADMIN_PASSWORD;
        if (isProd && !envPassword) {
            logging_1.logger.warn('[Auth] Database is uninitialized. Provision initial administrator using /api/auth/bootstrap with BOOTSTRAP_SECRET.');
            return;
        }
        const defaultPassword = envPassword || (process.env.NODE_ENV === 'test' ? 'Admin@123456' : 'Stavan@123');
        // Ensure default profile exists with an active database registry
        const profileCode = prisma_1.defaultProfile || 'Stavan';
        let stavanProfile = await prisma_1.systemPrisma.profile.findFirst({
            where: {
                OR: [
                    { code: profileCode },
                    { code: 'Stavan' },
                ],
            },
            include: {
                databaseRegistries: true,
            },
        });
        if (!stavanProfile) {
            stavanProfile = await prisma_1.systemPrisma.profile.create({
                data: {
                    code: profileCode,
                    name: profileCode,
                    isActive: true,
                },
                include: {
                    databaseRegistries: true,
                },
            });
        }
        const dbPath = path_1.default.resolve(path_1.default.join((0, paths_1.getDatabasesDir)(), `${profileCode}.db`));
        (0, prisma_1.ensureProfileDbFile)(dbPath);
        const { installationService } = await Promise.resolve().then(() => __importStar(require('../system/installation.service')));
        const installation = await installationService.getOrCreateInstallation();
        const activeRegistry = (stavanProfile.databaseRegistries || []).find((r) => r.status === 'ACTIVE');
        if (!activeRegistry) {
            await prisma_1.systemPrisma.databaseRegistry.create({
                data: {
                    databaseId: crypto_1.default.randomUUID(),
                    displayName: `${profileCode} Business Database`,
                    canonicalPath: dbPath,
                    installationId: installation.id,
                    profileId: stavanProfile.id,
                    status: 'ACTIVE',
                    schemaVersion: 1,
                },
            });
        }
        try {
            (0, prisma_1.registerProfile)({
                code: profileCode,
                name: stavanProfile.name,
                dbPath,
            });
            (0, prisma_1.saveConfig)({
                activeProfile: profileCode,
                allowedProfiles: [profileCode],
            });
        }
        catch {
            // Ignore cache registration issues
        }
        await this.createUser('stavan', defaultPassword, 'Stavan', exports.ROLES.SUPER_ADMIN, [profileCode]);
        if (process.env.AUTO_SEED_DEFAULT_ADMIN === 'true' && installation.lifecycleState !== 'READY') {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installation.id },
                data: { lifecycleState: 'READY', initializedAt: new Date() },
            });
            logging_1.logger.info('Installation lifecycle transitioned to READY following auto-seed.');
        }
        if (envPassword) {
            logging_1.logger.info(`Default user "stavan" seeded from DEFAULT_ADMIN_PASSWORD.`);
        }
        else if (process.env.NODE_ENV !== 'test') {
            logging_1.logger.info(`Default user "stavan" seeded with standard password.`);
        }
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
//# sourceMappingURL=auth.service.js.map