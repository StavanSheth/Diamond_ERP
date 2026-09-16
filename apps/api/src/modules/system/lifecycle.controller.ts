import { Request, Response, NextFunction } from 'express';
import { installationService } from './installation.service';
import { databaseRegistryService } from './database/database-registry.service';
import { databaseValidationService } from './database/database-validation.service';
import { z } from 'zod';

import { authService } from '../auth/auth.service';

const updateStateSchema = z.object({
  lifecycleState: z.enum([
    'NOT_INITIALIZED',
    'APP_SETUP',
    'PIN_SETUP',
    'DEVICE_SETUP',
    'USER_DISCOVERY',
    'DATABASE_DISCOVERY',
    'DATABASE_VALIDATION',
    'DATABASE_SETUP',
    'READY',
  ]),
  isReset: z.boolean().optional(),
});

const registerDeviceSchema = z.object({
  deviceId: z.string().optional(),
  deviceName: z.string().min(1).max(100),
  platform: z.string().max(50).optional(),
  osVersion: z.string().max(100).optional(),
});

const validateDatabaseSchema = z.object({
  path: z.string().min(1),
});

const registerDatabaseSchema = z.object({
  path: z.string().min(1),
  displayName: z.string().max(100).optional(),
  databaseType: z.string().max(50).optional(),
  profileId: z.string().optional(),
});

const associateUserSchema = z.object({
  userId: z.string().min(1),
  installationId: z.string().optional(),
});

export class LifecycleController {
  /**
   * Helper: Enforce bootstrap security boundary.
   * If installation is already READY, mutations require authenticated caller.
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
        message: 'Installation is fully initialized. Lifecycle modifications require authentication.',
      });
      return false;
    }
    return true;
  }

  /**
   * GET /api/system/lifecycle
   * Public probe returning the current installation status and lifecycle state.
   */
  getLifecycleStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await installationService.getLifecycleStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/system/installation
   * Returns complete installation details and registered devices.
   */
  getInstallation = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const install = await installationService.getOrCreateInstallation();
      res.json({ success: true, data: install });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/system/lifecycle-state
   * Update the authoritative lifecycle state machine.
   */
  updateLifecycleState = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!(await this.checkBootstrapAccess(req, res))) return;

      const parsed = updateStateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const updated = await installationService.updateLifecycleState(parsed.data.lifecycleState, {
        isReset: parsed.data.isReset,
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/system/device
   * Register or update the local desktop Device.
   */
  registerDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!(await this.checkBootstrapAccess(req, res))) return;

      const parsed = registerDeviceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const device = await installationService.registerDevice({
        deviceId: parsed.data.deviceId,
        deviceName: parsed.data.deviceName,
        platform: parsed.data.platform,
        osVersion: parsed.data.osVersion,
      });
      res.status(201).json({ success: true, data: device });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/system/database/validate
   * Read-only inspection of a candidate SQLite database file.
   */
  validateDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = validateDatabaseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const result = await databaseValidationService.validateDatabase(parsed.data.path);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/system/database/register
   * Register a database file in the control database registry.
   */
  registerDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = registerDatabaseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const install = await installationService.getOrCreateInstallation();
      const registered = await databaseRegistryService.registerDatabase({
        rawPath: parsed.data.path,
        displayName: parsed.data.displayName,
        databaseType: parsed.data.databaseType,
        profileId: parsed.data.profileId,
        installationId: install.id,
      });
      res.status(201).json({ success: true, data: registered });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/system/database/list
   * List all registered databases for the local installation.
   */
  listDatabases = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const install = await installationService.getOrCreateInstallation();
      const list = await databaseRegistryService.listDatabases(install.id);
      res.json({ success: true, data: list });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/system/device/:deviceId/revoke
   */
  revokeDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawDeviceId = req.params.deviceId;
      const deviceId = Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId;
      const device = await installationService.revokeDevice(deviceId);
      res.json({ success: true, data: device });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/system/device/:deviceId/reactivate
   */
  reactivateDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawDeviceId = req.params.deviceId;
      const deviceId = Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId;
      const device = await installationService.reactivateDevice(deviceId);
      res.json({ success: true, data: device });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/system/users/associate
   */
  associateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = associateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const install = await installationService.getOrCreateInstallation();
      const installationId = parsed.data.installationId || install.id;
      const result = await installationService.associateUser(installationId, parsed.data.userId);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/system/users/disassociate
   */
  disassociateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = associateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const install = await installationService.getOrCreateInstallation();
      const installationId = parsed.data.installationId || install.id;
      await installationService.disassociateUser(installationId, parsed.data.userId);
      res.json({ success: true, message: 'User disassociated from installation' });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/system/users
   */
  getInstallationUsers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const install = await installationService.getOrCreateInstallation();
      const users = await installationService.getInstallationUsers(install.id);
      res.json({ success: true, data: users });
    } catch (error) {
      next(error);
    }
  };
}

export const lifecycleController = new LifecycleController();
