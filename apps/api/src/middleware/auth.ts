import { Request, Response, NextFunction } from 'express';
import { authService, AuthenticatedUser } from '../modules/auth/auth.service';
import { RequestWithId } from './request-id';
import prisma from '../infrastructure/database/prisma';

/**
 * Extends Express Request with authenticated user information.
 */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

/**
 * Authentication middleware.
 * 
 * Extracts the JWT token from the Authorization header,
 * verifies it, and attaches the authenticated user to the request.
 * 
 * Expected header format: Authorization: Bearer <token>
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const requestId = (req as RequestWithId).requestId || 'unknown';

  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Provide a valid Bearer token.',
      requestId,
    });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  const payload = authService.verifyToken(token);
  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication token.',
      requestId,
    });
    return;
  }

  try {
    // Session validation: ensure the user exists, is active, and token version matches
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      res.status(401).json({
        success: false,
        error: 'Session expired or invalidated. Please log in again.',
        requestId,
      });
      return;
    }

    // Attach authenticated user to request
    (req as AuthenticatedRequest).user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication middleware.
 * 
 * If a token is present, verifies it and attaches the user.
 * If no token is present, allows the request to proceed without user info.
 * 
 * Useful for endpoints that behave differently for authenticated vs anonymous users.
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
      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (user && user.isActive && user.tokenVersion === payload.tokenVersion) {
        (req as AuthenticatedRequest).user = {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        };
      }
    } catch (error) {
      // Ignore DB errors for optional auth
    }
  }

  next();
}
