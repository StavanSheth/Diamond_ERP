import { Request, Response, NextFunction } from 'express';
import { 
  requestContext, 
  isConfiguredProfile, 
  getCanonicalProfile, 
  defaultProfile 
} from '../infrastructure/database/prisma';
import { AuthenticatedRequest } from './auth';

const PROFILE_FORMAT_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;

/**
 * Server-side Profile Authorization Middleware.
 * 
 * Enforces:
 * Authenticated User
 *         ↓
 * User/Profile Membership
 *         ↓
 * Requested Profile
 *         ↓
 * Server-side authorization
 *         ↓
 * Canonical Profile Context
 *         ↓
 * Scoped Prisma/database client
 * 
 * Never allows client-controlled arbitrary SQLite file access.
 */
export function profileMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const rawHeader = req.headers['x-profile-id'];
  const requestedProfile = typeof rawHeader === 'string' ? rawHeader.trim() : undefined;

  // 1. If requested profile header is present, validate format strictly
  if (requestedProfile !== undefined && requestedProfile !== '') {
    if (!PROFILE_FORMAT_REGEX.test(requestedProfile)) {
      res.status(400).json({
        success: false,
        error: `Malformed profile identifier: "${requestedProfile}". Profile names must be alphanumeric with dashes or underscores (1-50 chars).`,
      });
      return;
    }

    // 2. Reject unknown / unconfigured profiles
    if (!isConfiguredProfile(requestedProfile)) {
      res.status(404).json({
        success: false,
        error: `Profile "${requestedProfile}" is not configured on this server.`,
      });
      return;
    }
  }

  // 3. Check authorization if user is authenticated
  const authenticatedUser = (req as AuthenticatedRequest).user;
  let canonicalCode = defaultProfile;

  if (authenticatedUser) {
    const userProfiles = authenticatedUser.profiles || [];

    if (requestedProfile) {
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
        });
        return;
      }

      canonicalCode = targetCode;
    } else {
      // If no header sent, default to user's first assigned profile or defaultProfile if authorized
      if (userProfiles.length > 0) {
        canonicalCode = userProfiles[0];
      }
    }
  } else if (requestedProfile) {
    // Unauthenticated request with requested profile (e.g., pre-auth endpoint)
    const canonical = getCanonicalProfile(requestedProfile);
    if (canonical) {
      canonicalCode = canonical.code;
    }
  }

  const canonical = getCanonicalProfile(canonicalCode);
  const profileId = canonical ? canonical.id : canonicalCode.toLowerCase();

  // 4. Establish canonical profile context in AsyncLocalStorage
  requestContext.run(
    {
      profileId,
      profileCode: canonical ? canonical.code : canonicalCode,
      userId: authenticatedUser?.id,
    },
    () => {
      next();
    },
  );
}
