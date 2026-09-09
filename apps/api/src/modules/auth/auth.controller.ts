import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { authService, AuthenticatedUser, ROLES } from './auth.service';
import { systemPrisma, defaultProfile } from '../../infrastructure/database/prisma';
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
  profiles: z.array(z.string()).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
});

const bootstrapSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  displayName: z.string().min(1, 'Display name is required').max(100),
});

// ── Extend Request type ─────────────────────────────────────────────────
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

// ── Controller ──────────────────────────────────────────────────────────
export class AuthController {

  /**
   * POST /api/auth/login
   * Authenticate user, create session, and return JWT token.
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
      const result = await authService.login(username, password, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

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
        profiles: user.profiles,
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

      const { username, password, displayName, role, profiles } = parsed.data;
      const user = await authService.createUser(username, password, displayName, role, profiles);

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
   * Invalidate the current session or all sessions.
   */
  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as AuthenticatedRequest).user;
      const logoutAll = req.query.all === 'true';

      if (logoutAll) {
        await authService.invalidateSessions(user.id);
      } else if (user.sessionId) {
        await authService.revokeSession(user.sessionId);
      } else {
        await authService.invalidateSessions(user.id);
      }
      
      res.json({
        success: true,
        message: logoutAll ? 'Logged out successfully from all devices' : 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/auth/bootstrap
   * Secure initialization: requires BOOTSTRAP_SECRET header, verifies system uninitialized,
   * atomically creates the first administrator, and permanently disables the endpoint.
   */
  bootstrap = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const configuredSecret = process.env.BOOTSTRAP_SECRET;
      
      // In production or when BOOTSTRAP_SECRET is not configured, endpoint is completely disabled
      if (!configuredSecret) {
        res.status(403).json({
          success: false,
          error: 'Bootstrap endpoint is disabled. Configure BOOTSTRAP_SECRET to enable initial setup.',
        });
        return;
      }

      // 1. Verify bootstrap secret from dedicated header via constant-time comparison
      const rawHeaderSecret = req.headers['x-bootstrap-secret'];
      const providedSecret = typeof rawHeaderSecret === 'string' ? rawHeaderSecret.trim() : '';

      if (
        !providedSecret ||
        providedSecret.length !== configuredSecret.length ||
        !crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(configuredSecret))
      ) {
        res.status(403).json({ success: false, error: 'Access denied: invalid bootstrap authorization.' });
        return;
      }

      // 2. Validate payload
      const parsed = bootstrapSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const { username, password, displayName } = parsed.data;

      // 3. Concurrency-safe atomic initialization
      const result = await systemPrisma.$transaction(async (tx) => {
        // Check atomic marker
        const initMarker = await tx.setting.findUnique({
          where: { key: 'system.bootstrapped' },
        });
        const userCount = await tx.user.count();

        if (initMarker?.value === 'true' || userCount > 0) {
          throw new Error('SYSTEM_ALREADY_INITIALIZED');
        }

        // Create default profile record if missing
        let defaultProf = await tx.profile.findUnique({ where: { code: defaultProfile } });
        if (!defaultProf) {
          defaultProf = await tx.profile.create({
            data: {
              code: defaultProfile,
              name: defaultProfile,
              isActive: true,
            },
          });
        }

        // Hash password
        const passwordHash = await authService.hashPassword(password);
        const adminUser = await tx.user.create({
          data: {
            username: username.toLowerCase().trim(),
            displayName,
            passwordHash,
            role: ROLES.SUPER_ADMIN,
            isActive: true,
          },
        });

        // Link admin to default profile
        await tx.userProfile.create({
          data: {
            userId: adminUser.id,
            profileId: defaultProf.id,
            role: ROLES.SUPER_ADMIN,
            isActive: true,
          },
        });

        // Permanently mark bootstrap complete
        await tx.setting.create({
          data: {
            key: 'system.bootstrapped',
            value: 'true',
          },
        });

        return {
          id: adminUser.id,
          username: adminUser.username,
          displayName: adminUser.displayName,
          role: adminUser.role,
        };
      });

      res.status(201).json({
        success: true,
        data: result,
        message: 'System bootstrap successful. Endpoint is now permanently closed.',
      });
    } catch (error: any) {
      if (error.message === 'SYSTEM_ALREADY_INITIALIZED') {
        res.status(403).json({
          success: false,
          error: 'System is already initialized. Bootstrap cannot be run again.',
        });
        return;
      }
      next(error);
    }
  };
}

export const authController = new AuthController();
