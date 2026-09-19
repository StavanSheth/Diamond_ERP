import { systemPrisma } from '../../infrastructure/database/prisma';
import { installationService } from '../system/installation.service';
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
   * Uses positive sanitization to ensure no credential leaks occur.
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
      delete sanitizedMeta.secret;

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
   * Atomically records a PIN authentication failure (used by verifyPin and changePin).
   * Increments failed attempts, triggers 15-minute lockout at threshold (5 attempts),
   * and emits appropriate audit events.
   */
  async recordPinFailure(
    deviceId: string,
    meta?: AuditMeta,
    context: 'VERIFY' | 'CHANGE_PIN' = 'VERIFY'
  ): Promise<{
    failedAttempts: number;
    remainingAttempts: number;
    isLockedOut: boolean;
    lockedUntil: Date | null;
  }> {
    const updated = await systemPrisma.$transaction(async (tx) => {
      const now = new Date();
      const current = await tx.deviceSecurity.findUnique({
        where: { deviceId },
      });

      // If existing lockout has expired, start a new failure sequence at 1
      const isExpired = !!(current?.lockedUntil && current.lockedUntil <= now);

      let sec;
      if (isExpired) {
        sec = await tx.deviceSecurity.update({
          where: { deviceId },
          data: {
            failedAttempts: 1,
            lockedUntil: null,
          },
        });
      } else {
        // Atomic database increment avoids race conditions on concurrent failures
        sec = await tx.deviceSecurity.update({
          where: { deviceId },
          data: {
            failedAttempts: { increment: 1 },
          },
        });
      }

      // Check if threshold reached
      if (sec.failedAttempts >= SECURITY_CONFIG.MAX_FAILED_PIN_ATTEMPTS) {
        if (!sec.lockedUntil || sec.lockedUntil <= now) {
          const lockoutTime = new Date(now.getTime() + SECURITY_CONFIG.PIN_LOCKOUT_DURATION_MS);
          sec = await tx.deviceSecurity.update({
            where: { deviceId },
            data: {
              lockedUntil: lockoutTime,
            },
          });
        }
      }

      return sec;
    });

    const isLockedOut = !!(updated.lockedUntil && updated.lockedUntil > new Date());
    const remaining = Math.max(0, SECURITY_CONFIG.MAX_FAILED_PIN_ATTEMPTS - updated.failedAttempts);

    if (isLockedOut) {
      await this.recordAuditEvent(
        SECURITY_AUDIT_EVENTS.PIN_LOCKED,
        deviceId,
        `Authentication lockout activated after ${updated.failedAttempts} consecutive failed attempts (${context})`,
        meta,
        { failedAttempts: updated.failedAttempts, lockedUntil: updated.lockedUntil?.toISOString() }
      );
    } else {
      await this.recordAuditEvent(
        SECURITY_AUDIT_EVENTS.PIN_VERIFICATION_FAILED,
        deviceId,
        `PIN verification failed (attempt ${updated.failedAttempts}, context: ${context})`,
        meta,
        { attempt: updated.failedAttempts, remainingAttempts: remaining }
      );
    }

    return {
      failedAttempts: updated.failedAttempts,
      remainingAttempts: remaining,
      isLockedOut,
      lockedUntil: updated.lockedUntil,
    };
  }

  /**
   * Retrieves or initializes the DeviceSecurity record for a given deviceId.
   * Enforces cross-installation isolation: device must belong to current installation.
   */
  async getOrCreateDeviceSecurity(deviceId: string): Promise<{
    device: any;
    security: any;
  }> {
    const localId = installationService.getOrGenerateDeviceId();
    const install = await installationService.getOrCreateInstallation();

    let device = await systemPrisma.device.findUnique({
      where: { deviceId },
      include: { installation: true },
    });

    if (!device) {
      if (deviceId === localId) {
        device = await systemPrisma.device.create({
          data: {
            installationId: install.id,
            deviceId: localId,
            deviceName: 'Main Workstation',
            platform: 'WINDOWS',
            status: 'ACTIVE',
            lastSeenAt: new Date(),
          },
          include: { installation: true },
        });
      } else {
        throw new NotFoundError(`Device "${deviceId}" not found in system registry.`);
      }
    } else if (deviceId === localId && device.installationId !== install.id) {
      // Re-bind local device if prior installation was archived/reinstalled
      device = await systemPrisma.device.update({
        where: { id: device.id },
        data: { installationId: install.id, status: 'ACTIVE' },
        include: { installation: true },
      });
    }

    // Cross-installation boundary enforcement
    if (device.installationId !== install.id) {
      throw new AuthorizationError('Security operation rejected: Device belongs to another installation.');
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
   * Decouples workstation screen lock (applicationLocked) from authentication lockout (authenticationLockedUntil).
   */
  async getSecurityStatus(deviceId: string): Promise<SecurityStatusDto> {
    const { device, security } = await this.getOrCreateDeviceSecurity(deviceId);

    const now = new Date();
    const isAuthLocked = !!(security.lockedUntil && security.lockedUntil > now);
    const lockedUntilIso = isAuthLocked ? security.lockedUntil!.toISOString() : null;

    // If lockout duration has elapsed, treat effective failed attempts as 0 for remaining count
    const isExpiredLockout = security.lockedUntil && security.lockedUntil <= now;
    const effectiveFailedAttempts = isAuthLocked
      ? security.failedAttempts
      : (isExpiredLockout ? 0 : security.failedAttempts);

    const remaining = Math.max(0, SECURITY_CONFIG.MAX_FAILED_PIN_ATTEMPTS - effectiveFailedAttempts);
    const isEffectivelyLocked = security.isLocked || isAuthLocked;

    return {
      deviceId: device.deviceId,
      isPinConfigured: !!security.pinHash,
      configured: !!security.pinHash,
      applicationLocked: security.isLocked,
      authenticationLockedUntil: lockedUntilIso,
      isLocked: isEffectivelyLocked, // Backward-compatible alias (locked if either screen locked or auth locked out)
      lockedUntil: lockedUntilIso,  // Backward-compatible alias for auth lockout
      failedAttempts: effectiveFailedAttempts,
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

    // Concurrency check via atomic conditional update
    const updated = await systemPrisma.$transaction(async (tx) => {
      // First try conditional update where pinHash is null
      const updateResult = await tx.deviceSecurity.updateMany({
        where: {
          deviceId,
          pinHash: null,
        },
        data: {
          pinHash,
          pinConfiguredAt: new Date(),
          failedAttempts: 0,
          lockedUntil: null,
          isLocked: false,
        },
      });

      if (updateResult.count > 0) {
        return tx.deviceSecurity.findUniqueOrThrow({ where: { deviceId } });
      }

      // If update matched 0 rows, check if already configured
      const existing = await tx.deviceSecurity.findUnique({ where: { deviceId } });
      if (existing?.pinHash) {
        throw new ConflictError('PIN is already configured for this device. Use PIN change instead.');
      }

      // Otherwise record didn't exist yet: insert
      return tx.deviceSecurity.create({
        data: {
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
      applicationLocked: false,
      authenticationLockedUntil: null,
      failedAttempts: updated.failedAttempts,
      isLocked: false,
      lockedUntil: null,
      lastAuthenticatedAt: updated.lastAuthenticatedAt?.toISOString() || null,
      lastPinChangeAt: updated.lastPinChangeAt?.toISOString() || null,
    };
  }

  /**
   * Verifies an input PIN against the device security record.
   * Manages failed attempts, automatic 15-min lockout on 5 failures, and lockout expiration.
   * Invariant: During active lockout, all attempts (even correct PIN) are rejected.
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

    // Invariant: Check if device is in an active lockout window
    // During active lockout, even a correct PIN cannot authenticate.
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
        applicationLocked: security.isLocked,
        authenticationLockedUntil: security.lockedUntil.toISOString(),
        isLocked: true,
        locked: true,
        failedAttemptsRemaining: 0,
        remainingAttempts: 0,
        lockedUntil: security.lockedUntil.toISOString(),
        message: 'Device is temporarily locked out due to multiple failed attempts.',
      };
    }

    // If lockout duration has elapsed, reset lockout and failed attempts counter
    // Invariant: Do NOT reset isLocked (workstation screen lock) on lockout expiration.
    // Screen unlock strictly requires authenticating with the correct PIN.
    if (security.lockedUntil && security.lockedUntil <= now) {
      await systemPrisma.deviceSecurity.update({
        where: { deviceId },
        data: {
          failedAttempts: 0,
          lockedUntil: null,
        },
      });
      security.failedAttempts = 0;
      security.lockedUntil = null;
    }

    const isValid = await pinService.verifyPinHash(pin, security.pinHash);

    if (isValid) {
      // Successful verification: reset failed attempts, clear lockout & lock, and record authentication timestamp
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
        applicationLocked: false,
        authenticationLockedUntil: null,
        isLocked: false,
        locked: false,
        failedAttemptsRemaining: SECURITY_CONFIG.MAX_FAILED_PIN_ATTEMPTS,
        remainingAttempts: SECURITY_CONFIG.MAX_FAILED_PIN_ATTEMPTS,
      };
    } else {
      // Failed verification: atomically record failure using centralized helper
      const failure = await this.recordPinFailure(deviceId, meta, 'VERIFY');

      return {
        success: false,
        applicationLocked: security.isLocked,
        authenticationLockedUntil: failure.lockedUntil?.toISOString() || null,
        isLocked: security.isLocked || failure.isLockedOut,
        locked: security.isLocked || failure.isLockedOut,
        failedAttemptsRemaining: failure.remainingAttempts,
        remainingAttempts: failure.remainingAttempts,
        lockedUntil: failure.lockedUntil?.toISOString() || null,
        message: failure.isLockedOut ? 'Device locked out due to multiple failed attempts.' : 'Incorrect PIN',
      };
    }
  }

  /**
   * Authenticated PIN change requiring valid current PIN.
   * Enforces lockout checks, prevents same-PIN reuse, resets counters, and invalidates active sessions on this device.
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

    const now = new Date();

    // Check if device is in active lockout
    if (security.lockedUntil && security.lockedUntil > now) {
      throw new AuthenticationError('Device is temporarily locked out. PIN cannot be changed during lockout.');
    }

    // Invariant: Prevent same-PIN reuse
    if (currentPin === newPin) {
      throw new ValidationError('New PIN must be different from current PIN.');
    }

    // Verify current PIN using unified failure mechanism
    const isCurrentValid = await pinService.verifyPinHash(currentPin, security.pinHash);
    if (!isCurrentValid) {
      const failure = await this.recordPinFailure(deviceId, meta, 'CHANGE_PIN');
      if (failure.isLockedOut) {
        throw new AuthenticationError('Incorrect current PIN. Device is now locked out due to multiple failed attempts.');
      }
      throw new AuthenticationError(`Current PIN is incorrect. ${failure.remainingAttempts} attempts remaining.`);
    }

    const newPinHash = await pinService.hashPin(newPin);

    // Atomically update PIN with optimistic concurrency on verified pinHash,
    // clear lockout, and revoke active sessions for this device
    const updated = await systemPrisma.$transaction(async (tx) => {
      const updateResult = await tx.deviceSecurity.updateMany({
        where: {
          deviceId,
          pinHash: security.pinHash, // Condition: pinHash must still match the verified current hash
        },
        data: {
          pinHash: newPinHash,
          lastPinChangeAt: new Date(),
          failedAttempts: 0,
          lockedUntil: null,
          isLocked: false,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictError('PIN was modified concurrently by another request. Please try again.');
      }

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

      return tx.deviceSecurity.findUniqueOrThrow({ where: { deviceId } });
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
      applicationLocked: false,
      authenticationLockedUntil: null,
      failedAttempts: 0,
      isLocked: false,
      lockedUntil: null,
      lastAuthenticatedAt: updated.lastAuthenticatedAt?.toISOString() || null,
      lastPinChangeAt: updated.lastPinChangeAt?.toISOString() || null,
    };
  }

  /**
   * Explicitly locks the application workstation (screen shield / idle lock).
   * Invariant: Mutates applicationLocked (isLocked) only; does not alter authentication lockout.
   */
  async lockApplication(deviceId: string, meta?: AuditMeta): Promise<LockStateDto> {
    const { device, security } = await this.getOrCreateDeviceSecurity(deviceId);
    if (device.status === 'REVOKED') {
      throw new AuthorizationError('Cannot lock application: Device is revoked.');
    }

    await systemPrisma.deviceSecurity.update({
      where: { deviceId },
      data: { isLocked: true },
    });

    await this.recordAuditEvent(
      SECURITY_AUDIT_EVENTS.APPLICATION_LOCKED,
      deviceId,
      'Application locked explicitly',
      meta,
      { state: 'LOCKED' }
    );

    const now = new Date();
    const isAuthLocked = !!(security.lockedUntil && security.lockedUntil > now);
    const lockedUntilIso = isAuthLocked ? security.lockedUntil!.toISOString() : null;

    return {
      applicationLocked: true,
      authenticationLockedUntil: lockedUntilIso,
      isLocked: true,
      lockedUntil: lockedUntilIso,
    };
  }

  /**
   * Unlocks the application workstation using valid PIN authentication.
   */
  async unlockApplication(deviceId: string, pin: string, meta?: AuditMeta): Promise<LockStateDto> {
    const { device } = await this.getOrCreateDeviceSecurity(deviceId);
    if (device.status === 'REVOKED') {
      throw new AuthorizationError('Cannot unlock application: Device is revoked.');
    }

    const verification = await this.verifyPin(deviceId, pin, meta);
    if (!verification.success) {
      throw new AuthenticationError(
        verification.locked || (verification.authenticationLockedUntil !== null && verification.authenticationLockedUntil !== undefined)
          ? 'Application is locked out due to multiple failed attempts.'
          : `Incorrect PIN. ${verification.failedAttemptsRemaining ?? verification.remainingAttempts} attempts remaining.`
      );
    }

    await systemPrisma.deviceSecurity.update({
      where: { deviceId },
      data: { isLocked: false },
    });

    await this.recordAuditEvent(
      SECURITY_AUDIT_EVENTS.APPLICATION_UNLOCKED,
      deviceId,
      'Application unlocked successfully',
      meta
    );

    return {
      applicationLocked: false,
      authenticationLockedUntil: null,
      isLocked: false,
      lockedUntil: null,
    };
  }

  /**
   * Ensures device is bound and initialized.
   */
  async bindDevice(deviceId: string, meta?: AuditMeta): Promise<SecurityStatusDto> {
    const { device } = await this.getOrCreateDeviceSecurity(deviceId);
    if (device.status === 'REVOKED') {
      throw new AuthorizationError('Cannot bind device: Device is revoked.');
    }

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
