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
  private getInstallationIdFilePath(): string {
    return path.join(getConfigDir(), '.installation-id');
  }

  /**
   * Resolves or generates the permanent installation ID.
   * Backed by %LOCALAPPDATA%\DiamondERP\config\.installation-id for recovery.
   */
  private getOrGenerateInstallationId(): string {
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
      logger.warn(`Could not persist .installation-id to disk: ${(err as Error).message}`);
      return crypto.randomUUID();
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
   * Controlled state transition for the onboarding/lifecycle state machine.
   */
  async updateLifecycleState(targetState: LifecycleState): Promise<InstallationDto> {
    if (!LIFECYCLE_STAGES.includes(targetState)) {
      throw new ValidationError(`Invalid lifecycle state: "${targetState}". Allowed: ${LIFECYCLE_STAGES.join(', ')}`);
    }

    const current = await this.getOrCreateInstallation();
    const currentIndex = LIFECYCLE_STAGES.indexOf(current.lifecycleState);
    const targetIndex = LIFECYCLE_STAGES.indexOf(targetState);

    // Transition validation: Allow progressive step, reset to NOT_INITIALIZED, or staying in same state
    const isReset = targetState === 'NOT_INITIALIZED';
    const isStepForward = targetIndex === currentIndex + 1;
    const isSameState = targetIndex === currentIndex;
    const isJumpToReady = targetState === 'READY'; // Allowed when fast-forwarding completed setups

    if (!isReset && !isStepForward && !isSameState && !isJumpToReady && targetIndex < currentIndex) {
      throw new ConflictError(
        `Illegal lifecycle transition: Cannot move backward from ${current.lifecycleState} to ${targetState} without resetting.`
      );
    }

    const updateData: any = {
      lifecycleState: targetState,
    };

    if (targetState === 'READY' && !current.initializedAt) {
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
   */
  async registerDevice(deviceName: string, platform = 'WINDOWS', osVersion?: string): Promise<DeviceDto> {
    if (!deviceName || deviceName.trim().length === 0) {
      throw new ValidationError('Device name is required');
    }

    const install = await this.getOrCreateInstallation();

    // Look for existing device with same name on this installation
    const existing = await systemPrisma.device.findFirst({
      where: {
        installationId: install.id,
        deviceName: deviceName.trim(),
      },
    });

    let deviceRecord;
    if (existing) {
      deviceRecord = await systemPrisma.device.update({
        where: { id: existing.id },
        data: {
          platform,
          osVersion: osVersion || existing.osVersion,
          lastSeenAt: new Date(),
          status: 'ACTIVE',
        },
      });
    } else {
      deviceRecord = await systemPrisma.device.create({
        data: {
          installationId: install.id,
          deviceName: deviceName.trim(),
          platform,
          osVersion,
          status: 'ACTIVE',
          lastSeenAt: new Date(),
        },
      });
    }

    logger.info(`Device registered: ${deviceRecord.deviceName} (${deviceRecord.id}) under installation ${install.installationId}`);

    return {
      id: deviceRecord.id,
      installationId: deviceRecord.installationId,
      deviceName: deviceRecord.deviceName,
      platform: deviceRecord.platform,
      osVersion: deviceRecord.osVersion,
      status: deviceRecord.status as any,
      lastSeenAt: deviceRecord.lastSeenAt.toISOString(),
      createdAt: deviceRecord.createdAt.toISOString(),
      updatedAt: deviceRecord.updatedAt.toISOString(),
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
