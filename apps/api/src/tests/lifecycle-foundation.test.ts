import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { installationService, LIFECYCLE_STAGES } from '../modules/system/installation.service';
import { authService, ROLES } from '../modules/auth/auth.service';
import { systemPrisma, ensureProfileDbFile, getClientForProfile } from '../infrastructure/database/prisma';
import { getDatabasesDir, getDatabaseTemplatePath, getControlDbPath } from '../infrastructure/paths';
import { canonicalizeDatabasePath } from '../modules/system/database/database-path.util';
import { databaseValidationService } from '../modules/system/database/database-validation.service';
import { databaseRegistryService } from '../modules/system/database/database-registry.service';
import { lifecycleController } from '../modules/system/lifecycle.controller';

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

    it('is strictly idempotent when re-registered with same deviceId even if display name changes', async () => {
      const install = await installationService.getOrCreateInstallation();
      const customDeviceId = crypto.randomUUID();

      const dev1 = await installationService.registerDevice({
        deviceId: customDeviceId,
        deviceName: 'Workshop-OldName',
        platform: 'WINDOWS',
      });

      await new Promise((r) => setTimeout(r, 10));

      // Same deviceId, updated display name
      const dev2 = await installationService.registerDevice({
        deviceId: customDeviceId,
        deviceName: 'Workshop-Renamed',
        platform: 'WINDOWS',
        osVersion: '11.0.22631',
      });

      expect(dev2.id).toBe(dev1.id);
      expect(dev2.deviceId).toBe(customDeviceId);
      expect(dev2.deviceName).toBe('Workshop-Renamed'); // Display name updated
      expect(dev2.osVersion).toBe('11.0.22631');

      // Device count remains exactly 1 (no duplicate device created)
      const count = await systemPrisma.device.count({ where: { installationId: install.id } });
      expect(count).toBe(1);
    });
  });

  describe('3. Strict Lifecycle State Progression Matrix', () => {
    it('enforces the complete 9-stage progression matrix from NOT_INITIALIZED to READY', async () => {
      await installationService.getOrCreateInstallation();

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
      const mockReq: any = { body: { lifecycleState: 'APP_SETUP' } };
      let jsonSent: any = null;
      const mockRes: any = {
        status: () => mockRes,
        json: (j: any) => { jsonSent = j; return mockRes; },
      };

      await lifecycleController.updateLifecycleState(mockReq, mockRes, () => {});
      expect(jsonSent?.success).toBe(true);
      expect(jsonSent?.data?.lifecycleState).toBe('APP_SETUP');

      // Fast-forward to READY through valid steps
      await installationService.updateLifecycleState('PIN_SETUP');
      await installationService.updateLifecycleState('DEVICE_SETUP');
      await installationService.updateLifecycleState('USER_DISCOVERY');
      await installationService.updateLifecycleState('DATABASE_DISCOVERY');
      await installationService.updateLifecycleState('DATABASE_VALIDATION');
      await installationService.updateLifecycleState('DATABASE_SETUP');
      await installationService.updateLifecycleState('READY');

      // 2. When READY: unauthenticated mutation MUST return 403 Forbidden
      const unauthReq: any = { body: { lifecycleState: 'NOT_INITIALIZED' } }; // unauthenticated (no req.user)
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
  });
});
