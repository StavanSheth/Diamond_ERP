import { describe, it, expect, beforeEach } from 'vitest';
import { systemPrisma } from '../infrastructure/database/prisma';
import { pinService } from '../modules/security/pin.service';
import { deviceSecurityService } from '../modules/security/device-security.service';
import { installationService } from '../modules/system/installation.service';
import { ConflictError, AuthenticationError, ValidationError } from '../errors';

describe('Phase 3: PIN Security Service & Cryptographic Verification', () => {
  let testDeviceId: string;

  beforeEach(async () => {
    // Ensure installation exists
    await installationService.getOrCreateInstallation();

    // Use authoritative local device ID
    testDeviceId = installationService.getOrGenerateDeviceId();
    
    // Ensure device is registered
    await installationService.registerDevice({
      deviceName: 'PIN-Test-Terminal',
      platform: 'WINDOWS',
    });

    // Clean device security state for a fresh test
    await systemPrisma.deviceSecurity.deleteMany({
      where: { deviceId: testDeviceId },
    });
  });

  describe('A. PIN Policy Validation', () => {
    it('accepts a valid 6-digit non-trivial numeric PIN', () => {
      const res = pinService.validatePin('849201');
      expect(res.valid).toBe(true);
      expect(res.reason).toBeUndefined();
    });

    it('rejects empty or non-string input', () => {
      expect(pinService.validatePin('').valid).toBe(false);
      expect(pinService.validatePin(null).valid).toBe(false);
      expect(pinService.validatePin(undefined).valid).toBe(false);
      expect(pinService.validatePin(123456 as any).valid).toBe(false);
    });

    it('rejects whitespace and padded inputs without silent trimming', () => {
      expect(pinService.validatePin(' 849201').valid).toBe(false);
      expect(pinService.validatePin('849201 ').valid).toBe(false);
      expect(pinService.validatePin('84 201').valid).toBe(false);
    });

    it('rejects PINs shorter or longer than 6 digits', () => {
      expect(pinService.validatePin('12345').valid).toBe(false);
      expect(pinService.validatePin('1234567').valid).toBe(false);
    });

    it('rejects non-numeric alphabetic or symbolic characters', () => {
      expect(pinService.validatePin('12345a').valid).toBe(false);
      expect(pinService.validatePin('abcdef').valid).toBe(false);
      expect(pinService.validatePin('12@456').valid).toBe(false);
    });

    it('rejects trivially repeated digits (000000, 777777)', () => {
      expect(pinService.validatePin('000000').valid).toBe(false);
      expect(pinService.validatePin('777777').valid).toBe(false);
      expect(pinService.validatePin('999999').valid).toBe(false);
    });

    it('rejects ascending and descending sequential runs (123456, 654321)', () => {
      expect(pinService.validatePin('123456').valid).toBe(false);
      expect(pinService.validatePin('654321').valid).toBe(false);
      expect(pinService.validatePin('012345').valid).toBe(false);
      expect(pinService.validatePin('543210').valid).toBe(false);
    });

    it('rejects disallowed common patterns from security dictionary', () => {
      expect(pinService.validatePin('121212').valid).toBe(false);
      expect(pinService.validatePin('112233').valid).toBe(false);
    });
  });

  describe('B. PIN Cryptographic Hashing & Salt Invariance', () => {
    it('generates a salted bcrypt hash distinct from plaintext PIN', async () => {
      const pin = '582914';
      const hash = await pinService.hashPin(pin);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(pin);
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
      expect(hash.length).toBeGreaterThanOrEqual(59);
    });

    it('produces different salted hashes for the exact same PIN', async () => {
      const pin = '719382';
      const hash1 = await pinService.hashPin(pin);
      const hash2 = await pinService.hashPin(pin);

      expect(hash1).not.toBe(hash2);
      // Both hashes verify successfully despite distinct salts
      expect(await pinService.verifyPinHash(pin, hash1)).toBe(true);
      expect(await pinService.verifyPinHash(pin, hash2)).toBe(true);
    });

    it('fails verification gracefully when comparing against empty or invalid hash', async () => {
      expect(await pinService.verifyPinHash('582914', '')).toBe(false);
      expect(await pinService.verifyPinHash('', '$2a$10$...')).toBe(false);
      expect(await pinService.verifyPinHash('582914', 'not-a-bcrypt-hash')).toBe(false);
    });
  });

  describe('C. PIN Setup Lifecycle', () => {
    it('sets up a PIN on unconfigured device and persists state in control DB', async () => {
      const pin = '839201';
      const res = await deviceSecurityService.setupPin(testDeviceId, pin);

      expect(res.deviceId).toBe(testDeviceId);
      expect(res.isPinConfigured).toBe(true);
      expect(res.failedAttempts).toBe(0);
      expect(res.isLocked).toBe(false);

      // Verify row in database
      const row = await systemPrisma.deviceSecurity.findUnique({
        where: { deviceId: testDeviceId },
      });
      expect(row).toBeDefined();
      expect(row!.pinHash).toBeDefined();
      expect(row!.pinHash).not.toBe(pin); // Hash must not be plaintext!
      expect(row!.pinConfiguredAt).toBeDefined();
    });

    it('rejects second setup attempt with ConflictError', async () => {
      const pin = '839201';
      await deviceSecurityService.setupPin(testDeviceId, pin);

      await expect(
        deviceSecurityService.setupPin(testDeviceId, '948271')
      ).rejects.toThrow(ConflictError);
    });

    it('handles concurrent setup attempts atomically so exactly one succeeds', async () => {
      const pinA = '482019';
      const pinB = '739105';

      const results = await Promise.allSettled([
        deviceSecurityService.setupPin(testDeviceId, pinA),
        deviceSecurityService.setupPin(testDeviceId, pinB),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });
  });

  describe('D. PIN Verification, Attempt Tracking & Automatic Lockout', () => {
    const validPin = '629401';
    const wrongPin = '391058';

    beforeEach(async () => {
      await deviceSecurityService.setupPin(testDeviceId, validPin);
    });

    it('succeeds on correct PIN and resets remaining attempts', async () => {
      const res = await deviceSecurityService.verifyPin(testDeviceId, validPin);
      expect(res.success).toBe(true);
      expect(res.isLocked).toBe(false);
      expect(res.failedAttemptsRemaining).toBe(5);
    });

    it('increments failedAttempts on wrong PIN and tracks remaining attempts', async () => {
      const res1 = await deviceSecurityService.verifyPin(testDeviceId, wrongPin);
      expect(res1.success).toBe(false);
      expect(res1.isLocked).toBe(false);
      expect(res1.failedAttemptsRemaining).toBe(4);

      const res2 = await deviceSecurityService.verifyPin(testDeviceId, wrongPin);
      expect(res2.success).toBe(false);
      expect(res2.isLocked).toBe(false);
      expect(res2.failedAttemptsRemaining).toBe(3);

      const dbRow = await systemPrisma.deviceSecurity.findUnique({
        where: { deviceId: testDeviceId },
      });
      expect(dbRow?.failedAttempts).toBe(2);
    });

    it('locks device for 15 minutes after 5 consecutive failures', async () => {
      for (let i = 0; i < 4; i++) {
        const r = await deviceSecurityService.verifyPin(testDeviceId, wrongPin);
        expect(r.isLocked).toBe(false);
      }

      // 5th failed attempt triggers lockout
      const lockRes = await deviceSecurityService.verifyPin(testDeviceId, wrongPin);
      expect(lockRes.success).toBe(false);
      expect(lockRes.isLocked).toBe(true);
      expect(lockRes.failedAttemptsRemaining).toBe(0);
      expect(lockRes.lockedUntil).toBeDefined();

      // Ensure locked state persisted in database
      const dbRow = await systemPrisma.deviceSecurity.findUnique({
        where: { deviceId: testDeviceId },
      });
      expect(dbRow?.isLocked).toBe(true);
      expect(dbRow?.lockedUntil).toBeDefined();

      // Subsequent attempt even with CORRECT PIN is blocked during active lockout
      const blockedRes = await deviceSecurityService.verifyPin(testDeviceId, validPin);
      expect(blockedRes.success).toBe(false);
      expect(blockedRes.isLocked).toBe(true);
    });

    it('resets lockout and allows authentication after lockout duration has expired', async () => {
      // Force device into expired lockout state
      const pastTime = new Date(Date.now() - 1000); // Expired 1 second ago
      await systemPrisma.deviceSecurity.update({
        where: { deviceId: testDeviceId },
        data: {
          failedAttempts: 5,
          isLocked: true,
          lockedUntil: pastTime,
        },
      });

      // Now verify with correct PIN: should recognize expired lockout and succeed
      const res = await deviceSecurityService.verifyPin(testDeviceId, validPin);
      expect(res.success).toBe(true);
      expect(res.isLocked).toBe(false);
      expect(res.failedAttemptsRemaining).toBe(5);

      const dbRow = await systemPrisma.deviceSecurity.findUnique({
        where: { deviceId: testDeviceId },
      });
      expect(dbRow?.failedAttempts).toBe(0);
      expect(dbRow?.isLocked).toBe(false);
      expect(dbRow?.lockedUntil).toBeNull();
    });

    it('handles concurrent failed attempts without counter corruption', async () => {
      const devId = `concurrent-test-${Date.now()}`;
      const install = await installationService.getOrCreateInstallation();
      await systemPrisma.device.create({
        data: {
          deviceId: devId,
          installationId: install.id,
          deviceName: 'Concurrent-Term',
          platform: 'WINDOWS',
          status: 'ACTIVE',
        },
      });
      await deviceSecurityService.setupPin(devId, validPin);

      // Fire 5 concurrent wrong PIN verifications
      await Promise.all([
        deviceSecurityService.verifyPin(devId, wrongPin),
        deviceSecurityService.verifyPin(devId, wrongPin),
        deviceSecurityService.verifyPin(devId, wrongPin),
        deviceSecurityService.verifyPin(devId, wrongPin),
        deviceSecurityService.verifyPin(devId, wrongPin),
      ]);

      const status = await deviceSecurityService.getSecurityStatus(devId);
      expect(status.failedAttempts).toBe(5);
      expect(status.isLocked).toBe(true);
    });
  });

  describe('E. PIN Change Lifecycle', () => {
    const originalPin = '519284';
    const newPin = '839201';

    beforeEach(async () => {
      await deviceSecurityService.setupPin(testDeviceId, originalPin);
    });

    it('changes PIN successfully when correct current PIN is provided', async () => {
      const res = await deviceSecurityService.changePin(testDeviceId, originalPin, newPin);
      expect(res.isPinConfigured).toBe(true);
      expect(res.failedAttempts).toBe(0);

      // Old PIN no longer works
      const verifyOld = await deviceSecurityService.verifyPin(testDeviceId, originalPin);
      expect(verifyOld.success).toBe(false);

      // New PIN works
      const verifyNew = await deviceSecurityService.verifyPin(testDeviceId, newPin);
      expect(verifyNew.success).toBe(true);
    });

    it('rejects PIN change when current PIN is incorrect and increments failed attempts', async () => {
      await expect(
        deviceSecurityService.changePin(testDeviceId, '999888', newPin)
      ).rejects.toThrow(AuthenticationError);

      const status = await deviceSecurityService.getSecurityStatus(testDeviceId);
      expect(status.failedAttempts).toBe(1);
    });

    it('rejects PIN change when new PIN violates policy', async () => {
      await expect(
        deviceSecurityService.changePin(testDeviceId, originalPin, '123456') // Sequential rejected
      ).rejects.toThrow(ValidationError);
    });
  });
});
