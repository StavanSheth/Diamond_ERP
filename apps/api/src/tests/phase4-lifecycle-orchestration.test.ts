import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemPrisma } from '../infrastructure/database/prisma';
import { onboardingService } from '../modules/system/onboarding/onboarding.service';
import { installationService } from '../modules/system/installation.service';
import { onboardingAuthorizationService } from '../modules/system/onboarding/onboarding-authorization.service';
import { getDatabasesDir } from '../infrastructure/paths';
import { ConflictError, AuthenticationError } from '../errors';
import type { LifecycleState } from '@diamond-erp/contracts';

describe('Diamond ERP V3 — Phase 4: Lifecycle Orchestration & State Machine Verification', () => {
  let installId: string;
  let localDeviceId: string;
  const createdTestFiles: string[] = [];

  beforeEach(async () => {
    const install = await installationService.getOrCreateInstallation();
    installId = install.id;
    localDeviceId = installationService.getOrGenerateDeviceId();

    // Ensure active device
    await systemPrisma.device.upsert({
      where: { deviceId: localDeviceId },
      update: { status: 'ACTIVE', revokedAt: null, installationId: install.id },
      create: {
        deviceId: localDeviceId,
        installationId: install.id,
        deviceName: 'Orchestration-Test-Terminal',
        platform: 'WINDOWS',
        status: 'ACTIVE',
      },
    });

    // Reset installation to NOT_INITIALIZED for clean state machine test
    await systemPrisma.installation.update({
      where: { id: installId },
      data: { lifecycleState: 'NOT_INITIALIZED', initializedAt: null, status: 'ACTIVE' },
    });

    // Clean device security state and database registry
    await systemPrisma.deviceSecurity.deleteMany({
      where: { deviceId: localDeviceId },
    });
    await systemPrisma.databaseRegistry.deleteMany({
      where: { installationId: installId },
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

  // ── 1. Legal Forward Transitions ──────────────────────────────────────────
  describe('1. Legal Forward Transitions (Step-by-step)', () => {
    it('executes the complete 9-stage lifecycle strictly in order', async () => {
      // 1. NOT_INITIALIZED -> APP_SETUP
      let status = await onboardingService.initializeApplication();
      expect(status.lifecycleState).toBe('APP_SETUP');
      expect(status.installationInitialized).toBe(true);

      // 2. APP_SETUP -> PIN_SETUP -> DEVICE_SETUP via atomic setupPin
      status = await onboardingService.setupPin('847291');
      expect(status.lifecycleState).toBe('DEVICE_SETUP');
      expect(status.pinConfigured).toBe(true);

      // 3. DEVICE_SETUP -> USER_DISCOVERY via atomic registerDevice
      status = await onboardingService.registerDevice('Front-Desk-Terminal');
      expect(status.lifecycleState).toBe('USER_DISCOVERY');
      expect(status.deviceConfigured).toBe(true);

      // 4. USER_DISCOVERY -> DATABASE_DISCOVERY via user creation/selection
      const suffix = Date.now().toString();
      await onboardingService.createBusinessUser({
        username: `orchestration_user_${suffix}`,
        password: 'Password123456!',
        displayName: 'Orchestration Admin',
        role: 'ADMIN',
      });
      status = await onboardingService.getOnboardingState();
      expect(status.lifecycleState).toBe('DATABASE_DISCOVERY');
      expect(status.userConfigured).toBe(true);

      // 5. DATABASE_DISCOVERY -> DATABASE_VALIDATION -> DATABASE_SETUP via new DB creation
      const dbRes = await onboardingService.createNewDatabase({
        displayName: `Orchestration_DB_${suffix}`,
      });
      createdTestFiles.push(path.resolve(getDatabasesDir(), `orchestration_db_${suffix}.db`));
      expect(dbRes.success).toBe(true);

      status = await onboardingService.getOnboardingState();
      expect(status.lifecycleState).toBe('DATABASE_SETUP');
      expect(status.databaseConfigured).toBe(true);

      // 6. DATABASE_SETUP -> READY via completeOnboarding
      status = await onboardingService.completeOnboarding();
      expect(status.lifecycleState).toBe('READY');
      expect(status.ready).toBe(true);
    });
  });

  // ── 2. Illegal State Transitions ──────────────────────────────────────────
  describe('2. Illegal Forward & Skip Transitions', () => {
    it('rejects NOT_INITIALIZED -> READY', async () => {
      await expect(
        installationService.updateLifecycleState('READY')
      ).rejects.toThrow(ConflictError);
    });

    it('rejects NOT_INITIALIZED -> DEVICE_SETUP', async () => {
      await expect(
        installationService.updateLifecycleState('DEVICE_SETUP')
      ).rejects.toThrow(ConflictError);
    });

    it('rejects PIN_SETUP -> READY', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'PIN_SETUP' },
      });
      await expect(
        installationService.updateLifecycleState('READY')
      ).rejects.toThrow(ConflictError);
    });

    it('rejects DEVICE_SETUP -> READY', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DEVICE_SETUP' },
      });
      await expect(
        installationService.updateLifecycleState('READY')
      ).rejects.toThrow(ConflictError);
    });

    it('rejects USER_DISCOVERY -> READY', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'USER_DISCOVERY' },
      });
      await expect(
        installationService.updateLifecycleState('READY')
      ).rejects.toThrow(ConflictError);
    });

    it('rejects DATABASE_DISCOVERY -> READY', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DATABASE_DISCOVERY' },
      });
      await expect(
        installationService.updateLifecycleState('READY')
      ).rejects.toThrow(ConflictError);
    });

    it('rejects DATABASE_VALIDATION -> READY', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DATABASE_VALIDATION' },
      });
      await expect(
        installationService.updateLifecycleState('READY')
      ).rejects.toThrow(ConflictError);
    });
  });

  // ── 3. Prerequisite Blocking Tests ────────────────────────────────────────
  describe('3. Mandatory Prerequisite Enforcement', () => {
    it('blocks advancing from PIN_SETUP to DEVICE_SETUP if PIN was never configured', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'PIN_SETUP' },
      });

      // Ensure no PIN hash exists
      await systemPrisma.deviceSecurity.deleteMany({
        where: { deviceId: localDeviceId },
      });

      await expect(
        installationService.updateLifecycleState('DEVICE_SETUP')
      ).rejects.toThrow(/Application PIN must be configured/i);
    });

    it('blocks advancing from DEVICE_SETUP to USER_DISCOVERY if device is REVOKED', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DEVICE_SETUP' },
      });

      await systemPrisma.device.update({
        where: { deviceId: localDeviceId },
        data: { status: 'REVOKED' },
      });

      await expect(
        installationService.updateLifecycleState('USER_DISCOVERY')
      ).rejects.toThrow(/active device registration is required/i);
    });

    it('blocks transition to READY if database is missing or unattached', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DATABASE_SETUP' },
      });

      // Remove any registered databases for this installation
      await systemPrisma.databaseRegistry.deleteMany({
        where: { installationId: installId },
      });

      await expect(
        onboardingService.completeOnboarding()
      ).rejects.toThrow(ConflictError);
    });
  });

  // ── 4. Resumability Across Incomplete States ──────────────────────────────
  describe('4. Incomplete State Resumability', () => {
    const TEST_STATES: LifecycleState[] = [
      'APP_SETUP',
      'PIN_SETUP',
      'DEVICE_SETUP',
      'USER_DISCOVERY',
      'DATABASE_DISCOVERY',
      'DATABASE_VALIDATION',
      'DATABASE_SETUP',
      'READY',
    ];

    for (const state of TEST_STATES) {
      it(`resumes from persisted state "${state}" without resetting`, async () => {
        await systemPrisma.installation.update({
          where: { id: installId },
          data: { lifecycleState: state },
        });

        // Simulate restarting / re-reading state from backend
        const status = await onboardingService.getOnboardingState();
        expect(status.lifecycleState).toBe(state);
      });
    }
  });

  // ── 5. Idempotency & Repeat Safety ────────────────────────────────────────
  describe('5. Step Idempotency', () => {
    it('executes initializeApplication repeatedly without corrupting identity', async () => {
      const res1 = await onboardingService.initializeApplication();
      const res2 = await onboardingService.initializeApplication();
      expect(res1.installation?.id).toBe(res2.installation?.id);
      expect(res1.installation?.installationId).toBe(res2.installation?.installationId);
      expect(res2.lifecycleState).toBe('APP_SETUP');
    });

    it('registers workstation device repeatedly without creating duplicate device IDs', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DEVICE_SETUP' },
      });

      await installationService.registerDevice({ deviceName: 'Terminal A', platform: 'WINDOWS' });
      await installationService.registerDevice({ deviceName: 'Terminal A Renamed', platform: 'WINDOWS' });

      const devices = await systemPrisma.device.findMany({
        where: { deviceId: localDeviceId },
      });
      expect(devices.length).toBe(1);
    });
  });

  // ── 6. Post-READY Security Boundary ───────────────────────────────────────
  describe('6. Post-READY Security Boundary Hardening', () => {
    it('forbids unauthenticated lifecycle mutations once in READY state', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'READY' },
      });

      const mockReq: any = { headers: {} };
      await expect(
        onboardingAuthorizationService.authorize(mockReq, 'INITIALIZE_APPLICATION')
      ).rejects.toThrow(AuthenticationError);
    });

    it('permits reading onboarding status freely at any state including READY', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'READY' },
      });

      const mockReq: any = { headers: {} };
      await expect(
        onboardingAuthorizationService.authorize(mockReq, 'READ_ONBOARDING_STATUS')
      ).resolves.not.toThrow();
    });
  });
});
