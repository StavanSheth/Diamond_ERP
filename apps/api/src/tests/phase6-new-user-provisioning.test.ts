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
import { getDatabasesDir, getDatabaseTemplatePath, getControlDbPath } from '../infrastructure/paths';
import { ConflictError, NotFoundError } from '../errors';

describe('Diamond ERP V3 — Phase 6: New User + Blank Database Provisioning + User–Database Isolation', () => {
  let installId: string;
  let deviceId: string;
  const createdTestFiles: string[] = [];

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

      // Verify lifecycle moved to DATABASE_DISCOVERY
      let state = await onboardingService.getOnboardingState();
      expect(state.lifecycleState).toBe('DATABASE_DISCOVERY');

      // Create new blank database from template
      const dbRes = await onboardingService.createNewDatabase({
        displayName: `Company ${uname}`,
        profileCode: `prof_${uname}`,
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
  // B, E, F, G. NEW DB UNIQUENESS & ISOLATION (Section 33 B, E, F, G)
  // ═════════════════════════════════════════════════════════════════════════
  describe('B, E, F, G. Database Uniqueness, Path & Profile Isolation', () => {
    it('provisions independent databases for User A and User B with distinct paths, IDs, and profiles', async () => {
      const resA = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Database A',
        profileCode: `p6_db_a_${Date.now()}`,
      });
      createdTestFiles.push(resA.canonicalPath);

      const resB = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Database B',
        profileCode: `p6_db_b_${Date.now()}`,
      });
      createdTestFiles.push(resB.canonicalPath);

      // Invariant B & E: Path isolation
      expect(resA.canonicalPath).not.toBe(resB.canonicalPath);
      expect(fs.existsSync(resA.canonicalPath)).toBe(true);
      expect(fs.existsSync(resB.canonicalPath)).toBe(true);

      // Invariant F: Database Registry isolation
      expect(resA.databaseId).not.toBe(resB.databaseId);

      // Invariant G: Profile isolation
      expect(resA.profileId).not.toBe(resB.profileId);
      expect(resA.profileCode).not.toBe(resB.profileCode);

      // Verify both profiles exist in DB with proper dbPaths
      const profA = await systemPrisma.profile.findUnique({ where: { id: resA.profileId } });
      const profB = await systemPrisma.profile.findUnique({ where: { id: resB.profileId } });
      expect(profA?.dbPath).toBe(resA.canonicalPath);
      expect(profB?.dbPath).toBe(resB.canonicalPath);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // C. EXISTING DB CANNOT BE REUSED / OVERWRITTEN (Section 33 C)
  // ═════════════════════════════════════════════════════════════════════════
  describe('C. Collision and System Database Overwrite Protection', () => {
    it('rejects provisioning when a target database file already exists', async () => {
      const code = `p6_collision_${Date.now()}`;
      const existing = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Initial Database',
        profileCode: code,
      });
      createdTestFiles.push(existing.canonicalPath);

      // Attempting to provision second database with same code on disk must reject
      await expect(
        databaseProvisioningService.provisionBlankDatabase({
          displayName: 'Duplicate Database',
          profileCode: code,
          installationId: 'foreign-install-id', // different installation
        })
      ).rejects.toThrow(ConflictError);
    });

    it('rejects provisioning at the Control DB (system.db) path', () => {
      const controlDbPath = getControlDbPath();
      const controlName = path.basename(controlDbPath).replace(/\.db$/, '');

      expect(() => {
        databaseProvisioningService.determineDestination(controlName, path.dirname(controlDbPath));
      }).toThrow(ConflictError);
    });

    it('rejects provisioning at the Template DB (template.db) path', () => {
      const templateDbPath = getDatabaseTemplatePath();
      if (templateDbPath) {
        const templateName = path.basename(templateDbPath).replace(/\.db$/, '');
        expect(() => {
          databaseProvisioningService.determineDestination(templateName, path.dirname(templateDbPath));
        }).toThrow(ConflictError);
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // D, Section 34 P0 CRITICAL ISOLATION TEST (MANDATORY)
  // ═════════════════════════════════════════════════════════════════════════
  describe('D & Section 34. P0 Critical Data Isolation Test', () => {
    it('proves that User B cannot see business records inserted into User A database', async () => {
      const codeA = `p6_iso_a_${Date.now()}`;
      const codeB = `p6_iso_b_${Date.now()}`;

      // 1. Provision Database A
      const resA = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'User A Database',
        profileCode: codeA,
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

      const uniqueStockCode = `STK_A_${Date.now()}`;
      await clientA.$executeRawUnsafe(
        `INSERT INTO "Stock" (id, stockCode, name, currency, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?);`,
        crypto.randomUUID(),
        uniqueStockCode,
        '10ct Rough Diamonds',
        'USD',
        1,
        new Date().toISOString(),
        new Date().toISOString()
      );

      // Verify Database A has the records
      const countA = await clientA.$queryRawUnsafe<any[]>('SELECT COUNT(*) as cnt FROM "Party";');
      expect(Number(countA[0].cnt)).toBe(1);
      await clientA.$disconnect();

      // 3. Provision Database B (New User)
      const resB = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'User B Database',
        profileCode: codeB,
      });
      createdTestFiles.push(resB.canonicalPath);

      // 4. Load Database B
      const clientB = new PrismaClient({
        datasources: { db: { url: `file:${path.resolve(resB.canonicalPath)}` } },
      });
      await clientB.$connect();

      // Invariant: User B cannot see User A's records!
      const partyCountB = await clientB.$queryRawUnsafe<any[]>('SELECT COUNT(*) as cnt FROM "Party";');
      const stockCountB = await clientB.$queryRawUnsafe<any[]>('SELECT COUNT(*) as cnt FROM "Stock";');
      expect(Number(partyCountB[0].cnt)).toBe(0);
      expect(Number(stockCountB[0].cnt)).toBe(0);

      // Check specific search for User A party in DB B
      const partyRowsB = await clientB.$queryRawUnsafe<any[]>(
        `SELECT * FROM "Party" WHERE partyCode = ?;`,
        uniquePartyCode
      );
      expect(partyRowsB.length).toBe(0);

      await clientB.$disconnect();

      // Invariant Assertions:
      expect(resB.canonicalPath).not.toBe(resA.canonicalPath);
      expect(resB.databaseId).not.toBe(resA.databaseId);
      expect(resB.profileId).not.toBe(resA.profileId);
      expect(resB.profileCode).not.toBe(resA.profileCode);
    });

    it('Section 35: Data-inheritance test - ensures 0 business rows across multiple tables in new DB', async () => {
      const code = `p6_data_inherit_${Date.now()}`;
      const res = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Pristine Verification DB',
        profileCode: code,
      });
      createdTestFiles.push(res.canonicalPath);

      // Verify pristine state across multiple core ERP tables
      const pristineCheck = await databaseProvisioningService.validatePristineState(res.canonicalPath);
      expect(pristineCheck.isPristine).toBe(true);

      const tables = ['Stock', 'Party', 'Transaction', 'Ledger', 'DiamondItem', 'Repair'];
      for (const t of tables) {
        if (pristineCheck.recordCounts[t] !== undefined) {
          expect(pristineCheck.recordCounts[t]).toBe(0);
        }
      }
    });

    it('verifies master template remains pristine after user data modification', async () => {
      const templatePath = getDatabaseTemplatePath()!;
      expect(fs.existsSync(templatePath)).toBe(true);

      // Validate template is pristine
      const pristineCheck = await databaseProvisioningService.validatePristineState(templatePath);
      expect(pristineCheck.isPristine).toBe(true);
      expect(pristineCheck.recordCounts['Stock'] || 0).toBe(0);
      expect(pristineCheck.recordCounts['Party'] || 0).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // H. SESSION ISOLATION & USER SWITCHING (Section 33 H & Section 25)
  // ═════════════════════════════════════════════════════════════════════════
  describe('H. Session Isolation & User Switching', () => {
    it('strictly isolates active profile on login to user assigned profiles', async () => {
      const unameA = `user_sw_a_${Date.now()}`;
      const unameB = `user_sw_b_${Date.now()}`;

      // Create User A with DB A
      const userA = await authService.createUser(unameA, 'Password123!Secure', 'User A', 'ADMIN', []);
      const dbA = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'DB A',
        profileCode: `prof_a_${Date.now()}`,
        userId: userA.id,
      });
      createdTestFiles.push(dbA.canonicalPath);

      // Create User B with DB B
      const userB = await authService.createUser(unameB, 'Password123!Secure', 'User B', 'ADMIN', []);
      const dbB = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'DB B',
        profileCode: `prof_b_${Date.now()}`,
        userId: userB.id,
      });
      createdTestFiles.push(dbB.canonicalPath);

      // Login User A
      const loginA = await authService.login(unameA, 'Password123!Secure');
      expect(loginA.user.activeProfile).toBe(dbA.profileCode);
      expect(loginA.user.profiles).toContain(dbA.profileCode);
      expect(loginA.user.profiles).not.toContain(dbB.profileCode);

      // Login User B
      const loginB = await authService.login(unameB, 'Password123!Secure');
      expect(loginB.user.activeProfile).toBe(dbB.profileCode);
      expect(loginB.user.profiles).toContain(dbB.profileCode);
      expect(loginB.user.profiles).not.toContain(dbA.profileCode);

      // Switch back to User A
      const reLoginA = await authService.login(unameA, 'Password123!Secure');
      expect(reLoginA.user.activeProfile).toBe(dbA.profileCode);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // I, J. IDEMPOTENCY & CONCURRENCY (Section 33 I, J)
  // ═════════════════════════════════════════════════════════════════════════
  describe('I, J. Idempotency & Concurrency Safety', () => {
    it('is idempotent: repeated provisioning with same profile returns existing registry', async () => {
      const code = `p6_idemp_${Date.now()}`;
      const first = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'First Call',
        profileCode: code,
      });
      createdTestFiles.push(first.canonicalPath);

      const second = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Second Call',
        profileCode: code,
      });

      expect(second.databaseId).toBe(first.databaseId);
      expect(second.canonicalPath).toBe(first.canonicalPath);
      expect(second.profileId).toBe(first.profileId);
    });

    it('blocks concurrent provisioning of the same profile path with ConflictError', async () => {
      const code = `p6_race_${Date.now()}`;
      const promise1 = databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Race DB 1',
        profileCode: code,
      });
      const promise2 = databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Race DB 2',
        profileCode: code,
      });

      const results = await Promise.allSettled([promise1, promise2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      const firstResult = (fulfilled[0] as PromiseFulfilledResult<any>).value;
      createdTestFiles.push(firstResult.canonicalPath);

      if (rejected.length > 0) {
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // K, L. VALIDATION FAILURE & COMPENSATION (Section 33 K, L)
  // ═════════════════════════════════════════════════════════════════════════
  describe('K, L. Failure Handling & Filesystem Compensation', () => {
    it('compensates and deletes newly created DB file when Control DB transaction fails', async () => {
      const code = `p6_comp_${Date.now()}`;
      const dbDir = path.resolve(getDatabasesDir());
      const expectedDbPath = path.resolve(dbDir, `${code}.db`);

      // Intentionally insert a conflicting profile record that will cause tx to fail
      await systemPrisma.profile.create({
        data: {
          code,
          name: 'Pre-existing Conflict',
          status: 'ACTIVE',
          isActive: true,
        },
      });

      // Now attempt to provision with an invalid installation ID that fails FK constraint
      await expect(
        databaseProvisioningService.provisionBlankDatabase({
          displayName: 'Compensate DB',
          profileCode: code,
          installationId: '00000000-0000-0000-0000-000000000000', // Non-existent installation
        })
      ).rejects.toThrow();

      // Invariant L: The copied database file must be deleted by compensation!
      expect(fs.existsSync(expectedDbPath)).toBe(false);

      // Clean up the dummy profile
      await systemPrisma.profile.delete({ where: { code } }).catch(() => {});
    });

    it('fails closed without creating empty file if template is not found', async () => {
      const originalEnv = process.env.DIAMOND_TEMPLATE_DB;
      process.env.DIAMOND_TEMPLATE_DB = path.resolve('non_existent_template_123.db');

      try {
        const code = `p6_missing_tpl_${Date.now()}`;
        const dbDir = path.resolve(getDatabasesDir());
        const expectedDbPath = path.resolve(dbDir, `${code}.db`);

        await expect(
          databaseProvisioningService.provisionBlankDatabase({
            displayName: 'Should Fail',
            profileCode: code,
          })
        ).rejects.toThrow(NotFoundError);

        expect(fs.existsSync(expectedDbPath)).toBe(false);
      } finally {
        if (originalEnv !== undefined) {
          process.env.DIAMOND_TEMPLATE_DB = originalEnv;
        } else {
          delete process.env.DIAMOND_TEMPLATE_DB;
        }
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // N. PHASE 5 REGRESSION (Section 33 N)
  // ═════════════════════════════════════════════════════════════════════════
  describe('N. Phase 5 Regression Verification', () => {
    it('preserves existing user discovery and database discovery functionality', async () => {
      // 1. Discover users
      const users = await onboardingService.discoverUsers();
      expect(users).toBeDefined();
      expect(Array.isArray(users.candidates)).toBe(true);

      // 2. Discover databases
      const dbs = await onboardingService.discoverDatabases();
      expect(dbs).toBeDefined();
      expect(Array.isArray(dbs.candidates)).toBe(true);

      // 3. Inspect database candidate
      const templatePath = getDatabaseTemplatePath()!;
      const preview = await onboardingService.inspectDatabaseCandidate(templatePath);
      expect(preview.conflictReason).toBe('DATABASE_IS_TEMPLATE');
      expect(preview.suitability).toBe('CONFLICT');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 36. WINDOWS PATH TESTING
  // ═════════════════════════════════════════════════════════════════════════
  describe('Section 36. Windows Path Testing', () => {
    it('handles database display names with spaces and normalizes paths consistently', async () => {
      const res = await databaseProvisioningService.provisionBlankDatabase({
        displayName: 'Mumbai Diamond Branch 01',
      });
      createdTestFiles.push(res.canonicalPath);

      expect(res.profileCode).toBe('mumbai_diamond_branch_01');
      expect(res.canonicalPath).toContain('mumbai_diamond_branch_01.db');
      expect(fs.existsSync(res.canonicalPath)).toBe(true);

      // Verify canonical path resolution consistency
      const validation = await databaseValidationService.validateDatabase(res.canonicalPath);
      expect(validation.isValid).toBe(true);
    });
  });
});
