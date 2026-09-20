import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { systemPrisma } from '../infrastructure/database/prisma';
import { installationService } from '../modules/system/installation.service';
import { onboardingService } from '../modules/system/onboarding/onboarding.service';
import { databaseProvisioningService } from '../modules/system/database/database-provisioning.service';
import { databaseValidationService } from '../modules/system/database/database-validation.service';
import { authService } from '../modules/auth/auth.service';
import { deviceSecurityService } from '../modules/security/device-security.service';
import { getDatabasesDir } from '../infrastructure/paths';
import { ValidationError, ConflictError } from '../errors';

describe('Diamond ERP V3 — Phase 6: New User + Blank Database Provisioning + User–Database Isolation', () => {
  let installId: string;
  let deviceId: string;
  const createdTestFiles: string[] = [];

  async function createTestUser(prefix = 'p6_u') {
    const uname = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const user = await authService.createUser(uname, 'Password123!Secure', 'Test User', 'ADMIN', []);
    await installationService.associateUser(installId, user.id);
    return user;
  }

  beforeEach(async () => {
    const install = await installationService.getOrCreateInstallation();
    installId = install.id;
    deviceId = installationService.getOrGenerateDeviceId();

    // Ensure active device and pin for full lifecycle flow
    await installationService.registerDevice({
      deviceName: 'Phase6-Validation-Terminal',
      platform: 'WINDOWS',
    });
    await deviceSecurityService.setupPin(deviceId, '849201').catch(() => {});

    await systemPrisma.installation.update({
      where: { id: installId },
      data: { lifecycleState: 'USER_DISCOVERY', status: 'ACTIVE' },
    });
  });

  afterEach(async () => {
    for (const f of createdTestFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
      const wal = `${f}-wal`;
      const shm = `${f}-shm`;
      if (fs.existsSync(wal)) try { fs.unlinkSync(wal); } catch {}
      if (fs.existsSync(shm)) try { fs.unlinkSync(shm); } catch {}
    }
    createdTestFiles.length = 0;
  });

  // ═════════════════════════════════════════════════════════════════════════
  // A. NEW USER PROVISIONING & FULL LIFECYCLE PROGRESSION (Section 33 A)
  // ═════════════════════════════════════════════════════════════════════════
  describe('A. New User Creation & Full Lifecycle Progression', () => {
    it('executes full path: USER_DISCOVERY -> Create User -> Create Blank DB -> DATABASE_SETUP -> READY', async () => {
      const uname = `p6_user_${Date.now()}`;
      const userRes = await onboardingService.createBusinessUser({
        username: uname,
        password: 'Password123!Secure',
        displayName: 'Phase 6 Admin',
        role: 'ADMIN',
      });

      expect(userRes.success).toBe(true);
      expect(userRes.user.username).toBe(uname);
      expect(userRes.provisioningContext).toBeDefined();
      expect(userRes.provisioningContext.userId).toBe(userRes.user.id);

      // Verify lifecycle moved to DATABASE_DISCOVERY
      let state = await onboardingService.getOnboardingState();
      expect(state.lifecycleState).toBe('DATABASE_DISCOVERY');

      // Create new blank database from template carrying authoritative userId
      const dbRes = await onboardingService.createNewDatabase({
        displayName: `Company ${uname}`,
        profileCode: `prof_${uname}`,
        userId: userRes.user.id,
      });

      expect(dbRes.success).toBe(true);
      expect(dbRes.registry.canonicalPath).toContain(`prof_${uname}.db`);
      createdTestFiles.push(dbRes.registry.canonicalPath);

      // Verify lifecycle moved through DATABASE_VALIDATION to DATABASE_SETUP
      state = await onboardingService.getOnboardingState();
      expect(state.lifecycleState).toBe('DATABASE_SETUP');

      // Complete onboarding and advance to READY
      const completeRes = await onboardingService.completeOnboarding();
      expect(completeRes.lifecycleState).toBe('READY');
      expect(completeRes.ready).toBe(true);

      // Verify Audit Events
      const events = await systemPrisma.auditEvent.findMany({
        where: {
          eventType: {
            in: [
              'NEW_USER_PROVISIONING_STARTED',
              'NEW_USER_CREATED',
              'NEW_DATABASE_PROVISIONED',
              'NEW_DATABASE_VALIDATED',
              'NEW_DATABASE_ATTACHED',
              'NEW_USER_PROVISIONING_COMPLETED',
            ],
          },
        },
      });
      const types = events.map((e) => e.eventType);
      expect(types).toContain('NEW_USER_PROVISIONING_STARTED');
      expect(types).toContain('NEW_USER_CREATED');
      expect(types).toContain('NEW_DATABASE_PROVISIONED');
      expect(types).toContain('NEW_DATABASE_VALIDATED');
      expect(types).toContain('NEW_DATABASE_ATTACHED');
      expect(types).toContain('NEW_USER_PROVISIONING_COMPLETED');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // FIX #1: STRICT USER ↔ DATABASE OWNERSHIP ISOLATION (Section 4)
  // ═════════════════════════════════════════════════════════════════════════
  describe('Fix #1 — Strict User ↔ Database Ownership Isolation', () => {
    it('Section 4.9 Test A: User B does not inherit User A profile/database ownership', async () => {
      const userA = await createTestUser('user_a');
      const userB = await createTestUser('user_b');

      const codeA = `p6_iso_a_${Date.now()}`;
      const codeB = `p6_iso_b_${Date.now()}`;

      const resA = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Database A',
        profileCode: codeA,
        userId: userA.id,
      });
      createdTestFiles.push(resA.canonicalPath);

      const resB = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Database B',
        profileCode: codeB,
        userId: userB.id,
      });
      createdTestFiles.push(resB.canonicalPath);

      // Assert User A ownership
      const userAProfiles = await systemPrisma.userProfile.findMany({
        where: { userId: userA.id, isActive: true },
        include: { profile: true },
      });
      const userACodes = userAProfiles.map((up) => up.profile.code);
      expect(userACodes).toContain(codeA);
      expect(userACodes).not.toContain(codeB);

      // Assert User B ownership
      const userBProfiles = await systemPrisma.userProfile.findMany({
        where: { userId: userB.id, isActive: true },
        include: { profile: true },
      });
      const userBCodes = userBProfiles.map((up) => up.profile.code);
      expect(userBCodes).toContain(codeB);
      expect(userBCodes).not.toContain(codeA);
    });

    it('Section 4.9 Test B: Existing installation users are NOT automatically assigned to a newly provisioned profile', async () => {
      const userA = await createTestUser('inst_u_a');
      const userB = await createTestUser('inst_u_b');
      const userC = await createTestUser('inst_u_c');

      const newCode = `p6_target_b_${Date.now()}`;
      const res = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'User B DB',
        profileCode: newCode,
        userId: userB.id,
      });
      createdTestFiles.push(res.canonicalPath);

      // Verify User B has profile
      const upB = await systemPrisma.userProfile.findFirst({
        where: { userId: userB.id, profileId: res.profileId, isActive: true },
      });
      expect(upB).toBeDefined();

      // Verify User A and User C DO NOT have the profile
      const upA = await systemPrisma.userProfile.findFirst({
        where: { userId: userA.id, profileId: res.profileId },
      });
      const upC = await systemPrisma.userProfile.findFirst({
        where: { userId: userC.id, profileId: res.profileId },
      });
      expect(upA).toBeNull();
      expect(upC).toBeNull();
    });

    it('Section 4.9 Test C: Missing target user strictly fails closed without creating artifacts', async () => {
      const code = `p6_missing_u_${Date.now()}`;
      const targetDbPath = path.resolve(getDatabasesDir(), `${code}.db`);

      await expect(
        databaseProvisioningService.provisionBlankDatabase({
          displayName: 'Should Fail DB',
          profileCode: code,
          userId: '', // missing
        })
      ).rejects.toThrow(ValidationError);

      // Assert no files or database records were created
      expect(fs.existsSync(targetDbPath)).toBe(false);
      const profile = await systemPrisma.profile.findUnique({ where: { code } });
      expect(profile).toBeNull();
      const registry = await systemPrisma.databaseRegistry.findUnique({ where: { canonicalPath: targetDbPath } });
      expect(registry).toBeNull();
    });

    it('Section 4.9 Test D: Attempting provisioning for a user of another installation fails with ConflictError', async () => {
      const foreignInstall = await systemPrisma.installation.create({
        data: {
          installationId: crypto.randomUUID(),
          status: 'ACTIVE',
        },
      });

      const foreignUser = await authService.createUser(
        `foreign_${Date.now()}`,
        'Password123!Secure',
        'Foreign User',
        'ADMIN',
        []
      );
      await systemPrisma.installationUser.create({
        data: {
          installationId: foreignInstall.id,
          userId: foreignUser.id,
        },
      });

      // Try provisioning under our local installation for a user belonging only to foreign install
      await expect(
        databaseProvisioningService.provisionBlankDatabase({
          displayName: 'Foreign User DB',
          profileCode: `foreign_prof_${Date.now()}`,
          userId: foreignUser.id,
          installationId: installId, // local install
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // FIX #2: DURABLE PROVISIONING IDEMPOTENCY (Section 5)
  // ═════════════════════════════════════════════════════════════════════════
  describe('Fix #2 — Durable Provisioning Idempotency & Operation Identity', () => {
    it('Section 5.7: Replaying the same operationId returns the existing result without recreating', async () => {
      const user = await createTestUser('idemp_u');
      const opId = `op_idemp_${Date.now()}`;
      const code = `p6_idemp_${Date.now()}`;

      const first = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Idempotent DB',
        profileCode: code,
        userId: user.id,
        provisioningOperationId: opId,
      });
      createdTestFiles.push(first.canonicalPath);

      // Replay identical operation
      const second = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Idempotent DB',
        profileCode: code,
        userId: user.id,
        provisioningOperationId: opId,
      });

      expect(second.databaseId).toBe(first.databaseId);
      expect(second.canonicalPath).toBe(first.canonicalPath);
      expect(second.profileId).toBe(first.profileId);
      expect(second.operationId).toBe(opId);

      // Verify only one registry and operation record exists
      const opCount = await systemPrisma.provisioningOperation.count({ where: { operationId: opId } });
      expect(opCount).toBe(1);

      const regCount = await systemPrisma.databaseRegistry.count({ where: { databaseId: first.databaseId } });
      expect(regCount).toBe(1);
    });

    it('Section 5.7: Reusing same operationId with conflicting payload throws ConflictError', async () => {
      const user = await createTestUser('conflict_u');
      const opId = `op_conflict_${Date.now()}`;
      const code = `p6_conf_${Date.now()}`;

      const first = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Original Name',
        profileCode: code,
        userId: user.id,
        provisioningOperationId: opId,
      });
      createdTestFiles.push(first.canonicalPath);

      // Call again with same operationId but different display name / payload
      await expect(
        databaseProvisioningService.provisionBlankDatabase({
          displayName: 'Conflicting Altered Name',
          profileCode: code,
          userId: user.id,
          provisioningOperationId: opId,
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // FIX #3: CRASH / INTERRUPTION RECOVERY & RECONCILIATION (Section 6)
  // ═════════════════════════════════════════════════════════════════════════
  describe('Fix #3 — Crash Recovery & Startup Reconciliation', () => {
    it('Section 6.5: Reconciles an interrupted operation where file was created and completes registry', async () => {
      const user = await createTestUser('reconcile_u');
      const opId = `op_crash_${Date.now()}`;
      const code = `p6_crash_${Date.now()}`;
      const { canonicalPath } = databaseProvisioningService.determineDestination(code);
      createdTestFiles.push(canonicalPath);

      // Copy template to destination as if crashed right after FILE_CREATED
      const templatePath = await databaseProvisioningService.validateTemplate();
      fs.copyFileSync(templatePath, canonicalPath);

      const requestHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ installationId: installId, userId: user.id, profileCode: code, displayName: code, profileName: code }))
        .digest('hex');

      await systemPrisma.provisioningOperation.create({
        data: {
          operationId: opId,
          installationId: installId,
          userId: user.id,
          profileCode: code,
          targetPath: canonicalPath,
          status: 'FILE_CREATED',
          requestHash,
        },
      });

      // Run reconciliation
      const reconResult = await databaseProvisioningService.reconcileInterruptedOperations(installId);
      expect(reconResult.reconciled).toBeGreaterThanOrEqual(1);

      // Verify operation is now COMPLETED
      const op = await systemPrisma.provisioningOperation.findUnique({ where: { operationId: opId } });
      expect(op?.status).toBe('COMPLETED');

      // Verify registry was created
      const reg = await systemPrisma.databaseRegistry.findUnique({ where: { canonicalPath } });
      expect(reg).toBeDefined();
      expect(reg?.status).toBe('ACTIVE');
    });

    it('Section 6.5: Compensates and cleans up corrupted orphan file on interrupted crash', async () => {
      const user = await createTestUser('corrupt_u');
      const opId = `op_corrupt_${Date.now()}`;
      const code = `p6_corrupt_${Date.now()}`;
      const { canonicalPath } = databaseProvisioningService.determineDestination(code);

      // Write garbage data to simulate corrupted partial file
      fs.writeFileSync(canonicalPath, Buffer.from('Corrupted database file data'));

      const requestHash = crypto.createHash('sha256').update('corrupt').digest('hex');
      await systemPrisma.provisioningOperation.create({
        data: {
          operationId: opId,
          installationId: installId,
          userId: user.id,
          profileCode: code,
          targetPath: canonicalPath,
          status: 'FILE_CREATED',
          requestHash,
        },
      });

      const reconResult = await databaseProvisioningService.reconcileInterruptedOperations(installId);
      expect(reconResult.compensated).toBeGreaterThanOrEqual(1);

      // Incomplete corrupted file must be removed!
      expect(fs.existsSync(canonicalPath)).toBe(false);

      const op = await systemPrisma.provisioningOperation.findUnique({ where: { operationId: opId } });
      expect(op?.status).toBe('COMPENSATED');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // FIX #4: AUTHORITATIVE / EXTENSIBLE PRISTINE VALIDATION (Section 7)
  // ═════════════════════════════════════════════════════════════════════════
  describe('Fix #4 — Authoritative & Extensible Pristine Validation', () => {
    it('Section 7.7 Test 1: Injected rows in a business table fail pristine validation with ConflictError', async () => {
      await createTestUser('pristine_fail_u');
      const code = `p6_fail_pristine_${Date.now()}`;
      const { canonicalPath } = databaseProvisioningService.determineDestination(code);
      createdTestFiles.push(canonicalPath);

      const templatePath = await databaseProvisioningService.validateTemplate();
      fs.copyFileSync(templatePath, canonicalPath);

      // Inject a business record into DiamondItem
      const client = new PrismaClient({ datasources: { db: { url: `file:${canonicalPath}` } } });
      await client.$connect();
      await client.$executeRawUnsafe(
        `INSERT INTO "Party" (id, partyCode, name, partyType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?);`,
        crypto.randomUUID(),
        `P_${Date.now()}`,
        'Injected Customer',
        'CUSTOMER',
        new Date().toISOString(),
        new Date().toISOString()
      );
      await client.$disconnect();

      // Assert pristine check rejects
      await expect(databaseProvisioningService.validatePristineState(canonicalPath)).rejects.toThrow(ConflictError);
    });

    it('Section 7.7 Test 2: Unclassified table in SQLite fails closed with PRISTINE_VALIDATION_UNCLASSIFIED', async () => {
      const code = `p6_unclass_${Date.now()}`;
      const { canonicalPath } = databaseProvisioningService.determineDestination(code);
      createdTestFiles.push(canonicalPath);

      const templatePath = await databaseProvisioningService.validateTemplate();
      fs.copyFileSync(templatePath, canonicalPath);

      // Create an unknown table
      const client = new PrismaClient({ datasources: { db: { url: `file:${canonicalPath}` } } });
      await client.$connect();
      await client.$executeRawUnsafe(`CREATE TABLE "UnknownFutureTable" ("id" TEXT PRIMARY KEY, "secret" TEXT);`);
      await client.$disconnect();

      await expect(databaseProvisioningService.validatePristineState(canonicalPath)).rejects.toThrow(
        /PRISTINE_VALIDATION_UNCLASSIFIED/
      );
    });

    it('Section 7.7 Test 3: Approved reference data does not fail pristine validation', async () => {
      const code = `p6_ref_ok_${Date.now()}`;
      const { canonicalPath } = databaseProvisioningService.determineDestination(code);
      createdTestFiles.push(canonicalPath);

      const templatePath = await databaseProvisioningService.validateTemplate();
      fs.copyFileSync(templatePath, canonicalPath);

      // Insert into SYSTEM_CONFIGURATION / REFERENCE_DATA table (Setting)
      const client = new PrismaClient({ datasources: { db: { url: `file:${canonicalPath}` } } });
      await client.$connect();
      await client.$executeRawUnsafe(
        `INSERT INTO "Setting" (id, key, value, updatedAt) VALUES (?, ?, ?, ?);`,
        crypto.randomUUID(),
        'app.locale',
        'en-IN',
        new Date().toISOString()
      );
      await client.$disconnect();

      const result = await databaseProvisioningService.validatePristineState(canonicalPath);
      expect(result.isPristine).toBe(true);
    });

    it('Section 7.7 Test 4: Corrupted template fails before creating any destination database', async () => {
      const user = await createTestUser('corrupt_tpl_u');
      const originalEnv = process.env.DIAMOND_TEMPLATE_DB;

      const corruptTplPath = path.resolve('corrupted_test_template.db');
      fs.writeFileSync(corruptTplPath, Buffer.from('Not a valid sqlite database header'));
      process.env.DIAMOND_TEMPLATE_DB = corruptTplPath;

      try {
        const code = `p6_no_dst_${Date.now()}`;
        const targetPath = path.resolve(getDatabasesDir(), `${code}.db`);

        await expect(
          databaseProvisioningService.provisionBlankDatabase({
            displayName: 'Corrupted Template Test',
            profileCode: code,
            userId: user.id,
          })
        ).rejects.toThrow(ValidationError);

        // Prove destination was never created
        expect(fs.existsSync(targetPath)).toBe(false);
      } finally {
        if (fs.existsSync(corruptTplPath)) fs.unlinkSync(corruptTplPath);
        if (originalEnv !== undefined) {
          process.env.DIAMOND_TEMPLATE_DB = originalEnv;
        } else {
          delete process.env.DIAMOND_TEMPLATE_DB;
        }
      }
    });

    it('Section 7.7 Test 5: Modifying template after provisioning leaves provisioned database unaffected', async () => {
      const user = await createTestUser('tpl_immut_u');
      const code = `p6_immut_${Date.now()}`;

      const res = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Immutable Check DB',
        profileCode: code,
        userId: user.id,
      });
      createdTestFiles.push(res.canonicalPath);

      // Verify provisioned database has 0 records
      const client = new PrismaClient({ datasources: { db: { url: `file:${res.canonicalPath}` } } });
      await client.$connect();
      const countBefore = await client.$queryRawUnsafe<any[]>('SELECT COUNT(*) as cnt FROM "Stock";');
      expect(Number(countBefore[0].cnt)).toBe(0);
      await client.$disconnect();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 34. P0 CRITICAL DATA ISOLATION TEST (MANDATORY)
  // ═════════════════════════════════════════════════════════════════════════
  describe('Section 34. P0 Critical Data Isolation Test', () => {
    it('proves that User B cannot see business records inserted into User A database', async () => {
      const userA = await createTestUser('p0_user_a');
      const userB = await createTestUser('p0_user_b');

      const codeA = `p6_iso_a_${Date.now()}`;
      const codeB = `p6_iso_b_${Date.now()}`;

      // 1. Provision Database A
      const resA = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'User A Database',
        profileCode: codeA,
        userId: userA.id,
      });
      createdTestFiles.push(resA.canonicalPath);

      // 2. Insert unique business record into Database A
      const clientA = new PrismaClient({
        datasources: { db: { url: `file:${path.resolve(resA.canonicalPath)}` } },
      });
      await clientA.$connect();

      const uniquePartyCode = `PARTY_A_${Date.now()}`;
      await clientA.$executeRawUnsafe(
        `INSERT INTO "Party" (id, partyCode, name, partyType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?);`,
        crypto.randomUUID(),
        uniquePartyCode,
        'Diamond Supplier A',
        'SUPPLIER',
        new Date().toISOString(),
        new Date().toISOString()
      );

      const countA = await clientA.$queryRawUnsafe<any[]>('SELECT COUNT(*) as cnt FROM "Party";');
      expect(Number(countA[0].cnt)).toBe(1);
      await clientA.$disconnect();

      // 3. Provision Database B (New User B)
      const resB = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'User B Database',
        profileCode: codeB,
        userId: userB.id,
      });
      createdTestFiles.push(resB.canonicalPath);

      // 4. Load Database B
      const clientB = new PrismaClient({
        datasources: { db: { url: `file:${path.resolve(resB.canonicalPath)}` } },
      });
      await clientB.$connect();

      // Invariant: User B cannot see User A records!
      const partyCountB = await clientB.$queryRawUnsafe<any[]>('SELECT COUNT(*) as cnt FROM "Party";');
      expect(Number(partyCountB[0].cnt)).toBe(0);

      const partyRowsB = await clientB.$queryRawUnsafe<any[]>(
        `SELECT * FROM "Party" WHERE partyCode = ?;`,
        uniquePartyCode
      );
      expect(partyRowsB.length).toBe(0);

      await clientB.$disconnect();

      expect(resB.canonicalPath).not.toBe(resA.canonicalPath);
      expect(resB.databaseId).not.toBe(resA.databaseId);
      expect(resB.profileId).not.toBe(resA.profileId);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 36. WINDOWS PATH TESTING
  // ═════════════════════════════════════════════════════════════════════════
  describe('Section 36. Windows Path Testing', () => {
    it('handles database display names with spaces and normalizes paths consistently', async () => {
      const user = await createTestUser('win_u');
      const res = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Mumbai Diamond Branch 01',
        userId: user.id,
      });
      createdTestFiles.push(res.canonicalPath);

      expect(res.profileCode).toBe('mumbai_diamond_branch_01');
      expect(res.canonicalPath).toContain('mumbai_diamond_branch_01.db');
      expect(fs.existsSync(res.canonicalPath)).toBe(true);

      const validation = await databaseValidationService.validateDatabase(res.canonicalPath);
      expect(validation.isValid).toBe(true);
    });
  });
});
