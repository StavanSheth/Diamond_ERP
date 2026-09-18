import { describe, it, expect, beforeEach } from 'vitest';
import { systemPrisma } from '../infrastructure/database/prisma';
import { installationService } from '../modules/system/installation.service';
import { onboardingController } from '../modules/system/onboarding/onboarding.controller';
import { authService } from '../modules/auth/auth.service';
import { AuthorizationError, AuthenticationError } from '../errors';

describe('Diamond ERP V3 — Phase 4: Bootstrap Security Matrix & Boundary Hardening', () => {
  let installId: string;
  let localDeviceId: string;

  beforeEach(async () => {
    const install = await installationService.getOrCreateInstallation();
    installId = install.id;
    localDeviceId = installationService.getOrGenerateDeviceId();

    // Ensure local device is registered and ACTIVE
    await systemPrisma.device.upsert({
      where: { deviceId: localDeviceId },
      update: { status: 'ACTIVE', revokedAt: null, installationId: install.id },
      create: {
        deviceId: localDeviceId,
        installationId: install.id,
        deviceName: 'Security-Test-Terminal',
        platform: 'WINDOWS',
        status: 'ACTIVE',
      },
    });

    // Reset installation to NOT_INITIALIZED
    await systemPrisma.installation.update({
      where: { id: installId },
      data: { lifecycleState: 'NOT_INITIALIZED', status: 'ACTIVE' },
    });
  });

  // ── Helper to invoke controller with mock Express req/res ───────────────
  const callController = async (handler: any, reqPartial: any = {}) => {
    let statusCode = 200;
    let jsonResult: any = null;
    let nextError: any = null;

    const mockReq: any = {
      headers: {},
      body: {},
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

  // ── 1. Bootstrap State-Based Access Matrix ──────────────────────────────
  describe('1. Pre-READY Bootstrap State-Based Matrix', () => {
    it('allows only status and initializeApp when in NOT_INITIALIZED state', async () => {
      // 1. Status is allowed
      const statusRes = await callController(onboardingController.getOnboardingStatus);
      expect(statusRes.statusCode).toBe(200);
      expect(statusRes.jsonResult.success).toBe(true);

      // 2. Initialize app is allowed
      const initRes = await callController(onboardingController.initializeApp);
      expect(initRes.statusCode).toBe(200);

      // Reset back to NOT_INITIALIZED to test forbidden mutations
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'NOT_INITIALIZED' },
      });

      // 3. User creation is forbidden at NOT_INITIALIZED
      const userRes = await callController(onboardingController.createUser, {
        body: { username: 'testuser', password: 'Password123456!', displayName: 'Test' },
      });
      expect(userRes.nextError).toBeInstanceOf(AuthorizationError);
      expect(userRes.nextError.message).toContain('forbidden at lifecycle state NOT_INITIALIZED');

      // 4. DB creation is forbidden at NOT_INITIALIZED
      const dbRes = await callController(onboardingController.createDatabase, {
        body: { displayName: 'NewDB' },
      });
      expect(dbRes.nextError).toBeInstanceOf(AuthorizationError);

      // 5. Complete onboarding is forbidden at NOT_INITIALIZED
      const compRes = await callController(onboardingController.completeOnboarding);
      expect(compRes.nextError).toBeInstanceOf(AuthorizationError);
    });

    it('allows user discovery/selection in USER_DISCOVERY, but forbids database operations', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'USER_DISCOVERY' },
      });

      // User discovery allowed
      const usersRes = await callController(onboardingController.discoverUsers);
      expect(usersRes.statusCode).toBe(200);
      expect(usersRes.jsonResult.success).toBe(true);

      // Database operations forbidden
      const dbRes = await callController(onboardingController.createDatabase, {
        body: { displayName: 'PrematureDB' },
      });
      expect(dbRes.nextError).toBeInstanceOf(AuthorizationError);
      expect(dbRes.nextError.message).toContain('forbidden at lifecycle state USER_DISCOVERY');

      const attachRes = await callController(onboardingController.attachDatabase, {
        body: { path: 'C:\\test.db', confirmAttachment: true },
      });
      expect(attachRes.nextError).toBeInstanceOf(AuthorizationError);
    });

    it('allows database operations in DATABASE_VALIDATION and DATABASE_SETUP', async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'DATABASE_SETUP' },
      });

      // Discover databases allowed
      const dbsRes = await callController(onboardingController.discoverDatabases);
      expect(dbsRes.statusCode).toBe(200);

      // Inspect allowed
      const inspRes = await callController(onboardingController.inspectDatabase, {
        body: { path: 'nonexistent.db' },
      });
      expect(inspRes.statusCode).toBe(200);
    });
  });

  // ── 2. Post-READY Production Security Boundary ──────────────────────────
  describe('2. Post-READY Production Boundary', () => {
    beforeEach(async () => {
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'READY' },
      });
    });

    it('allows anonymous read of onboarding status when READY', async () => {
      const res = await callController(onboardingController.getOnboardingStatus);
      expect(res.statusCode).toBe(200);
      expect(res.jsonResult.success).toBe(true);
      expect(res.jsonResult.data.lifecycleState).toBe('READY');
    });

    it('rejects mutations with AuthenticationError (401) when anonymous in READY state', async () => {
      const res = await callController(onboardingController.createDatabase, {
        body: { displayName: 'UnauthDB' },
      });
      expect(res.nextError).toBeInstanceOf(AuthenticationError);
      expect(res.nextError.message).toContain('Authentication required');
    });

    it('rejects mutations with AuthorizationError (403) when user has VIEWER role in READY state', async () => {
      const viewer = await authService.createUser(
        `viewer_${Date.now()}`,
        'Password123456!',
        'Viewer User',
        'VIEWER'
      );
      const token = authService.generateToken({
        userId: viewer.id,
        username: viewer.username,
        role: viewer.role,
        tokenVersion: 1,
      });

      const res = await callController(onboardingController.createDatabase, {
        headers: { authorization: `Bearer ${token}` },
        body: { displayName: 'ViewerDB' },
      });

      expect(res.nextError).toBeInstanceOf(AuthorizationError);
      expect(res.nextError.message).toContain('requires ADMIN role');
    });

    it('allows mutations when authenticated as active ADMIN in READY state', async () => {
      const admin = await authService.createUser(
        `admin_${Date.now()}`,
        'Password123456!',
        'Admin User',
        'ADMIN'
      );
      const token = authService.generateToken({
        userId: admin.id,
        username: admin.username,
        role: admin.role,
        tokenVersion: 1,
      });

      // Attempt inspection (authorized, then schema validation handles body)
      const res = await callController(onboardingController.inspectDatabase, {
        headers: { authorization: `Bearer ${token}` },
        body: { path: 'test_candidate.db' },
      });

      expect(res.nextError).toBeNull();
      expect(res.statusCode).toBe(200);
    });

    it('rejects any mutation if the local device is REVOKED', async () => {
      // Revoke the device
      await systemPrisma.device.update({
        where: { deviceId: localDeviceId },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });

      const admin = await authService.createUser(
        `revadmin_${Date.now()}`,
        'Password123456!',
        'Revoked Admin',
        'ADMIN'
      );
      const token = authService.generateToken({
        userId: admin.id,
        username: admin.username,
        role: admin.role,
        tokenVersion: 1,
      });

      const res = await callController(onboardingController.createDatabase, {
        headers: { authorization: `Bearer ${token}` },
        body: { displayName: 'RevokedDB' },
      });

      expect(res.nextError).toBeInstanceOf(AuthorizationError);
      expect(res.nextError.message).toContain('is REVOKED and cannot perform onboarding');
    });

    it('strictly forbids special-case privilege bypass for default-admin without valid token', async () => {
      const res = await callController(onboardingController.createDatabase, {
        body: { displayName: 'HackerDB' },
        user: { id: 'default-admin' }, // Old bypass attempt
      });

      // Must be rejected because default-admin does not exist in Control DB as an active ADMIN user
      expect(res.nextError).toBeInstanceOf(AuthorizationError);
    });
  });

  // ── 3. Zero Secret Leakage Verification ──────────────────────────────────
  describe('3. Zero Secret Leakage Across All Onboarding DTOs', () => {
    it('ensures no passwordHash, pinHash, or secret tokens are present in any response', async () => {
      // 1. Status DTO
      const statusRes = await callController(onboardingController.getOnboardingStatus);
      const statusStr = JSON.stringify(statusRes.jsonResult);
      expect(statusStr).not.toContain('pinHash');
      expect(statusStr).not.toContain('passwordHash');
      expect(statusStr).not.toContain('tokenVersion');

      // 2. Discover Users DTO
      await systemPrisma.installation.update({
        where: { id: installId },
        data: { lifecycleState: 'USER_DISCOVERY' },
      });
      const usersRes = await callController(onboardingController.discoverUsers);
      const usersStr = JSON.stringify(usersRes.jsonResult);
      expect(usersStr).not.toContain('pinHash');
      expect(usersStr).not.toContain('passwordHash');
      expect(usersStr).not.toContain('tokenVersion');
      expect(usersStr).not.toContain('password');

      // 3. User Creation DTO
      const createRes = await callController(onboardingController.createUser, {
        body: {
          username: `safeuser_${Date.now()}`,
          password: 'Password123456!',
          displayName: 'Safe User',
        },
      });
      const createStr = JSON.stringify(createRes.jsonResult);
      expect(createStr).not.toContain('passwordHash');
      expect(createStr).not.toContain('pinHash');
      expect(createStr).not.toContain('token');
    });
  });
});
