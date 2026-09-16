import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { installationService, LIFECYCLE_STAGES } from '../modules/system/installation.service';
import { authService, ROLES } from '../modules/auth/auth.service';
import { systemPrisma, ensureProfileDbFile, getClientForProfile } from '../infrastructure/database/prisma';
import { getDatabasesDir, getDatabaseTemplatePath } from '../infrastructure/paths';

describe('Phase 2 Foundation: Installation, Device, Safe User Deactivation & Database Isolation', () => {
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
    // Clean up test installation records
    await systemPrisma.device.deleteMany().catch(() => {});
    await systemPrisma.installation.deleteMany().catch(() => {});
  });

  afterAll(() => {
    cleanupFiles();
  });

  describe('1. Installation Identity & Lifecycle State Machine', () => {
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

    it('enforces valid progressive lifecycle state transitions', async () => {
      await installationService.getOrCreateInstallation();

      // Step forward 1: NOT_INITIALIZED -> APP_SETUP
      const s1 = await installationService.updateLifecycleState('APP_SETUP');
      expect(s1.lifecycleState).toBe('APP_SETUP');

      // Step forward 2: APP_SETUP -> PIN_SETUP
      const s2 = await installationService.updateLifecycleState('PIN_SETUP');
      expect(s2.lifecycleState).toBe('PIN_SETUP');

      // Step forward 3: PIN_SETUP -> DEVICE_SETUP
      const s3 = await installationService.updateLifecycleState('DEVICE_SETUP');
      expect(s3.lifecycleState).toBe('DEVICE_SETUP');

      // Step to READY: records initializedAt timestamp
      const ready = await installationService.updateLifecycleState('READY');
      expect(ready.lifecycleState).toBe('READY');
      expect(ready.initializedAt).toBeDefined();
      expect(typeof ready.initializedAt).toBe('string');
    });

    it('rejects invalid state values and illegal backward transitions without reset', async () => {
      await installationService.getOrCreateInstallation();
      await installationService.updateLifecycleState('APP_SETUP');
      await installationService.updateLifecycleState('PIN_SETUP');

      // Invalid state name
      await expect(
        installationService.updateLifecycleState('NON_EXISTENT_STATE' as any)
      ).rejects.toThrow();

      // Illegal backward step: PIN_SETUP -> APP_SETUP
      await expect(
        installationService.updateLifecycleState('APP_SETUP')
      ).rejects.toThrow(/Illegal lifecycle transition/);

      // Reset to NOT_INITIALIZED is permitted
      const reset = await installationService.updateLifecycleState('NOT_INITIALIZED');
      expect(reset.lifecycleState).toBe('NOT_INITIALIZED');
      expect(reset.initializedAt).toBeNull();
    });
  });

  describe('2. Device Registration & Association', () => {
    it('registers a device linked to the local installation', async () => {
      const install = await installationService.getOrCreateInstallation();

      const device = await installationService.registerDevice('FrontDesk-Terminal-1', 'WINDOWS', '10.0.19045');
      expect(device.id).toBeDefined();
      expect(device.installationId).toBe(install.id);
      expect(device.deviceName).toBe('FrontDesk-Terminal-1');
      expect(device.platform).toBe('WINDOWS');
      expect(device.osVersion).toBe('10.0.19045');
      expect(device.status).toBe('ACTIVE');
      expect(device.lastSeenAt).toBeDefined();

      // Verification: Installation includes registered device count
      const updatedInstall = await installationService.getOrCreateInstallation();
      expect(updatedInstall.deviceCount).toBe(1);
    });

    it('updates lastSeenAt when same device is re-registered', async () => {
      await installationService.getOrCreateInstallation();
      const dev1 = await installationService.registerDevice('Workshop-PC', 'WINDOWS');
      const firstSeen = new Date(dev1.lastSeenAt).getTime();

      // Small delay
      await new Promise((r) => setTimeout(r, 10));

      const dev2 = await installationService.registerDevice('Workshop-PC', 'WINDOWS', '11.0.22631');
      expect(dev2.id).toBe(dev1.id);
      expect(new Date(dev2.lastSeenAt).getTime()).toBeGreaterThanOrEqual(firstSeen);
      expect(dev2.osVersion).toBe('11.0.22631');
    });
  });

  describe('3. Safe User Deactivation & Absolute Database Preservation', () => {
    it('deactivates user, revokes sessions, and STRICTLY PRESERVES SQLite database on disk', async () => {
      const username = `test_deact_${Date.now()}`;
      const profileCode = `prof_deact_${Date.now()}`;
      const dbDir = getDatabasesDir();
      const dbPath = path.resolve(dbDir, `${profileCode}.db`);
      testDbFiles.push(dbPath);

      // 1. Create User and provision associated profile database file
      ensureProfileDbFile(dbPath);
      expect(fs.existsSync(dbPath)).toBe(true);

      const createdUser = await authService.createUser(
        username,
        'SecurePassword123!',
        'Test Deact User',
        ROLES.MANAGER,
        [profileCode]
      );
      expect(createdUser.id).toBeDefined();

      // 2. Simulate login to create an active session
      const loginRes = await authService.login(username, 'SecurePassword123!');
      expect(loginRes.token).toBeDefined();

      // Verify active session exists in system DB
      const activeSessionsBefore = await systemPrisma.session.count({
        where: { userId: createdUser.id, revokedAt: null },
      });
      expect(activeSessionsBefore).toBeGreaterThan(0);

      // 3. Execute safe deactivation (Phase 2 core feature)
      const deactResult = await authService.deactivateUser(createdUser.id);
      expect(deactResult.isActive).toBe(false);
      expect(deactResult.deletedAt).toBeInstanceOf(Date);

      // 4. Invariant Check: Deactivated user CANNOT log in
      await expect(
        authService.login(username, 'SecurePassword123!')
      ).rejects.toThrow(/Invalid username or password/);

      // 5. Invariant Check: All active sessions revoked
      const activeSessionsAfter = await systemPrisma.session.count({
        where: { userId: createdUser.id, revokedAt: null },
      });
      expect(activeSessionsAfter).toBe(0);

      // 6. MANDATORY INVARIANT: The physical SQLite file (<profileCode>.db) on disk is 100% INTACT
      expect(fs.existsSync(dbPath)).toBe(true);
      expect(fs.statSync(dbPath).size).toBeGreaterThan(0);

      // 7. Test user reactivation
      const reactResult = await authService.reactivateUser(createdUser.id);
      expect(reactResult.isActive).toBe(true);

      // Reactivated user can log in again
      const relogin = await authService.login(username, 'SecurePassword123!');
      expect(relogin.token).toBeDefined();
    });
  });

  describe('4. Multi-Profile Database Isolation & Template Integrity', () => {
    it('provisions independent database files for distinct profiles and maintains complete isolation', async () => {
      const dbDir = getDatabasesDir();
      const codeA = `iso_a_${Date.now()}`;
      const codeB = `iso_b_${Date.now()}`;
      const pathA = path.resolve(dbDir, `${codeA}.db`);
      const pathB = path.resolve(dbDir, `${codeB}.db`);
      testDbFiles.push(pathA, pathB);

      // 1. Provision Profile A & B from template.db
      ensureProfileDbFile(pathA);
      ensureProfileDbFile(pathB);

      // Assert distinct file paths
      expect(pathA).not.toBe(pathB);
      expect(fs.existsSync(pathA)).toBe(true);
      expect(fs.existsSync(pathB)).toBe(true);

      // 2. Open clients for both profiles
      const clientA = getClientForProfile(codeA);
      const clientB = getClientForProfile(codeB);

      // Verify PRAGMA integrity_check on both freshly provisioned databases
      const checkA = await clientA.$queryRawUnsafe<any[]>('PRAGMA integrity_check;');
      const checkB = await clientB.$queryRawUnsafe<any[]>('PRAGMA integrity_check;');
      expect(checkA[0]?.integrity_check).toBe('ok');
      expect(checkB[0]?.integrity_check).toBe('ok');

      // 3. Insert record into Database A
      const partyInA = await clientA.party.create({
        data: {
          partyCode: 'SUP-001',
          name: 'Supplier Alpha (A Only)',
          partyType: 'SUPPLIER',
          phone: '1234567890',
        },
      });
      expect(partyInA.id).toBeDefined();

      // 4. Assert Record in A is NOT visible in Database B (Complete Tenancy Isolation)
      const partiesInB = await clientB.party.findMany({
        where: { name: 'Supplier Alpha (A Only)' },
      });
      expect(partiesInB.length).toBe(0);

      // Record count in B is completely independent
      const totalInB = await clientB.party.count();
      expect(totalInB).toBe(0);

      const totalInA = await clientA.party.count();
      expect(totalInA).toBe(1);

      // Clean disconnect
      await clientA.$disconnect();
      await clientB.$disconnect();
    });

    it('verifies template.db is an uncorrupted, schema-only template with 0 records', async () => {
      const templatePath = getDatabaseTemplatePath();
      expect(templatePath).toBeDefined();
      expect(fs.existsSync(templatePath!)).toBe(true);

      const templateClient = new PrismaClient({
        datasources: {
          db: { url: 'file:' + templatePath!.replace(/\\/g, '/') },
        },
      });

      const integrity = await templateClient.$queryRawUnsafe<any[]>('PRAGMA integrity_check;');
      expect(integrity[0]?.integrity_check).toBe('ok');

      const installs = await templateClient.installation.count();
      const devices = await templateClient.device.count();
      const stocks = await templateClient.stock.count();
      const parties = await templateClient.party.count();

      expect(installs).toBe(0);
      expect(devices).toBe(0);
      expect(stocks).toBe(0);
      expect(parties).toBe(0);

      await templateClient.$disconnect();
    });
  });

  describe('5. Public Lifecycle Status API Probe', () => {
    it('returns lifecycle status object without authentication requirement', async () => {
      const status = await installationService.getLifecycleStatus();
      expect(status.installationId).toBeDefined();
      expect(status.appVersion).toBe('3.0.0');
      expect(LIFECYCLE_STAGES).toContain(status.lifecycleState);
      expect(typeof status.isInitialized).toBe('boolean');
      expect(status.activeProfile).toBeDefined();
    });
  });
});
