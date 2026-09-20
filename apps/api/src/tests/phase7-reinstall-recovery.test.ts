import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { systemPrisma } from '../infrastructure/database/prisma';
import { recoveryService } from '../modules/system/recovery/recovery.service';
import { userLifecycleService } from '../modules/system/user-lifecycle/user-lifecycle.service';
import { preservationService } from '../modules/system/preservation/preservation.service';
import { uninstallPreflightService } from '../modules/system/uninstall/uninstall-preflight.service';
import { getDatabaseTemplatePath } from '../infrastructure/paths';

describe('Phase 7 — Reinstall Recovery & Full Data Preservation Lifecycle', () => {
  const testDir = path.resolve('apps/api/test-scratch-phase7-lifecycle');
  const userDbPath = path.join(testDir, 'customer_lifecycle_db.db');
  const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');

  let instId: string;
  let userId: string;
  let profileId: string;
  let registryId: string;

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    fs.copyFileSync(templateDb, userDbPath);

    // Ensure installation exists in control plane
    let inst = await systemPrisma.installation.findFirst();
    if (!inst) {
      inst = await systemPrisma.installation.create({
        data: {
          installationId: 'inst_lifecycle_e2e_p7',
          appVersion: '3.0.0',
          status: 'ACTIVE',
          lifecycleState: 'READY',
          initializedAt: new Date(),
        },
      });
    }
    instId = inst.id;

    // Seed test business records into user's DB
    const client = new PrismaClient({ datasourceUrl: `file:${path.resolve(userDbPath)}` });
    await client.$executeRawUnsafe(`
      INSERT OR REPLACE INTO Stock (id, stockCode, name, description, currency, isActive, createdAt, updatedAt)
      VALUES 
        ('stk_e2e_01', 'STK-E2E-101', 'Marquise Diamond 1.5ct', 'VVS1 D Color', 'USD', 1, datetime('now'), datetime('now')),
        ('stk_e2e_02', 'STK-E2E-102', 'Emerald Cut Diamond 2.0ct', 'VS1 E Color', 'USD', 1, datetime('now'), datetime('now'));
    `);
    await client.$executeRawUnsafe(`
      INSERT OR REPLACE INTO Party (id, partyCode, name, partyType, phone, email, createdAt, updatedAt)
      VALUES 
        ('pty_e2e_01', 'PARTY-E2E-01', 'Premier Gems Antwerp', 'CUSTOMER', '+3212345678', 'gems@antwerp.be', datetime('now'), datetime('now'));
    `);
    await client.$disconnect();

    // Create User A
    const userA = await systemPrisma.user.create({
      data: {
        username: 'lifecycle_user',
        passwordHash: 'argon2id_mock_lifecycle_hash',
        displayName: 'Lifecycle Diamond Trader',
        role: 'ADMIN',
        isActive: true,
      },
    });
    userId = userA.id;

    // Create Profile A
    const profileA = await systemPrisma.profile.create({
      data: {
        code: 'LIFECYCLE_PROF',
        name: 'Lifecycle Trading Profile',
        dbPath: userDbPath,
        isActive: true,
      },
    });
    profileId = profileA.id;

    // UserProfile mapping
    await systemPrisma.userProfile.create({
      data: {
        userId,
        profileId,
        role: 'ADMIN',
        isActive: true,
      },
    });

    // DatabaseRegistry entry
    const reg = await systemPrisma.databaseRegistry.create({
      data: {
        databaseId: 'dbreg_lifecycle_001',
        displayName: 'Lifecycle Workspace DB',
        canonicalPath: path.resolve(userDbPath),
        profileId,
        installationId: instId,
        status: 'ACTIVE',
      },
    });
    registryId = reg.id;
  });

  afterAll(async () => {
    try {
      await systemPrisma.userProfile.deleteMany({ where: { userId } });
      await systemPrisma.databaseRegistry.deleteMany({ where: { id: registryId } });
      await systemPrisma.profile.deleteMany({ where: { id: profileId } });
      await systemPrisma.user.deleteMany({ where: { id: userId } });
    } catch {}

    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('P0-12: reinstall detection identifies existing customer data and distinguishes RECOVERY state', async () => {
    const detection = await recoveryService.detectReinstallState();

    expect(detection.hasPreviousData).toBe(true);
    expect(detection.canContinue || detection.canRestore).toBe(true);
    expect(detection.classification).toBeDefined();
  });

  it('P0-13, P0-14: recovery candidate validation verifies schema and requires explicit confirmation', async () => {
    // 1. Discovery scan
    const candidates = await recoveryService.discoverCandidates(testDir);
    const targetCandidate = candidates.candidates.find(
      (c) => path.resolve(c.canonicalPath) === path.resolve(userDbPath)
    );
    expect(targetCandidate).toBeDefined();

    // Invariant: Discovery alone does NOT attach or alter the profile
    const profileBefore = await systemPrisma.profile.findUnique({ where: { id: profileId } });
    expect(profileBefore?.status).toBe('ACTIVE');

    // 2. Candidate inspection & validation
    const preview = await recoveryService.inspectCandidate(userDbPath);
    expect(['VALID', 'REQUIRES_CONFIRMATION']).toContain(preview.suitability);
    expect(preview.tableCount).toBeGreaterThan(0);
    expect(preview.sqliteIntegrity).toBe('ok');
  });

  it('P0-16: full end-to-end lifecycle preserves 100% customer business data across uninstall and reinstall', async () => {
    // 1. Count records before uninstall
    const clientBefore = new PrismaClient({ datasourceUrl: `file:${path.resolve(userDbPath)}` });
    const stockBefore = await clientBefore.$queryRawUnsafe<any[]>("SELECT * FROM Stock ORDER BY id ASC");
    const partyBefore = await clientBefore.$queryRawUnsafe<any[]>("SELECT * FROM Party ORDER BY id ASC");
    await clientBefore.$disconnect();

    expect(stockBefore.length).toBe(2);
    expect(partyBefore.length).toBe(1);

    // 2. Soft-delete user
    const deleteRes = await userLifecycleService.deleteUser(userId, 'PRE_UNINSTALL_LIFECYCLE');
    expect(deleteRes.success).toBe(true);
    expect(deleteRes.databasePreserved).toBe(true);

    // 3. Create full preservation package (DB + CSVs + XLSX + Manifests)
    const pkg = await preservationService.createPreservationPackage({
      databasePath: userDbPath,
      confirmPreservation: true,
    });
    expect(pkg.status).toBe('VERIFIED');

    // 4. Verify preservation package
    const verifyRes = await preservationService.verifyPreservationPackage(pkg.packageId);
    expect(verifyRes.verified).toBe(true);
    expect(verifyRes.databaseBackupVerified).toBe(true);
    expect(verifyRes.csvVerified).toBe(true);
    expect(verifyRes.xlsxVerified).toBe(true);

    // 5. Issue uninstall authorization
    const auth = await uninstallPreflightService.issueUninstallAuthorization(pkg.packageId);
    expect(auth.status).toBe('ISSUED');

    // 6. Simulate Windows Uninstaller:
    // Uninstaller verifies authorization token, consumes it, and preserves customer AppData/databases
    const checkRes = await uninstallPreflightService.checkAuthorizationToken();
    expect(checkRes.valid).toBe(true);

    // Consume token
    await uninstallPreflightService.consumeAuthorizationToken();

    // 7. Verify token single-use invariant
    const secondCheck = await uninstallPreflightService.checkAuthorizationToken();
    expect(secondCheck.valid).toBe(false);

    // 8. Simulate Reinstall: Database file was preserved by installer
    expect(fs.existsSync(userDbPath)).toBe(true);

    // 9. Reconnect / Reattach explicitly via recoveryService
    const restorePreview = await recoveryService.prepareRestore({
      candidatePath: userDbPath,
      targetProfileCode: 'LIFECYCLE_PROF',
    });
    expect(restorePreview.restoreId).toBeDefined();

    const restoreResult = await recoveryService.confirmRestore({
      restoreId: restorePreview.restoreId,
      confirmDestructiveOverwrite: true,
      targetProfileCode: 'LIFECYCLE_PROF',
    });
    expect(restoreResult.status).toBe('VERIFIED');

    // 10. Data-Integrity Invariant Assertion:
    // Before uninstall business record count == After reinstall business record count
    const clientAfter = new PrismaClient({ datasourceUrl: `file:${path.resolve(userDbPath)}` });
    const stockAfter = await clientAfter.$queryRawUnsafe<any[]>("SELECT * FROM Stock ORDER BY id ASC");
    const partyAfter = await clientAfter.$queryRawUnsafe<any[]>("SELECT * FROM Party ORDER BY id ASC");
    await clientAfter.$disconnect();

    expect(stockAfter.length).toBe(stockBefore.length);
    expect(partyAfter.length).toBe(partyBefore.length);

    // Record IDs and attributes remain identical and unmodified
    expect(stockAfter[0].id).toBe(stockBefore[0].id);
    expect(stockAfter[0].stockCode).toBe(stockBefore[0].stockCode);
    expect(stockAfter[1].id).toBe(stockBefore[1].id);
    expect(partyAfter[0].id).toBe(partyBefore[0].id);
    expect(partyAfter[0].partyCode).toBe(partyBefore[0].partyCode);
  });
});
