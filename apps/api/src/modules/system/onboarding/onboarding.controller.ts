import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { onboardingService } from './onboarding.service';
import { onboardingAuthorizationService } from './onboarding-authorization.service';

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
  userId: z.string().optional(),
  targetUserId: z.string().optional(),
  confirmAttachment: z.boolean(),
});

const createDatabaseSchema = z.object({
  userId: z.string().min(1, 'Target user ID is required'),
  displayName: z.string().min(1, 'Database display name is required').max(100),
  profileCode: z.string().max(50).optional(),
  profileName: z.string().max(100).optional(),
  provisioningOperationId: z.string().optional(),
});

const setupPinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
  metadata: z.record(z.string(), z.any()).optional(),
});

const registerDeviceSchema = z.object({
  deviceName: z.string().min(1, 'Device name is required').max(100),
});

export class OnboardingController {
  getOnboardingStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await onboardingAuthorizationService.authorize(req, 'READ_ONBOARDING_STATUS');
      const status = await onboardingService.getOnboardingState();
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  };

  initializeApp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await onboardingAuthorizationService.authorize(req, 'INITIALIZE_APPLICATION');
      const status = await onboardingService.initializeApplication();
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  };

  setupPin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await onboardingAuthorizationService.authorize(req, 'SETUP_PIN');
      const parsed = setupPinSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const status = await onboardingService.setupPin(parsed.data.pin, parsed.data.metadata);
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  };

  registerDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await onboardingAuthorizationService.authorize(req, 'REGISTER_DEVICE');
      const parsed = registerDeviceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const status = await onboardingService.registerDevice(parsed.data.deviceName);
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  };

  discoverUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await onboardingAuthorizationService.authorize(req, 'DISCOVER_USERS');
      const result = await onboardingService.discoverUsers();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  selectUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await onboardingAuthorizationService.authorize(req, 'SELECT_USER');
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
      await onboardingAuthorizationService.authorize(req, 'CREATE_USER');
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

  discoverDatabases = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await onboardingAuthorizationService.authorize(req, 'DISCOVER_DATABASES');
      const result = await onboardingService.discoverDatabases();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  inspectDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await onboardingAuthorizationService.authorize(req, 'INSPECT_DATABASE');
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
      await onboardingAuthorizationService.authorize(req, 'ATTACH_DATABASE');
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
      await onboardingAuthorizationService.authorize(req, 'CREATE_DATABASE');
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

  completeDatabaseSetup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await onboardingAuthorizationService.authorize(req, 'COMPLETE_DATABASE_SETUP');
      const status = await onboardingService.completeDatabaseSetup();
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  };

  completeOnboarding = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await onboardingAuthorizationService.authorize(req, 'COMPLETE_ONBOARDING');
      const result = await onboardingService.completeOnboarding();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  resetRecoverableStep = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await onboardingAuthorizationService.authorize(req, 'RESET_ONBOARDING_STEP');
      const result = await onboardingService.resetRecoverableOnboardingState();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };
}

export const onboardingController = new OnboardingController();
