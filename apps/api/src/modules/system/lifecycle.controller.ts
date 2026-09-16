import { Request, Response, NextFunction } from 'express';
import { installationService } from './installation.service';
import { z } from 'zod';

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
});

const registerDeviceSchema = z.object({
  deviceName: z.string().min(1).max(100),
  platform: z.string().max(50).optional(),
  osVersion: z.string().max(100).optional(),
});

export class LifecycleController {
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
      const parsed = updateStateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const updated = await installationService.updateLifecycleState(parsed.data.lifecycleState);
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
      const parsed = registerDeviceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const device = await installationService.registerDevice(
        parsed.data.deviceName,
        parsed.data.platform,
        parsed.data.osVersion
      );
      res.status(201).json({ success: true, data: device });
    } catch (error) {
      next(error);
    }
  };
}

export const lifecycleController = new LifecycleController();
