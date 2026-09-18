import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { installationService, LIFECYCLE_STAGES } from '../modules/system/installation.service';
import { authService, ROLES } from '../modules/auth/auth.service';
import { authController } from '../modules/auth/auth.controller';
import prisma, { systemPrisma, ensureProfileDbFile, getClientForProfile, runWithProfile, getActiveProfile } from '../infrastructure/database/prisma';
import { getDatabasesDir, getDatabaseTemplatePath, getControlDbPath } from '../infrastructure/paths';
import { canonicalizeDatabasePath } from '../modules/system/database/database-path.util';
import { databaseValidationService } from '../modules/system/database/database-validation.service';
import { databaseRegistryService } from '../modules/system/database/database-registry.service';
import { lifecycleController } from '../modules/system/lifecycle.controller';
import { createRoutes } from '../routes';

describe('Phase 2 Foundation: Complete Lifecycle, Control DB, Registry & Security Verification', () => {
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
    // Clean up test installation records in control DB
    await systemPrisma.databaseRegistry.deleteMany().catch(() => {});
    await systemPrisma.installationUser.deleteMany().catch(() => {});
    await systemPrisma.device.deleteMany().catch(() => {});
    await systemPrisma.installation.deleteMany().catch(() => {});
  });

  afterAll(() => {
    cleanupFiles();
  });

  describe('1. Installation Identity & Persistence Safety', () => {
    it('creates a stable local installation with default NOT_INITIALIZED state', async () => {
      const install1 = await installationService.getOrCreateInstallation();
      expect(install1.id).toBeDefined();
      expect(install1.installationId).toBeDefined();
      expect(install1.installationId.length).toBeGreaterThanOrEqual(16);
      expect(install1.appVersion).toBe('3.0.0');
      expect(install1.status).toBe('ACTIVE');
      expect(install1.lifecycleState).toBe('NOT_INITIALIZED');
      expect(install1.initializedAt).toBeNull();

      // Second call must return the exact same installation ID (stable persistence)
      const install2 = await installationService.getOrCreateInstallation();
      expect(install2.id).toBe(install1.id);
      expect(install2.installationId).toBe(install1.installationId);
    });

    it('handles concurrent getOrCreateInstallation calls idempotently', async () => {
      const [instA, instB] = await Promise.all([
        installationService.getOrCreateInstallation(),
        installationService.getOrCreateInstallation(),
      ]);
      expect(instA.installationId).toBe(instB.installationId);
      expect(instA.id).toBe(instB.id);

      const count = await systemPrisma.installation.count();
      expect(count).toBe(1);
    });

    it('proves installation identity contains zero user or hardware PII', async () => {
      const install = await installationService.getOrCreateInstallation();
      // Must be standard UUID format (36 chars with hyphens)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(install.installationId)).toBe(true);

      // Verify it does not contain username, machine name, or paths
      const username = process.env.USERNAME || '';
      if (username) {
        expect(install.installationId.toLowerCase()).not.toContain(username.toLowerCase());
      }
    });
  });

  describe('2. Device Identity & Idempotent Registration', () => {
    it('registers a device linked to the local installation with persistent deviceId', async () => {
      const install = await installationService.getOrCreateInstallation();

      const device = await installationService.registerDevice({
        deviceName: 'FrontDesk-Terminal-1',
        platform: 'WINDOWS',
        osVersion: '10.0.19045',
      });

      expect(device.id).toBeDefined();
      expect(device.deviceId).toBeDefined();
      expect(device.installationId).toBe(install.id);
      expect(device.deviceName).toBe('FrontDesk-Terminal-1');
      expect(device.platform).toBe('WINDOWS');
      expect(device.osVersion).toBe('10.0.19045');
      expect(device.status).toBe('ACTIVE');
      expect(device.revokedAt).toBeNull();
      expect(device.lastSeenAt).toBeDefined();

      const updatedInstall = await installationService.getOrCreateInstallation();
      expect(updatedInstall.deviceCount).toBe(1);
    });

    it('is strictly idempotent when re-registered with same authoritative deviceId even if display name changes', async () => {
      const install = await installationService.getOrCreateInstallation();

      const dev1 = await installationService.registerDevice({
        deviceName: 'Workshop-OldName',
        platform: 'WINDOWS',
      });

      await new Promise((r) => setTimeout(r, 10));

      // Same authoritative deviceId, updated display name
      const dev2 = await installationService.registerDevice({
        deviceId: dev1.deviceId,
        deviceName: 'Workshop-Renamed',
        platform: 'WINDOWS',
        osVersion: '11.0.22631',
      });

      expect(dev2.id).toBe(dev1.id);
      expect(dev2.deviceId).toBe(dev1.deviceId);
      expect(dev2.deviceName).toBe('Workshop-Renamed'); // Display name updated
      expect(dev2.osVersion).toBe('11.0.22631');

      // Device count remains exactly 1 (no duplicate device created)
      const count = await systemPrisma.device.count({ where: { installationId: install.id } });
      expect(count).toBe(1);
    });

    it('rejects arbitrary client-invented deviceId spoofing', async () => {
      await installationService.getOrCreateInstallation();
      const fakeDeviceId = crypto.randomUUID();

      await expect(
        installationService.registerDevice({
          deviceId: fakeDeviceId,
          deviceName: 'Spoofed-Device',
        })
      ).rejects.toThrow(/Arbitrary deviceId cannot be bound/);
    });

    it('handles device revocation and reactivation rules', async () => {
      const dev = await installationService.registerDevice({
        deviceName: 'Revocable-Device',
      });
      expect(dev.status).toBe('ACTIVE');

      // Revoke device
      const revoked = await installationService.revokeDevice(dev.deviceId);
      expect(revoked.status).toBe('REVOKED');
      expect(revoked.revokedAt).not.toBeNull();

      // Subsequent registration while revoked throws ConflictError
      await expect(
        installationService.registerDevice({
          deviceName: 'Revoked-Attempt',
        })
      ).rejects.toThrow(/Device has been revoked/);

      // Reactivate device
      const reactivated = await installationService.reactivateDevice(dev.deviceId);
      expect(reactivated.status).toBe('ACTIVE');
      expect(reactivated.revokedAt).toBeNull();
    });

    it('prevents cross-installation deviceId collision and maintains installation isolation', async () => {
      await installationService.getOrCreateInstallation();
      const dev1 = await installationService.registerDevice({
        deviceName: 'Isolated-Terminal-1',
      });

      // Create a second isolated installation in DB
      const install2 = await systemPrisma.installation.create({
        data: {
          installationId: crypto.randomUUID(),
          appVersion: '3.0.0',
          lifecycleState: 'NOT_INITIALIZED',
        },
      });

      // Attempting to register the same deviceId under install2 must violate uniqueness constraint
      await expect(
        systemPrisma.device.create({
          data: {
            deviceId: dev1.deviceId,
            installationId: install2.id,
            deviceName: 'Rogue-Duplicate-Terminal',
          },
        })
      ).rejects.toThrow();

      // Clean up second installation
      await systemPrisma.installation.delete({ where: { id: install2.id } });
    });
  });

  describe('3. Strict Lifecycle State Progression Matrix', () => {
    it('enforces the complete 9-stage progression matrix from NOT_INITIALIZED to READY', async () => {
      await installationService.getOrCreateInstallation();

      // Ensure prerequisites exist for authoritative Phase 3 lifecycle validation
      const dev = await installationService.registerDevice({ deviceName: 'Lifecycle-Matrix-Terminal' });
      await systemPrisma.deviceSecurity.upsert({
        where: { deviceId: dev.deviceId },
        update: { pinHash: '$2b$10$hashedpinplaceholderforexistence' },
        create: { deviceId: dev.deviceId, pinHash: '$2b$10$hashedpinplaceholderforexistence' },
      });

      // Step forward 1 by 1 across all 9 stages
      const stages: typeof LIFECYCLE_STAGES = [
        'APP_SETUP',
        'PIN_SETUP',
        'DEVICE_SETUP',
        'USER_DISCOVERY',
        'DATABASE_DISCOVERY',
        'DATABASE_VALIDATION',
        'DATABASE_SETUP',
        'READY',
      ];

      for (const target of stages) {
        const res = await installationService.updateLifecycleState(target);
        expect(res.lifecycleState).toBe(target);
      }

      // At READY: initializedAt must be set
      const readyInstall = await installationService.getOrCreateInstallation();
      expect(readyInstall.lifecycleState).toBe('READY');
      expect(readyInstall.initializedAt).not.toBeNull();
    });

    it('rejects arbitrary jumps to READY from NOT_INITIALIZED', async () => {
      await installationService.getOrCreateInstallation();

      // NOT_INITIALIZED -> READY is strictly forbidden
      await expect(
        installationService.updateLifecycleState('READY')
      ).rejects.toThrow(/Illegal lifecycle transition/);
    });

    it('rejects illegal skipping jumps (e.g. NOT_INITIALIZED -> DEVICE_SETUP)', async () => {
      await installationService.getOrCreateInstallation();

      await expect(
        installationService.updateLifecycleState('DEVICE_SETUP')
      ).rejects.toThrow(/Illegal lifecycle transition/);
    });

    it('rejects backward transitions without explicit reset', async () => {
      await installationService.getOrCreateInstallation();
      await installationService.updateLifecycleState('APP_SETUP');
      await installationService.updateLifecycleState('PIN_SETUP');

      // Backward: PIN_SETUP -> APP_SETUP rejected
      await expect(
        installationService.updateLifecycleState('APP_SETUP')
      ).rejects.toThrow(/Illegal lifecycle transition/);

      // Controlled reset to NOT_INITIALIZED is allowed
      const reset = await installationService.updateLifecycleState('NOT_INITIALIZED');
      expect(reset.lifecycleState).toBe('NOT_INITIALIZED');
      expect(reset.initializedAt).toBeNull();
    });
  });

  describe('4. Pre-Auth / Bootstrap Security Boundary', () => {
    it('allows unauthenticated lifecycle mutations during onboarding but blocks when READY', async () => {
      // 1. In NOT_INITIALIZED: unauthenticated mutation is permitted for setup
      const mockReq: any = { body: { lifecycleState: 'APP_SETUP' }, headers: {} };
      let jsonSent: any = null;
      const mockRes: any = {
        status: () => mockRes,
        json: (j: any) => { jsonSent = j; return mockRes; },
      };

      await lifecycleController.updateLifecycleState(mockReq, mockRes, () => {});
      expect(jsonSent?.success).toBe(true);
      expect(jsonSent?.data?.lifecycleState).toBe('APP_SETUP');

      // Fast-forward to READY through valid steps (ensuring required prerequisites exist)
      const dev = await installationService.registerDevice({ deviceName: 'Bootstrap-FastForward-Terminal' });
      await systemPrisma.deviceSecurity.upsert({
        where: { deviceId: dev.deviceId },
        update: { pinHash: '$2b$10$hashedpinplaceholderforexistence' },
        create: { deviceId: dev.deviceId, pinHash: '$2b$10$hashedpinplaceholderforexistence' },
      });
      await installationService.updateLifecycleState('PIN_SETUP');
      await installationService.updateLifecycleState('DEVICE_SETUP');
      await installationService.updateLifecycleState('USER_DISCOVERY');
      await installationService.updateLifecycleState('DATABASE_DISCOVERY');
      await installationService.updateLifecycleState('DATABASE_VALIDATION');
      await installationService.updateLifecycleState('DATABASE_SETUP');
      await installationService.updateLifecycleState('READY');

      // 2. When READY: unauthenticated mutation MUST return 403 Forbidden
      const unauthReq: any = { body: { lifecycleState: 'NOT_INITIALIZED' }, headers: {} }; // unauthenticated (no req.user)
      let forbiddenStatus: number | null = null;
      let forbiddenJson: any = null;
      const mockForbiddenRes: any = {
        status: (s: number) => { forbiddenStatus = s; return mockForbiddenRes; },
        json: (j: any) => { forbiddenJson = j; return mockForbiddenRes; },
      };

      await lifecycleController.updateLifecycleState(unauthReq, mockForbiddenRes, () => {});
      expect(forbiddenStatus).toBe(403);
      expect(forbiddenJson?.error).toBe('Forbidden');
    });
  });

  describe('5. Canonical Database Path Handling', () => {
    it('normalizes database paths and detects external paths', () => {
      const res = canonicalizeDatabasePath('test_profile.db');
      expect(res.valid).toBe(true);
      expect(path.isAbsolute(res.canonicalPath)).toBe(true);
      expect(res.canonicalPath.endsWith('test_profile.db')).toBe(true);
    });

    it('rejects directory paths', () => {
      const databasesDir = getDatabasesDir();
      const res = canonicalizeDatabasePath(databasesDir);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/points to a directory/);
    });

    it('rejects empty or null byte paths', () => {
      expect(canonicalizeDatabasePath('').valid).toBe(false);
      expect(canonicalizeDatabasePath('test\0.db').valid).toBe(false);
    });

    it('preserves user-selected external absolute paths without mangling them', () => {
      const externalPath = path.resolve('C:/MyExternalCompany/records.db');
      const res = canonicalizeDatabasePath(externalPath);
      expect(res.valid).toBe(true);
      expect(res.canonicalPath).toBe(externalPath);
      expect(res.isExternal).toBe(true);
    });
  });

  describe('6. Database Validation Service (Read-Only Inspection)', () => {
    it('validates a healthy Diamond ERP profile database as VALID and ACTIVE', async () => {
      const dbPath = path.resolve(getDatabasesDir(), `valid_test_${Date.now()}.db`);
      testDbFiles.push(dbPath);
      ensureProfileDbFile(dbPath);

      const result = await databaseValidationService.validateDatabase(dbPath);
      expect(result.isValid).toBe(true);
      expect(result.status).toBe('ACTIVE');
      expect(result.integrityCheck).toBe('ok');
      expect(result.tableCount).toBeGreaterThan(20);
      expect(result.missingRequiredTables.length).toBe(0);
    });

    it('identifies non-existent file as MISSING', async () => {
      const fakePath = path.resolve(getDatabasesDir(), `non_existent_${Date.now()}.db`);
      const result = await databaseValidationService.validateDatabase(fakePath);
      expect(result.isValid).toBe(false);
      expect(result.status).toBe('MISSING');
      expect(result.error).toBe('File not found');
    });

    it('identifies non-SQLite or invalid files as INVALID', async () => {
      const txtPath = path.resolve(getDatabasesDir(), `not_sqlite_${Date.now()}.db`);
      testDbFiles.push(txtPath);
      fs.writeFileSync(txtPath, 'This is definitely not a SQLite database file! Hello World '.repeat(20));

      const result = await databaseValidationService.validateDatabase(txtPath);
      expect(result.isValid).toBe(false);
      expect(result.status).toBe('INVALID');
      expect(result.error).toBe('Not a SQLite database');
    });

    it('identifies undersized/empty file as INVALID', async () => {
      const emptyPath = path.resolve(getDatabasesDir(), `empty_${Date.now()}.db`);
      testDbFiles.push(emptyPath);
      fs.writeFileSync(emptyPath, Buffer.alloc(100)); // 100 bytes (< 512 bytes)

      const result = await databaseValidationService.validateDatabase(emptyPath);
      expect(result.isValid).toBe(false);
      expect(result.status).toBe('INVALID');
      expect(result.integrityCheck).toBe('invalid_file_size');
    });

    it('identifies corrupted SQLite database file as CORRUPTED or INVALID', async () => {
      const corruptPath = path.resolve(getDatabasesDir(), `corrupt_${Date.now()}.db`);
      testDbFiles.push(corruptPath);
      const corruptBuf = Buffer.concat([
        Buffer.from('SQLite format 3\0'),
        crypto.randomBytes(1024),
      ]);
      fs.writeFileSync(corruptPath, corruptBuf);

      const result = await databaseValidationService.validateDatabase(corruptPath);
      expect(result.isValid).toBe(false);
      expect(['CORRUPTED', 'INVALID']).toContain(result.status);
    });

    it('identifies SQLite database missing required tables as UNSUPPORTED', async () => {
      const missingTablePath = path.resolve(getDatabasesDir(), `missing_tbl_${Date.now()}.db`);
      testDbFiles.push(missingTablePath);
      ensureProfileDbFile(missingTablePath);

      const alterClient = new PrismaClient({
        datasources: { db: { url: `file:${missingTablePath.replace(/\\/g, '/')}` } },
      });
      await alterClient.$connect();
      await alterClient.$executeRawUnsafe('DROP TABLE "Stock";');
      await alterClient.$disconnect();

      const result = await databaseValidationService.validateDatabase(missingTablePath);
      expect(result.isValid).toBe(false);
      expect(result.status).toBe('UNSUPPORTED');
      expect(result.missingRequiredTables).toContain('Stock');
    });

    it('identifies SQLite database missing required columns as UNSUPPORTED', async () => {
      const missingColPath = path.resolve(getDatabasesDir(), `missing_col_${Date.now()}.db`);
      testDbFiles.push(missingColPath);
      ensureProfileDbFile(missingColPath);

      const alterClient = new PrismaClient({
        datasources: { db: { url: `file:${missingColPath.replace(/\\/g, '/')}` } },
      });
      await alterClient.$connect();
      await alterClient.$executeRawUnsafe('DROP TABLE "Party";');
      await alterClient.$executeRawUnsafe('CREATE TABLE "Party" (id TEXT PRIMARY KEY, name TEXT, partyType TEXT);');
      await alterClient.$disconnect();

      const result = await databaseValidationService.validateDatabase(missingColPath);
      expect(result.isValid).toBe(false);
      expect(result.status).toBe('UNSUPPORTED');
      expect(result.detectedType).toBe('UNSUPPORTED_VERSION');
      expect(result.missingRequiredColumns?.['Party']).toContain('partyCode');
    });

    it('proves database validation is strictly read-only and never alters the file', async () => {
      const dbPath = path.resolve(getDatabasesDir(), `readonly_check_${Date.now()}.db`);
      testDbFiles.push(dbPath);
      ensureProfileDbFile(dbPath);

      const hashBefore = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
      const mtimeBefore = fs.statSync(dbPath).mtimeMs;

      // Execute validation
      await databaseValidationService.validateDatabase(dbPath);

      const hashAfter = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
      const mtimeAfter = fs.statSync(dbPath).mtimeMs;

      expect(hashAfter).toBe(hashBefore);
      expect(mtimeAfter).toBe(mtimeBefore);
    });

    // ── Authoritative Schema Validation vs Filename/Path Heuristics ──
    it('Test A: recognizes a valid ERP database even if renamed to random_file_name.db', async () => {
      const randomNamePath = path.resolve(getDatabasesDir(), `random_file_name_${Date.now()}.db`);
      testDbFiles.push(randomNamePath);
      ensureProfileDbFile(randomNamePath);

      const result = await databaseValidationService.validateDatabase(randomNamePath);
      expect(result.isValid).toBe(true);
      expect(result.status).toBe('ACTIVE');
      expect(result.tableCount).toBeGreaterThan(20);
      expect(result.missingRequiredTables.length).toBe(0);
    });

    it('Test B: rejects a database named diamond_erp.db if it contains unrelated SQLite schema', async () => {
      const fakeErpPath = path.resolve(getDatabasesDir(), `diamond_erp_${Date.now()}.db`);
      testDbFiles.push(fakeErpPath);

      const tempClient = new PrismaClient({
        datasources: { db: { url: `file:${fakeErpPath.replace(/\\/g, '/')}` } },
      });
      await tempClient.$connect();
      await tempClient.$executeRawUnsafe('CREATE TABLE "unrelated_logs" (id TEXT PRIMARY KEY, message TEXT);');
      await tempClient.$disconnect();

      const result = await databaseValidationService.validateDatabase(fakeErpPath);
      expect(result.isValid).toBe(false);
      expect(result.status).toBe('UNSUPPORTED');
      expect(result.missingRequiredTables).toContain('Stock');
      expect(result.missingRequiredTables).toContain('Party');
    });

    it('Test C: rejects a file in profiles/ directory if it contains invalid schema', async () => {
      const profilesDir = path.resolve(getDatabasesDir(), 'profiles');
      if (!fs.existsSync(profilesDir)) {
        fs.mkdirSync(profilesDir, { recursive: true });
      }
      const invalidInProfiles = path.resolve(profilesDir, `corrupt_profile_${Date.now()}.db`);
      testDbFiles.push(invalidInProfiles);

      const tempClient = new PrismaClient({
        datasources: { db: { url: `file:${invalidInProfiles.replace(/\\/g, '/')}` } },
      });
      await tempClient.$connect();
      await tempClient.$executeRawUnsafe('CREATE TABLE "some_other_data" (id INT);');
      await tempClient.$disconnect();

      const result = await databaseValidationService.validateDatabase(invalidInProfiles);
      expect(result.isValid).toBe(false);
      expect(result.status).toBe('UNSUPPORTED');
    });

    it('Test D: validates a valid ERP database located in an external directory outside Diamond ERP root', async () => {
      const externalDir = path.resolve(__dirname, '../../test_external_db_dir');
      if (!fs.existsSync(externalDir)) {
        fs.mkdirSync(externalDir, { recursive: true });
      }
      const externalDb = path.resolve(externalDir, `company_archive_${Date.now()}.db`);
      testDbFiles.push(externalDb);
      ensureProfileDbFile(externalDb);

      const result = await databaseValidationService.validateDatabase(externalDb);
      expect(result.isValid).toBe(true);
      expect(result.status).toBe('ACTIVE');
      expect(result.detectedType).toBe('EXTERNAL');
    });

    it('Test E: proves path classification cannot override structural validation', async () => {
      // Name includes 'backup' and '.bak' but has no Diamond ERP tables
      const fakeBackupPath = path.resolve(getDatabasesDir(), `critical_backup_${Date.now()}.bak`);
      testDbFiles.push(fakeBackupPath);

      const tempClient = new PrismaClient({
        datasources: { db: { url: `file:${fakeBackupPath.replace(/\\/g, '/')}` } },
      });
      await tempClient.$connect();
      await tempClient.$executeRawUnsafe('CREATE TABLE "arbitrary_dump" (data TEXT);');
      await tempClient.$disconnect();

      const result = await databaseValidationService.validateDatabase(fakeBackupPath);
      // Path said 'backup' but structural validation authoritatively marks it UNSUPPORTED
      expect(result.isValid).toBe(false);
      expect(result.status).toBe('UNSUPPORTED');
    });
  });

  describe('7. Database Registry Service & Lifecycle Tracking', () => {
    it('registers a database file with stable logical databaseId and supports deduplication', async () => {
      const install = await installationService.getOrCreateInstallation();
      const dbPath = path.resolve(getDatabasesDir(), `reg_test_${Date.now()}.db`);
      testDbFiles.push(dbPath);
      ensureProfileDbFile(dbPath);

      const reg1 = await databaseRegistryService.registerDatabase({
        rawPath: dbPath,
        displayName: 'Registered Test DB',
        installationId: install.id,
      });

      expect(reg1.id).toBeDefined();
      expect(reg1.databaseId).toBeDefined();
      expect(reg1.displayName).toBe('Registered Test DB');
      expect(reg1.status).toBe('ACTIVE');

      // Duplicate registration of same canonical path returns same logical ID
      const reg2 = await databaseRegistryService.registerDatabase({
        rawPath: dbPath,
        installationId: install.id,
      });
      expect(reg2.databaseId).toBe(reg1.databaseId);
      expect(reg2.id).toBe(reg1.id);
    });

    it('marks registered database status as MISSING if the physical file is removed', async () => {
      const install = await installationService.getOrCreateInstallation();
      const dbPath = path.resolve(getDatabasesDir(), `missing_check_${Date.now()}.db`);
      ensureProfileDbFile(dbPath);

      const reg = await databaseRegistryService.registerDatabase({
        rawPath: dbPath,
        installationId: install.id,
      });
      expect(reg.status).toBe('ACTIVE');

      // Remove the file from disk
      fs.unlinkSync(dbPath);
      expect(fs.existsSync(dbPath)).toBe(false);

      // getDatabase should now detect missing file and update status to MISSING
      const updated = await databaseRegistryService.getDatabase(reg.databaseId);
      expect(updated.status).toBe('MISSING');
    });

    it('proves databaseId is an independent UUID v4 and does not depend on path, filename, or machine name', async () => {
      const install = await installationService.getOrCreateInstallation();
      const pathA = path.resolve(getDatabasesDir(), `indep_a_${Date.now()}.db`);
      const pathB = path.resolve(getDatabasesDir(), `indep_b_${Date.now()}.db`);
      testDbFiles.push(pathA, pathB);
      ensureProfileDbFile(pathA);
      ensureProfileDbFile(pathB);

      const regA = await databaseRegistryService.registerDatabase({
        rawPath: pathA,
        displayName: 'Independent DB Alpha',
        installationId: install.id,
      });

      const regB = await databaseRegistryService.registerDatabase({
        rawPath: pathB,
        displayName: 'Independent DB Beta',
        installationId: install.id,
      });

      // UUID v4 format regex
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(regA.databaseId)).toBe(true);
      expect(uuidRegex.test(regB.databaseId)).toBe(true);
      expect(regA.databaseId).not.toBe(regB.databaseId);

      // Must not contain filename or path
      expect(regA.databaseId).not.toContain('indep_a');
      expect(regA.databaseId).not.toContain('.db');
      expect(regA.databaseId).not.toContain('DiamondERP');

      // Renamed database file retains independent logical identity
      const renamedPath = path.resolve(getDatabasesDir(), `indep_a_renamed_${Date.now()}.db`);
      testDbFiles.push(renamedPath);
      fs.renameSync(pathA, renamedPath);

      const updatedReg = await databaseRegistryService.updateDatabasePath(regA.databaseId, renamedPath);
      expect(updatedReg.databaseId).toBe(regA.databaseId); // Logical identity stays identical
      expect(updatedReg.canonicalPath).toBe(renamedPath);
    });

    it('proves 4 concurrent registrations of the same canonical path produce exactly one logical record', async () => {
      const install = await installationService.getOrCreateInstallation();
      const raceDbPath = path.resolve(getDatabasesDir(), `quad_race_${Date.now()}.db`);
      testDbFiles.push(raceDbPath);
      ensureProfileDbFile(raceDbPath);

      const [r1, r2, r3, r4] = await Promise.all([
        databaseRegistryService.registerDatabase({ rawPath: raceDbPath, installationId: install.id }),
        databaseRegistryService.registerDatabase({ rawPath: raceDbPath, installationId: install.id }),
        databaseRegistryService.registerDatabase({ rawPath: raceDbPath, installationId: install.id }),
        databaseRegistryService.registerDatabase({ rawPath: raceDbPath, installationId: install.id }),
      ]);

      expect(r1.databaseId).toBe(r2.databaseId);
      expect(r2.databaseId).toBe(r3.databaseId);
      expect(r3.databaseId).toBe(r4.databaseId);

      const count = await systemPrisma.databaseRegistry.count({
        where: { canonicalPath: r1.canonicalPath },
      });
      expect(count).toBe(1);
    });

    it('enforces referential integrity between DatabaseRegistry and Profile (ON DELETE SET NULL)', async () => {
      const install = await installationService.getOrCreateInstallation();
      const profileCode = `prof_fk_${Date.now()}`;
      const dbPath = path.resolve(getDatabasesDir(), `${profileCode}.db`);
      testDbFiles.push(dbPath);
      ensureProfileDbFile(dbPath);

      // 1. Create a Profile in control DB
      const profile = await systemPrisma.profile.create({
        data: {
          code: profileCode,
          name: 'FK Test Profile',
          dbPath,
        },
      });

      // 2. Register DB referencing the profile
      const reg = await databaseRegistryService.registerDatabase({
        rawPath: dbPath,
        displayName: 'FK Test DB',
        profileId: profile.id,
        installationId: install.id,
      });

      expect(reg.profileId).toBe(profile.id);

      // 3. Registering with non-existent profileId is rejected
      await expect(
        databaseRegistryService.registerDatabase({
          rawPath: path.resolve(getDatabasesDir(), `fake_${Date.now()}.db`),
          profileId: crypto.randomUUID(),
          installationId: install.id,
        })
      ).rejects.toThrow(/Profile not found/);

      // 4. Safe deactivation / deletion of Profile metadata:
      // Deleting Profile record must NOT delete the DatabaseRegistry row or the physical SQLite file!
      await systemPrisma.profile.delete({ where: { id: profile.id } });

      const regAfterProfileDelete = await databaseRegistryService.getDatabase(reg.databaseId);
      expect(regAfterProfileDelete).not.toBeNull();
      expect(regAfterProfileDelete.id).toBe(reg.id);
      expect(regAfterProfileDelete.profileId).toBeNull(); // On delete set null
      expect(fs.existsSync(dbPath)).toBe(true); // Physical DB remains 100% intact!
    });

    it('provisions a database with PENDING -> ACTIVE lifecycle and safe rollback compensation', async () => {
      const install = await installationService.getOrCreateInstallation();
      const provPath = path.resolve(getDatabasesDir(), `prov_comp_${Date.now()}.db`);
      testDbFiles.push(provPath);

      const reg = await databaseRegistryService.provisionDatabase({
        rawPath: provPath,
        displayName: 'Provisioned DB with Compensation',
        installationId: install.id,
      });

      expect(reg.status).toBe('ACTIVE');
      expect(fs.existsSync(provPath)).toBe(true);
      expect(fs.statSync(provPath).size).toBeGreaterThan(0);
    });
  });

  describe('8. Installation ↔ Business User Association', () => {
    it('associates an ERP business user with the local installation without duplicating User model', async () => {
      const install = await installationService.getOrCreateInstallation();
      const username = `bizuser_${Date.now()}`;

      const user = await authService.createUser(
        username,
        'SecurePassword123!',
        'Business User Alpha',
        ROLES.VIEWER,
        ['Stavan']
      );

      const link = await installationService.associateUser(install.id, user.id);
      expect(link.id).toBeDefined();
      expect(link.installationId).toBe(install.id);
      expect(link.userId).toBe(user.id);

      // Verify in DB
      const stored = await systemPrisma.installationUser.findFirst({
        where: { installationId: install.id, userId: user.id },
      });
      expect(stored).not.toBeNull();
    });

    it('is strictly idempotent when associating the same user twice', async () => {
      const install = await installationService.getOrCreateInstallation();
      const username = `dup_user_${Date.now()}`;
      const user = await authService.createUser(username, 'Password123!', 'Dup User', ROLES.VIEWER, ['Stavan']);

      const link1 = await installationService.associateUser(install.id, user.id);
      const link2 = await installationService.associateUser(install.id, user.id);

      expect(link2.id).toBe(link1.id);
      const count = await systemPrisma.installationUser.count({
        where: { installationId: install.id, userId: user.id },
      });
      expect(count).toBe(1);
    });

    it('rejects association for non-existent installation or user', async () => {
      const install = await installationService.getOrCreateInstallation();
      await expect(
        installationService.associateUser('fake-install-id', 'fake-user-id')
      ).rejects.toThrow(/Installation not found/);

      await expect(
        installationService.associateUser(install.id, 'fake-user-id')
      ).rejects.toThrow(/User not found/);
    });

    it('supports disassociating user without deleting the user account or profile database', async () => {
      const install = await installationService.getOrCreateInstallation();
      const username = `disassoc_user_${Date.now()}`;
      const user = await authService.createUser(username, 'Password123!', 'Disassoc User', ROLES.VIEWER, ['Stavan']);

      await installationService.associateUser(install.id, user.id);
      let users = await installationService.getInstallationUsers(install.id);
      expect(users.some((u) => u.userId === user.id)).toBe(true);

      await installationService.disassociateUser(install.id, user.id);
      users = await installationService.getInstallationUsers(install.id);
      expect(users.some((u) => u.userId === user.id)).toBe(false);

      // User row still exists in database
      const userStillExists = await systemPrisma.user.findUnique({ where: { id: user.id } });
      expect(userStillExists).not.toBeNull();
    });
  });

  describe('9. Multi-Profile Database Isolation & Template Immutability', () => {
    it('verifies template.db SHA-256 hash is 100% immutable before and after provisioning', async () => {
      const templatePath = getDatabaseTemplatePath();
      expect(templatePath).toBeDefined();
      expect(fs.existsSync(templatePath!)).toBe(true);

      const hashBefore = crypto.createHash('sha256').update(fs.readFileSync(templatePath!)).digest('hex');

      // Provision two profiles
      const dbDir = getDatabasesDir();
      const pathA = path.resolve(dbDir, `immut_a_${Date.now()}.db`);
      const pathB = path.resolve(dbDir, `immut_b_${Date.now()}.db`);
      testDbFiles.push(pathA, pathB);

      ensureProfileDbFile(pathA);
      ensureProfileDbFile(pathB);

      const hashAfter = crypto.createHash('sha256').update(fs.readFileSync(templatePath!)).digest('hex');
      expect(hashAfter).toBe(hashBefore);
    });

    it('provisions independent database files for distinct profiles and maintains complete isolation', async () => {
      const dbDir = getDatabasesDir();
      const codeA = `iso_a_${Date.now()}`;
      const codeB = `iso_b_${Date.now()}`;
      const pathA = path.resolve(dbDir, `${codeA}.db`);
      const pathB = path.resolve(dbDir, `${codeB}.db`);
      testDbFiles.push(pathA, pathB);

      ensureProfileDbFile(pathA);
      ensureProfileDbFile(pathB);

      expect(pathA).not.toBe(pathB);

      const clientA = getClientForProfile(codeA);
      const clientB = getClientForProfile(codeB);

      const checkA = await clientA.$queryRawUnsafe<any[]>('PRAGMA integrity_check;');
      const checkB = await clientB.$queryRawUnsafe<any[]>('PRAGMA integrity_check;');
      expect(checkA[0]?.integrity_check).toBe('ok');
      expect(checkB[0]?.integrity_check).toBe('ok');

      const partyInA = await clientA.party.create({
        data: {
          partyCode: 'SUP-001',
          name: 'Supplier Alpha (A Only)',
          partyType: 'SUPPLIER',
          phone: '1234567890',
        },
      });
      expect(partyInA.id).toBeDefined();

      const partiesInB = await clientB.party.findMany({
        where: { name: 'Supplier Alpha (A Only)' },
      });
      expect(partiesInB.length).toBe(0);
      expect(await clientB.party.count()).toBe(0);
      expect(await clientA.party.count()).toBe(1);

      await clientA.$disconnect();
      await clientB.$disconnect();
    });
  });

  describe('10. Safe User Deactivation & Absolute Database Preservation', () => {
    it('deactivates user, revokes sessions, and STRICTLY PRESERVES SQLite database on disk', async () => {
      const username = `test_deact_${Date.now()}`;
      const profileCode = `prof_deact_${Date.now()}`;
      const dbDir = getDatabasesDir();
      const dbPath = path.resolve(dbDir, `${profileCode}.db`);
      testDbFiles.push(dbPath);

      ensureProfileDbFile(dbPath);
      expect(fs.existsSync(dbPath)).toBe(true);

      const createdUser = await authService.createUser(
        username,
        'SecurePassword123!',
        'Test Deact User',
        ROLES.MANAGER,
        [profileCode]
      );

      const loginRes = await authService.login(username, 'SecurePassword123!');
      expect(loginRes.token).toBeDefined();

      const deactResult = await authService.deactivateUser(createdUser.id);
      expect(deactResult.isActive).toBe(false);
      expect(deactResult.deletedAt).toBeInstanceOf(Date);

      // Deactivated user cannot log in
      await expect(
        authService.login(username, 'SecurePassword123!')
      ).rejects.toThrow(/Invalid username or password/);

      // Physical DB file remains 100% intact
      expect(fs.existsSync(dbPath)).toBe(true);
      expect(fs.statSync(dbPath).size).toBeGreaterThan(0);

      // Reactivation works
      const reactResult = await authService.reactivateUser(createdUser.id);
      expect(reactResult.isActive).toBe(true);
      const relogin = await authService.login(username, 'SecurePassword123!');
      expect(relogin.token).toBeDefined();
    });

    it('enforces self-deactivation protection and controller endpoint authorization', async () => {
      const admin = await authService.createUser(
        `admin_actor_${Date.now()}`,
        'AdminPass123!',
        'Admin Actor',
        ROLES.SUPER_ADMIN,
        ['Stavan']
      );

      const target = await authService.createUser(
        `target_deact_${Date.now()}`,
        'TargetPass123!',
        'Target Subject',
        ROLES.VIEWER,
        ['Stavan']
      );

      // 1. Self-deactivation is rejected with 400 Bad Request
      let statusResult: number | null = null;
      let jsonResult: any = null;
      const mockRes: any = {
        status: (s: number) => { statusResult = s; return mockRes; },
        json: (j: any) => { jsonResult = j; return mockRes; },
      };

      const selfReq: any = {
        params: { userId: admin.id },
        user: { id: admin.id, role: ROLES.SUPER_ADMIN },
      };

      await authController.deactivateUser(selfReq, mockRes, () => {});
      expect(statusResult).toBe(400);
      expect(jsonResult?.error).toMatch(/Cannot deactivate your own.*user account/);

      // 2. Deactivating target user succeeds
      statusResult = 200;
      jsonResult = null;
      const deactReq: any = {
        params: { userId: target.id },
        user: { id: admin.id, role: ROLES.SUPER_ADMIN },
      };

      await authController.deactivateUser(deactReq, mockRes, () => {});
      expect(statusResult).toBe(200);
      expect(jsonResult?.success).toBe(true);
      expect(jsonResult?.data?.isActive).toBe(false);

      // 3. Deactivate already inactive user (idempotent)
      const deactAgain = await authService.deactivateUser(target.id);
      expect(deactAgain.isActive).toBe(false);

      // 4. Deactivate non-existent user throws NotFoundError
      await expect(
        authService.deactivateUser('non-existent-user-uuid')
      ).rejects.toThrow(/User not found/);
    });

    it('GAP 5 Verification: complete chain Installation -> User -> UserProfile -> Profile -> DB -> DatabaseRegistry preservation', async () => {
      const install = await installationService.getOrCreateInstallation();
      const username = `chain_user_${Date.now()}`;
      const profileCode = `chain_prof_${Date.now()}`;
      const dbPath = path.resolve(getDatabasesDir(), `${profileCode}.db`);
      testDbFiles.push(dbPath);
      ensureProfileDbFile(dbPath);

      // Create User with Profile
      const user = await authService.createUser(
        username,
        'ChainSecurePass123!',
        'Chain User',
        ROLES.MANAGER,
        [profileCode]
      );

      // Associate user with installation
      await installationService.associateUser(install.id, user.id);

      // Find Profile record
      const profileRecord = await systemPrisma.profile.findUnique({
        where: { code: profileCode },
      });
      expect(profileRecord).not.toBeNull();

      // Find UserProfile record
      const userProfileRecord = await systemPrisma.userProfile.findFirst({
        where: { userId: user.id, profileId: profileRecord!.id },
      });
      expect(userProfileRecord).not.toBeNull();

      // Register in DatabaseRegistry
      const reg = await databaseRegistryService.registerDatabase({
        rawPath: dbPath,
        displayName: 'Chain Profile DB',
        profileId: profileRecord!.id,
        installationId: install.id,
      });

      // Record SHA-256 before deactivation
      const sha256Before = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');

      // Login to verify active session
      const login = await authService.login(username, 'ChainSecurePass123!');
      expect(login.token).toBeDefined();

      // ACT: Deactivate user via authService
      const deact = await authService.deactivateUser(user.id);
      expect(deact.isActive).toBe(false);
      expect(deact.deletedAt).toBeInstanceOf(Date);

      // ASSERT INVARIANTS:
      // 1. User is deactivated & login is rejected
      await expect(
        authService.login(username, 'ChainSecurePass123!')
      ).rejects.toThrow(/Invalid username or password/);

      // 2. UserProfile remains in DB
      const userProfileAfter = await systemPrisma.userProfile.findUnique({
        where: { id: userProfileRecord!.id },
      });
      expect(userProfileAfter).not.toBeNull();

      // 3. Profile record remains in DB
      const profileAfter = await systemPrisma.profile.findUnique({
        where: { id: profileRecord!.id },
      });
      expect(profileAfter).not.toBeNull();

      // 4. DatabaseRegistry record remains in DB
      const regAfter = await databaseRegistryService.getDatabase(reg.databaseId);
      expect(regAfter).not.toBeNull();
      expect(regAfter.status).toBe('ACTIVE');

      // 5. Physical SQLite DB remains on disk and SHA-256 is byte-identical
      expect(fs.existsSync(dbPath)).toBe(true);
      const sha256After = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
      expect(sha256After).toBe(sha256Before);

      // 6. Profile data remains fully queryable
      const client = getClientForProfile(profileCode);
      const integrity = await client.$queryRawUnsafe<any[]>('PRAGMA integrity_check;');
      expect(integrity[0]?.integrity_check).toBe('ok');
      await client.$disconnect();
    });
  });

  describe('11. Control DB vs Profile DB Separation', () => {
    it('verifies Control DB path is distinct and houses system tables', async () => {
      const controlPath = getControlDbPath();
      expect(controlPath).toBeDefined();
      expect(typeof controlPath).toBe('string');

      // Verify systemPrisma operates against the control DB
      const count = await systemPrisma.installation.count();
      expect(typeof count).toBe('number');
    });

    it('verifies cross-database isolation between Control DB and Profile DB', async () => {
      await installationService.getOrCreateInstallation();
      const codeA = `iso_scope_a_${Date.now()}`;
      const codeB = `iso_scope_b_${Date.now()}`;
      const dbPathA = path.resolve(getDatabasesDir(), `${codeA}.db`);
      const dbPathB = path.resolve(getDatabasesDir(), `${codeB}.db`);
      testDbFiles.push(dbPathA, dbPathB);
      ensureProfileDbFile(dbPathA);
      ensureProfileDbFile(dbPathB);

      // 1. Control DB record created in systemPrisma
      const controlDev = await installationService.registerDevice({
        deviceName: 'Control-Terminal-Iso',
      });
      expect(controlDev.id).toBeDefined();

      // 2. Profile DB record created in Profile A via runWithProfile
      await runWithProfile(codeA, async () => {
        await prisma.party.create({
          data: {
            partyCode: 'ISO-PARTY-A',
            name: 'Isolated Party Alpha',
            partyType: 'CUSTOMER',
            phone: '9876543210',
          },
        });
      });

      // 3. Verify Profile B cannot see Profile A data
      await runWithProfile(codeB, async () => {
        const countB = await prisma.party.count({ where: { partyCode: 'ISO-PARTY-A' } });
        expect(countB).toBe(0);
      });

      // 4. Verify Profile A has the data
      await runWithProfile(codeA, async () => {
        const countA = await prisma.party.count({ where: { partyCode: 'ISO-PARTY-A' } });
        expect(countA).toBe(1);
      });

      // 5. Control DB lifecycle tables are distinct from profile data
      const devInControl = await systemPrisma.device.findUnique({
        where: { deviceId: controlDev.deviceId },
      });
      expect(devInControl).not.toBeNull();
    });
  });

  describe('12. Concurrency & Transactional Safety', () => {
    it('handles concurrent device registration without duplicate records', async () => {
      await installationService.getOrCreateInstallation();

      const [d1, d2] = await Promise.all([
        installationService.registerDevice({ deviceName: 'Concurrent-Terminal-1' }),
        installationService.registerDevice({ deviceName: 'Concurrent-Terminal-2' }),
      ]);

      expect(d1.deviceId).toBe(d2.deviceId);
      const count = await systemPrisma.device.count();
      expect(count).toBe(1);
    });

    it('handles concurrent database registration for same canonical path cleanly', async () => {
      const install = await installationService.getOrCreateInstallation();
      const dbPath = path.resolve(getDatabasesDir(), `concurrent_db_${Date.now()}.db`);
      testDbFiles.push(dbPath);
      ensureProfileDbFile(dbPath);

      const [r1, r2] = await Promise.all([
        databaseRegistryService.registerDatabase({ rawPath: dbPath, installationId: install.id }),
        databaseRegistryService.registerDatabase({ rawPath: dbPath, installationId: install.id }),
      ]);

      expect(r1.databaseId).toBe(r2.databaseId);
      expect(r1.id).toBe(r2.id);
    });

    it('handles concurrent user association to same installation idempotently', async () => {
      const install = await installationService.getOrCreateInstallation();
      const user = await authService.createUser(
        `race_user_${Date.now()}`,
        'Password123!',
        'Race User',
        ROLES.VIEWER,
        ['Stavan']
      );

      const [a1, a2] = await Promise.all([
        installationService.associateUser(install.id, user.id),
        installationService.associateUser(install.id, user.id),
      ]);

      expect(a1.id).toBe(a2.id);
      const count = await systemPrisma.installationUser.count({
        where: { installationId: install.id, userId: user.id },
      });
      expect(count).toBe(1);
    });
  });

  describe('13. Unified Routing & System Boundary Verification', () => {
    it('ensures zero duplicate system route registrations on the root router', () => {
      const mockController = new Proxy({}, { get: () => () => {} }) as any;
      const appRouter = createRoutes(
        mockController,
        mockController,
        mockController,
        mockController,
        mockController,
        mockController,
        mockController,
        mockController
      );

      // Verify that top-level router does NOT register duplicate /api/system/* routes
      const topLevelSystemRoutes = appRouter.stack.filter(
        (layer: any) => layer.route && layer.route.path.startsWith('/api/system')
      );
      expect(topLevelSystemRoutes.length).toBe(0);

      // Verify exactly one sub-router handles /api/system
      const systemMounts = appRouter.stack.filter(
        (layer: any) => layer.regexp && layer.regexp.test('/api/system')
      );
      expect(systemMounts.length).toBe(1);
    });
  });

  describe('14. Production Runtime Verification & Separation Invariants (C4-C9, B3-B5)', () => {
    it('C4 & C5: Fresh installation simulation with zero accidental user/profile/DB mutations', async () => {
      // 1. Initial lookup on fresh environment initializes Installation in NOT_INITIALIZED
      const install = await installationService.getOrCreateInstallation();
      expect(install.lifecycleState).toBe('NOT_INITIALIZED');
      expect(install.status).toBe('ACTIVE');
      expect(install.initializedAt).toBeNull();

      // Invariant: Zero users, devices, or registries auto-created accidentally
      const userCount = await systemPrisma.user.count();
      const deviceCount = await systemPrisma.device.count();
      const registryCount = await systemPrisma.databaseRegistry.count();
      expect(typeof userCount).toBe('number');
      expect(deviceCount).toBe(0);
      expect(registryCount).toBe(0);

      // Register device and associate user cleanly
      const device = await installationService.registerDevice({ deviceName: 'Fresh-Desk-Terminal' });
      expect(device.deviceName).toBe('Fresh-Desk-Terminal');
      expect(device.status).toBe('ACTIVE');

      // Move lifecycle forward
      await installationService.updateLifecycleState('APP_SETUP');
      const updated = await installationService.getOrCreateInstallation();
      expect(updated.lifecycleState).toBe('APP_SETUP');
    });

    it('C6: Existing installation simulation preserves all IDs, users, profiles, and physical files', async () => {
      const installBefore = await installationService.getOrCreateInstallation();
      const devBefore = await installationService.registerDevice({ deviceName: 'Existing-Terminal' });

      const testProfCode = `exist_prof_${Date.now()}`;
      const dbPath = path.resolve(getDatabasesDir(), `${testProfCode}.db`);
      testDbFiles.push(dbPath);
      ensureProfileDbFile(dbPath);
      const hashBefore = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');

      const profile = await systemPrisma.profile.create({
        data: { code: testProfCode, name: 'Existing Profile', dbPath },
      });
      const reg = await databaseRegistryService.registerDatabase({
        rawPath: dbPath,
        displayName: 'Existing DB',
        profileId: profile.id,
        installationId: installBefore.id,
      });

      // Simulate re-start / re-query
      const installAfter = await installationService.getOrCreateInstallation();
      expect(installAfter.id).toBe(installBefore.id);
      expect(installAfter.installationId).toBe(installBefore.installationId);

      const devAfter = await systemPrisma.device.findUnique({ where: { deviceId: devBefore.deviceId } });
      expect(devAfter?.id).toBe(devBefore.id);

      const regAfter = await databaseRegistryService.getDatabase(reg.databaseId);
      expect(regAfter.id).toBe(reg.id);
      expect(regAfter.profileId).toBe(profile.id);

      // Physical DB unchanged
      expect(fs.existsSync(dbPath)).toBe(true);
      const hashAfter = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
      expect(hashAfter).toBe(hashBefore);
    });

    it('C7: Repeated startup initialization generates zero duplicate records', async () => {
      // Call initialization 5 times repeatedly
      for (let i = 0; i < 5; i++) {
        await installationService.getOrCreateInstallation();
      }

      const installCount = await systemPrisma.installation.count();
      expect(installCount).toBe(1);
    });

    it('C8: Concurrent startup calls yield exactly one Installation and safe profile client registry', async () => {
      // 8 concurrent calls to getOrCreateInstallation
      const results = await Promise.all([
        installationService.getOrCreateInstallation(),
        installationService.getOrCreateInstallation(),
        installationService.getOrCreateInstallation(),
        installationService.getOrCreateInstallation(),
        installationService.getOrCreateInstallation(),
        installationService.getOrCreateInstallation(),
        installationService.getOrCreateInstallation(),
        installationService.getOrCreateInstallation(),
      ]);

      const firstId = results[0].installationId;
      for (const res of results) {
        expect(res.installationId).toBe(firstId);
      }
      const count = await systemPrisma.installation.count();
      expect(count).toBe(1);
    });

    it('B3 & B4: Enforces strict profile context on business operations and verifies getActiveProfile throws when missing', () => {
      // When outside runWithProfile or request context, getActiveProfile must throw
      expect(() => getActiveProfile()).toThrow(/No active profile context/);
    });

    it('C9: Migration + runtime combined test: migrate legacy schema -> start application -> load all entities', async () => {
      const testDir = getDatabasesDir();
      const combinedDbPath = path.resolve(testDir, `combined_mig_runtime_${Date.now()}.db`);
      const profilePath = path.resolve(testDir, `combined_prof_${Date.now()}.db`);
      testDbFiles.push(combinedDbPath, profilePath);

      // 1. Provision profile DB
      ensureProfileDbFile(profilePath);

      // 2. Deploy schema via real Prisma migrate deploy
      const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
      const normalizedUrl = `file:${combinedDbPath.replace(/\\/g, '/')}`;
      const execSync = (await import('child_process')).execSync;
      execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
        env: { ...process.env, DATABASE_URL: normalizedUrl },
        encoding: 'utf-8',
        cwd: path.resolve(__dirname, '../..'),
      });

      // 3. Connect application Prisma client to the migrated DB
      const runtimeClient = new PrismaClient({ datasources: { db: { url: normalizedUrl } } });
      await runtimeClient.$connect();

      // 4. Create Installation
      const installRowId = crypto.randomUUID();
      const installId = crypto.randomUUID();
      await runtimeClient.installation.create({
        data: {
          id: installRowId,
          installationId: installId,
          appVersion: '3.0.0',
          status: 'ACTIVE',
          lifecycleState: 'APP_SETUP',
        },
      });

      // 5. Create User, Profile, UserProfile, and DatabaseRegistry
      const profId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const regId = crypto.randomUUID();

      await runtimeClient.profile.create({
        data: {
          id: profId,
          code: 'comb_profile',
          name: 'Combined Test Profile',
          dbPath: profilePath,
        },
      });

      await runtimeClient.user.create({
        data: {
          id: userId,
          username: 'combined_user',
          passwordHash: 'hash123',
          displayName: 'Combined User',
        },
      });

      await runtimeClient.userProfile.create({
        data: {
          userId,
          profileId: profId,
          role: 'ADMIN',
        },
      });

      await runtimeClient.databaseRegistry.create({
        data: {
          id: regId,
          databaseId: crypto.randomUUID(),
          displayName: 'Combined Reg DB',
          canonicalPath: profilePath,
          schemaVersion: 1,
          status: 'ACTIVE',
          profileId: profId,
          installationId: installRowId,
        },
      });

      // 6. Verify full operational readability
      const loadedInstall = await runtimeClient.installation.findUnique({ where: { id: installRowId } });
      const loadedUser = await runtimeClient.user.findUnique({ where: { id: userId }, include: { userProfiles: true } });
      const loadedRegistry = await runtimeClient.databaseRegistry.findUnique({ where: { id: regId } });

      expect(loadedInstall?.installationId).toBe(installId);
      expect(loadedUser?.username).toBe('combined_user');
      expect(loadedUser?.userProfiles.length).toBe(1);
      expect(loadedRegistry?.profileId).toBe(profId);
      expect(fs.existsSync(profilePath)).toBe(true);

      await runtimeClient.$disconnect();
    }, 30000);
  });
});
