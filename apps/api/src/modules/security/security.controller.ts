import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { securityService } from './security.service';
import { installationService } from '../system/installation.service';
import { authService } from '../auth/auth.service';
import { systemPrisma } from '../../infrastructure/database/prisma';
import { ValidationError, AuthorizationError, ConflictError } from '../../errors';

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
   * Helper: Extracts active authenticated user and validates session is not revoked.
   */
  private async getAuthenticatedUser(req: Request) {
    let user = (req as any).user;
    if (user && user.id !== 'default-admin') {
      return user;
    }
    const authHeader = req.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = authService.verifyToken(token);
      if (payload) {
        const dbUser = await systemPrisma.user.findUnique({
          where: { id: payload.userId },
        });
        if (dbUser && dbUser.isActive && dbUser.tokenVersion === payload.tokenVersion) {
          if (payload.sessionId) {
            const session = await systemPrisma.session.findUnique({
              where: { id: payload.sessionId },
            });
            if (!session || session.revokedAt || session.expiresAt < new Date()) {
              return null;
            }
          }
          return {
            id: dbUser.id,
            userId: dbUser.id,
            username: dbUser.username,
            role: dbUser.role,
            sessionId: payload.sessionId,
          };
        }
      }
    }
    return null;
  }

  /**
   * Predicate: Can configure initial PIN.
   * Disallowed if PIN is already configured (ConflictError).
   * In READY state, requires an active authenticated session.
   */
  private async canConfigureInitialPin(req: Request, deviceId: string): Promise<void> {
    const install = await installationService.getOrCreateInstallation();

    // Check if device already has a PIN
    const sec = await systemPrisma.deviceSecurity.findUnique({
      where: { deviceId },
    });
    if (sec?.pinHash) {
      throw new ConflictError('PIN is already configured for this device. Use PIN change instead.');
    }

    if (install.lifecycleState === 'READY') {
      const user = await this.getAuthenticatedUser(req);
      if (!user) {
        throw new AuthorizationError('Installation is READY. Authenticated authorization required to configure initial PIN.');
      }
    }
  }

  /**
   * Predicate: Can change PIN.
   * In READY state, PIN change requires an active authenticated session.
   */
  private async canChangePin(req: Request): Promise<void> {
    const install = await installationService.getOrCreateInstallation();
    if (install.lifecycleState === 'READY') {
      const user = await this.getAuthenticatedUser(req);
      if (!user) {
        throw new AuthorizationError('Authentication required: PIN change requires an active authenticated session once installation is in READY state.');
      }
    }
  }

  /**
   * Predicate: Can bind device.
   * In READY state, device binding requires an active authenticated session.
   */
  private async canBindDevice(req: Request): Promise<void> {
    const install = await installationService.getOrCreateInstallation();
    if (install.lifecycleState === 'READY') {
      const user = await this.getAuthenticatedUser(req);
      if (!user) {
        throw new AuthorizationError('Authentication required: Device binding requires an authenticated session in READY state.');
      }
    }
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
      const parsed = pinSetupSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid PIN setup request', parsed.error.format());
      }

      const authoritativeDeviceId = securityService.resolveAuthoritativeDeviceId(parsed.data.deviceId);
      await this.canConfigureInitialPin(req, authoritativeDeviceId);

      const meta = this.getAuditMeta(req);
      const result = await securityService.setupPin(parsed.data.pin, authoritativeDeviceId, meta);

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
      await this.canChangePin(req);

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
      await this.canBindDevice(req);

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
