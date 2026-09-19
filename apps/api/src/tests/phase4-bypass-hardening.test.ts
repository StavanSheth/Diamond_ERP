import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemPrisma } from '../infrastructure/database/prisma';
import { installationService } from '../modules/system/installation.service';
import { onboardingService } from '../modules/system/onboarding/onboarding.service';
import { lifecycleController } from '../modules/system/lifecycle.controller';
import { onboardingController } from '../modules/system/onboarding/onboarding.controller';
import { getDatabasesDir } from '../infrastructure/paths';
import { ConflictError, AuthorizationError, ValidationError } from '../errors';
import type { LifecycleState } from '@diamond-erp/contracts';

describe('Diamond ERP V3 — Phase 4: Lifecycle Bypass Hardening & Direct API Tests', () => {
  let installId: string;
  let localDeviceId: string;
  const createdTestFiles: string[] = [];

  // Helper to mock Express req, res, next
  const callController = async (handler: any, reqPartial: any = {}) => {
    let statusCode = 200;
    let jsonResult: any = null;
    let nextError: any = null;

    const mockReq: any = {
      headers: {},
      body: {},
      params: {},
      ...reqPartial,
    };

    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => {
        jsonResult = data;
        return mockRes;
      },
    };

    const mockNext = (err: any) => {
      nextError = err;
    };

    await handler(mockReq, mockRes, mockNext);
    return { statusCode, jsonResult, nextError };
  };

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
        deviceName: 'Harden-Test-Terminal',
        platform: 'WINDOWS',
        status: 'ACTIVE',
      },
    });

    // Reset installation to NOT_INITIALIZED for clean testing
    await systemPrisma.installation.update({
      where: { id: installId },
      data: { lifecycleState: 'NOT_INITIALIZED', initializedAt: null, status: 'ACTIVE' },
    });

    // Clean up device security, installation users, database registry
    await systemPrisma.deviceSecurity.deleteMany({
      where: { deviceId: localDeviceId },
    });
    await systemPrisma.installationUser.deleteMany({
      where: { installationId: installId },
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

  // ── 1. Illegal Transitions Matrix via Direct API & Service ───────────────
  describe('1. Illegal Transitions Matrix (Direct API & Service)', () => {
    const illegalTransitions: Array<{ from: LifecycleState; to: LifecycleState }> = [
      { from: 'NOT_INITIALIZED', to: 'READY' },
      { from: 'NOT_INITIALIZED', to: 'DATABASE_SETUP' },
      { from: 'APP_SETUP', to: 'READY' },
      { from: 'APP_SETUP', to: 'DEVICE_SETUP' },
      { from: 'PIN_SETUP', to: 'READY' },
      { from: 'DEVICE_SETUP', to: 'DATABASE_SETUP' },
      { from: 'USER_DISCOVERY', to: 'READY' },
      { from: 'DATABASE_DISCOVERY', to: 'READY' },
      { from: 'DATABASE_VALIDATION', to: 'READY' },
    ];

    for (const { from, to } of illegalTransitions) {
      it(`rejects illegal transition ${from} → ${to} directly via service and HTTP endpoint`, async () => {
        await systemPrisma.installation.update({
          where: { id: installId },
          data: { lifecycleState: from },
        });

        // 1. Direct Service Call
        await expect(
          installationService.updateLifecycleState(to)
        ).rejects.toThrow(ConflictError);

        // 2. Direct HTTP Controller Call (POST /api/system/lifecycle-state)
        const httpRes = await callController(lifecycleController.updateLifecycleState, {
          body: { lifecycleState: to },
        });
        expect(httpRes.nextError).toBeInstanceOf(ConflictError);
      });
    }
  });

  // ── 2. Strict Server-Side Prerequisite Invariants ────────────────────────
  describe('2. Strict Server-Side Prerequisite Invariants', () => {
    it('PIN Prerequisite: rejects PIN_SETUP → DEVICE_SETUP if PIN hash is absent', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'PIN_SETUP' },
      });

      // No PIN configured in deviceSecurity
      await expect(
        installationService.updateLifecycleState('DEVICE_SETUP')
      ).rejects.toThrow(/Application PIN must be configured/i);

      // Direct HTTP endpoint must also reject
      const res = await callController(lifecycleController.updateLifecycleState, {
        body: { lifecycleState: 'DEVICE_SETUP' },
      });
      expect(res.nextError).toBeInstanceOf(ConflictError);
      expect(res.nextError.message).toContain('Application PIN must be configured');
    });

    it('Device Prerequisite: rejects DEVICE_SETUP → USER_DISCOVERY if device is not active', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DEVICE_SETUP' },
      });

      // Revoke the device
      await systemPrisma.device.update({
        where: { deviceId: localDeviceId },
        data: { status: 'REVOKED' },
      });

      await expect(
        installationService.updateLifecycleState('USER_DISCOVERY')
      ).rejects.toThrow(/active device registration is required/i);
    });

    it('User Prerequisite: rejects USER_DISCOVERY → DATABASE_DISCOVERY if no active user is associated', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'USER_DISCOVERY' },
      });

      // No installationUser associated
      await expect(
        installationService.updateLifecycleState('DATABASE_DISCOVERY', { enforceInvariants: true })
      ).rejects.toThrow(/active business user must be associated/i);

      const res = await callController(lifecycleController.updateLifecycleState, {
        body: { lifecycleState: 'DATABASE_DISCOVERY' },
      });
      expect(res.nextError).toBeInstanceOf(ConflictError);
      expect(res.nextError.message).toContain('active business user must be associated');
    });

    it('Database Prerequisite: rejects DATABASE_VALIDATION → DATABASE_SETUP without active database', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DATABASE_VALIDATION' },
      });

      await expect(
        installationService.updateLifecycleState('DATABASE_SETUP', { enforceInvariants: true })
      ).rejects.toThrow(/active database file must exist/i);
    });

    it('READY Prerequisite: rejects DATABASE_SETUP → READY if database file is missing or invalid', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DATABASE_SETUP' },
      });

      // Provide valid PIN and user so it reaches the database check
      await systemPrisma.deviceSecurity.create({
        data: {
          deviceId: localDeviceId,
          pinHash: 'dummy_valid_pin_hash',
        },
      });
      const user = await systemPrisma.user.create({
        data: {
          username: `ready_test_user_${Date.now()}`,
          displayName: 'Ready User',
          passwordHash: 'dummy_hash',
          role: 'ADMIN',
          isActive: true,
        },
      });
      await systemPrisma.installationUser.create({
        data: {
          installationId: installId,
          userId: user.id,
        },
      });

      // 1. Missing database registry
      await expect(
        installationService.updateLifecycleState('READY', { enforceInvariants: true })
      ).rejects.toThrow(/No active database is registered/i);

      // 2. Database registered to non-existent file
      const nonExistentPath = path.resolve(getDatabasesDir(), `missing_${Date.now()}.db`);
      const fakeReg = await systemPrisma.databaseRegistry.create({
        data: {
          databaseId: 'test-fake-db',
          displayName: 'Fake DB',
          canonicalPath: nonExistentPath,
          status: 'ACTIVE',
          databaseType: 'EXTERNAL',
          installationId: installId,
        },
      });

      await expect(
        installationService.updateLifecycleState('READY', { enforceInvariants: true })
      ).rejects.toThrow(/Physical database file is missing/i);

      // Clean up fake registry and user
      await systemPrisma.databaseRegistry.delete({ where: { id: fakeReg.id } });
      await systemPrisma.installationUser.deleteMany({ where: { installationId: installId } });
      await systemPrisma.user.delete({ where: { id: user.id } });
    });
  });

  // ── 3. Direct Out-of-Order API Call Protection ───────────────────────────
  describe('3. Direct Out-of-Order API Call Protection', () => {
    it('forbids creating user when at APP_SETUP', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'APP_SETUP' },
      });

      const res = await callController(onboardingController.createUser, {
        body: { username: 'early_user', password: 'Password123456!', displayName: 'Early' },
      });
      expect(res.nextError).toBeInstanceOf(AuthorizationError);
      expect(res.nextError.message).toContain('forbidden at lifecycle state APP_SETUP');
    });

    it('forbids creating database when at USER_DISCOVERY', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'USER_DISCOVERY' },
      });

      const res = await callController(onboardingController.createDatabase, {
        body: { displayName: 'EarlyDB' },
      });
      expect(res.nextError).toBeInstanceOf(AuthorizationError);
      expect(res.nextError.message).toContain('forbidden at lifecycle state USER_DISCOVERY');
    });

    it('forbids calling completeOnboarding when at DATABASE_DISCOVERY', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DATABASE_DISCOVERY' },
      });

      const res = await callController(onboardingController.completeOnboarding);
      expect(res.nextError).toBeInstanceOf(AuthorizationError);
      expect(res.nextError.message).toContain('forbidden at lifecycle state DATABASE_DISCOVERY');
    });

    it('forbids attaching database without explicit confirmAttachment = true', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DATABASE_DISCOVERY' },
      });

      const res = await callController(onboardingController.attachDatabase, {
        body: { path: 'C:\\test.db', confirmAttachment: false },
      });
      expect(res.nextError).toBeInstanceOf(ValidationError);
      expect(res.nextError.message).toContain('Explicit confirmation is required');
    });
  });

  // ── 4. Concurrency Safety & Race Condition Protection ─────────────────────
  describe('4. Concurrency Safety & Race Condition Protection', () => {
    it('prevents race conditions when two concurrent requests attempt the same transition', async () => {
      // Set to PIN_SETUP with valid PIN configured
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'PIN_SETUP' },
      });
      await systemPrisma.deviceSecurity.create({
        data: {
          deviceId: localDeviceId,
          pinHash: 'dummy_hash',
        },
      });

      // Fire two simultaneous transitions to DEVICE_SETUP
      const [resA, resB] = await Promise.all([
        installationService.updateLifecycleState('DEVICE_SETUP'),
        installationService.updateLifecycleState('DEVICE_SETUP'),
      ]);

      // Both must succeed safely without throwing unhandled errors
      expect(resA.lifecycleState).toBe('DEVICE_SETUP');
      expect(resB.lifecycleState).toBe('DEVICE_SETUP');

      // Verify the database state is cleanly DEVICE_SETUP
      const current = await systemPrisma.installation.findUnique({ where: { id: installId } });
      expect(current?.lifecycleState).toBe('DEVICE_SETUP');
    });
  });

  // ── 5. Full Resume Verification Across All Stages ─────────────────────────
  describe('5. Full Resume Verification Across All Stages', () => {
    const STAGES: LifecycleState[] = [
      'NOT_INITIALIZED',
      'APP_SETUP',
      'PIN_SETUP',
      'DEVICE_SETUP',
      'USER_DISCOVERY',
      'DATABASE_DISCOVERY',
      'DATABASE_VALIDATION',
      'DATABASE_SETUP',
      'READY',
    ];

    for (const stage of STAGES) {
      it(`resumes correctly from "${stage}" after simulated process restart`, async () => {
        await systemPrisma.installation.update({
          where: { id: installId },
          data: { lifecycleState: stage },
        });

        // Query status (simulating frontend startup probe on new application run)
        const status = await onboardingService.getOnboardingState();
        expect(status.lifecycleState).toBe(stage);
        expect(status.currentStep).toBe(stage);

        if (stage === 'NOT_INITIALIZED') {
          expect(status.installationInitialized).toBe(false);
        } else {
          expect(status.installationInitialized).toBe(true);
        }
      });
    }
  });
});
