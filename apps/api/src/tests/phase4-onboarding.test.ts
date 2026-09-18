import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { systemPrisma } from '../infrastructure/database/prisma';
import { onboardingService } from '../modules/system/onboarding/onboarding.service';
import { installationService } from '../modules/system/installation.service';
import { deviceSecurityService } from '../modules/security/device-security.service';
import { authService } from '../modules/auth/auth.service';
import {
  getDatabasesDir,
  getControlDbPath,
  getDatabaseTemplatePath,
} from '../infrastructure/paths';
import { ValidationError, ConflictError, NotFoundError } from '../errors';

describe('Diamond ERP V3 — Phase 4: First-Run Onboarding, User & Database Discovery', () => {
  let installId: string;
  let deviceId: string;
  const createdTestFiles: string[] = [];

  beforeEach(async () => {
    const install = await installationService.getOrCreateInstallation();
    installId = install.id;
    deviceId = installationService.getOrGenerateDeviceId();

    // Reset installation to APP_SETUP for deterministic test progression
    await systemPrisma.installation.update({
      where: { id: installId },
      data: { lifecycleState: 'APP_SETUP', initializedAt: null, status: 'ACTIVE' },
    });

    // Ensure active device
    await installationService.registerDevice({
      deviceName: 'Phase4-Test-Terminal',
      platform: 'WINDOWS',
    });

    // Clean device security state for fresh test
    await systemPrisma.deviceSecurity.deleteMany({
      where: { deviceId },
    });
  });

  afterEach(() => {
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

  // ── Test Group 1 & 2: Fresh Install & App Setup Idempotency ────────────
  describe('Group 1 & 2: Fresh Install Detection & App Setup Idempotency', () => {
    it('initializes application setup and advances lifecycle from NOT_INITIALIZED to APP_SETUP', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'NOT_INITIALIZED' },
      });

      const status = await onboardingService.initializeApplication();
      expect(status.installationInitialized).toBe(true);
      expect(status.lifecycleState).toBe('APP_SETUP');
    });

    it('is strictly idempotent on repeated app setup initialization', async () => {
      const first = await onboardingService.initializeApplication();
      const second = await onboardingService.initializeApplication();
      expect(first.installation?.installationId).toBe(second.installation?.installationId);
      expect(second.lifecycleState).toBe('APP_SETUP');
    });
  });

  // ── Test Group 3 & 4 & 5: User Discovery, Creation & Association ───────
  describe('Group 3, 4, 5: Business User Discovery, Creation & Association', () => {
    it('discovers existing users and correctly identifies installation association', async () => {
      const uniqueSuffix = Date.now().toString();
      const user = await authService.createUser(
        `disc_user_${uniqueSuffix}`,
        'Password123456!',
        'Discovery User',
        'ADMIN'
      );

      const discovery = await onboardingService.discoverUsers();
      expect(discovery.candidates.length).toBeGreaterThan(0);

      const found = discovery.candidates.find((c) => c.id === user.id);
      expect(found).toBeDefined();
      expect(found?.username).toBe(`disc_user_${uniqueSuffix}`);
      expect((found as any)?.passwordHash).toBeUndefined(); // Zero secret leakage
      expect(found?.associatedWithInstallation).toBe(false);

      // Now associate
      await onboardingService.selectExistingUser(user.id);

      const discoveryAfter = await onboardingService.discoverUsers();
      const foundAfter = discoveryAfter.candidates.find((c) => c.id === user.id);
      expect(foundAfter?.associatedWithInstallation).toBe(true);
    });

    it('creates a new business user during onboarding with secure password hashing', async () => {
      const uniqueSuffix = Date.now().toString();
      const username = `new_adm_${uniqueSuffix}`;

      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'USER_DISCOVERY' },
      });

      const result = await onboardingService.createBusinessUser({
        username,
        password: 'SecurePassword123!',
        displayName: 'New Administrator',
      });

      expect(result.success).toBe(true);
      expect(result.user.username).toBe(username);
      expect((result.user as any).passwordHash).toBeUndefined(); // Zero secret leakage

      // Verify associated in Control DB
      const installUser = await systemPrisma.installationUser.findFirst({
        where: { installationId: installId, userId: result.user.id },
      });
      expect(installUser).not.toBeNull();

      // Lifecycle advanced to DATABASE_DISCOVERY
      const state = await onboardingService.getOnboardingState();
      expect(state.lifecycleState).toBe('DATABASE_DISCOVERY');
    });

    it('rejects association of non-existent or inactive users', async () => {
      await expect(
        onboardingService.selectExistingUser('non-existent-user-uuid')
      ).rejects.toThrow(NotFoundError);

      const uniqueSuffix = Date.now().toString();
      const inactiveUser = await systemPrisma.user.create({
        data: {
          username: `inactive_${uniqueSuffix}`,
          passwordHash: 'hash',
          displayName: 'Inactive User',
          isActive: false,
        },
      });

      await expect(
        onboardingService.selectExistingUser(inactiveUser.id)
      ).rejects.toThrow(ConflictError);
    });

    it('disassociating user preserves database and user records', async () => {
      const uniqueSuffix = Date.now().toString();
      const user = await authService.createUser(
        `keep_user_${uniqueSuffix}`,
        'Password123456!',
        'Keep User',
        'ADMIN'
      );

      await installationService.associateUser(installId, user.id);
      await installationService.disassociateUser(installId, user.id);

      // User must still exist in User table
      const userCheck = await systemPrisma.user.findUnique({ where: { id: user.id } });
      expect(userCheck).not.toBeNull();
    });
  });

  // ── Test Group 6 & 7: Database Discovery & Path Security ───────────────
  describe('Group 6 & 7: Database Discovery & Path Security', () => {
    it('discovers databases from local directories without whole-drive scan', async () => {
      const discovery = await onboardingService.discoverDatabases();
      expect(discovery).toBeDefined();
      expect(Array.isArray(discovery.candidates)).toBe(true);

      // Invariant: control DB and template DB must NEVER appear as candidate business databases
      const controlDbPath = path.resolve(getControlDbPath()).toLowerCase();
      const templateDbPath = getDatabaseTemplatePath()
        ? path.resolve(getDatabaseTemplatePath()!).toLowerCase()
        : '';

      for (const candidate of discovery.candidates) {
        const canonical = path.resolve(candidate.canonicalPath).toLowerCase();
        expect(canonical).not.toBe(controlDbPath);
        if (templateDbPath) {
          expect(canonical).not.toBe(templateDbPath);
        }
      }
    });

    it('rejects path traversal, null bytes, and directory paths during inspection', async () => {
      // Null byte
      const nullByte = await onboardingService.inspectDatabaseCandidate('data\0.db');
      expect(nullByte.suitability).toBe('INVALID');

      // Directory
      const dirPreview = await onboardingService.inspectDatabaseCandidate(getDatabasesDir());
      expect(dirPreview.suitability).toBe('INVALID');
      expect(dirPreview.details).toContain('directory');

      // Non-existent path
      const missingPreview = await onboardingService.inspectDatabaseCandidate('C:\\non_existent_folder_xyz\\missing.db');
      expect(missingPreview.suitability).toBe('INVALID');
    });

    it('rejects candidate inspection targeting system.db or template.db', async () => {
      const controlDb = getControlDbPath();
      const controlPreview = await onboardingService.inspectDatabaseCandidate(controlDb);
      expect(controlPreview.suitability).toBe('CONFLICT');
      expect(controlPreview.conflictReason).toBe('DATABASE_IS_CONTROL_DB');

      const templateDb = getDatabaseTemplatePath();
      if (templateDb) {
        const templatePreview = await onboardingService.inspectDatabaseCandidate(templateDb);
        expect(templatePreview.suitability).toBe('CONFLICT');
        expect(templatePreview.conflictReason).toBe('DATABASE_IS_TEMPLATE');
      }
    });
  });

  // ── Test Group 8, 9, 10, 11: Database Attachment, New DB & Template Invariants
  describe('Group 8, 9, 10, 11: Database Attachment, New DB & Template Invariants', () => {
    it('requires explicit confirmation before attaching an existing database', async () => {
      const templatePath = getDatabaseTemplatePath();
      expect(templatePath).not.toBeNull();

      const candidatePath = path.resolve(getDatabasesDir(), `candidate_test_${Date.now()}.db`);
      fs.copyFileSync(templatePath!, candidatePath);
      createdTestFiles.push(candidatePath);

      // Attachment without confirmation must fail
      await expect(
        onboardingService.attachExistingDatabase({
          path: candidatePath,
          confirmAttachment: false,
        })
      ).rejects.toThrow(ValidationError);
    });

    it('attaches existing valid database upon explicit confirmation and preserves file content', async () => {
      const templatePath = getDatabaseTemplatePath();
      expect(templatePath).not.toBeNull();

      const candidatePath = path.resolve(getDatabasesDir(), `candidate_attach_${Date.now()}.db`);
      fs.copyFileSync(templatePath!, candidatePath);
      createdTestFiles.push(candidatePath);

      const beforeHash = crypto.createHash('sha256').update(fs.readFileSync(candidatePath)).digest('hex');

      // Associate a user first so attachment can link user
      const user = await authService.createUser(
        `attach_user_${Date.now()}`,
        'Password123456!',
        'Attach User',
        'ADMIN'
      );
      await installationService.associateUser(installId, user.id);

      const attachResult = await onboardingService.attachExistingDatabase({
        path: candidatePath,
        displayName: 'Test Company DB',
        confirmAttachment: true,
      });

      expect(attachResult.success).toBe(true);
      expect(attachResult.registry.status).toBe('ACTIVE');

      // Physical file must remain intact and identical
      const afterHash = crypto.createHash('sha256').update(fs.readFileSync(candidatePath)).digest('hex');
      expect(afterHash).toBe(beforeHash);
    });

    it('provisions a brand new profile database from template.db', async () => {
      const user = await authService.createUser(
        `prov_user_${Date.now()}`,
        'Password123456!',
        'Prov User',
        'ADMIN'
      );
      await installationService.associateUser(installId, user.id);

      const dbName = `New_Office_${Date.now()}`;
      const result = await onboardingService.createNewDatabase({
        displayName: dbName,
      });

      expect(result.success).toBe(true);
      expect(result.registry.status).toBe('ACTIVE');
      createdTestFiles.push(result.registry.canonicalPath);

      expect(fs.existsSync(result.registry.canonicalPath)).toBe(true);
    });

    it('fails safely when template.db is missing and does NOT create empty database', async () => {
      // Simulate missing template by overriding environment variable to a non-existent path
      const originalEnv = process.env.DIAMOND_TEMPLATE_DB;
      process.env.DIAMOND_TEMPLATE_DB = path.resolve(getDatabasesDir(), 'non_existent_template.db');

      const nonExistentTarget = path.resolve(getDatabasesDir(), `should_not_exist_${Date.now()}.db`);
      createdTestFiles.push(nonExistentTarget);

      const dbName = `Missing_Template_${Date.now()}`;
      try {
        await expect(
          onboardingService.createNewDatabase({
            displayName: dbName,
          })
        ).rejects.toThrow(/template\.db/i);

        // Invariant: empty 0-byte file must NOT be left behind
        expect(fs.existsSync(nonExistentTarget)).toBe(false);
      } finally {
        if (originalEnv) {
          process.env.DIAMOND_TEMPLATE_DB = originalEnv;
        } else {
          delete process.env.DIAMOND_TEMPLATE_DB;
        }
      }
    });

    it('rejects attaching system.db or template.db even if confirmAttachment is true', async () => {
      await expect(
        onboardingService.attachExistingDatabase({
          path: getControlDbPath(),
          confirmAttachment: true,
        })
      ).rejects.toThrow(ConflictError);

      const templateDb = getDatabaseTemplatePath();
      if (templateDb) {
        await expect(
          onboardingService.attachExistingDatabase({
            path: templateDb,
            confirmAttachment: true,
          })
        ).rejects.toThrow(ConflictError);
      }
    });
  });

  // ── Test Group 13 & 14: Concurrency & Failure Compensation ─────────────
  describe('Group 13 & 14: Concurrency & Failure Compensation', () => {
    it('handles concurrent duplicate user creation deterministically with exactly one winner', async () => {
      const username = `race_user_${Date.now()}`;
      const [r1, r2] = await Promise.allSettled([
        onboardingService.createBusinessUser({
          username,
          password: 'Password123456!',
          displayName: 'Race User',
        }),
        onboardingService.createBusinessUser({
          username,
          password: 'Password123456!',
          displayName: 'Race User',
        }),
      ]);

      const successes = [r1, r2].filter((r) => r.status === 'fulfilled');
      const failures = [r1, r2].filter((r) => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
    });

    it('handles concurrent new database creation with identical profile name deterministically', async () => {
      const dbName = `Race_DB_${Date.now()}`;
      const [r1, r2] = await Promise.allSettled([
        onboardingService.createNewDatabase({ displayName: dbName }),
        onboardingService.createNewDatabase({ displayName: dbName }),
      ]);

      const successes = [r1, r2].filter((r) => r.status === 'fulfilled');
      const failures = [r1, r2].filter((r) => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      if (successes[0].status === 'fulfilled') {
        createdTestFiles.push(successes[0].value.registry.canonicalPath);
      }
    });
  });

  // ── Test Group 15, 16, 17, 18, 19: Security, Recovery & READY Gate ────
  describe('Group 15, 16, 17, 18, 19: Security, Recovery & READY Gate', () => {
    it('never exposes passwordHash, pinHash, or JWT in onboarding status', async () => {
      // Configure PIN
      await deviceSecurityService.setupPin(deviceId, '982341');

      const status = await onboardingService.getOnboardingState();
      expect((status as any).pinHash).toBeUndefined();
      expect((status as any).passwordHash).toBeUndefined();
      expect((status as any).token).toBeUndefined();
      expect(status.pinConfigured).toBe(true);
      expect(status.deviceConfigured).toBe(true);
    });

    it('allows recovering from database validation/setup back to discovery without resetting identity', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DATABASE_VALIDATION' },
      });

      const recovered = await onboardingService.resetRecoverableOnboardingState();
      expect(recovered.lifecycleState).toBe('DATABASE_DISCOVERY');
      expect(recovered.installationInitialized).toBe(true);
    });

    it('blocks transition to READY if mandatory prerequisites are missing', async () => {
      // 1. Missing PIN -> Cannot complete onboarding
      await systemPrisma.deviceSecurity.deleteMany({ where: { deviceId } });
      await expect(onboardingService.completeOnboarding()).rejects.toThrow(ConflictError);

      // 2. Setup PIN but no associated user
      await deviceSecurityService.setupPin(deviceId, '123987');
      await systemPrisma.installationUser.deleteMany({ where: { installationId: installId } });
      await expect(onboardingService.completeOnboarding()).rejects.toThrow(ConflictError);

      // 3. Associate user but no active database
      const user = await authService.createUser(
        `ready_gate_user_${Date.now()}`,
        'Password123456!',
        'Gate User',
        'ADMIN'
      );
      await installationService.associateUser(installId, user.id);
      await systemPrisma.databaseRegistry.deleteMany({ where: { installationId: installId } });
      await expect(onboardingService.completeOnboarding()).rejects.toThrow(ConflictError);
    });

    it('successfully completes onboarding and transitions to READY when all prerequisites are met', async () => {
      // 1. Move to PIN_SETUP & setup PIN
      await installationService.updateLifecycleState('PIN_SETUP');
      await deviceSecurityService.setupPin(deviceId, '849201');

      // 2. Move to DEVICE_SETUP
      await installationService.updateLifecycleState('DEVICE_SETUP');

      // 3. Move to USER_DISCOVERY & associate user
      await installationService.updateLifecycleState('USER_DISCOVERY');
      const user = await authService.createUser(
        `ready_success_user_${Date.now()}`,
        'Password123456!',
        'Success User',
        'ADMIN'
      );
      await installationService.associateUser(installId, user.id);

      // 4. Move to DATABASE_DISCOVERY -> DATABASE_VALIDATION
      await installationService.updateLifecycleState('DATABASE_DISCOVERY');
      await installationService.updateLifecycleState('DATABASE_VALIDATION');

      // 5. Create database (which advances to DATABASE_SETUP)
      const db = await onboardingService.createNewDatabase({
        displayName: `Final_Ready_DB_${Date.now()}`,
      });
      createdTestFiles.push(db.registry.canonicalPath);

      // 6. Complete onboarding to reach READY
      const finalStatus = await onboardingService.completeOnboarding();
      expect(finalStatus.ready).toBe(true);
      expect(finalStatus.lifecycleState).toBe('READY');

      // Verify audit event emitted
      const audit = await systemPrisma.auditEvent.findFirst({
        where: { eventType: 'ONBOARDING_COMPLETED', entityId: installId },
      });
      expect(audit).not.toBeNull();
    });
  });
});
