import { Request, Response, NextFunction } from 'express';
import { authService, AuthenticatedUser, ROLES } from '../modules/auth/auth.service';
import { RequestWithId } from './request-id';
import { systemPrisma, getAllProfiles } from '../infrastructure/database/prisma';
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
    }

    // Determine profiles user is authorized to access
    let authorizedProfiles: string[] = [];
    if (user.role === ROLES.SUPER_ADMIN) {
      authorizedProfiles = getAllProfiles();
    } else {
      authorizedProfiles = user.userProfiles
        .filter((up) => up.isActive && up.profile.isActive)
        .map((up) => up.profile.code);
    }

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
        let authorizedProfiles: string[] = [];
        if (user.role === ROLES.SUPER_ADMIN) {
          authorizedProfiles = getAllProfiles();
        } else {
          authorizedProfiles = user.userProfiles
            .filter((up) => up.isActive && up.profile.isActive)
            .map((up) => up.profile.code);
        }

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
