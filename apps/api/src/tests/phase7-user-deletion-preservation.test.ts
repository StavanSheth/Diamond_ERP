import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { systemPrisma } from '../infrastructure/database/prisma';
import { userLifecycleService } from '../modules/system/user-lifecycle/user-lifecycle.service';
import { recoveryService } from '../modules/system/recovery/recovery.service';
import { getDatabaseTemplatePath } from '../infrastructure/paths';
import { ValidationError } from '../errors';

describe('Phase 7 — User Deactivation / Deletion Data Preservation', () => {
  const testDir = path.resolve('apps/api/test-scratch-phase7-users');
  const userADbPath = path.join(testDir, 'user_a_business.db');
  const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');

  let userAId: string;
  let profileAId: string;
  let registryAId: string;

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Prepare a pristine SQLite database for User A
    fs.copyFileSync(templateDb, userADbPath);

    // Seed test business data into User A's database using dynamic PrismaClient
    const userPrisma = new PrismaClient({ datasourceUrl: `file:${path.resolve(userADbPath)}` });
    await userPrisma.$executeRawUnsafe(`
      INSERT OR REPLACE INTO Stock (id, stockCode, name, description, currency, isActive, createdAt, updatedAt)
      VALUES ('stock_101', 'LOT-A-99', 'High Quality Diamond A', 'Test Lot A', 'USD', 1, datetime('now'), datetime('now'));
    `);
    await userPrisma.$disconnect();

    // Ensure installation exists in system DB
    let inst = await systemPrisma.installation.findFirst();
    if (!inst) {
      inst = await systemPrisma.installation.create({
        data: {
          installationId: 'inst_test_p7_001',
          appVersion: '3.0.0',
          status: 'ACTIVE',
          lifecycleState: 'READY',
          initializedAt: new Date(),
        },
      });
    }

    // Create User A in control plane
    const userA = await systemPrisma.user.create({
      data: {
        username: 'usera_test',
        passwordHash: 'argon2id_mock_hash_usera',
        displayName: 'User A Diamond Corp',
        role: 'ADMIN',
        isActive: true,
      },
    });
    userAId = userA.id;

    // Create Profile A
    const profileA = await systemPrisma.profile.create({
      data: {
        code: 'USERA_PROF',
        name: 'User A Workspace',
        dbPath: userADbPath,
        isActive: true,
      },
    });
    profileAId = profileA.id;

    // Associate UserProfile
    await systemPrisma.userProfile.create({
      data: {
        userId: userAId,
        profileId: profileAId,
        role: 'ADMIN',
        isActive: true,
      },
    });

    // Create DatabaseRegistry entry
    const registryA = await systemPrisma.databaseRegistry.create({
      data: {
        databaseId: 'dbreg_usera_001',
        displayName: 'User A Workspace DB',
        canonicalPath: path.resolve(userADbPath),
        profileId: profileAId,
        installationId: inst.id,
        status: 'ACTIVE',
      },
    });
    registryAId = registryA.id;
  });

  afterAll(async () => {
    // Cleanup control plane records
    try {
      await systemPrisma.userProfile.deleteMany({ where: { userId: userAId } });
      await systemPrisma.databaseRegistry.deleteMany({ where: { id: registryAId } });
      await systemPrisma.profile.deleteMany({ where: { id: profileAId } });
      await systemPrisma.user.deleteMany({ where: { id: userAId } });
    } catch {}

    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('P0-1: prevents deactivation or deletion of primary admin "stavan"', async () => {
    let stavan = await systemPrisma.user.findFirst({
      where: { username: { equals: 'stavan' } },
    });
    if (!stavan) {
      stavan = await systemPrisma.user.create({
        data: {
          username: 'stavan',
          passwordHash: 'mock_stavan_hash',
          displayName: 'Stavan Admin',
          role: 'ADMIN',
          isActive: true,
        },
      });
    }

    await expect(userLifecycleService.deactivateUser(stavan.id)).rejects.toThrow(ValidationError);
    await expect(userLifecycleService.deleteUser(stavan.id)).rejects.toThrow(ValidationError);
  });

  it('P0-1: deactivating a user preserves database file, registry, and customer data', async () => {
    const res = await userLifecycleService.deactivateUser(userAId, 'VACATION_INACTIVE');
    expect(res.success).toBe(true);

    // Verify User record is deactivated
    const updatedUser = await systemPrisma.user.findUnique({ where: { id: userAId } });
    expect(updatedUser?.isActive).toBe(false);

    // UserProfile is marked inactive
    const up = await systemPrisma.userProfile.findFirst({ where: { userId: userAId } });
    expect(up?.isActive).toBe(false);

    // Invariant: Database file MUST exist on disk
    expect(fs.existsSync(userADbPath)).toBe(true);

    // Invariant: DatabaseRegistry MUST remain preserved
    const reg = await systemPrisma.databaseRegistry.findUnique({ where: { id: registryAId } });
    expect(reg).not.toBeNull();
    expect(reg?.canonicalPath).toBe(path.resolve(userADbPath));

    // Invariant: Business data intact inside SQLite
    const userPrisma = new PrismaClient({ datasourceUrl: `file:${path.resolve(userADbPath)}` });
    const rows = await userPrisma.$queryRawUnsafe<any[]>("SELECT * FROM Stock WHERE id = 'stock_101'");
    await userPrisma.$disconnect();
    expect(rows).toHaveLength(1);
    expect(rows[0].stockCode).toBe('LOT-A-99');
    expect(rows[0].name).toBe('High Quality Diamond A');
  });

  it('P0-1: deleting a user soft-deletes the user and strictly preserves database and profile', async () => {
    const res = await userLifecycleService.deleteUser(userAId, 'ACCOUNT_TERMINATED');
    expect(res.success).toBe(true);
    expect(res.databasePreserved).toBe(true);

    // Verify User record is soft-deleted
    const deletedUser = await systemPrisma.user.findUnique({ where: { id: userAId } });
    expect(deletedUser?.isActive).toBe(false);
    expect(deletedUser?.deletedAt).not.toBeNull();

    // Database file MUST remain untouched on disk
    expect(fs.existsSync(userADbPath)).toBe(true);

    // DatabaseRegistry remains preserved
    const reg = await systemPrisma.databaseRegistry.findUnique({ where: { id: registryAId } });
    expect(reg).not.toBeNull();

    // AuditEvent must be recorded
    const audit = await systemPrisma.auditEvent.findFirst({
      where: {
        eventType: 'USER_DELETED',
        description: { contains: 'usera_test' },
      },
    });
    expect(audit).not.toBeNull();
  });

  it('P0-2: deleted user database remains discoverable with DELETED_USER ownership status', async () => {
    const candidates = await recoveryService.discoverCandidates(testDir);
    const candidateA = candidates.candidates.find(
      (c) => path.resolve(c.canonicalPath) === path.resolve(userADbPath)
    );

    expect(candidateA).toBeDefined();
    expect(candidateA?.ownershipStatus).toBe('DELETED_USER');
    expect(candidateA?.previousOwnerUsername).toBe('usera_test');
    expect(candidateA?.source).toBeDefined();
  });

  it('P0-15: User B cannot automatically inherit or attach User A database', async () => {
    // Create User B
    const userB = await systemPrisma.user.create({
      data: {
        username: 'userb_test',
        passwordHash: 'mock_hash_b',
        displayName: 'User B Diamonds',
        role: 'ADMIN',
        isActive: true,
      },
    });

    try {
      // User B must not have any profile pointing to User A's database
      const userBProfiles = await systemPrisma.userProfile.findMany({
        where: { userId: userB.id },
        include: { profile: true },
      });
      const userBHasDbA = userBProfiles.some(
        (up) => Boolean(up.profile?.dbPath && path.resolve(up.profile.dbPath) === path.resolve(userADbPath))
      );
      expect(userBHasDbA).toBe(false);

      // Discovery alone does NOT attach candidate to User B
      await recoveryService.discoverCandidates(testDir);
      const userBProfilesAfter = await systemPrisma.userProfile.findMany({
        where: { userId: userB.id },
      });
      expect(userBProfilesAfter).toHaveLength(0);
    } finally {
      await systemPrisma.user.delete({ where: { id: userB.id } });
    }
  });

  it('P0-14: Candidate database passes Phase 5 validation engine', async () => {
    const preview = await recoveryService.inspectCandidate(userADbPath);
    expect(preview.suitability).toBe('REQUIRES_CONFIRMATION');
    expect(preview.ownershipStatus).toBe('DELETED_USER');
    expect(preview.previousOwnerUsername).toBe('usera_test');
    expect(preview.tableCount).toBeGreaterThan(0);
  });
});
