import { Request, Response, NextFunction } from 'express';
import { authService, AuthenticatedUser, ROLES } from '../modules/auth/auth.service';
import { RequestWithId } from './request-id';
import { systemPrisma, getAllProfiles, defaultProfile } from '../infrastructure/database/prisma';
import { logger } from '../infrastructure/logging';
import { config } from '../config';

/**
 * Extends Express Request with authenticated user information.
 */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

/**
 * Helper to assign default system admin credentials for local desktop ERP usage.
 */
function assignDefaultAdmin(req: Request): void {
  const defaultProfiles = getAllProfiles();
  (req as AuthenticatedRequest).user = {
    id: 'default-admin',
    username: 'admin',
    displayName: 'System Administrator',
    role: ROLES.SUPER_ADMIN,
    sessionId: 'desktop-session',
    profiles: defaultProfiles,
  };
}

/**
 * Authentication middleware.
 * Validates JWT, user active status, token version, and active session.
 * For local desktop ERP mode without auth headers, automatically authenticates as Super Admin.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const requestId = (req as RequestWithId).requestId || 'unknown';

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    assignDefaultAdmin(req);
    next();
    return;
  }

  const token = authHeader.substring(7);
  const payload = authService.verifyToken(token);
  if (!payload) {
    if (!config.isProduction) {
      assignDefaultAdmin(req);
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
    const user = await systemPrisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        userProfiles: {
          include: { profile: true },
        },
      },
    });

    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      if (!config.isProduction) {
        assignDefaultAdmin(req);
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
      const session = await systemPrisma.session.findUnique({
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
        const device = await systemPrisma.device.findUnique({
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
    const authorizedProfiles: string[] = user.role === ROLES.SUPER_ADMIN
      ? Array.from(new Set([...userProfileCodes, ...getAllProfiles()]))
      : (userProfileCodes.length > 0 ? userProfileCodes : [defaultProfile]);

    (req as AuthenticatedRequest).user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      sessionId: payload.sessionId,
      profiles: authorizedProfiles,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication middleware.
 */
export async function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);
  const payload = authService.verifyToken(token);
  if (payload) {
    try {
      const user = await systemPrisma.user.findUnique({
        where: { id: payload.userId },
        include: {
          userProfiles: {
            include: { profile: true },
          },
        },
      });

      if (user && user.isActive && user.tokenVersion === payload.tokenVersion) {
        const authorizedProfiles: string[] = getAllProfiles();

        (req as AuthenticatedRequest).user = {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          sessionId: payload.sessionId,
          profiles: authorizedProfiles,
        };
      }
    } catch (err: any) {
      logger.warn(`[optionalAuthenticate] Ignored error during optional auth: ${err?.message || err}`);
    }
  }

  next();
}
