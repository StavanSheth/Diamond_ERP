import { Request, Response, NextFunction } from 'express';
import { authService, AuthenticatedUser } from './auth.service';
import { z } from 'zod';

// ── Validation Schemas ──────────────────────────────────────────────────
const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required').max(200),
});

const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  displayName: z.string().min(1, 'Display name is required').max(100),
  role: z.string().min(1, 'Role is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
});

// ── Extend Request type ─────────────────────────────────────────────────
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

// ── Controller ──────────────────────────────────────────────────────────
export class AuthController {

  /**
   * POST /api/auth/login
   * Authenticate user and return JWT token.
   */
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
      const result = await authService.login(username, password);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
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
  me = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;
    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  };

  /**
   * POST /api/auth/users
   * Create a new user (admin only).
   */
  createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const { username, password, displayName, role } = parsed.data;
      const user = await authService.createUser(username, password, displayName, role);

      res.status(201).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/auth/change-password
   * Change the current user's password.
   */
  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const user = (req as AuthenticatedRequest).user;
      const { currentPassword, newPassword } = parsed.data;

      await authService.changePassword(user.id, currentPassword, newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error: unknown) {
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
   * Invalidate the current user's session globally.
   */
  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as AuthenticatedRequest).user;
      await authService.invalidateSessions(user.id);
      
      res.json({
        success: true,
        message: 'Logged out successfully from all devices',
      });
    } catch (error) {
      next(error);
    }
  };
  /**
   * POST /api/auth/bootstrap
   * Create an initial admin user if the database is empty.
   */
  bootstrap = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password, displayName } = req.body;
      if (!username || !password || !displayName) {
        res.status(400).json({ success: false, error: 'username, password, and displayName are required' });
        return;
      }
      
      const prismaObj = require('../../infrastructure/database/prisma').default;
      const count = await prismaObj.user.count();
      if (count > 0) {
        res.status(403).json({ success: false, error: 'Database is already bootstrapped. Cannot run bootstrap again.' });
        return;
      }

      const user = await authService.createUser(username, password, displayName, 'SUPER_ADMIN');
      res.status(201).json({ success: true, data: user, message: 'Bootstrap successful' });
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();
