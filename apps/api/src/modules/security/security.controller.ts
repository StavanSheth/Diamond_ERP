import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { securityService } from './security.service';
import { installationService } from '../system/installation.service';
import { authService } from '../auth/auth.service';
import { ValidationError, AuthorizationError } from '../../errors';

const pinSetupSchema = z.object({
  pin: z.string().min(1, 'PIN is required').max(20),
  deviceId: z.string().optional(),
});

const pinVerifySchema = z.object({
  pin: z.string().min(1, 'PIN is required').max(20),
  deviceId: z.string().optional(),
});

const pinChangeSchema = z.object({
  currentPin: z.string().min(1, 'Current PIN is required').max(20),
  newPin: z.string().min(1, 'New PIN is required').max(20),
  deviceId: z.string().optional(),
});

const lockSchema = z.object({
  deviceId: z.string().optional(),
});

const unlockSchema = z.object({
  pin: z.string().min(1, 'PIN is required').max(20),
  deviceId: z.string().optional(),
});

const bindDeviceSchema = z.object({
  deviceId: z.string().optional(),
});

export class SecurityController {
  private getAuditMeta(req: Request) {
    const user = (req as any).user;
    return {
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      userId: user?.userId || user?.id,
      sessionId: user?.sessionId,
    };
  }

  /**
   * Helper: Enforces bootstrap security rules.
   * If installation is READY, privileged security mutations require authentication.
   */
  private async checkBootstrapAccess(req: Request): Promise<boolean> {
    const install = await installationService.getOrCreateInstallation();
    let user = (req as any).user;
    if (!user && req.headers?.authorization?.startsWith('Bearer ')) {
      const token = req.headers.authorization.substring(7);
      const payload = authService.verifyToken(token);
      if (payload) {
        user = payload;
      }
    }

    if (install.lifecycleState === 'READY' && !user) {
      return false;
    }
    return true;
  }

  getSecurityStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deviceId = req.query.deviceId as string | undefined;
      const status = await securityService.getStatus(deviceId);
      res.status(200).json(status);
    } catch (err) {
      next(err);
    }
  };

  setupPin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const isAllowed = await this.checkBootstrapAccess(req);
      if (!isAllowed) {
        throw new AuthorizationError('Installation is READY. Authenticated authorization required to configure security.');
      }

      const parsed = pinSetupSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid PIN setup request', parsed.error.format());
      }

      const meta = this.getAuditMeta(req);
      const result = await securityService.setupPin(parsed.data.pin, parsed.data.deviceId, meta);

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  verifyPin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = pinVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid PIN verify request', parsed.error.format());
      }

      const meta = this.getAuditMeta(req);
      const result = await securityService.verifyPin(parsed.data.pin, parsed.data.deviceId, meta);

      // Return 200 with result status (success/locked/remainingAttempts)
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  changePin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = pinChangeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid PIN change request', parsed.error.format());
      }

      const meta = this.getAuditMeta(req);
      const result = await securityService.changePin(
        parsed.data.currentPin,
        parsed.data.newPin,
        parsed.data.deviceId,
        meta
      );

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  lock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = lockSchema.safeParse(req.body);
      const deviceId = parsed.success ? parsed.data.deviceId : undefined;
      const meta = this.getAuditMeta(req);
      const result = await securityService.lock(deviceId, meta);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  unlock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = unlockSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid unlock request', parsed.error.format());
      }

      const meta = this.getAuditMeta(req);
      const result = await securityService.unlock(parsed.data.pin, parsed.data.deviceId, meta);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  bindDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = bindDeviceSchema.safeParse(req.body);
      const deviceId = parsed.success ? parsed.data.deviceId : undefined;
      const meta = this.getAuditMeta(req);
      const result = await securityService.bind(deviceId, meta);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export const securityController = new SecurityController();
