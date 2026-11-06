"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.optionalAuthenticate = optionalAuthenticate;
const auth_service_1 = require("../modules/auth/auth.service");
const prisma_1 = require("../infrastructure/database/prisma");
const logging_1 = require("../infrastructure/logging");
const config_1 = require("../config");
/**
 * Helper to assign default system admin credentials for local desktop ERP usage.
 * Automatically binds to the real primary active user in SQLite if one exists.
 */
async function assignDefaultAdmin(req) {
    const defaultProfiles = (0, prisma_1.getAllProfiles)();
    try {
        const realUser = await prisma_1.systemPrisma.user.findFirst({
            where: { isActive: true, deletedAt: null },
            orderBy: { createdAt: 'asc' },
            include: {
                userProfiles: {
                    include: { profile: true },
                },
            },
        });
        if (realUser) {
            const userProfileCodes = realUser.userProfiles?.filter((up) => up.isActive).map((up) => up.profile.code) || [];
            const authorizedProfiles = realUser.role === auth_service_1.ROLES.SUPER_ADMIN
                ? Array.from(new Set([...userProfileCodes, ...defaultProfiles]))
                : (userProfileCodes.length > 0 ? userProfileCodes : [prisma_1.defaultProfile]);
            req.user = {
                id: realUser.id,
                username: realUser.username,
                displayName: realUser.displayName,
                role: realUser.role,
                sessionId: 'desktop-session',
                profiles: authorizedProfiles,
            };
            return;
        }
    }
    catch (err) {
        logging_1.logger.warn(`Could not resolve primary user for default admin: ${err?.message || err}`);
    }
    req.user = {
        id: 'default-admin',
        username: 'admin',
        displayName: 'System Administrator',
        role: auth_service_1.ROLES.SUPER_ADMIN,
        sessionId: 'desktop-session',
        profiles: defaultProfiles,
    };
}
/**
 * Authentication middleware.
 * Validates JWT, user active status, token version, and active session.
 * For local desktop ERP mode without auth headers, automatically authenticates as Super Admin.
 */
async function authenticate(req, res, next) {
    const requestId = req.requestId || 'unknown';
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        await assignDefaultAdmin(req);
        next();
        return;
    }
    const token = authHeader.substring(7);
    const payload = auth_service_1.authService.verifyToken(token);
    if (!payload) {
        if (!config_1.config.isProduction) {
            await assignDefaultAdmin(req);
            next();
            return;
        }
        res.status(401).json({
            success: false,
            error: 'Invalid or expired authentication token.',
            requestId,
        });
        return;
    }
    try {
        // Session and user validation against primary/system database
        const user = await prisma_1.systemPrisma.user.findUnique({
            where: { id: payload.userId },
            include: {
                userProfiles: {
                    include: { profile: true },
                },
            },
        });
        if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
            if (!config_1.config.isProduction) {
                await assignDefaultAdmin(req);
                next();
                return;
            }
            res.status(401).json({
                success: false,
                error: 'Session expired or invalidated. Please log in again.',
                requestId,
            });
            return;
        }
        // If session ID is present in token, ensure session was not revoked or missing (Fail-Closed)
        if (payload.sessionId) {
            const session = await prisma_1.systemPrisma.session.findUnique({
                where: { id: payload.sessionId },
            });
            if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== user.id) {
                res.status(401).json({
                    success: false,
                    error: 'Session has been revoked, expired, or is invalid. Please log in again.',
                    requestId,
                });
                return;
            }
            if (session.deviceId) {
                const device = await prisma_1.systemPrisma.device.findUnique({
                    where: { deviceId: session.deviceId },
                });
                if (device && device.status === 'REVOKED') {
                    res.status(401).json({
                        success: false,
                        error: 'Device has been revoked. Access denied.',
                        requestId,
                    });
                    return;
                }
            }
        }
        // User-Profile Isolation:
        // Non-super-admin users are strictly scoped to their assigned profiles in userProfiles.
        // SUPER_ADMIN has access to all registered profiles.
        const userProfileCodes = user.userProfiles?.filter((up) => up.isActive).map((up) => up.profile.code) || [];
        const authorizedProfiles = user.role === auth_service_1.ROLES.SUPER_ADMIN
            ? Array.from(new Set([...userProfileCodes, ...(0, prisma_1.getAllProfiles)()]))
            : (userProfileCodes.length > 0 ? userProfileCodes : [prisma_1.defaultProfile]);
        req.user = {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            sessionId: payload.sessionId,
            profiles: authorizedProfiles,
        };
        next();
    }
    catch (error) {
        next(error);
    }
}
/**
 * Optional authentication middleware.
 */
async function optionalAuthenticate(req, _res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
    }
    const token = authHeader.substring(7);
    const payload = auth_service_1.authService.verifyToken(token);
    if (payload) {
        try {
            const user = await prisma_1.systemPrisma.user.findUnique({
                where: { id: payload.userId },
                include: {
                    userProfiles: {
                        include: { profile: true },
                    },
                },
            });
            if (user && user.isActive && user.tokenVersion === payload.tokenVersion) {
                const authorizedProfiles = (0, prisma_1.getAllProfiles)();
                req.user = {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    role: user.role,
                    sessionId: payload.sessionId,
                    profiles: authorizedProfiles,
                };
            }
        }
        catch (err) {
            logging_1.logger.warn(`[optionalAuthenticate] Ignored error during optional auth: ${err?.message || err}`);
        }
    }
    next();
}
//# sourceMappingURL=auth.js.map