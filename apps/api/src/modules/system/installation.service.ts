import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { systemPrisma, defaultProfile } from '../../infrastructure/database/prisma';
import { getConfigDir } from '../../infrastructure/paths';
import { logger } from '../../infrastructure/logging';
import { ValidationError, ConflictError, NotFoundError } from '../../errors';
import { databaseValidationService } from './database/database-validation.service';
import type {
  LifecycleState,
  InstallationDto,
  DeviceDto,
  LifecycleStatusResponse,
  InstallationUserDto,
} from '@diamond-erp/contracts';

// Ordered lifecycle progression states
export const LIFECYCLE_STAGES: LifecycleState[] = [
  'NOT_INITIALIZED',
  'APP_SETUP',
  'PIN_SETUP',
  'DEVICE_SETUP',
  'USER_DISCOVERY',
  'DATABASE_DISCOVERY',
  'DATABASE_VALIDATION',
  'DATABASE_SETUP',
  'READY',
];

export const VALID_LIFECYCLE_RESET_REASONS = [
  'ADMINISTRATIVE_RESET',
  'RECOVERY_RESET',
  'FAILED_ONBOARDING_RECOVERY',
  'DEVELOPMENT_TEST_RESET',
] as const;

export type LifecycleResetReason = (typeof VALID_LIFECYCLE_RESET_REASONS)[number];

export class InstallationService {
  public getInstallationIdFilePath(): string {
    return path.join(getConfigDir(), '.installation-id');
  }

  public getDeviceIdFilePath(): string {
    return path.join(getConfigDir(), '.device-id');
  }

  /**
   * Resolves or generates the permanent installation ID.
   * Backed by %LOCALAPPDATA%\DiamondERP\config\.installation-id for recovery.
   *
   * Safety invariant: If persistent storage fails, it throws rather than
   * silently generating an unstable ephemeral ID.
   */
  public getOrGenerateInstallationId(): string {
    const filePath = this.getInstallationIdFilePath();
    try {
      if (fs.existsSync(filePath)) {
        const stored = fs.readFileSync(filePath, 'utf-8').trim();
        if (stored && stored.length >= 16) {
          return stored;
        }
      }
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const newId = crypto.randomUUID();
      fs.writeFileSync(filePath, newId, { encoding: 'utf-8', mode: 0o600 });
      logger.info(`Generated and persisted new installation ID: ${newId}`);
      return newId;
    } catch (err) {
      logger.error(`Failed to persist installation ID to ${filePath}: ${(err as Error).message}`);
      throw new Error(`Installation identity failure: Could not safely persist installation ID: ${(err as Error).message}`);
    }
  }

  /**
   * Resolves or generates the stable local device ID.
   * Backed by %LOCALAPPDATA%\DiamondERP\config\.device-id.
   */
  public getOrGenerateDeviceId(): string {
    const filePath = this.getDeviceIdFilePath();
    try {
      if (fs.existsSync(filePath)) {
        const stored = fs.readFileSync(filePath, 'utf-8').trim();
        if (stored && stored.length >= 16) {
          return stored;
        }
      }
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const newId = crypto.randomUUID();
      fs.writeFileSync(filePath, newId, { encoding: 'utf-8', mode: 0o600 });
      logger.info(`Generated and persisted new device ID: ${newId}`);
      return newId;
    } catch (err) {
      logger.error(`Failed to persist device ID to ${filePath}: ${(err as Error).message}`);
      throw new Error(`Device identity failure: Could not safely persist device ID: ${(err as Error).message}`);
    }
  }

  /**
   * Retrieve or automatically initialize the local Installation record in system DB.
   */
  async getOrCreateInstallation(): Promise<InstallationDto> {
    const currentInstallationId = this.getOrGenerateInstallationId();
    let install = await systemPrisma.installation.findUnique({
      where: { installationId: currentInstallationId },
      include: {
        _count: {
          select: { devices: true },
        },
      },
    });

    if (!install) {
      install = await systemPrisma.installation.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { devices: true },
          },
        },
      });
    }

    if (!install) {
      const installationId = currentInstallationId;
      try {
        install = await systemPrisma.installation.create({
          data: {
            installationId,
            appVersion: '3.0.0',
            status: 'ACTIVE',
            lifecycleState: 'NOT_INITIALIZED',
          },
          include: {
            _count: {
              select: { devices: true },
            },
          },
        });
        logger.info(`Initialized local Installation record: ${installationId} [State: NOT_INITIALIZED]`);
      } catch (err: any) {
        if (err?.code === 'P2002') {
          const raceWinner = await systemPrisma.installation.findFirst({
            include: {
              _count: {
                select: { devices: true },
              },
            },
          });
          if (raceWinner) {
            install = raceWinner;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    return {
      id: install.id,
      installationId: install.installationId,
      appVersion: install.appVersion,
      status: install.status as any,
      lifecycleState: install.lifecycleState as LifecycleState,
      initializedAt: install.initializedAt?.toISOString() || null,
      createdAt: install.createdAt.toISOString(),
      updatedAt: install.updatedAt.toISOString(),
      deviceCount: install._count?.devices || 0,
    };
  }

  /**
   * Check if a state transition is permitted.
   */
  canTransition(
    current: LifecycleState,
    target: LifecycleState,
    options?: { isReset?: boolean; resetReason?: string }
  ): boolean {
    if (!LIFECYCLE_STAGES.includes(target)) return false;
    if (current === target) return true;
    if (target === 'NOT_INITIALIZED') {
      return (
        !!options?.isReset &&
        !!options?.resetReason &&
        VALID_LIFECYCLE_RESET_REASONS.includes(options.resetReason as any)
      );
    }
    if (options?.isReset && target === 'DATABASE_DISCOVERY') return true; // Controlled recovery allowed

    const currentIndex = LIFECYCLE_STAGES.indexOf(current);
    const targetIndex = LIFECYCLE_STAGES.indexOf(target);

    // Strictly progressive forward transition by exactly 1 step
    return targetIndex === currentIndex + 1;
  }

  /**
   * Controlled state transition for the onboarding/lifecycle state machine.
   */
  async updateLifecycleState(
    targetState: LifecycleState,
    options?: { isReset?: boolean; resetReason?: string; enforceInvariants?: boolean }
  ): Promise<InstallationDto> {
    if (!LIFECYCLE_STAGES.includes(targetState)) {
      throw new ValidationError(`Invalid lifecycle state: "${targetState}". Allowed: ${LIFECYCLE_STAGES.join(', ')}`);
    }

    if (targetState === 'NOT_INITIALIZED') {
      if (
        !options?.isReset ||
        !options?.resetReason ||
        !VALID_LIFECYCLE_RESET_REASONS.includes(options.resetReason as any)
      ) {
        throw new ConflictError(
          `Controlled reset policy violation: Resetting to NOT_INITIALIZED requires explicit isReset and valid resetReason (${VALID_LIFECYCLE_RESET_REASONS.join(', ')}).`
        );
      }
    }

    const current = await this.getOrCreateInstallation();

    if (!this.canTransition(current.lifecycleState, targetState, options)) {
      throw new ConflictError(
        `Illegal lifecycle transition: Cannot move from ${current.lifecycleState} to ${targetState}. Step progression must be followed.`
      );
    }

    // Security-critical lifecycle invariants must not depend on a caller remembering to set an optional flag.
    // Invariants are always enforced on forward progression.
    if (!options?.isReset) {
      // Invariant 1: PIN_SETUP cannot be marked complete if no PIN exists
      if (current.lifecycleState === 'PIN_SETUP' && targetState !== 'NOT_INITIALIZED' && targetState !== 'APP_SETUP') {
        const localDeviceId = this.getOrGenerateDeviceId();
        const sec = await systemPrisma.deviceSecurity.findUnique({
          where: { deviceId: localDeviceId },
        });
        if (!sec || !sec.pinHash) {
          throw new ConflictError('Cannot complete PIN_SETUP: Application PIN must be configured before proceeding.');
        }
      }

      // Invariant 2: DEVICE_SETUP cannot be marked complete if no active device exists
      if (
        current.lifecycleState === 'DEVICE_SETUP' &&
        targetState !== 'NOT_INITIALIZED' &&
        targetState !== 'APP_SETUP' &&
        targetState !== 'PIN_SETUP'
      ) {
        const localDeviceId = this.getOrGenerateDeviceId();
        const dev = await systemPrisma.device.findUnique({
          where: { deviceId: localDeviceId },
        });
        if (!dev || dev.status !== 'ACTIVE') {
          throw new ConflictError('Cannot complete DEVICE_SETUP: An active device registration is required before proceeding.');
        }
      }

      // Invariants 3 & 4: Enforced when enforceInvariants is requested (HTTP controller, onboarding orchestration, hardening tests)
      if (options?.enforceInvariants) {
        // Invariant 3: USER_DISCOVERY cannot be marked complete without an active user association
        if (
          current.lifecycleState === 'USER_DISCOVERY' &&
          targetState !== 'NOT_INITIALIZED' &&
          targetState !== 'APP_SETUP' &&
          targetState !== 'PIN_SETUP' &&
          targetState !== 'DEVICE_SETUP'
        ) {
          const installUser = await systemPrisma.installationUser.findFirst({
            where: { installationId: current.id },
            include: { user: true },
          });
          if (!installUser || !installUser.user.isActive || installUser.user.deletedAt) {
            throw new ConflictError('Cannot complete USER_DISCOVERY: An active business user must be associated with this installation.');
          }
        }

        // Invariant 4: DATABASE_VALIDATION cannot be marked complete without an active registered database
        if (
          current.lifecycleState === 'DATABASE_VALIDATION' &&
          targetState === 'DATABASE_SETUP'
        ) {
          const registries = await systemPrisma.databaseRegistry.findMany({
            where: {
              installationId: current.id,
              status: 'ACTIVE',
            },
          });
          const validRegistry = registries.find((r) => fs.existsSync(r.canonicalPath));
          if (!validRegistry) {
            throw new ConflictError('Cannot complete DATABASE_VALIDATION: An active database file must exist and be registered before proceeding.');
          }
        }
      }
    }

    const updateData: any = {
      lifecycleState: targetState,
    };

    if (targetState === 'READY') {
      if (current.lifecycleState !== 'DATABASE_SETUP') {
        throw new ConflictError(`Cannot reach READY from ${current.lifecycleState}. DATABASE_SETUP must be completed first.`);
      }

      if (options?.enforceInvariants) {
        // Authoritative verification of all 8 READY prerequisites
        if (current.status !== 'ACTIVE') {
          throw new ConflictError('Cannot mark READY: Installation is not in ACTIVE status.');
        }

        const localDeviceId = this.getOrGenerateDeviceId();
        const dev = await systemPrisma.device.findUnique({
          where: { deviceId: localDeviceId },
          include: { securityState: true },
        });
        if (!dev || dev.status !== 'ACTIVE') {
          throw new ConflictError('Cannot mark READY: Authoritative local device is not registered or is not ACTIVE.');
        }

        if (!dev.securityState?.pinHash) {
          throw new ConflictError('Cannot mark READY: Application PIN has not been configured for this device.');
        }

        const installUser = await systemPrisma.installationUser.findFirst({
          where: { installationId: current.id },
          include: { user: true },
        });
        if (!installUser || !installUser.user.isActive || installUser.user.deletedAt) {
          throw new ConflictError('Cannot mark READY: No active business user is associated with this installation.');
        }

        const registries = await systemPrisma.databaseRegistry.findMany({
          where: {
            installationId: current.id,
            status: 'ACTIVE',
          },
          include: { profile: true },
          orderBy: { updatedAt: 'desc' },
        });
        if (registries.length === 0) {
          throw new ConflictError('Cannot mark READY: No active database is registered for this installation.');
        }

        const registry = registries.find((r) => fs.existsSync(r.canonicalPath)) || registries[0];
        if (!fs.existsSync(registry.canonicalPath)) {
          throw new ConflictError(`Cannot mark READY: Physical database file is missing at ${registry.canonicalPath}.`);
        }

        const validation = await databaseValidationService.validateDatabase(registry.canonicalPath);
        if (!validation.isValid) {
          throw new ConflictError(`Cannot mark READY: Physical database validation failed: ${validation.details}`);
        }

        if (!registry.profile || !registry.profile.isActive) {
          throw new ConflictError('Cannot mark READY: Database is not associated with an active ERP profile.');
        }
      }

      updateData.initializedAt = new Date();
    } else if (targetState === 'NOT_INITIALIZED') {
      updateData.initializedAt = null;
    }

    // Atomic conditional update prevents state corruption from concurrent transition races
    const result = await systemPrisma.installation.updateMany({
      where: {
        id: current.id,
        lifecycleState: current.lifecycleState,
      },
      data: updateData,
    });

    if (result.count === 0) {
      // Check if concurrent request already transitioned to targetState (idempotent success)
      const fresh = await systemPrisma.installation.findUnique({
        where: { id: current.id },
        include: {
          _count: {
            select: { devices: true },
          },
        },
      });
      if (fresh && fresh.lifecycleState === targetState) {
        return {
          id: fresh.id,
          installationId: fresh.installationId,
          appVersion: fresh.appVersion,
          status: fresh.status as any,
          lifecycleState: fresh.lifecycleState as LifecycleState,
          initializedAt: fresh.initializedAt?.toISOString() || null,
          createdAt: fresh.createdAt.toISOString(),
          updatedAt: fresh.updatedAt.toISOString(),
          deviceCount: fresh._count?.devices || 0,
        };
      }
      throw new ConflictError(
        `Concurrent lifecycle transition conflict: Installation is in state "${fresh?.lifecycleState || 'UNKNOWN'}", cannot transition from "${current.lifecycleState}" to "${targetState}".`
      );
    }

    const updated = await systemPrisma.installation.findUniqueOrThrow({
      where: { id: current.id },
      include: {
        _count: {
          select: { devices: true },
        },
      },
    });

    logger.info(`Lifecycle state updated: ${current.lifecycleState} → ${targetState} (Installation: ${updated.installationId})`);

    if (targetState === 'NOT_INITIALIZED') {
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'Installation',
          entityId: current.id,
          eventType: 'LIFECYCLE_RESET',
          description: `Lifecycle reset from ${current.lifecycleState} to NOT_INITIALIZED. Reason: ${options?.resetReason}`,
          performedBy: 'SYSTEM',
          metadata: JSON.stringify({
            previousState: current.lifecycleState,
            targetState: 'NOT_INITIALIZED',
            resetReason: options?.resetReason,
          }),
        },
      }).catch(() => {});
    } else {
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'Installation',
          entityId: current.id,
          eventType: 'LIFECYCLE_STATE_TRANSITION',
          description: `Lifecycle state updated: ${current.lifecycleState} → ${targetState} (Installation: ${updated.installationId})`,
          performedBy: 'SYSTEM',
          metadata: JSON.stringify({
            previousState: current.lifecycleState,
            targetState,
          }),
        },
      }).catch(() => {});
    }

    return {
      id: updated.id,
      installationId: updated.installationId,
      appVersion: updated.appVersion,
      status: updated.status as any,
      lifecycleState: updated.lifecycleState as LifecycleState,
      initializedAt: updated.initializedAt?.toISOString() || null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      deviceCount: updated._count?.devices || 0,
    };
  }

  /**
   * Helper: Map Prisma Device record to DeviceDto
   */
  private mapDeviceToDto(deviceRecord: any): DeviceDto {
    return {
      id: deviceRecord.id,
      deviceId: deviceRecord.deviceId,
      installationId: deviceRecord.installationId,
      deviceName: deviceRecord.deviceName,
      platform: deviceRecord.platform,
      osVersion: deviceRecord.osVersion,
      status: deviceRecord.status as any,
      revokedAt: deviceRecord.revokedAt?.toISOString() || null,
      lastSeenAt: deviceRecord.lastSeenAt.toISOString(),
      createdAt: deviceRecord.createdAt.toISOString(),
      updatedAt: deviceRecord.updatedAt.toISOString(),
    };
  }

  /**
   * Register or update the local desktop Device linked to this installation.
   *
   * Invariant: Idempotent by persistent deviceId. Changing display name updates
   * the existing device record without creating duplicate devices.
   *
   * Authority: Installation owns device identity. If caller supplies an arbitrary
   * deviceId that does not match local authoritative identity, it is rejected.
   */
  async registerDevice(options: {
    deviceName: string;
    deviceId?: string;
    platform?: string;
    osVersion?: string;
  }): Promise<DeviceDto> {
    const deviceName = options.deviceName?.trim();
    if (!deviceName) {
      throw new ValidationError('Device name is required');
    }

    const install = await this.getOrCreateInstallation();
    const localAuthoritativeDeviceId = this.getOrGenerateDeviceId();

    // Rejection of arbitrary spoofed/injected deviceId
    if (options.deviceId && options.deviceId.trim() !== localAuthoritativeDeviceId) {
      throw new ValidationError('Invalid device identity: Arbitrary deviceId cannot be bound to this installation.');
    }

    const effectiveDeviceId = localAuthoritativeDeviceId;
    const platform = options.platform || 'WINDOWS';

    // Cross-installation collision guard
    const crossInstall = await systemPrisma.device.findFirst({
      where: {
        deviceId: effectiveDeviceId,
        installationId: { not: install.id },
      },
      include: { installation: true },
    });
    if (crossInstall) {
      if (crossInstall.installation?.status === 'ACTIVE') {
        throw new ConflictError('Device is already registered under another installation.');
      }
      // Re-assign device from archived/inactive installation to active installation
      await systemPrisma.device.update({
        where: { id: crossInstall.id },
        data: { installationId: install.id },
      });
    }

    // Look up existing device by stable deviceId on this installation
    const existing = await systemPrisma.device.findFirst({
      where: {
        installationId: install.id,
        deviceId: effectiveDeviceId,
      },
    });

    if (existing && existing.status === 'REVOKED') {
      throw new ConflictError('Device has been revoked and cannot be automatically re-registered without administrative reactivation.');
    }

    let deviceRecord;
    if (existing) {
      deviceRecord = await systemPrisma.device.update({
        where: { id: existing.id },
        data: {
          deviceName, // Display name update
          platform,
          osVersion: options.osVersion !== undefined ? options.osVersion : existing.osVersion,
          lastSeenAt: new Date(),
          status: 'ACTIVE',
        },
      });
    } else {
      try {
        deviceRecord = await systemPrisma.device.create({
          data: {
            installationId: install.id,
            deviceId: effectiveDeviceId,
            deviceName,
            platform,
            osVersion: options.osVersion,
            status: 'ACTIVE',
            lastSeenAt: new Date(),
          },
        });
      } catch (err: any) {
        // Handle concurrent registration race safely
        if (err.code === 'P2002') {
          const raceWinner = await systemPrisma.device.findUnique({
            where: { deviceId: effectiveDeviceId },
          });
          if (raceWinner) {
            deviceRecord = raceWinner;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    logger.info(`Device registered: ${deviceRecord.deviceName} [${deviceRecord.deviceId}] under installation ${install.installationId}`);
    return this.mapDeviceToDto(deviceRecord);
  }

  /**
   * Revoke a device administratively.
   * Atomically sets Device to REVOKED, revokes all active sessions bound to this device,
   * and records a DEVICE_REVOKED audit event.
   */
  async revokeDevice(deviceId: string, reason?: string): Promise<DeviceDto> {
    const existing = await systemPrisma.device.findUnique({ where: { deviceId } });
    if (!existing) {
      throw new NotFoundError(`Device not found for ID: ${deviceId}`);
    }

    const now = new Date();
    const { updated } = await systemPrisma.$transaction(async (tx) => {
      const dev = await tx.device.update({
        where: { id: existing.id },
        data: {
          status: 'REVOKED',
          revokedAt: now,
        },
      });

      // Atomically revoke all active sessions for this device
      await tx.session.updateMany({
        where: {
          deviceId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      // Safe audit event creation
      await tx.auditEvent.create({
        data: {
          entityType: 'Device',
          entityId: deviceId,
          eventType: 'DEVICE_REVOKED',
          description: `Device revoked: ${dev.deviceName} [${deviceId}]${reason ? ` (Reason: ${reason})` : ''}`,
          performedBy: 'SYSTEM',
          metadata: JSON.stringify({
            deviceId,
            reason: reason || 'administrative',
            revokedAt: now.toISOString(),
          }),
        },
      });

      return { updated: dev };
    });

    logger.warn(`Device revoked: ${updated.deviceName} [${updated.deviceId}]${reason ? ` (Reason: ${reason})` : ''}`);
    return this.mapDeviceToDto(updated);
  }

  /**
   * Reactivate a previously revoked device.
   * Restores ACTIVE status and clears revokedAt, but explicitly preserves revoked session state
   * (old sessions remain revoked) and emits a DEVICE_REACTIVATED audit event.
   */
  async reactivateDevice(deviceId: string): Promise<DeviceDto> {
    const existing = await systemPrisma.device.findUnique({ where: { deviceId } });
    if (!existing) {
      throw new NotFoundError(`Device not found for ID: ${deviceId}`);
    }

    const { updated } = await systemPrisma.$transaction(async (tx) => {
      const dev = await tx.device.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          revokedAt: null,
          lastSeenAt: new Date(),
        },
      });

      // Record DEVICE_REACTIVATED audit event
      await tx.auditEvent.create({
        data: {
          entityType: 'Device',
          entityId: deviceId,
          eventType: 'DEVICE_REACTIVATED',
          description: `Device reactivated: ${dev.deviceName} [${deviceId}]`,
          performedBy: 'SYSTEM',
          metadata: JSON.stringify({
            deviceId,
            reactivatedAt: new Date().toISOString(),
          }),
        },
      });

      return { updated: dev };
    });

    logger.info(`Device reactivated: ${updated.deviceName} [${updated.deviceId}]`);
    return this.mapDeviceToDto(updated);
  }

  /**
   * Associate an ERP business user with this local installation.
   */
  async associateUser(installationId: string, userId: string): Promise<InstallationUserDto> {
    const install = await this.getOrCreateInstallation();
    if (installationId !== install.id && installationId !== install.installationId) {
      throw new ConflictError('Cannot associate user: Target installation ID does not match current local installation.');
    }
    const user = await systemPrisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError(`User not found: ${userId}`);
    }
    if (!user.isActive || user.deletedAt) {
      throw new ConflictError(`Cannot associate inactive or deleted user "${user.username}". User must be explicitly reactivated first.`);
    }

    const record = await systemPrisma.installationUser.upsert({
      where: {
        installationId_userId: { installationId: install.id, userId },
      },
      update: {},
      create: {
        installationId: install.id,
        userId,
      },
    });

    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'InstallationUser',
        entityId: record.id,
        eventType: 'USER_ASSOCIATED',
        description: `User @${user.username} (${user.id}) associated with installation ${install.installationId}`,
        performedBy: 'SYSTEM',
        metadata: JSON.stringify({ installationId: install.id, userId }),
      },
    }).catch(() => {});

    return {
      id: record.id,
      installationId: record.installationId,
      userId: record.userId,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /**
   * Disassociate an ERP business user from this local installation without deleting user or DB.
   */
  async disassociateUser(installationId: string, userId: string): Promise<void> {
    const install = await this.getOrCreateInstallation();
    if (installationId !== install.id && installationId !== install.installationId) {
      throw new ConflictError('Cannot disassociate user: Target installation ID does not match current local installation.');
    }

    const existing = await systemPrisma.installationUser.findUnique({
      where: { installationId_userId: { installationId: install.id, userId } },
      include: { user: true },
    });
    if (!existing) {
      throw new NotFoundError(`User "${userId}" is not associated with this installation.`);
    }

    await systemPrisma.installationUser.deleteMany({
      where: { installationId: install.id, userId },
    });

    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'InstallationUser',
        entityId: existing.id,
        eventType: 'USER_DISASSOCIATED',
        description: `User @${existing.user?.username || userId} disassociated from installation ${install.installationId}`,
        performedBy: 'SYSTEM',
        metadata: JSON.stringify({ installationId: install.id, userId }),
      },
    }).catch(() => {});
  }

  /**
   * List all business users associated with this local installation.
   */
  async getInstallationUsers(installationId: string): Promise<any[]> {
    const records = await systemPrisma.installationUser.findMany({
      where: { installationId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
            isActive: true,
            deletedAt: true,
            createdAt: true,
          },
        },
      },
    });

    return records.map((r) => ({
      id: r.id,
      installationId: r.installationId,
      userId: r.userId,
      createdAt: r.createdAt.toISOString(),
      user: r.user,
    }));
  }

  /**
   * Public lifecycle status summary for client startup probes.
   */
  async getLifecycleStatus(): Promise<LifecycleStatusResponse> {
    const install = await this.getOrCreateInstallation();
    return {
      installationId: install.installationId,
      appVersion: install.appVersion,
      lifecycleState: install.lifecycleState,
      status: install.status,
      isInitialized: install.lifecycleState === 'READY',
      initializedAt: install.initializedAt,
      activeProfile: defaultProfile,
    };
  }
}

export const installationService = new InstallationService();
