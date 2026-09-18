import { describe, it, expect, beforeEach } from 'vitest';
import { systemPrisma } from '../infrastructure/database/prisma';
import { securityService } from '../modules/security/security.service';
import { deviceSecurityService } from '../modules/security/device-security.service';
import { securityController } from '../modules/security/security.controller';
import { installationService } from '../modules/system/installation.service';
import { authService } from '../modules/auth/auth.service';
import { authenticate } from '../middleware/auth';
import {
  ValidationError,
  AuthorizationError,
  ConflictError,
} from '../errors';

describe('Phase 3 Remediation: Authoritative Security Boundary & Attack Regression Suite', () => {
  let localDeviceId: string;
  let foreignDeviceId: string;
  let anotherLocalDeviceId: string;

  beforeEach(async () => {
    // 1. Ensure current installation
    const install = await installationService.getOrCreateInstallation();
    localDeviceId = installationService.getOrGenerateDeviceId();

    // Ensure local device is registered and active
    await systemPrisma.device.upsert({
      where: { deviceId: localDeviceId },
      update: { status: 'ACTIVE', revokedAt: null, installationId: install.id },
      create: {
        deviceId: localDeviceId,
        installationId: install.id,
        deviceName: 'Local-Authoritative-Terminal',
        platform: 'WINDOWS',
        status: 'ACTIVE',
      },
    });

    // Clean device security state for local device
    await systemPrisma.deviceSecurity.deleteMany({
      where: { deviceId: localDeviceId },
    });

    // 2. Set up another valid device under the SAME installation
    anotherLocalDeviceId = `dev-sibling-${Date.now()}`;
    await systemPrisma.device.create({
      data: {
        deviceId: anotherLocalDeviceId,
        installationId: install.id,
        deviceName: 'Sibling-Terminal',
        platform: 'WINDOWS',
        status: 'ACTIVE',
      },
    });

    // 3. Set up a foreign installation and a device belonging to IT
    const foreignInstall = await systemPrisma.installation.create({
      data: {
        installationId: `foreign-install-${Date.now()}`,
        appVersion: '3.0.0',
        status: 'ACTIVE',
        lifecycleState: 'READY',
      },
    });
    foreignDeviceId = `foreign-dev-${Date.now()}`;
    await systemPrisma.device.create({
      data: {
        deviceId: foreignDeviceId,
        installationId: foreignInstall.id,
        deviceName: 'Foreign-Terminal',
        platform: 'WINDOWS',
        status: 'ACTIVE',
      },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 48: 10 EXPLICIT ATTACK TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 48: Ten Authoritative Security Attack Scenarios', () => {
    it('Attack 1: User sends another valid device ID from the same installation -> REJECTED', async () => {
      // Local node should only operate on its authoritative local device
      // Passing another sibling deviceId must be rejected with ValidationError
      expect(() => {
        securityService.resolveAuthoritativeDeviceId(anotherLocalDeviceId);
      }).toThrow(ValidationError);

      await expect(
        securityService.getStatus(anotherLocalDeviceId)
      ).rejects.toThrow(ValidationError);

      await expect(
        securityService.setupPin('849201', anotherLocalDeviceId)
      ).rejects.toThrow(ValidationError);
    });

    it('Attack 2: User sends a device ID from another installation -> REJECTED', async () => {
      // Direct service or client resolution passing foreign device must fail
      expect(() => {
        securityService.resolveAuthoritativeDeviceId(foreignDeviceId);
      }).toThrow(ValidationError);

      // Low-level device security service cross-installation enforcement check
      await expect(
        deviceSecurityService.getOrCreateDeviceSecurity(foreignDeviceId)
      ).rejects.toThrow(AuthorizationError);

      await expect(
        deviceSecurityService.setupPin(foreignDeviceId, '849201')
      ).rejects.toThrow(AuthorizationError);
    });

    it('Attack 3: User calls PIN change without authentication after READY -> REJECTED', async () => {
      // Configure initial PIN first
      await deviceSecurityService.setupPin(localDeviceId, '849201');

      // Advance lifecycle to READY
      const install = await installationService.getOrCreateInstallation();
      await systemPrisma.installation.update({
        where: { id: install.id },
        data: { lifecycleState: 'READY' },
      });

      // Mock unauthenticated request without Authorization header
      const req: any = {
        body: {
          currentPin: '849201',
          newPin: '930182',
        },
        headers: {},
      };
      const res: any = {
        status: () => res,
        json: () => res,
      };
      let errorThrown: any = null;
      const next = (err?: any) => {
        if (err) errorThrown = err;
      };

      await securityController.changePin(req, res, next);

      expect(errorThrown).toBeDefined();
      expect(errorThrown).toBeInstanceOf(AuthorizationError);
      expect(errorThrown.message).toContain('active authenticated session');
    });

    it('Attack 4: User calls lock on another device -> REJECTED', async () => {
      // Calling lock on a different device must be rejected by authoritative resolution
      await expect(
        securityService.lock(anotherLocalDeviceId)
      ).rejects.toThrow(ValidationError);

      await expect(
        securityService.lock(foreignDeviceId)
      ).rejects.toThrow(ValidationError);
    });

    it('Attack 5: User calls unlock on another device -> REJECTED', async () => {
      // Calling unlock on a different device must be rejected by authoritative resolution
      await expect(
        securityService.unlock('849201', anotherLocalDeviceId)
      ).rejects.toThrow(ValidationError);

      await expect(
        securityService.unlock('849201', foreignDeviceId)
      ).rejects.toThrow(ValidationError);
    });

    it('Attack 6: Revoked device attempts authentication -> REJECTED', async () => {
      await deviceSecurityService.setupPin(localDeviceId, '849201');

      // Administratively revoke the device
      await installationService.revokeDevice(localDeviceId, 'Compromised hardware');

      // Attempting to verify PIN on revoked device must fail with AuthorizationError
      await expect(
        deviceSecurityService.verifyPin(localDeviceId, '849201')
      ).rejects.toThrow(AuthorizationError);

      // Attempting to unlock on revoked device must fail with AuthorizationError
      await expect(
        deviceSecurityService.unlockApplication(localDeviceId, '849201')
      ).rejects.toThrow(AuthorizationError);
    });

    it('Attack 7: Old session after PIN change -> REJECTED', async () => {
      const originalPin = '519284';
      await deviceSecurityService.setupPin(localDeviceId, originalPin);

      // Create a user and log in, binding the session to localDeviceId
      const username = `session-user-${Date.now()}`;
      await authService.createUser(username, 'Password123!', 'Session Test User', 'ADMIN');
      const login = await authService.login(username, 'Password123!', { deviceId: localDeviceId });

      // Verify token works before PIN change
      let authStatus: number | null = null;
      let authError: string | null = null;
      const mockReqBefore: any = {
        headers: { authorization: `Bearer ${login.token}` },
        socket: {},
      };
      const mockResBefore: any = {
        status: (code: number) => {
          authStatus = code;
          return {
            json: (payload: any) => {
              authError = payload.error;
            },
          };
        },
      };

      await authenticate(mockReqBefore, mockResBefore, () => {});
      expect(authStatus).toBeNull(); // 200 / Next() called

      // Now change PIN on the device
      await deviceSecurityService.changePin(localDeviceId, originalPin, '839201');

      // Verify the OLD session token is now rejected with 401
      const mockReqAfter: any = {
        headers: { authorization: `Bearer ${login.token}` },
        socket: {},
      };
      const mockResAfter: any = {
        status: (code: number) => {
          authStatus = code;
          return {
            json: (payload: any) => {
              authError = payload.error;
            },
          };
        },
      };

      await authenticate(mockReqAfter, mockResAfter, () => {});
      expect(authStatus).toBe(401);
      expect(authError).toContain('revoked');
    });

    it('Attack 8: Old session after device revocation -> REJECTED', async () => {
      await deviceSecurityService.setupPin(localDeviceId, '849201');

      // Create user and log in bound to device
      const username = `rev-user-${Date.now()}`;
      await authService.createUser(username, 'Password123!', 'Rev Test User', 'ADMIN');
      const login = await authService.login(username, 'Password123!', { deviceId: localDeviceId });

      // Revoke the device
      await installationService.revokeDevice(localDeviceId, 'Audit termination');

      // The active session must be rejected with 401
      let authStatus: number | null = null;
      let authError: string | null = null;
      const mockReq: any = {
        headers: { authorization: `Bearer ${login.token}` },
        socket: {},
      };
      const mockRes: any = {
        status: (code: number) => {
          authStatus = code;
          return {
            json: (payload: any) => {
              authError = payload.error;
            },
          };
        },
      };

      await authenticate(mockReq, mockRes, () => {});
      expect(authStatus).toBe(401);
      expect(authError).toBeDefined();
    });

    it('Attack 9: Old revoked session after device reactivation -> REJECTED', async () => {
      await deviceSecurityService.setupPin(localDeviceId, '849201');

      // Create user and log in
      const username = `react-user-${Date.now()}`;
      await authService.createUser(username, 'Password123!', 'Reactivate Test User', 'ADMIN');
      const login = await authService.login(username, 'Password123!', { deviceId: localDeviceId });

      // Revoke device (invalidates sessions)
      await installationService.revokeDevice(localDeviceId, 'Temporary lock');

      // Reactivate device (restores active device, but must NOT resurrect old sessions)
      await installationService.reactivateDevice(localDeviceId);

      // Verify the old session from before revocation is STILL REJECTED
      let authStatus: number | null = null;
      let authError: string | null = null;
      const mockReq: any = {
        headers: { authorization: `Bearer ${login.token}` },
        socket: {},
      };
      const mockRes: any = {
        status: (code: number) => {
          authStatus = code;
          return {
            json: (payload: any) => {
              authError = payload.error;
            },
          };
        },
      };

      await authenticate(mockReq, mockRes, () => {});
      expect(authStatus).toBe(401);
      expect(authError).toContain('revoked');
    });

    it('Attack 10: Correct PIN during active authentication lockout -> REJECTED', async () => {
      const validPin = '719284';
      const wrongPin = '111222';
      await deviceSecurityService.setupPin(localDeviceId, validPin);

      // Trigger lockout with 5 failed attempts
      for (let i = 0; i < 4; i++) {
        await deviceSecurityService.verifyPin(localDeviceId, wrongPin);
      }
      const fifthAttempt = await deviceSecurityService.verifyPin(localDeviceId, wrongPin);
      expect(fifthAttempt.isLocked).toBe(true);
      expect(fifthAttempt.authenticationLockedUntil).toBeDefined();

      // Submit CORRECT PIN during active lockout window
      const attackRes = await deviceSecurityService.verifyPin(localDeviceId, validPin);

      // Must be rejected!
      expect(attackRes.success).toBe(false);
      expect(attackRes.failedAttemptsRemaining).toBe(0);
      expect(attackRes.authenticationLockedUntil).toBeDefined();
      expect(attackRes.message).toContain('locked out');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 49: DECOUPLED LOCK-STATE MATRIX TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 49: Lock-State Matrix & Predictable Semantics', () => {
    it('State A: applicationLocked = true, authenticationLockedUntil = null (Workstation locked, no lockout)', async () => {
      await deviceSecurityService.setupPin(localDeviceId, '849201');

      // Lock workstation
      const lockRes = await deviceSecurityService.lockApplication(localDeviceId);
      expect(lockRes.applicationLocked).toBe(true);
      expect(lockRes.authenticationLockedUntil).toBeNull();
      expect(lockRes.isLocked).toBe(true); // Compatibility alias

      const status = await deviceSecurityService.getSecurityStatus(localDeviceId);
      expect(status.applicationLocked).toBe(true);
      expect(status.authenticationLockedUntil).toBeNull();
      expect(status.isLocked).toBe(true);
    });

    it('State B: applicationLocked = false, authenticationLockedUntil = future (Workstation unlocked, auth locked out)', async () => {
      await deviceSecurityService.setupPin(localDeviceId, '849201');

      // Trigger 5 wrong attempts without locking workstation
      for (let i = 0; i < 5; i++) {
        await deviceSecurityService.verifyPin(localDeviceId, '999888');
      }

      const status = await deviceSecurityService.getSecurityStatus(localDeviceId);
      expect(status.applicationLocked).toBe(false); // Workstation itself is not locked
      expect(status.authenticationLockedUntil).toBeDefined();
      expect(status.authenticationLockedUntil).not.toBeNull();
      expect(status.isLocked).toBe(true); // Backward-compatible alias reports true during lockout
    });

    it('State C: applicationLocked = true, authenticationLockedUntil = future (Workstation locked AND auth locked out)', async () => {
      await deviceSecurityService.setupPin(localDeviceId, '849201');

      // First lock workstation
      await deviceSecurityService.lockApplication(localDeviceId);

      // Now fail PIN verification 5 times on the lock screen
      for (let i = 0; i < 5; i++) {
        await deviceSecurityService.verifyPin(localDeviceId, '999888');
      }

      const status = await deviceSecurityService.getSecurityStatus(localDeviceId);
      expect(status.applicationLocked).toBe(true);
      expect(status.authenticationLockedUntil).toBeDefined();
      expect(status.authenticationLockedUntil).not.toBeNull();
    });

    it('State D: Lockout expires -> correct PIN unlocks workstation', async () => {
      const pin = '849201';
      await deviceSecurityService.setupPin(localDeviceId, pin);

      // Workstation is locked
      await deviceSecurityService.lockApplication(localDeviceId);

      // Simulate expired lockout in database
      const past = new Date(Date.now() - 2000);
      await systemPrisma.deviceSecurity.update({
        where: { deviceId: localDeviceId },
        data: {
          failedAttempts: 5,
          lockedUntil: past,
        },
      });

      // Correct PIN now succeeds and unlocks application
      const unlockRes = await deviceSecurityService.unlockApplication(localDeviceId, pin);
      expect(unlockRes.applicationLocked).toBe(false);
      expect(unlockRes.authenticationLockedUntil).toBeNull();
      expect(unlockRes.isLocked).toBe(false);

      const status = await deviceSecurityService.getSecurityStatus(localDeviceId);
      expect(status.applicationLocked).toBe(false);
      expect(status.authenticationLockedUntil).toBeNull();
      expect(status.isLocked).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 50: CONCURRENCY TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 50: Concurrency & State Invariance', () => {
    it('handles 2 simultaneous PIN setup requests with exactly 1 success and 1 conflict', async () => {
      const devId = `concurrent-setup-${Date.now()}`;
      const install = await installationService.getOrCreateInstallation();
      await systemPrisma.device.create({
        data: {
          deviceId: devId,
          installationId: install.id,
          deviceName: 'Concurrent-Setup-Terminal',
          platform: 'WINDOWS',
          status: 'ACTIVE',
        },
      });

      const results = await Promise.allSettled([
        deviceSecurityService.setupPin(devId, '839201'),
        deviceSecurityService.setupPin(devId, '749102'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    });

    it('handles 10 concurrent wrong PIN attempts without counter or lockout corruption', async () => {
      const devId = `concurrent-fail-${Date.now()}`;
      const install = await installationService.getOrCreateInstallation();
      await systemPrisma.device.create({
        data: {
          deviceId: devId,
          installationId: install.id,
          deviceName: 'Concurrent-Fail-Terminal',
          platform: 'WINDOWS',
          status: 'ACTIVE',
        },
      });
      await deviceSecurityService.setupPin(devId, '839201');

      // Fire 10 simultaneous incorrect attempts
      const attempts = Array.from({ length: 10 }).map(() =>
        deviceSecurityService.verifyPin(devId, '123456')
      );

      await Promise.all(attempts);

      const status = await deviceSecurityService.getSecurityStatus(devId);
      expect(status.failedAttempts).toBeGreaterThanOrEqual(5);
      expect(status.authenticationLockedUntil).toBeDefined();
      expect(status.failedAttemptsRemaining).toBe(0);
    });

    it('handles 2 simultaneous PIN changes without corrupted PIN state', async () => {
      const devId = `concurrent-change-${Date.now()}`;
      const install = await installationService.getOrCreateInstallation();
      await systemPrisma.device.create({
        data: {
          deviceId: devId,
          installationId: install.id,
          deviceName: 'Concurrent-Change-Terminal',
          platform: 'WINDOWS',
          status: 'ACTIVE',
        },
      });
      const initialPin = '839201';
      await deviceSecurityService.setupPin(devId, initialPin);

      // Attempt 2 concurrent PIN changes using initialPin
      const results = await Promise.allSettled([
        deviceSecurityService.changePin(devId, initialPin, '192834'),
        deviceSecurityService.changePin(devId, initialPin, '583920'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // Device PIN must be one of the new valid PINs and must verify cleanly
      const verify1 = await deviceSecurityService.verifyPin(devId, '192834');
      const verify2 = await deviceSecurityService.verifyPin(devId, '583920');

      // Exactly one new PIN must be active
      expect(verify1.success !== verify2.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 51: ZERO SECRET LEAKAGE VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 51: Strict Zero Secret Leakage Verification', () => {
    it('verifies PIN plaintext, hash, and secrets are never present in status DTO or audit metadata', async () => {
      const pin = '948201';
      await deviceSecurityService.setupPin(localDeviceId, pin);

      // 1. Status DTO inspection
      const status = await securityService.getStatus();
      const statusJson = JSON.stringify(status);
      expect(statusJson).not.toContain(pin);
      expect(statusJson).not.toContain('pinHash');
      expect((status as any).pinHash).toBeUndefined();
      expect((status as any).pin).toBeUndefined();

      // 2. Perform security actions: failure, change, lock
      await deviceSecurityService.verifyPin(localDeviceId, '111222');
      await deviceSecurityService.changePin(localDeviceId, pin, '839204');
      await deviceSecurityService.lockApplication(localDeviceId);

      // 3. Inspect all AuditEvent rows for this device
      const auditEvents = await systemPrisma.auditEvent.findMany({
        where: { entityId: localDeviceId },
      });
      expect(auditEvents.length).toBeGreaterThan(0);

      for (const event of auditEvents) {
        expect(event.description).not.toContain(pin);
        expect(event.description).not.toContain('839204');
        if (event.metadata) {
          expect(event.metadata).not.toContain(pin);
          expect(event.metadata).not.toContain('839204');
          expect(event.metadata).not.toContain('pinHash');
          expect(event.metadata).not.toContain('password');
          expect(event.metadata).not.toContain('secret');
        }
      }
    });

    it('rejects changing PIN to the identical existing PIN (Same-PIN reuse prevention)', async () => {
      const pin = '948201';
      await deviceSecurityService.setupPin(localDeviceId, pin);

      await expect(
        deviceSecurityService.changePin(localDeviceId, pin, pin)
      ).rejects.toThrow(ValidationError);
    });
  });
});
