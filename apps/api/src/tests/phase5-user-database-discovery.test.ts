import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { systemPrisma } from '../infrastructure/database/prisma';
import { installationService } from '../modules/system/installation.service';
import { onboardingService } from '../modules/system/onboarding/onboarding.service';
import { databaseValidationService } from '../modules/system/database/database-validation.service';
import { authService } from '../modules/auth/auth.service';
import { deviceSecurityService } from '../modules/security/device-security.service';
import {
  getDatabasesDir,
  getControlDbPath,
  getDatabaseTemplatePath,
} from '../infrastructure/paths';
import { ValidationError, ConflictError, NotFoundError } from '../errors';

describe('Diamond ERP V3 — Phase 5: Existing User + Database Discovery & Validation', () => {
  let installId: string;
  let deviceId: string;
  const createdTestFiles: string[] = [];

  beforeEach(async () => {
    const install = await installationService.getOrCreateInstallation();
    installId = install.id;
    deviceId = installationService.getOrGenerateDeviceId();

    // Ensure active device and pin for full lifecycle flow
    await installationService.registerDevice({
      deviceName: 'Phase5-Validation-Terminal',
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
  // 50.1 EXISTING USER TESTS
  // ═════════════════════════════════════════════════════════════════════════
  describe('50.1 Existing User Discovery, Validation & Selection', () => {
    it('discovers existing users without exposing password hashes, PIN hashes, or tokens', async () => {
      const uname = `p5_user_${Date.now()}`;
      const created = await authService.createUser(uname, 'SecretPass12345!', 'P5 User', 'ADMIN', []);

      const discovery = await onboardingService.discoverUsers();
      expect(discovery.candidates.length).toBeGreaterThan(0);

      const found = discovery.candidates.find((u) => u.id === created.id);
      expect(found).toBeDefined();
      expect(found?.username).toBe(uname);
      expect(found?.displayName).toBe('P5 User');
      expect(found?.role).toBe('ADMIN');
      expect(found?.isActive).toBe(true);

      // Verify strict security boundary: no secrets or credentials exposed
      expect((found as any).passwordHash).toBeUndefined();
      expect((found as any).pinHash).toBeUndefined();
      expect((found as any).refreshToken).toBeUndefined();
      expect((found as any).sessionToken).toBeUndefined();
    });

    it('excludes soft-deleted users from user discovery candidates', async () => {
      const uname = `p5_del_${Date.now()}`;
      const created = await authService.createUser(uname, 'SecretPass12345!', 'P5 Deleted', 'VIEWER', []);

      // Soft delete the user
      await systemPrisma.user.update({
        where: { id: created.id },
        data: { deletedAt: new Date() },
      });

      const discovery = await onboardingService.discoverUsers();
      const found = discovery.candidates.find((u) => u.id === created.id);
      expect(found).toBeUndefined();
    });

    it('rejects selection of non-existent or soft-deleted user with NotFoundError', async () => {
      await expect(
        onboardingService.selectExistingUser('non-existent-user-uuid')
      ).rejects.toThrow(NotFoundError);

      const uname = `p5_del2_${Date.now()}`;
      const created = await authService.createUser(uname, 'SecretPass12345!', 'P5 Deleted 2', 'VIEWER', []);
      await systemPrisma.user.update({
        where: { id: created.id },
        data: { deletedAt: new Date() },
      });

      await expect(
        onboardingService.selectExistingUser(created.id)
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects selection of inactive user with ConflictError', async () => {
      const uname = `p5_inact_${Date.now()}`;
      const created = await authService.createUser(uname, 'SecretPass12345!', 'P5 Inactive', 'VIEWER', []);
      await systemPrisma.user.update({
        where: { id: created.id },
        data: { isActive: false },
      });

      await expect(
        onboardingService.selectExistingUser(created.id)
      ).rejects.toThrow(ConflictError);
    });

    it('successfully associates valid user, records USER_ASSOCIATED audit event, and advances lifecycle to DATABASE_DISCOVERY', async () => {
      const uname = `p5_valid_${Date.now()}`;
      const created = await authService.createUser(uname, 'SecretPass12345!', 'P5 Valid', 'ADMIN', []);

      const res = await onboardingService.selectExistingUser(created.id);
      expect(res.success).toBe(true);
      expect(res.user.id).toBe(created.id);

      // Verify InstallationUser relation
      const installUser = await systemPrisma.installationUser.findUnique({
        where: {
          installationId_userId: {
            installationId: installId,
            userId: created.id,
          },
        },
      });
      expect(installUser).toBeDefined();

      // Verify USER_ASSOCIATED audit event
      const audit = await systemPrisma.auditEvent.findFirst({
        where: {
          entityType: 'User',
          entityId: created.id,
          eventType: 'USER_ASSOCIATED',
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.performedBy).toBe(created.id);

      // Verify lifecycle advanced to DATABASE_DISCOVERY
      const install = await installationService.getOrCreateInstallation();
      expect(install.lifecycleState).toBe('DATABASE_DISCOVERY');
    });

    it('is strictly idempotent when selecting the same user multiple times', async () => {
      const uname = `p5_idem_${Date.now()}`;
      const created = await authService.createUser(uname, 'SecretPass12345!', 'P5 Idem', 'ADMIN', []);

      await onboardingService.selectExistingUser(created.id);
      await onboardingService.selectExistingUser(created.id);

      const records = await systemPrisma.installationUser.findMany({
        where: { installationId: installId, userId: created.id },
      });
      expect(records.length).toBe(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 50.2 DATABASE DISCOVERY TESTS
  // ═════════════════════════════════════════════════════════════════════════
  describe('50.2 Bounded Database Discovery', () => {
    it('discovers databases from DatabaseRegistry and local databases directory', async () => {
      const testDb = path.resolve(getDatabasesDir(), `disc_test_${Date.now()}.db`);
      const templatePath = getDatabaseTemplatePath()!;
      fs.copyFileSync(templatePath, testDb);
      createdTestFiles.push(testDb);

      const discovery = await onboardingService.discoverDatabases();
      expect(discovery.candidates.length).toBeGreaterThan(0);

      const found = discovery.candidates.find(
        (c) => c.canonicalPath.toLowerCase() === testDb.toLowerCase()
      );
      expect(found).toBeDefined();
      expect(found?.status).toBe('ACTIVE');
    });

    it('excludes Control DB (system.db) and Template DB (template.db) from discovery', async () => {
      const controlDb = path.resolve(getControlDbPath()).toLowerCase();
      const templateDb = getDatabaseTemplatePath() ? path.resolve(getDatabaseTemplatePath()!).toLowerCase() : null;

      const discovery = await onboardingService.discoverDatabases();
      for (const candidate of discovery.candidates) {
        const p = candidate.canonicalPath.toLowerCase();
        expect(p).not.toBe(controlDb);
        if (templateDb) {
          expect(p).not.toBe(templateDb);
        }
      }
    });

    it('deduplicates database candidates case-insensitively on Windows', async () => {
      const baseName = `cased_${Date.now()}.db`;
      const testDb = path.resolve(getDatabasesDir(), baseName);
      const templatePath = getDatabaseTemplatePath()!;
      fs.copyFileSync(templatePath, testDb);
      createdTestFiles.push(testDb);

      // Register with mixed case
      const upperPath = testDb.toUpperCase();
      await systemPrisma.databaseRegistry.create({
        data: {
          databaseId: crypto.randomUUID(),
          displayName: 'Cased DB',
          canonicalPath: upperPath,
          schemaVersion: 1,
          status: 'ACTIVE',
          databaseType: 'EXTERNAL',
          installationId: installId,
        },
      });

      const discovery = await onboardingService.discoverDatabases();
      const matches = discovery.candidates.filter(
        (c) => c.canonicalPath.toLowerCase() === testDb.toLowerCase()
      );
      expect(matches.length).toBe(1);
    });

    it('classifies missing database file as MISSING status in discovery', async () => {
      const missingPath = path.resolve(getDatabasesDir(), `non_existent_${Date.now()}.db`);
      await systemPrisma.databaseRegistry.create({
        data: {
          databaseId: crypto.randomUUID(),
          displayName: 'Missing DB',
          canonicalPath: missingPath,
          schemaVersion: 1,
          status: 'ACTIVE',
          databaseType: 'EXTERNAL',
          installationId: installId,
        },
      });

      const discovery = await onboardingService.discoverDatabases();
      const found = discovery.candidates.find(
        (c) => c.canonicalPath.toLowerCase() === missingPath.toLowerCase()
      );
      expect(found).toBeDefined();
      expect(found?.status).toBe('MISSING');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 50.3 DATABASE VALIDATION & SUITABILITY CLASSIFICATION
  // ═════════════════════════════════════════════════════════════════════════
  describe('50.3 Database Structural Validation & Compatibility Classification', () => {
    it('validates a valid production Diamond ERP database file', async () => {
      const testDb = path.resolve(getDatabasesDir(), `valid_erp_${Date.now()}.db`);
      const templatePath = getDatabaseTemplatePath()!;
      fs.copyFileSync(templatePath, testDb);
      createdTestFiles.push(testDb);

      const validation = await databaseValidationService.validateDatabase(testDb);
      expect(validation.isValid).toBe(true);
      expect(validation.status).toBe('ACTIVE');
      expect(validation.tableCount).toBeGreaterThanOrEqual(7);
      expect(validation.integrityCheck).toBe('ok');

      const preview = await onboardingService.inspectDatabaseCandidate(testDb);
      expect(preview.suitability).toBe('REQUIRES_CONFIRMATION');
      expect(preview.status).toBe('ACTIVE');
    });

    it('classifies non-existent database as MISSING status with INVALID suitability', async () => {
      const nonExistent = path.resolve(getDatabasesDir(), `ghost_${Date.now()}.db`);
      const validation = await databaseValidationService.validateDatabase(nonExistent);
      expect(validation.isValid).toBe(false);
      expect(validation.status).toBe('MISSING');

      const preview = await onboardingService.inspectDatabaseCandidate(nonExistent);
      expect(preview.status).toBe('MISSING');
      expect(preview.suitability).toBe('INVALID');
    });

    it('classifies plain text or invalid file as INVALID', async () => {
      const plainText = path.resolve(getDatabasesDir(), `text_${Date.now()}.db`);
      fs.writeFileSync(plainText, 'This is not a sqlite database file at all.');
      createdTestFiles.push(plainText);

      const validation = await databaseValidationService.validateDatabase(plainText);
      expect(validation.isValid).toBe(false);
      expect(validation.status).toBe('INVALID');

      const preview = await onboardingService.inspectDatabaseCandidate(plainText);
      expect(preview.suitability).toBe('INVALID');
    });

    it('classifies corrupted SQLite file as CORRUPTED', async () => {
      const corruptFile = path.resolve(getDatabasesDir(), `corrupt_${Date.now()}.db`);
      // SQLite header followed by garbage
      const buf = Buffer.alloc(1024);
      Buffer.from('SQLite format 3\0').copy(buf, 0);
      fs.writeFileSync(corruptFile, buf);
      createdTestFiles.push(corruptFile);

      const validation = await databaseValidationService.validateDatabase(corruptFile);
      expect(validation.isValid).toBe(false);
      expect(validation.status).toBe('CORRUPTED');

      const preview = await onboardingService.inspectDatabaseCandidate(corruptFile);
      expect(preview.suitability).toBe('CORRUPTED');
    });

    it('classifies SQLite database missing required ERP tables as UNSUPPORTED', async () => {
      const unsupportedDb = path.resolve(getDatabasesDir(), `unsupported_${Date.now()}.db`);
      const templatePath = getDatabaseTemplatePath()!;
      fs.copyFileSync(templatePath, unsupportedDb);
      createdTestFiles.push(unsupportedDb);

      const tempClient = new PrismaClient({
        datasources: { db: { url: `file:${unsupportedDb.replace(/\\/g, '/')}` } },
      });
      await tempClient.$connect();
      await tempClient.$executeRawUnsafe('DROP TABLE "Stock";');
      await tempClient.$disconnect();

      const validation = await databaseValidationService.validateDatabase(unsupportedDb);
      expect(validation.isValid).toBe(false);
      expect(validation.status).toBe('UNSUPPORTED');
      expect(validation.missingRequiredTables).toContain('Stock');

      const preview = await onboardingService.inspectDatabaseCandidate(unsupportedDb);
      expect(preview.suitability).toBe('UNSUPPORTED');
    });

    it('classifies database with future schema version as UNSUPPORTED', async () => {
      const futureDb = path.resolve(getDatabasesDir(), `future_ver_${Date.now()}.db`);
      const templatePath = getDatabaseTemplatePath()!;
      fs.copyFileSync(templatePath, futureDb);
      createdTestFiles.push(futureDb);

      const tempClient = new PrismaClient({
        datasources: { db: { url: `file:${futureDb.replace(/\\/g, '/')}` } },
      });
      await tempClient.$connect();
      await tempClient.$executeRawUnsafe(
        'INSERT OR REPLACE INTO "Profile" ("id", "code", "name", "schemaVersion", "status", "isActive", "createdAt", "updatedAt") ' +
        "VALUES ('p1', 'main', 'Main Profile', 99, 'ACTIVE', 1, datetime('now'), datetime('now'));"
      );
      await tempClient.$disconnect();

      const validation = await databaseValidationService.validateDatabase(futureDb);
      expect(validation.isValid).toBe(false);
      expect(validation.status).toBe('UNSUPPORTED');
      expect(validation.error).toContain('Future schema version');

      const preview = await onboardingService.inspectDatabaseCandidate(futureDb);
      expect(preview.suitability).toBe('UNSUPPORTED');
    });

    it('rejects Control DB (system.db) candidate inspection with CONFLICT and DATABASE_IS_CONTROL_DB', async () => {
      const controlDb = getControlDbPath();
      const preview = await onboardingService.inspectDatabaseCandidate(controlDb);
      expect(preview.suitability).toBe('CONFLICT');
      expect(preview.conflictReason).toBe('DATABASE_IS_CONTROL_DB');
    });

    it('rejects Template DB (template.db) candidate inspection with CONFLICT and DATABASE_IS_TEMPLATE', async () => {
      const templateDb = getDatabaseTemplatePath()!;
      const preview = await onboardingService.inspectDatabaseCandidate(templateDb);
      expect(preview.suitability).toBe('CONFLICT');
      expect(preview.conflictReason).toBe('DATABASE_IS_TEMPLATE');
    });

    it('detects cross-installation ownership conflict with CONFLICT and DATABASE_INSTALLATION_CONFLICT', async () => {
      const foreignInstall = await systemPrisma.installation.create({
        data: {
          installationId: 'foreign-install-uuid-999',
          status: 'ACTIVE',
          lifecycleState: 'READY',
        },
      });

      const conflictDb = path.resolve(getDatabasesDir(), `foreign_owned_${Date.now()}.db`);
      const templatePath = getDatabaseTemplatePath()!;
      fs.copyFileSync(templatePath, conflictDb);
      createdTestFiles.push(conflictDb);

      await systemPrisma.databaseRegistry.create({
        data: {
          databaseId: crypto.randomUUID(),
          displayName: 'Foreign Owned DB',
          canonicalPath: conflictDb,
          schemaVersion: 1,
          status: 'ACTIVE',
          databaseType: 'EXTERNAL',
          installationId: foreignInstall.id,
        },
      });

      const preview = await onboardingService.inspectDatabaseCandidate(conflictDb);
      expect(preview.suitability).toBe('CONFLICT');
      expect(preview.conflictReason).toBe('DATABASE_INSTALLATION_CONFLICT');

      // Attempting to attach must throw ConflictError
      await expect(
        onboardingService.attachExistingDatabase({
          path: conflictDb,
          confirmAttachment: true,
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 50.4 EXPLICIT ATTACHMENT & TRANSACTION SAFETY
  // ═════════════════════════════════════════════════════════════════════════
  describe('50.4 Explicit Attachment, Audit Events & Transaction Safety', () => {
    it('rejects attachment without explicit confirmation (confirmAttachment = false)', async () => {
      const testDb = path.resolve(getDatabasesDir(), `unconfirmed_${Date.now()}.db`);
      const templatePath = getDatabaseTemplatePath()!;
      fs.copyFileSync(templatePath, testDb);
      createdTestFiles.push(testDb);

      await expect(
        onboardingService.attachExistingDatabase({
          path: testDb,
          confirmAttachment: false,
        })
      ).rejects.toThrow(ValidationError);
    });

    it('revalidates database before attachment and rejects if file became invalid', async () => {
      const corruptedBeforeAttach = path.resolve(getDatabasesDir(), `swap_corrupt_${Date.now()}.db`);
      fs.writeFileSync(corruptedBeforeAttach, 'plain text non-database file');
      createdTestFiles.push(corruptedBeforeAttach);

      await expect(
        onboardingService.attachExistingDatabase({
          path: corruptedBeforeAttach,
          confirmAttachment: true,
        })
      ).rejects.toThrow(ValidationError);
    });

    it('successfully attaches valid database upon explicit confirmation: creates Profile, DatabaseRegistry, UserProfile & AuditEvents', async () => {
      // 1. Associate a user first
      const uname = `p5_att_user_${Date.now()}`;
      const user = await authService.createUser(uname, 'SecretPass12345!', 'Attach User', 'ADMIN', []);
      await onboardingService.selectExistingUser(user.id);

      // 2. Prepare valid candidate DB
      const testDb = path.resolve(getDatabasesDir(), `company_attach_${Date.now()}.db`);
      const templatePath = getDatabaseTemplatePath()!;
      fs.copyFileSync(templatePath, testDb);
      createdTestFiles.push(testDb);

      const beforeStat = fs.statSync(testDb);

      // 3. Attach
      const attachRes = await onboardingService.attachExistingDatabase({
        path: testDb,
        displayName: 'Attached Business DB',
        confirmAttachment: true,
      });

      expect(attachRes.success).toBe(true);
      expect(attachRes.registry).toBeDefined();
      expect(attachRes.registry.displayName).toBe('Attached Business DB');

      // 4. Invariant: physical external DB file was NOT modified or deleted
      expect(fs.existsSync(testDb)).toBe(true);
      const afterStat = fs.statSync(testDb);
      expect(afterStat.size).toBe(beforeStat.size);

      // 5. Verify DatabaseRegistry record in Control DB
      const reg = await systemPrisma.databaseRegistry.findUnique({
        where: { canonicalPath: testDb },
        include: { profile: true },
      });
      expect(reg).toBeDefined();
      expect(reg?.installationId).toBe(installId);
      expect(reg?.status).toBe('ACTIVE');
      expect(reg?.profileId).toBeDefined();

      // 6. Verify Profile record in Control DB
      const prof = await systemPrisma.profile.findUnique({
        where: { id: reg!.profileId! },
      });
      expect(prof).toBeDefined();
      expect(prof?.status).toBe('ACTIVE');

      // 7. Verify UserProfile link
      const userProfile = await systemPrisma.userProfile.findUnique({
        where: {
          userId_profileId: {
            userId: user.id,
            profileId: prof!.id,
          },
        },
      });
      expect(userProfile).toBeDefined();
      expect(userProfile?.isActive).toBe(true);

      // 8. Verify AuditEvents
      const confirmAudit = await systemPrisma.auditEvent.findFirst({
        where: {
          entityType: 'DatabaseRegistry',
          entityId: reg!.databaseId,
          eventType: 'DATABASE_ATTACHMENT_CONFIRMED',
        },
      });
      expect(confirmAudit).toBeDefined();

      const attachAudit = await systemPrisma.auditEvent.findFirst({
        where: {
          entityType: 'DatabaseRegistry',
          entityId: reg!.databaseId,
          eventType: 'DATABASE_ATTACHED',
        },
      });
      expect(attachAudit).toBeDefined();

      // 9. Verify state machine advanced to DATABASE_SETUP
      const currentInstall = await installationService.getOrCreateInstallation();
      expect(currentInstall.lifecycleState).toBe('DATABASE_SETUP');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 50.5 IDEMPOTENCY & 50.6 CONCURRENCY TESTS
  // ═════════════════════════════════════════════════════════════════════════
  describe('50.5 Idempotency & 50.6 Concurrency Protection', () => {
    it('attaching the same database twice yields identical logical databaseId without duplicates', async () => {
      const testDb = path.resolve(getDatabasesDir(), `idem_attach_${Date.now()}.db`);
      const templatePath = getDatabaseTemplatePath()!;
      fs.copyFileSync(templatePath, testDb);
      createdTestFiles.push(testDb);

      const res1 = await onboardingService.attachExistingDatabase({
        path: testDb,
        displayName: 'Idem DB 1',
        confirmAttachment: true,
      });

      const res2 = await onboardingService.attachExistingDatabase({
        path: testDb,
        displayName: 'Idem DB 1',
        confirmAttachment: true,
      });

      expect(res1.registry.databaseId).toBe(res2.registry.databaseId);

      const allRegistries = await systemPrisma.databaseRegistry.findMany({
        where: { canonicalPath: testDb },
      });
      expect(allRegistries.length).toBe(1);
    });

    it('handles concurrent attachment requests of the same database safely', async () => {
      const testDb = path.resolve(getDatabasesDir(), `concurrent_att_${Date.now()}.db`);
      const templatePath = getDatabaseTemplatePath()!;
      fs.copyFileSync(templatePath, testDb);
      createdTestFiles.push(testDb);

      const [resA, resB] = await Promise.all([
        onboardingService.attachExistingDatabase({
          path: testDb,
          displayName: 'Concurrent DB',
          confirmAttachment: true,
        }),
        onboardingService.attachExistingDatabase({
          path: testDb,
          displayName: 'Concurrent DB',
          confirmAttachment: true,
        }),
      ]);

      expect(resA.registry.databaseId).toBe(resB.registry.databaseId);

      const records = await systemPrisma.databaseRegistry.findMany({
        where: { canonicalPath: testDb },
      });
      expect(records.length).toBe(1);
    });

    it('handles concurrent user selection requests idempotently', async () => {
      const uname = `p5_conc_user_${Date.now()}`;
      const user = await authService.createUser(uname, 'SecretPass12345!', 'Concurrent User', 'ADMIN', []);

      await Promise.all([
        onboardingService.selectExistingUser(user.id),
        onboardingService.selectExistingUser(user.id),
      ]);

      const records = await systemPrisma.installationUser.findMany({
        where: { installationId: installId, userId: user.id },
      });
      expect(records.length).toBe(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 50.7 AUTHORITATIVE LIFECYCLE INTEGRATION & BYPASS PREVENTION
  // ═════════════════════════════════════════════════════════════════════════
  describe('50.7 Authoritative Lifecycle Transitions & Bypass Prevention', () => {
    it('prevents illegal transitions directly to READY from USER_DISCOVERY, DATABASE_DISCOVERY, or DATABASE_VALIDATION', async () => {
      // From USER_DISCOVERY -> READY
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'USER_DISCOVERY' },
      });
      await expect(
        installationService.updateLifecycleState('READY', { enforceInvariants: true })
      ).rejects.toThrow(ConflictError);

      // From DATABASE_DISCOVERY -> READY
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DATABASE_DISCOVERY' },
      });
      await expect(
        installationService.updateLifecycleState('READY', { enforceInvariants: true })
      ).rejects.toThrow(ConflictError);

      // From DATABASE_VALIDATION -> READY
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DATABASE_VALIDATION' },
      });
      await expect(
        installationService.updateLifecycleState('READY', { enforceInvariants: true })
      ).rejects.toThrow(ConflictError);
    });

    it('executes complete authoritative path: USER_DISCOVERY -> DATABASE_DISCOVERY -> DATABASE_VALIDATION -> DATABASE_SETUP -> READY', async () => {
      // 1. Associate User
      const uname = `p5_full_${Date.now()}`;
      const user = await authService.createUser(uname, 'SecretPass12345!', 'Full Path User', 'ADMIN', []);
      await onboardingService.selectExistingUser(user.id);

      const s1 = await onboardingService.getOnboardingState();
      expect(s1.lifecycleState).toBe('DATABASE_DISCOVERY');

      // 2. Discover & Attach DB
      const testDb = path.resolve(getDatabasesDir(), `full_path_${Date.now()}.db`);
      const templatePath = getDatabaseTemplatePath()!;
      fs.copyFileSync(templatePath, testDb);
      createdTestFiles.push(testDb);

      await onboardingService.attachExistingDatabase({
        path: testDb,
        displayName: 'Full Path DB',
        confirmAttachment: true,
      });

      const s2 = await onboardingService.getOnboardingState();
      expect(s2.lifecycleState).toBe('DATABASE_SETUP');

      // 3. Complete Onboarding
      const finalStatus = await onboardingService.completeOnboarding();
      expect(finalStatus.lifecycleState).toBe('READY');
      expect(finalStatus.ready).toBe(true);

      // 4. Verify ONBOARDING_COMPLETED audit event
      const completeAudit = await systemPrisma.auditEvent.findFirst({
        where: {
          entityType: 'Installation',
          entityId: installId,
          eventType: 'ONBOARDING_COMPLETED',
        },
      });
      expect(completeAudit).toBeDefined();
    });
  });
});
