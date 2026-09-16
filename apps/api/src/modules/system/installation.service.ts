import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { systemPrisma, defaultProfile } from '../../infrastructure/database/prisma';
import { getConfigDir } from '../../infrastructure/paths';
import { logger } from '../../infrastructure/logging';
import { ValidationError, ConflictError } from '../../errors';
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
  async updateLifecycleState(targetState: LifecycleState, options?: { isReset?: boolean }): Promise<InstallationDto> {
    if (!LIFECYCLE_STAGES.includes(targetState)) {
      throw new ValidationError(`Invalid lifecycle state: "${targetState}". Allowed: ${LIFECYCLE_STAGES.join(', ')}`);
    }

    const current = await this.getOrCreateInstallation();

    if (!this.canTransition(current.lifecycleState, targetState, options)) {
      throw new ConflictError(
        `Illegal lifecycle transition: Cannot move from ${current.lifecycleState} to ${targetState}. Step progression must be followed.`
      );
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
   * Register or update the local desktop Device linked to this installation.
   *
   * Invariant: Idempotent by persistent deviceId. Changing display name updates
   * the existing device record without creating duplicate devices.
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
    const effectiveDeviceId = options.deviceId?.trim() || this.getOrGenerateDeviceId();
    const platform = options.platform || 'WINDOWS';

    // Look up existing device by stable deviceId on this installation
    const existing = await systemPrisma.device.findFirst({
      where: {
        installationId: install.id,
        deviceId: effectiveDeviceId,
      },
    });

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
    }

    logger.info(`Device registered: ${deviceRecord.deviceName} [${deviceRecord.deviceId}] under installation ${install.installationId}`);

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
   * Associate an ERP business user with this local installation.
   */
  async associateUser(installationId: string, userId: string): Promise<InstallationUserDto> {
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
