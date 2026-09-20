import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { systemPrisma } from '../infrastructure/database/prisma';
import { recoveryService } from '../modules/system/recovery/recovery.service';
import { backupService } from '../modules/system/backup/backup.service';
import { installationService } from '../modules/system/installation.service';
import { getDatabasesDir, getDatabaseTemplatePath } from '../infrastructure/paths';

describe('Phase 8 — Explicit User ↔ Database Recovery Binding (P0)', () => {
  const dbsDir = getDatabasesDir();
  const deletedUsername = `deleted_user_${Date.now()}`;
  const deletedProfileCode = `DelProf_${Date.now()}`;
  const deletedDbPath = path.join(dbsDir, `${deletedProfileCode}.db`);
  const liveTargetDbPath = path.join(dbsDir, `Stavan.db`);

  let deletedUser: any;
  let deletedProfile: any;
  let backupRecord: any;

  beforeAll(async () => {
    await installationService.getOrCreateInstallation();
    const templateDb = getDatabaseTemplatePath();

    if (templateDb && fs.existsSync(templateDb)) {
      fs.copyFileSync(templateDb, deletedDbPath);
      if (!fs.existsSync(liveTargetDbPath)) {
        fs.copyFileSync(templateDb, liveTargetDbPath);
      }
    } else {
      const dummyClient = new PrismaClient({ datasources: { db: { url: `file:${deletedDbPath.replace(/\\/g, '/')}` } } });
      await dummyClient.$queryRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Profile" (id TEXT PRIMARY KEY, code TEXT, name TEXT, schemaVersion INTEGER);
        CREATE TABLE IF NOT EXISTS "Stock" (id TEXT PRIMARY KEY, stockCode TEXT, name TEXT);
      `);
      await dummyClient.$disconnect();
    }

    // Create deleted user in control DB
    deletedUser = await systemPrisma.user.create({
      data: {
        username: deletedUsername,
        displayName: 'Deleted Recovery Candidate',
        role: 'ADMIN',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz01234567890123456789',
        isActive: false,
        deletedAt: new Date(),
      },
    });

    deletedProfile = await systemPrisma.profile.create({
      data: {
        code: deletedProfileCode,
        name: `${deletedProfileCode} Profile`,
        dbPath: deletedDbPath,
        isActive: false,
        status: 'INACTIVE',
      },
    });

    await systemPrisma.userProfile.create({
      data: {
        userId: deletedUser.id,
        profileId: deletedProfile.id,
        role: 'ADMIN',
        isActive: false,
      },
    });

    // Create verified backup for recovery candidate
    backupRecord = await backupService.createBackup({
      databasePath: deletedDbPath,
      backupType: 'FULL',
      note: 'Backup of deleted user database',
    });
  });

  afterAll(async () => {
    if (fs.existsSync(deletedDbPath)) {
      try { fs.unlinkSync(deletedDbPath); } catch {}
    }
  });

  it('P0-1: rejects restore of deleted-user candidate if targetUserId is missing', async () => {
    const preview = await recoveryService.prepareRestore({
      candidatePath: backupRecord.backupPath,
      targetProfileCode: 'Stavan',
    });

    await expect(
      recoveryService.confirmRestore({
        restoreId: preview.restoreId,
        targetProfileCode: 'Stavan',
        confirmDestructiveOverwrite: true,
        // targetUserId omitted!
      })
    ).rejects.toThrow(/Target user ID is mandatory/i);
  });

  it('P0-2: rejects restore if targetUserId does not exist in the database', async () => {
    const preview = await recoveryService.prepareRestore({
      candidatePath: backupRecord.backupPath,
      targetProfileCode: 'Stavan',
    });

    await expect(
      recoveryService.confirmRestore({
        restoreId: preview.restoreId,
        targetProfileCode: 'Stavan',
        confirmDestructiveOverwrite: true,
        targetUserId: `non_existent_usr_${Date.now()}`,
      })
    ).rejects.toThrow(/not exist/i);
  });

  it('P0-3: successfully restores with explicit user binding, reactivates user, and links UserProfile + InstallationUser', async () => {
    const preview = await recoveryService.prepareRestore({
      candidatePath: backupRecord.backupPath,
      targetProfileCode: 'Stavan',
    });

    const result = await recoveryService.confirmRestore({
      restoreId: preview.restoreId,
      targetProfileCode: 'Stavan',
      confirmDestructiveOverwrite: true,
      targetUserId: deletedUser.id,
      reactivateUser: true,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('VERIFIED');

    // 1. Verify User reactivated
    const updatedUser = await systemPrisma.user.findUnique({
      where: { id: deletedUser.id },
    });
    expect(updatedUser?.isActive).toBe(true);
    expect(updatedUser?.deletedAt).toBeNull();

    // 2. Verify UserProfile association
    const userProfile = await systemPrisma.userProfile.findFirst({
      where: { userId: deletedUser.id, isActive: true },
      include: { profile: true },
    });
    expect(userProfile).toBeDefined();
    expect(userProfile?.profile.code).toBe('Stavan');

    // 3. Verify InstallationUser association
    const installUser = await systemPrisma.installationUser.findFirst({
      where: { userId: deletedUser.id },
    });
    expect(installUser).toBeDefined();

    // 4. Verify DatabaseRegistry
    const reg = await systemPrisma.databaseRegistry.findFirst({
      where: { canonicalPath: path.resolve(liveTargetDbPath), status: 'ACTIVE' },
    });
    expect(reg).toBeDefined();

    // 5. Verify audit event
    const audit = await systemPrisma.auditEvent.findFirst({
      where: { entityType: 'USER', entityId: deletedUser.id, eventType: 'DATABASE_RECOVERED' },
    });
    expect(audit).toBeDefined();
  });
});
