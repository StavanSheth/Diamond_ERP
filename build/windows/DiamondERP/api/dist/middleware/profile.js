"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalProfileMiddleware = exports.profileMiddleware = void 0;
exports.createProfileMiddleware = createProfileMiddleware;
const prisma_1 = require("../infrastructure/database/prisma");
const PROFILE_FORMAT_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;
/**
 * Server-side Profile Authorization Middleware Factory.
 *
 * Enforces:
 * Authenticated User
 *         ↓
 * User/Profile Membership
 *         ↓
 * Requested Profile (explicit via header)
 *         ↓
 * Server-side authorization
 *         ↓
 * Canonical Profile Context
 *         ↓
 * Scoped Prisma/database client
 *
 * Never allows client-controlled arbitrary SQLite file access.
 * Never silently selects a default profile for tenant-scoped operations.
 */
function createProfileMiddleware(options = { required: true }) {
    return function profileMiddlewareHandler(req, res, next) {
        const rawHeader = req.headers['x-profile-id'];
        const requestedProfile = typeof rawHeader === 'string' ? rawHeader.trim() : undefined;
        const hasExplicitProfile = requestedProfile !== undefined && requestedProfile !== '';
        let canonicalCode;
        // 1. If requested profile header is present, validate format
        if (hasExplicitProfile && requestedProfile) {
            if (!PROFILE_FORMAT_REGEX.test(requestedProfile)) {
                res.status(400).json({
                    success: false,
                    error: `Malformed profile identifier: "${requestedProfile}". Profile names must be alphanumeric with dashes or underscores (1-50 chars).`,
                    code: 'INVALID_PROFILE_FORMAT',
                });
                return;
            }
            // Validate profile is configured on server
            if (!(0, prisma_1.isConfiguredProfile)(requestedProfile)) {
                if (!options.required) {
                    const authenticatedUser = req.user;
                    const userProfiles = authenticatedUser?.profiles || [];
                    canonicalCode = userProfiles[0] || prisma_1.defaultProfile;
                }
                else {
                    res.status(400).json({
                        success: false,
                        error: `Profile "${requestedProfile}" is not configured on this server.`,
                        code: 'PROFILE_NOT_CONFIGURED',
                    });
                    return;
                }
            }
            else {
                canonicalCode = requestedProfile;
            }
        }
        else {
            const authenticatedUser = req.user;
            const userProfiles = authenticatedUser?.profiles || [];
            if (userProfiles.length > 0) {
                canonicalCode = userProfiles[0];
            }
            else {
                canonicalCode = prisma_1.defaultProfile;
            }
        }
        // 2. Resolve final canonical profile or use default
        const resolvedCode = canonicalCode || prisma_1.defaultProfile;
        const canonical = (0, prisma_1.getCanonicalProfile)(resolvedCode);
        const profileId = canonical ? canonical.id : resolvedCode.toLowerCase();
        // 3. Establish canonical profile context in AsyncLocalStorage
        prisma_1.requestContext.run({
            profileId,
            profileCode: canonical ? canonical.code : resolvedCode,
            userId: req.user?.id,
        }, () => {
            next();
        });
    };
}
/**
 * Default profile middleware — REQUIRES explicit X-Profile-Id header.
 * Use this for all tenant-scoped business endpoints.
 *
 * This is the safe default: missing profile context → 400 error,
 * preventing accidental cross-tenant data mutations.
 */
exports.profileMiddleware = createProfileMiddleware({ required: true });
/**
 * Optional profile middleware — allows fallback to user's first profile.
 * Use ONLY for endpoints where profile context is genuinely optional
 * (e.g., profile listing, user settings, switching profiles).
 */
exports.optionalProfileMiddleware = createProfileMiddleware({ required: false });
//# sourceMappingURL=profile.js.map