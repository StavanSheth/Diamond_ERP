import { Request, Response, NextFunction } from 'express';
import { 
  requestContext, 
  isConfiguredProfile, 
  getCanonicalProfile, 
  defaultProfile 
} from '../infrastructure/database/prisma';
import { AuthenticatedRequest } from './auth';
import { logger } from '../infrastructure/logging';

const PROFILE_FORMAT_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;

// ── Profile Middleware Options ──────────────────────────────────────────
export interface ProfileMiddlewareOptions {
  /**
   * When true (default), tenant-scoped endpoints REQUIRE an explicit
   * X-Profile-Id header. Missing header → 400 PROFILE_CONTEXT_REQUIRED.
   * 
   * When false, the middleware will fall back to the user's first
   * assigned profile if no header is provided. This mode should ONLY
   * be used for endpoints that genuinely do not require profile context
   * (e.g., user settings, profile listing).
   */
  required: boolean;
}

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
export function createProfileMiddleware(
  options: ProfileMiddlewareOptions = { required: true },
): (req: Request, res: Response, next: NextFunction) => void {
  return function profileMiddlewareHandler(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const rawHeader = req.headers['x-profile-id'];
    const requestedProfile = typeof rawHeader === 'string' ? rawHeader.trim() : undefined;
    const hasExplicitProfile = requestedProfile !== undefined && requestedProfile !== '';

    // 1. If requested profile header is present, validate format strictly
    if (hasExplicitProfile) {
      if (!PROFILE_FORMAT_REGEX.test(requestedProfile)) {
        res.status(400).json({
          success: false,
          error: `Malformed profile identifier: "${requestedProfile}". Profile names must be alphanumeric with dashes or underscores (1-50 chars).`,
          code: 'INVALID_PROFILE_FORMAT',
        });
        return;
      }

      // 2. Reject unknown / unconfigured profiles
      if (!isConfiguredProfile(requestedProfile)) {
        res.status(404).json({
          success: false,
          error: `Profile "${requestedProfile}" is not configured on this server.`,
          code: 'PROFILE_NOT_CONFIGURED',
        });
        return;
      }
    }

    // 3. Check authorization if user is authenticated
    const authenticatedUser = (req as AuthenticatedRequest).user;
    let canonicalCode: string | undefined;

    if (authenticatedUser) {
      const userProfiles = authenticatedUser.profiles || [];

      // Reject non-SUPER_ADMIN users with 0 assigned profiles
      if (authenticatedUser.role !== 'SUPER_ADMIN' && userProfiles.length === 0) {
        res.status(403).json({
          success: false,
          error: `Forbidden: User "${authenticatedUser.username}" has no active profile memberships.`,
          code: 'NO_PROFILE_MEMBERSHIPS',
        });
        return;
      }

      if (hasExplicitProfile) {
        // Explicit profile requested — verify membership
        const canonical = getCanonicalProfile(requestedProfile);
        const targetCode = canonical ? canonical.code : requestedProfile;

        // Verify user has explicit membership in this profile (or is SUPER_ADMIN)
        const isAuthorized =
          authenticatedUser.role === 'SUPER_ADMIN' ||
          userProfiles.some((p) => p.toLowerCase() === targetCode.toLowerCase());

        if (!isAuthorized) {
          res.status(403).json({
            success: false,
            error: `Forbidden: User "${authenticatedUser.username}" does not have access to profile "${targetCode}".`,
            code: 'PROFILE_ACCESS_DENIED',
          });
          return;
        }

        canonicalCode = targetCode;
      } else {
        // No explicit header — for non-superadmin users, require explicit context if required
        if (options.required && authenticatedUser.role !== 'SUPER_ADMIN') {
          res.status(400).json({
            success: false,
            error: 'Profile context required. Set the X-Profile-Id header to specify which profile this request targets.',
            code: 'PROFILE_CONTEXT_REQUIRED',
          });
          return;
        }

        // Non-required mode: fall back to first assigned profile
        if (userProfiles.length > 0) {
          canonicalCode = userProfiles[0];
          logger.debug(`[ProfileMiddleware] No X-Profile-Id header; falling back to first profile "${canonicalCode}" for user "${authenticatedUser.username}"`);
        } else if (authenticatedUser.role === 'SUPER_ADMIN') {
          canonicalCode = defaultProfile;
          logger.debug(`[ProfileMiddleware] No X-Profile-Id header; SUPER_ADMIN falling back to default profile "${canonicalCode}"`);
        } else {
          res.status(403).json({
            success: false,
            error: `Forbidden: User "${authenticatedUser.username}" has no active profile memberships.`,
            code: 'NO_PROFILE_MEMBERSHIPS',
          });
          return;
        }
      }
    } else if (hasExplicitProfile) {
      // Unauthenticated request with requested profile (e.g., pre-auth endpoint)
      const canonical = getCanonicalProfile(requestedProfile);
      if (canonical) {
        canonicalCode = canonical.code;
      }
    }

    // 4. Resolve final canonical profile or use default for unauthenticated routes
    const resolvedCode = canonicalCode || defaultProfile;
    const canonical = getCanonicalProfile(resolvedCode);
    const profileId = canonical ? canonical.id : resolvedCode.toLowerCase();

    // 5. Establish canonical profile context in AsyncLocalStorage
    requestContext.run(
      {
        profileId,
        profileCode: canonical ? canonical.code : resolvedCode,
        userId: authenticatedUser?.id,
      },
      () => {
        next();
      },
    );
  };
}

/**
 * Default profile middleware — REQUIRES explicit X-Profile-Id header.
 * Use this for all tenant-scoped business endpoints.
 * 
 * This is the safe default: missing profile context → 400 error,
 * preventing accidental cross-tenant data mutations.
 */
export const profileMiddleware = createProfileMiddleware({ required: true });

/**
 * Optional profile middleware — allows fallback to user's first profile.
 * Use ONLY for endpoints where profile context is genuinely optional
 * (e.g., profile listing, user settings, switching profiles).
 */
export const optionalProfileMiddleware = createProfileMiddleware({ required: false });
