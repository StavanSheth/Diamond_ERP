import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { onboardingService } from './onboarding.service';
import { installationService } from '../installation.service';
import { authService } from '../../auth/auth.service';

const selectUserSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
});

const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  displayName: z.string().min(1, 'Display name is required').max(100),
  role: z.string().optional(),
});

const inspectDatabaseSchema = z.object({
  path: z.string().min(1, 'Database path is required'),
});

const attachDatabaseSchema = z.object({
  path: z.string().min(1, 'Database path is required'),
  displayName: z.string().max(100).optional(),
  profileCode: z.string().max(50).optional(),
  profileName: z.string().max(100).optional(),
  confirmAttachment: z.boolean(),
});

const createDatabaseSchema = z.object({
  displayName: z.string().min(1, 'Database display name is required').max(100),
  profileCode: z.string().max(50).optional(),
  profileName: z.string().max(100).optional(),
});

export class OnboardingController {
  /**
   * Enforces bootstrap security boundary:
   * If installation is already READY, onboarding mutations require an authenticated session.
   */
  private async checkBootstrapAccess(req: Request, res: Response): Promise<boolean> {
    const install = await installationService.getOrCreateInstallation();
    let user = (req as any).user;
    if (!user && req.headers?.authorization?.startsWith('Bearer ')) {
      const token = req.headers.authorization.substring(7);
      const payload = authService.verifyToken(token);
      if (payload) {
        user = payload;
      }
    }

    if (install.lifecycleState === 'READY' && (!user || user.id === 'default-admin')) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Installation is fully initialized. Modifying onboarding state requires authenticated administrative access.',
      });
      return false;
    }
    return true;
  }

  getOnboardingStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await onboardingService.getOnboardingState();
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  };

  initializeApp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!(await this.checkBootstrapAccess(req, res))) return;
      const status = await onboardingService.initializeApplication();
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  };

  discoverUsers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await onboardingService.discoverUsers();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  selectUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!(await this.checkBootstrapAccess(req, res))) return;
      const parsed = selectUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await onboardingService.selectExistingUser(parsed.data.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!(await this.checkBootstrapAccess(req, res))) return;
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await onboardingService.createBusinessUser(parsed.data);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  discoverDatabases = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await onboardingService.discoverDatabases();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  inspectDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = inspectDatabaseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const preview = await onboardingService.inspectDatabaseCandidate(parsed.data.path);
      res.json({ success: true, data: preview });
    } catch (err) {
      next(err);
    }
  };

  attachDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!(await this.checkBootstrapAccess(req, res))) return;
      const parsed = attachDatabaseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await onboardingService.attachExistingDatabase(parsed.data);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  createDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!(await this.checkBootstrapAccess(req, res))) return;
      const parsed = createDatabaseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await onboardingService.createNewDatabase(parsed.data);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  completeOnboarding = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!(await this.checkBootstrapAccess(req, res))) return;
      const result = await onboardingService.completeOnboarding();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  resetRecoverableStep = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!(await this.checkBootstrapAccess(req, res))) return;
      const result = await onboardingService.resetRecoverableOnboardingState();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };
}

export const onboardingController = new OnboardingController();
