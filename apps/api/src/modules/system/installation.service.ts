import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { systemPrisma, defaultProfile } from '../../infrastructure/database/prisma';
import { getConfigDir } from '../../infrastructure/paths';
import { logger } from '../../infrastructure/logging';
import { ValidationError, ConflictError, NotFoundError } from '../../errors';
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
      logger.info(`Generated and persisted local device ID: ${newId}`);
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
    let install = await systemPrisma.installation.findFirst({
      include: {
        _count: {
          select: { devices: true },
        },
      },
    });

    if (!install) {
      const installationId = this.getOrGenerateInstallationId();
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
  canTransition(current: LifecycleState, target: LifecycleState, options?: { isReset?: boolean }): boolean {
    if (!LIFECYCLE_STAGES.includes(target)) return false;
    if (current === target) return true;
    if (target === 'NOT_INITIALIZED') return true; // Reset always allowed
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
    options?: { isReset?: boolean; enforceInvariants?: boolean }
  ): Promise<InstallationDto> {
    if (!LIFECYCLE_STAGES.includes(targetState)) {
      throw new ValidationError(`Invalid lifecycle state: "${targetState}". Allowed: ${LIFECYCLE_STAGES.join(', ')}`);
    }

    const current = await this.getOrCreateInstallation();

    if (!this.canTransition(current.lifecycleState, targetState, options)) {
      throw new ConflictError(
        `Illegal lifecycle transition: Cannot move from ${current.lifecycleState} to ${targetState}. Step progression must be followed.`
      );
    }

    // Security Invariants: enforced when options.enforceInvariants is requested
    if (options?.enforceInvariants) {
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
      if (current.lifecycleState === 'DEVICE_SETUP' && targetState !== 'NOT_INITIALIZED' && targetState !== 'APP_SETUP' && targetState !== 'PIN_SETUP') {
        const localDeviceId = this.getOrGenerateDeviceId();
        const dev = await systemPrisma.device.findUnique({
          where: { deviceId: localDeviceId },
        });
        if (!dev || dev.status !== 'ACTIVE') {
          throw new ConflictError('Cannot complete DEVICE_SETUP: An active device registration is required before proceeding.');
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
      updateData.initializedAt = new Date();
    } else if (targetState === 'NOT_INITIALIZED') {
      updateData.initializedAt = null;
    }

    const updated = await systemPrisma.installation.update({
      where: { id: current.id },
      data: updateData,
      include: {
        _count: {
          select: { devices: true },
        },
      },
    });

    logger.info(`Lifecycle state updated: ${current.lifecycleState} → ${targetState} (Installation: ${updated.installationId})`);

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
    });
    if (crossInstall) {
      throw new ConflictError('Device is already registered under another installation.');
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
   */
  async revokeDevice(deviceId: string, reason?: string): Promise<DeviceDto> {
    const existing = await systemPrisma.device.findUnique({ where: { deviceId } });
    if (!existing) {
      throw new NotFoundError(`Device not found for ID: ${deviceId}`);
    }
    const updated = await systemPrisma.device.update({
      where: { id: existing.id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });
    logger.warn(`Device revoked: ${updated.deviceName} [${updated.deviceId}]${reason ? ` (Reason: ${reason})` : ''}`);
    return this.mapDeviceToDto(updated);
  }

  /**
   * Reactivate a previously revoked device.
   */
  async reactivateDevice(deviceId: string): Promise<DeviceDto> {
    const existing = await systemPrisma.device.findUnique({ where: { deviceId } });
    if (!existing) {
      throw new NotFoundError(`Device not found for ID: ${deviceId}`);
    }
    const updated = await systemPrisma.device.update({
      where: { id: existing.id },
      data: {
        status: 'ACTIVE',
        revokedAt: null,
        lastSeenAt: new Date(),
      },
    });
    logger.info(`Device reactivated: ${updated.deviceName} [${updated.deviceId}]`);
    return this.mapDeviceToDto(updated);
  }

  /**
   * Associate an ERP business user with this local installation.
   */
  async associateUser(installationId: string, userId: string): Promise<InstallationUserDto> {
    const install = await systemPrisma.installation.findUnique({ where: { id: installationId } });
    if (!install) {
      throw new NotFoundError(`Installation not found: ${installationId}`);
    }
    const user = await systemPrisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError(`User not found: ${userId}`);
    }

    const record = await systemPrisma.installationUser.upsert({
      where: {
        installationId_userId: { installationId, userId },
      },
      update: {},
      create: {
        installationId,
        userId,
      },
    });

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
    await systemPrisma.installationUser.deleteMany({
      where: { installationId, userId },
    });
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
