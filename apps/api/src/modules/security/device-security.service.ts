import { systemPrisma } from '../../infrastructure/database/prisma';
import { logger } from '../../infrastructure/logging';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
} from '../../errors';
import { SECURITY_CONFIG, SECURITY_AUDIT_EVENTS } from './security.constants';
import { pinService } from './pin.service';
import type {
  SecurityStatusDto,
  PinVerificationResponse,
  LockStateDto,
  DeviceSecurityDto,
} from './security.types';

export interface AuditMeta {
  ip?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
}

export class DeviceSecurityService {
  /**
   * Safe audit event recording. Never logs plaintext PIN, hash, or secrets.
   */
  private async recordAuditEvent(
    eventType: string,
    entityId: string,
    description: string,
    meta?: AuditMeta,
    extraMetadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const sanitizedMeta: Record<string, unknown> = {
        ...(extraMetadata || {}),
        timestamp: new Date().toISOString(),
      };
      // Explicitly delete any sensitive fields if accidentally passed
      delete sanitizedMeta.pin;
      delete sanitizedMeta.pinHash;
      delete sanitizedMeta.currentPin;
      delete sanitizedMeta.newPin;
      delete sanitizedMeta.password;
      delete sanitizedMeta.token;

      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'DeviceSecurity',
          entityId,
          eventType,
          description,
          metadata: JSON.stringify(sanitizedMeta),
          performedBy: meta?.userId || 'SYSTEM',
          ipAddress: meta?.ip,
          deviceId: entityId,
          sessionId: meta?.sessionId,
        },
      });
    } catch (err: any) {
      logger.error(`Failed to record security audit event ${eventType}: ${err.message}`);
    }
  }

  /**
   * Retrieves or initializes the DeviceSecurity record for a given deviceId.
   */
  async getOrCreateDeviceSecurity(deviceId: string): Promise<{
    device: any;
    security: any;
  }> {
    const device = await systemPrisma.device.findUnique({
      where: { deviceId },
    });

    if (!device) {
      throw new NotFoundError(`Device "${deviceId}" not found in system registry.`);
    }

    let security = await systemPrisma.deviceSecurity.findUnique({
      where: { deviceId },
    });

    if (!security) {
      try {
        security = await systemPrisma.deviceSecurity.create({
          data: {
            deviceId,
            failedAttempts: 0,
            isLocked: false,
          },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          security = await systemPrisma.deviceSecurity.findUnique({
            where: { deviceId },
          });
        } else {
          throw err;
        }
      }
    }

    return { device, security: security! };
  }

  /**
   * Returns sanitized, non-secret security status of the device.
   * Invariant: Never exposes pinHash or secrets.
   */
  async getSecurityStatus(deviceId: string): Promise<SecurityStatusDto> {
    const { device, security } = await this.getOrCreateDeviceSecurity(deviceId);

    const now = new Date();
    let isCurrentlyLocked = security.isLocked;
    let lockedUntilIso: string | null = null;

    if (security.lockedUntil) {
      if (security.lockedUntil > now) {
        isCurrentlyLocked = true;
        lockedUntilIso = security.lockedUntil.toISOString();
      } else if (security.lockedUntil <= now && security.failedAttempts >= SECURITY_CONFIG.MAX_FAILED_PIN_ATTEMPTS) {
        // Lockout expired automatically
        isCurrentlyLocked = false;
        lockedUntilIso = null;
      }
    }

    const failedAttempts = isCurrentlyLocked && security.lockedUntil && security.lockedUntil > now
      ? security.failedAttempts
      : (security.lockedUntil && security.lockedUntil <= now ? 0 : security.failedAttempts);

    const remaining = Math.max(0, SECURITY_CONFIG.MAX_FAILED_PIN_ATTEMPTS - failedAttempts);

    return {
      deviceId: device.deviceId,
      isPinConfigured: !!security.pinHash,
      configured: !!security.pinHash,
      isLocked: isCurrentlyLocked,
      lockedUntil: lockedUntilIso,
      failedAttempts,
      failedAttemptsRemaining: remaining,
      isDeviceBound: true,
      deviceBound: true,
      deviceStatus: device.status as 'ACTIVE' | 'REVOKED' | 'PENDING',
      lastAuthenticatedAt: security.lastAuthenticatedAt?.toISOString() || null,
    };
  }

  /**
   * Initial PIN setup. Allowed only when PIN is not yet configured.
   * Invariant: Concurrent setups must fail for all but one winner.
   */
  async setupPin(deviceId: string, pin: string, meta?: AuditMeta): Promise<DeviceSecurityDto> {
    const validation = pinService.validatePin(pin);
    if (!validation.valid) {
      throw new ValidationError(validation.reason || 'Invalid PIN format');
    }

    const { device } = await this.getOrCreateDeviceSecurity(deviceId);
    if (device.status === 'REVOKED') {
      throw new AuthorizationError('Cannot configure PIN: Device is revoked.');
    }

    const pinHash = await pinService.hashPin(pin);

    // Concurrency check via transaction
    const updated = await systemPrisma.$transaction(async (tx) => {
      const current = await tx.deviceSecurity.findUnique({
        where: { deviceId },
      });

      if (current?.pinHash) {
        throw new ConflictError('PIN is already configured for this device. Use PIN change instead.');
      }

      return tx.deviceSecurity.upsert({
        where: { deviceId },
        update: {
          pinHash,
          pinConfiguredAt: new Date(),
          failedAttempts: 0,
          lockedUntil: null,
          isLocked: false,
        },
        create: {
          deviceId,
          pinHash,
          pinConfiguredAt: new Date(),
          failedAttempts: 0,
          lockedUntil: null,
          isLocked: false,
        },
      });
    });

    await this.recordAuditEvent(
      SECURITY_AUDIT_EVENTS.PIN_CONFIGURED,
      deviceId,
      'Application PIN configured successfully',
      meta
    );

    return {
      deviceId: updated.deviceId,
      isPinConfigured: true,
      configured: true,
      failedAttempts: updated.failedAttempts,
      isLocked: updated.isLocked,
      lockedUntil: updated.lockedUntil?.toISOString() || null,
      lastAuthenticatedAt: updated.lastAuthenticatedAt?.toISOString() || null,
      lastPinChangeAt: updated.lastPinChangeAt?.toISOString() || null,
    };
  }

  /**
   * Verifies an input PIN against the device security record.
   * Manages failed attempts, automatic 15-min lockout on 5 failures, and lockout expiration.
   */
  async verifyPin(deviceId: string, pin: string, meta?: AuditMeta): Promise<PinVerificationResponse> {
    const { device, security } = await this.getOrCreateDeviceSecurity(deviceId);

    if (device.status === 'REVOKED') {
      await this.recordAuditEvent(
        SECURITY_AUDIT_EVENTS.DEVICE_AUTH_FAILURE,
        deviceId,
        'Authentication rejected: Device is revoked',
        meta
      );
      throw new AuthorizationError('Device has been revoked. Access denied.');
    }

    if (!security.pinHash) {
      throw new BusinessRuleError('Application PIN is not configured.');
    }

    const now = new Date();

    // Check if device is in an active lockout window
    if (security.lockedUntil && security.lockedUntil > now) {
      await this.recordAuditEvent(
        SECURITY_AUDIT_EVENTS.PIN_VERIFICATION_FAILED,
        deviceId,
        'PIN verification blocked: device currently locked out',
        meta,
        { lockoutActive: true }
      );
      return {
        success: false,
        isLocked: true,
        locked: true,
        failedAttemptsRemaining: 0,
        remainingAttempts: 0,
        lockedUntil: security.lockedUntil.toISOString(),
      };
    }

    // If lockout duration has elapsed, reset lockout and failed attempts counter
    if (security.lockedUntil && security.lockedUntil <= now) {
      await systemPrisma.deviceSecurity.update({
        where: { deviceId },
        data: {
          failedAttempts: 0,
          lockedUntil: null,
          isLocked: false,
        },
      });
    }

    const isValid = await pinService.verifyPinHash(pin, security.pinHash);

    if (isValid) {
      // Successful verification: reset failed attempts and record authentication timestamp
      await systemPrisma.deviceSecurity.update({
        where: { deviceId },
        data: {
          failedAttempts: 0,
          lockedUntil: null,
          isLocked: false,
          lastAuthenticatedAt: new Date(),
        },
      });

      await this.recordAuditEvent(
        SECURITY_AUDIT_EVENTS.PIN_VERIFICATION_SUCCESS,
        deviceId,
        'PIN verification succeeded',
        meta
      );

      return {
        success: true,
        isLocked: false,
        locked: false,
        failedAttemptsRemaining: SECURITY_CONFIG.MAX_FAILED_PIN_ATTEMPTS,
        remainingAttempts: SECURITY_CONFIG.MAX_FAILED_PIN_ATTEMPTS,
      };
    } else {
      // Failed verification: atomically increment failed attempts
      const updated = await systemPrisma.$transaction(async (tx) => {
        const latest = await tx.deviceSecurity.findUnique({
          where: { deviceId },
        });
        const newCount = (latest?.failedAttempts || 0) + 1;
        const willLock = newCount >= SECURITY_CONFIG.MAX_FAILED_PIN_ATTEMPTS;
        const newLockout = willLock ? new Date(Date.now() + SECURITY_CONFIG.PIN_LOCKOUT_DURATION_MS) : null;

        return tx.deviceSecurity.update({
          where: { deviceId },
          data: {
            failedAttempts: newCount,
            isLocked: willLock ? true : latest?.isLocked || false,
            lockedUntil: newLockout || latest?.lockedUntil,
          },
        });
      });

      if (updated.isLocked && updated.lockedUntil) {
        await this.recordAuditEvent(
          SECURITY_AUDIT_EVENTS.PIN_LOCKED,
          deviceId,
          `PIN locked after ${updated.failedAttempts} consecutive failed attempts`,
          meta,
          { failedAttempts: updated.failedAttempts }
        );

        return {
          success: false,
          isLocked: true,
          locked: true,
          failedAttemptsRemaining: 0,
          remainingAttempts: 0,
          lockedUntil: updated.lockedUntil.toISOString(),
        };
      } else {
        const remaining = Math.max(0, SECURITY_CONFIG.MAX_FAILED_PIN_ATTEMPTS - updated.failedAttempts);

        await this.recordAuditEvent(
          SECURITY_AUDIT_EVENTS.PIN_VERIFICATION_FAILED,
          deviceId,
          `PIN verification failed (attempt ${updated.failedAttempts})`,
          meta,
          { attempt: updated.failedAttempts, remainingAttempts: remaining }
        );

        return {
          success: false,
          isLocked: false,
          locked: false,
          failedAttemptsRemaining: remaining,
          remainingAttempts: remaining,
        };
      }
    }
  }

  /**
   * Authenticated PIN change requiring valid current PIN.
   * Resets counters and invalidates active sessions on this device.
   */
  async changePin(
    deviceId: string,
    currentPin: string,
    newPin: string,
    meta?: AuditMeta
  ): Promise<DeviceSecurityDto> {
    const validation = pinService.validatePin(newPin);
    if (!validation.valid) {
      throw new ValidationError(validation.reason || 'Invalid new PIN');
    }

    const { device, security } = await this.getOrCreateDeviceSecurity(deviceId);
    if (device.status === 'REVOKED') {
      throw new AuthorizationError('Cannot change PIN: Device is revoked.');
    }

    if (!security.pinHash) {
      throw new BusinessRuleError('PIN is not configured. Use setup instead.');
    }

    // Verify current PIN
    const isCurrentValid = await pinService.verifyPinHash(currentPin, security.pinHash);
    if (!isCurrentValid) {
      // Increment failed attempt counter on bad current PIN
      await systemPrisma.deviceSecurity.update({
        where: { deviceId },
        data: { failedAttempts: { increment: 1 } },
      });
      await this.recordAuditEvent(
        SECURITY_AUDIT_EVENTS.PIN_VERIFICATION_FAILED,
        deviceId,
        'Failed PIN change: current PIN was incorrect',
        meta
      );
      throw new AuthenticationError('Current PIN is incorrect.');
    }

    const newPinHash = await pinService.hashPin(newPin);

    // Atomically update PIN and revoke existing sessions for this device
    const updated = await systemPrisma.$transaction(async (tx) => {
      const sec = await tx.deviceSecurity.update({
        where: { deviceId },
        data: {
          pinHash: newPinHash,
          lastPinChangeAt: new Date(),
          failedAttempts: 0,
          lockedUntil: null,
          isLocked: false,
        },
      });

      // Invalidate sessions bound to this device
      await tx.session.updateMany({
        where: {
          deviceId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return sec;
    });

    await this.recordAuditEvent(
      SECURITY_AUDIT_EVENTS.PIN_CHANGED,
      deviceId,
      'Application PIN successfully changed and device sessions refreshed',
      meta
    );

    return {
      deviceId: updated.deviceId,
      isPinConfigured: true,
      configured: true,
      failedAttempts: 0,
      isLocked: false,
      lockedUntil: null,
      lastAuthenticatedAt: updated.lastAuthenticatedAt?.toISOString() || null,
      lastPinChangeAt: updated.lastPinChangeAt?.toISOString() || null,
    };
  }

  /**
   * Explicitly locks the application for this device (screen lock/idle lock).
   */
  async lockApplication(deviceId: string, meta?: AuditMeta): Promise<LockStateDto> {
    const { security } = await this.getOrCreateDeviceSecurity(deviceId);

    await systemPrisma.deviceSecurity.update({
      where: { deviceId },
      data: { isLocked: true },
    });

    await this.recordAuditEvent(
      SECURITY_AUDIT_EVENTS.SECURITY_STATE_CHANGED,
      deviceId,
      'Application locked explicitly',
      meta,
      { state: 'LOCKED' }
    );

    return {
      isLocked: true,
      lockedUntil: security.lockedUntil?.toISOString() || null,
    };
  }

  /**
   * Unlocks the application using valid PIN authentication.
   */
  async unlockApplication(deviceId: string, pin: string, meta?: AuditMeta): Promise<LockStateDto> {
    const verification = await this.verifyPin(deviceId, pin, meta);
    if (!verification.success) {
      throw new AuthenticationError(
        verification.isLocked
          ? 'Application is locked out due to multiple failed attempts.'
          : `Incorrect PIN. ${verification.failedAttemptsRemaining ?? verification.remainingAttempts} attempts remaining.`
      );
    }

    await systemPrisma.deviceSecurity.update({
      where: { deviceId },
      data: { isLocked: false },
    });

    await this.recordAuditEvent(
      SECURITY_AUDIT_EVENTS.PIN_UNLOCKED,
      deviceId,
      'Application unlocked successfully',
      meta
    );

    return {
      isLocked: false,
      lockedUntil: null,
    };
  }

  /**
   * Ensures device is bound and initialized.
   */
  async bindDevice(deviceId: string, meta?: AuditMeta): Promise<SecurityStatusDto> {
    const status = await this.getSecurityStatus(deviceId);

    await this.recordAuditEvent(
      SECURITY_AUDIT_EVENTS.DEVICE_BOUND,
      deviceId,
      'Device security binding established',
      meta
    );

    return status;
  }
}

export const deviceSecurityService = new DeviceSecurityService();
