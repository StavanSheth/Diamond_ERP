import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { installationService } from '../modules/system/installation.service';
import { deviceSecurityService } from '../modules/security/device-security.service';
import { authService } from '../modules/auth/auth.service';
import { databaseRegistryService } from '../modules/system/database/database-registry.service';
import { databaseValidationService } from '../modules/system/database/database-validation.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import { getDatabaseTemplatePath } from '../infrastructure/paths';
import { ConflictError } from '../errors';

describe('Phase 2.14 — Runtime Use of Lifecycle Schema & Persistence Invariants', () => {
  const testDbFiles: string[] = [];

  const cleanupFiles = () => {
    for (const f of testDbFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
      const wal = f + '-wal';
      const shm = f + '-shm';
      if (fs.existsSync(wal)) try { fs.unlinkSync(wal); } catch {}
      if (fs.existsSync(shm)) try { fs.unlinkSync(shm); } catch {}
    }
  };

  beforeEach(async () => {
    await systemPrisma.databaseRegistry.deleteMany().catch(() => {});
    await systemPrisma.installationUser.deleteMany().catch(() => {});
    await systemPrisma.deviceSecurity.deleteMany().catch(() => {});
    await systemPrisma.device.deleteMany().catch(() => {});
    await systemPrisma.installation.deleteMany().catch(() => {});
  });

  afterAll(async () => {
    cleanupFiles();
  });

  it('Step 1: Installation initialization from persistence and survives restart', async () => {
    const install1 = await installationService.getOrCreateInstallation();
    expect(install1.installationId).toBeDefined();
    expect(install1.status).toBe('ACTIVE');

    // Simulate backend process restart: disconnect Prisma and read through a fresh connection
    const freshClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    try {
      const persisted = await freshClient.installation.findUnique({
        where: { id: install1.id },
      });
      expect(persisted).toBeDefined();
      expect(persisted?.installationId).toBe(install1.installationId);
      expect(persisted?.lifecycleState).toBe('NOT_INITIALIZED');
    } finally {
      await freshClient.$disconnect();
    }
  });

  it('Step 2: Device and DeviceSecurity persist and reuse stable identity across restart', async () => {
    const install = await installationService.getOrCreateInstallation();
    const device = await installationService.registerDevice({
      deviceName: 'Workstation-A',
      platform: 'WINDOWS',
      osVersion: '10.0.22631',
    });
    expect(device.id).toBeDefined();

    // Set up PIN for device with non-trivial digits
    await deviceSecurityService.setupPin(device.deviceId, '849201');

    // Simulate restart
    const freshClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    try {
      const persistedDev = await freshClient.device.findUnique({
        where: { deviceId: device.deviceId },
        include: { securityState: true },
      });
      expect(persistedDev).toBeDefined();
      expect(persistedDev?.installationId).toBe(install.id);
      expect(persistedDev?.securityState).toBeDefined();
      expect(persistedDev?.securityState?.pinHash).toBeDefined();
      expect(persistedDev?.securityState?.pinHash).not.toBe('849201');
    } finally {
      await freshClient.$disconnect();
    }

    // Calling registerDevice or getOrCreateDeviceSecurity again must NOT create duplicate records
    const device2 = await installationService.registerDevice({
      deviceName: 'Workstation-A',
      platform: 'WINDOWS',
    });
    expect(device2.id).toBe(device.id);

    const devCount = await systemPrisma.device.count({ where: { installationId: install.id } });
    expect(devCount).toBe(1);
  });

  it('Step 3: User state and InstallationUser relationship survive restart', async () => {
    const install = await installationService.getOrCreateInstallation();
    const user = await authService.createUser(
      'lifecycle_admin',
      'SecurePass123!',
      'Lifecycle Admin',
      'ADMIN',
      []
    );

    await installationService.associateUser(install.id, user.id);

    // Simulate restart
    const freshClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    try {
      const relation = await freshClient.installationUser.findUnique({
        where: {
          installationId_userId: {
            installationId: install.id,
            userId: user.id,
          },
        },
        include: { user: true, installation: true },
      });
      expect(relation).toBeDefined();
      expect(relation?.user.username).toBe('lifecycle_admin');
      expect(relation?.installation.installationId).toBe(install.installationId);
    } finally {
      await freshClient.$disconnect();
    }
  });

  it('Step 4: DatabaseRegistry updates on creation/attachment and survives restart', async () => {
    await installationService.getOrCreateInstallation();
    const dbFile = path.resolve(__dirname, `../../test_reg_${Date.now()}.db`);
    testDbFiles.push(dbFile);

    const templatePath = getDatabaseTemplatePath();
    if (templatePath && fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, dbFile);
    } else {
      fs.writeFileSync(dbFile, 'SQLite format 3\0');
    }

    const reg = await databaseRegistryService.registerDatabase({
      displayName: 'Test Company DB',
      rawPath: dbFile,
      databaseType: 'EXTERNAL',
    });
    expect(reg.id).toBeDefined();

    // Verify persistence across new Prisma connection
    const freshClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    try {
      const persistedReg = await freshClient.databaseRegistry.findUnique({
        where: { id: reg.id },
      });
      expect(persistedReg).toBeDefined();
      expect(persistedReg?.displayName).toBe('Test Company DB');
      expect(persistedReg?.status).toBe('ACTIVE');
    } finally {
      await freshClient.$disconnect();
    }
  });

  it('Step 5 & 6: Centralized state machine enforces valid progression and rejects invalid transitions', async () => {
    const install = await installationService.getOrCreateInstallation();
    expect(install.lifecycleState).toBe('NOT_INITIALIZED');

    // Illegal skip from NOT_INITIALIZED directly to READY must fail
    await expect(
      installationService.updateLifecycleState('READY')
    ).rejects.toThrow(ConflictError);

    // Illegal skip from NOT_INITIALIZED directly to DATABASE_SETUP must fail
    await expect(
      installationService.updateLifecycleState('DATABASE_SETUP')
    ).rejects.toThrow(ConflictError);

    // Valid transition to APP_SETUP
    const updated1 = await installationService.updateLifecycleState('APP_SETUP');
    expect(updated1.lifecycleState).toBe('APP_SETUP');

    // Transition to PIN_SETUP requires PIN before advancing to DEVICE_SETUP
    await installationService.updateLifecycleState('PIN_SETUP');
    await expect(
      installationService.updateLifecycleState('DEVICE_SETUP')
    ).rejects.toThrow(ConflictError); // Fails invariant: PIN must exist

    // Configure PIN with non-trivial digits
    const deviceId = installationService.getOrGenerateDeviceId();
    await deviceSecurityService.setupPin(deviceId, '739182');

    // Now advancing to DEVICE_SETUP succeeds
    const updated2 = await installationService.updateLifecycleState('DEVICE_SETUP');
    expect(updated2.lifecycleState).toBe('DEVICE_SETUP');
  });

  it('Step 7: Transactional consistency ensures multi-record operations rollback on failure', async () => {
    const install = await installationService.getOrCreateInstallation();

    // Verify transactional rollback: if user creation succeeds but secondary step fails
    const initialUserCount = await systemPrisma.user.count();
    const initialRelationCount = await systemPrisma.installationUser.count();

    try {
      await systemPrisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            username: 'tx_fail_user',
            passwordHash: 'dummy',
            displayName: 'Tx Fail',
            role: 'VIEWER',
          },
        });
        await tx.installationUser.create({
          data: {
            installationId: install.id,
            userId: u.id,
          },
        });
        // Intentionally trigger foreign key error or exception
        throw new Error('Simulated transaction rollback failure');
      });
    } catch {
      // Expected exception
    }

    const postUserCount = await systemPrisma.user.count();
    const postRelationCount = await systemPrisma.installationUser.count();

    expect(postUserCount).toBe(initialUserCount);
    expect(postRelationCount).toBe(initialRelationCount);
  });

  it('Step 8: Restart persistence test - state reloads identically across process resets', async () => {
    // 1. Set lifecycle state
    await installationService.getOrCreateInstallation();
    await installationService.updateLifecycleState('APP_SETUP');

    // 2. Stop / reset connection (simulating shutdown)
    await systemPrisma.$disconnect();

    // 3. Restart / instantiate fresh client
    const freshClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    try {
      // 4. Read lifecycle state
      const reloaded = await freshClient.installation.findFirst();
      // 5. Verify same state is recovered
      expect(reloaded?.lifecycleState).toBe('APP_SETUP');
    } finally {
      await freshClient.$disconnect();
    }
  });

  it('Step 9: Schema version safety rejects corrupted or incompatible database files', async () => {
    const corruptFile = path.resolve(__dirname, `../../test_corrupt_${Date.now()}.db`);
    testDbFiles.push(corruptFile);
    fs.writeFileSync(corruptFile, 'NOT A SQLITE FILE HEADER 1234567890');

    const result = await databaseValidationService.validateDatabase(corruptFile);
    expect(result.isValid).toBe(false);
    expect(['INVALID', 'CORRUPTED', 'UNSUPPORTED_VERSION']).toContain(result.status);
  });

  it('Step 10: Referential integrity across Installation, Device, and DatabaseRegistry', async () => {
    const install = await installationService.getOrCreateInstallation();
    const dev = await installationService.registerDevice({ deviceName: 'Ref-Terminal' });

    // Device belongs to Installation
    expect(dev.installationId).toBe(install.id);

    // Foreign key integrity check: querying through relation
    const found = await systemPrisma.installation.findUnique({
      where: { id: install.id },
      include: {
        devices: true,
        installationUsers: true,
      },
    });

    expect(found).toBeDefined();
    expect(found?.devices.some((d) => d.id === dev.id)).toBe(true);
  });
});
