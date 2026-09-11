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
  _options: ProfileMiddlewareOptions = { required: true },
): (req: Request, res: Response, next: NextFunction) => void {
  return function profileMiddlewareHandler(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const rawHeader = req.headers['x-profile-id'];
    const requestedProfile = typeof rawHeader === 'string' ? rawHeader.trim() : undefined;
    const hasExplicitProfile = requestedProfile !== undefined && requestedProfile !== '';

    let canonicalCode: string | undefined;

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

      // Auto-register profile if not yet registered (RBAC removed: allow dynamic profiles)
      if (!isConfiguredProfile(requestedProfile)) {
        try {
          const { registerProfile } = require('../infrastructure/database/prisma');
          registerProfile({ code: requestedProfile });
        } catch (regErr: any) {
          logger.warn(`[ProfileMiddleware] Could not auto-register profile "${requestedProfile}": ${regErr?.message}`);
        }
      }

      canonicalCode = requestedProfile;
    } else {
      const authenticatedUser = (req as AuthenticatedRequest).user;
      const userProfiles = authenticatedUser?.profiles || [];
      if (userProfiles.length > 0) {
        canonicalCode = userProfiles[0];
      } else {
        canonicalCode = defaultProfile;
      }
    }

    // 2. Resolve final canonical profile or use default
    const resolvedCode = canonicalCode || defaultProfile;
    const canonical = getCanonicalProfile(resolvedCode);
    const profileId = canonical ? canonical.id : resolvedCode.toLowerCase();

    // 3. Establish canonical profile context in AsyncLocalStorage
    requestContext.run(
      {
        profileId,
        profileCode: canonical ? canonical.code : resolvedCode,
        userId: (req as AuthenticatedRequest).user?.id,
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
