import { describe, it, expect, beforeEach } from 'vitest';
import { systemPrisma } from '../infrastructure/database/prisma';
import { deviceSecurityService } from '../modules/security/device-security.service';
import { installationService } from '../modules/system/installation.service';
import { authService } from '../modules/auth/auth.service';
import { AuthorizationError, AuthenticationError } from '../errors';

describe('Phase 3: Device Binding, Lock State & Security Lifecycle', () => {
  let testDeviceId: string;

  beforeEach(async () => {
    await installationService.getOrCreateInstallation();
    testDeviceId = installationService.getOrGenerateDeviceId();
    await systemPrisma.device.updateMany({
      where: { deviceId: testDeviceId },
      data: { status: 'ACTIVE', revokedAt: null },
    });
    await installationService.registerDevice({
      deviceName: 'Lock-Test-Terminal',
      platform: 'WINDOWS',
    });
    // Clean device security state
    await systemPrisma.deviceSecurity.deleteMany({
      where: { deviceId: testDeviceId },
    });
  });

  describe('1. Device Binding & Revocation State', () => {
    it('binds device security record and returns clean non-secret status', async () => {
      const status = await deviceSecurityService.getSecurityStatus(testDeviceId);
      expect(status.deviceId).toBe(testDeviceId);
      expect(status.isDeviceBound).toBe(true);
      expect(status.deviceStatus).toBe('ACTIVE');
      expect(status.isPinConfigured).toBe(false);
      expect(status.isLocked).toBe(false);
      expect((status as any).pinHash).toBeUndefined(); // Invariant: no hash leakage
    });

    it('blocks PIN setup and PIN verification on a REVOKED device', async () => {
      // Revoke the device
      await installationService.revokeDevice(testDeviceId, 'Compromised workstation terminal');

      // Attempting to setup PIN must fail
      await expect(
        deviceSecurityService.setupPin(testDeviceId, '849201')
      ).rejects.toThrow(AuthorizationError);

      // Attempting to verify PIN must fail
      await expect(
        deviceSecurityService.verifyPin(testDeviceId, '849201')
      ).rejects.toThrow(AuthorizationError);
    });

    it('allows authentication after an authorized administrative reactivation', async () => {
      // Setup PIN while active
      await deviceSecurityService.setupPin(testDeviceId, '849201');

      // Revoke device
      await installationService.revokeDevice(testDeviceId, 'Audit pause');

      // Rejected during revocation
      await expect(
        deviceSecurityService.verifyPin(testDeviceId, '849201')
      ).rejects.toThrow(AuthorizationError);

      // Reactivate device
      await installationService.reactivateDevice(testDeviceId);

      // Successfully authenticates
      const res = await deviceSecurityService.verifyPin(testDeviceId, '849201');
      expect(res.success).toBe(true);
    });
  });

  describe('2. Application Lock State (Screen Shield / Idle Lock)', () => {
    beforeEach(async () => {
      await deviceSecurityService.setupPin(testDeviceId, '719302');
    });

    it('locks application explicitly and requires valid PIN to unlock', async () => {
      // Lock workstation
      const lockRes = await deviceSecurityService.lockApplication(testDeviceId);
      expect(lockRes.isLocked).toBe(true);

      const statusAfterLock = await deviceSecurityService.getSecurityStatus(testDeviceId);
      expect(statusAfterLock.isLocked).toBe(true);

      // Unlock with incorrect PIN fails
      await expect(
        deviceSecurityService.unlockApplication(testDeviceId, '999111')
      ).rejects.toThrow(AuthenticationError);

      // Application remains locked
      const stillLocked = await deviceSecurityService.getSecurityStatus(testDeviceId);
      expect(stillLocked.isLocked).toBe(true);

      // Unlock with correct PIN succeeds
      const unlockRes = await deviceSecurityService.unlockApplication(testDeviceId, '719302');
      expect(unlockRes.isLocked).toBe(false);

      const statusAfterUnlock = await deviceSecurityService.getSecurityStatus(testDeviceId);
      expect(statusAfterUnlock.isLocked).toBe(false);
    });
  });

  describe('3. Session Association & Invalidation on Security Changes', () => {
    it('associates deviceId with business session and revokes device sessions on PIN change', async () => {
      const pin = '629481';
      await deviceSecurityService.setupPin(testDeviceId, pin);

      // Create a test user
      const username = `sec-user-${Date.now()}`;
      const password = 'TestSecurePassword123!';
      const user = await authService.createUser(
        username,
        password,
        'Security Test User',
        'ADMIN'
      );

      // User logs in on this device
      const loginRes = await authService.login(username, password, {
        deviceId: testDeviceId,
      });
      expect(loginRes.token).toBeDefined();

      // Find session in DB and verify deviceId was linked
      const session = await systemPrisma.session.findFirst({
        where: { userId: user.id, deviceId: testDeviceId },
      });
      expect(session).toBeDefined();
      expect(session?.deviceId).toBe(testDeviceId);
      expect(session?.revokedAt).toBeNull();

      // Now change PIN on the device
      await deviceSecurityService.changePin(testDeviceId, pin, '930184');

      // Verify that existing session on this device was revoked
      const updatedSession = await systemPrisma.session.findUnique({
        where: { id: session!.id },
      });
      expect(updatedSession?.revokedAt).toBeDefined();
    });
  });
});
