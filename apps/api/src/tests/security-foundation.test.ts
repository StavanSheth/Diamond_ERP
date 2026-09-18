import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { systemPrisma } from '../infrastructure/database/prisma';
import { installationService } from '../modules/system/installation.service';
import { deviceSecurityService } from '../modules/security/device-security.service';
import { authService } from '../modules/auth/auth.service';
import { getDatabasesDir, getDatabaseTemplatePath } from '../infrastructure/paths';
import { ConflictError } from '../errors';

describe('Phase 3: Security Invariants, Identity Isolation & DB Integrity', () => {
  beforeEach(async () => {
    // Reset or ensure installation
    await installationService.getOrCreateInstallation();
  });

  describe('1. Lifecycle Progression Invariants', () => {
    it('enforces Invariant 1: PIN_SETUP cannot complete if PIN is not configured', async () => {
      // Move to APP_SETUP -> PIN_SETUP
      await installationService.updateLifecycleState('NOT_INITIALIZED', { isReset: true });
      await installationService.updateLifecycleState('APP_SETUP');
      await installationService.updateLifecycleState('PIN_SETUP');

      const localDevId = installationService.getOrGenerateDeviceId();
      // Ensure local device security record has NO PIN configured
      await systemPrisma.deviceSecurity.deleteMany({
        where: { deviceId: localDevId },
      });

      // Attempting to advance to DEVICE_SETUP without configured PIN must fail with ConflictError (authoritative default)
      await expect(
        installationService.updateLifecycleState('DEVICE_SETUP')
      ).rejects.toThrow(ConflictError);

      // Now configure PIN
      await installationService.registerDevice({
        deviceName: 'Local-Terminal',
      });
      await deviceSecurityService.setupPin(localDevId, '839201');

      // Now advancing to DEVICE_SETUP succeeds!
      const updated = await installationService.updateLifecycleState('DEVICE_SETUP');
      expect(updated.lifecycleState).toBe('DEVICE_SETUP');
    });

    it('enforces Invariant 2: DEVICE_SETUP cannot complete if no active device is registered', async () => {
      const localDevId = installationService.getOrGenerateDeviceId();

      // Revoke the local device
      await systemPrisma.device.update({
        where: { deviceId: localDevId },
        data: { status: 'REVOKED' },
      });

      // Attempting to advance to USER_DISCOVERY with a revoked device must fail
      await expect(
        installationService.updateLifecycleState('USER_DISCOVERY')
      ).rejects.toThrow(ConflictError);

      // Reactivate device
      await systemPrisma.device.update({
        where: { deviceId: localDevId },
        data: { status: 'ACTIVE' },
      });

      // Advancing to USER_DISCOVERY now succeeds
      const updated = await installationService.updateLifecycleState('USER_DISCOVERY');
      expect(updated.lifecycleState).toBe('USER_DISCOVERY');
    });
  });

  describe('2. Strict Identity Separation: User Password vs Application Device PIN', () => {
    it('proves business user password changes and device PIN changes are completely independent', async () => {
      const install = await installationService.getOrCreateInstallation();
      const devId = `dev-iso-${Date.now()}`;
      await systemPrisma.device.create({
        data: {
          deviceId: devId,
          installationId: install.id,
          deviceName: 'Iso-Terminal',
          platform: 'WINDOWS',
          status: 'ACTIVE',
        },
      });

      const pin1 = '519284';
      const pin2 = '739201';
      await deviceSecurityService.setupPin(devId, pin1);

      const username = `multiuser-${Date.now()}`;
      const pw1 = 'PasswordAlpha123!';
      const pw2 = 'PasswordBeta456!';

      const user = await authService.createUser(
        username,
        pw1,
        'Isolation Test User',
        'ADMIN'
      );

      // Step A: Change user business password from pw1 to pw2
      await authService.changePassword(user.id, pw1, pw2);

      // Verify: Device PIN1 still verifies successfully!
      const verifyPin1AfterPwChange = await deviceSecurityService.verifyPin(devId, pin1);
      expect(verifyPin1AfterPwChange.success).toBe(true);

      // Step B: Change Device PIN from PIN1 to PIN2
      await deviceSecurityService.changePin(devId, pin1, pin2);

      // Verify: Business user login with pw2 still succeeds!
      const loginResult = await authService.login(username, pw2);
      expect(loginResult.user.id).toBe(user.id);
      expect(loginResult.token).toBeDefined();

      // Verify: Old PIN no longer works, new PIN works
      expect((await deviceSecurityService.verifyPin(devId, pin1)).success).toBe(false);
      expect((await deviceSecurityService.verifyPin(devId, pin2)).success).toBe(true);
    });
  });

  describe('3. Database Separation: Profile DBs vs Control DB & Zero Data Loss', () => {
    it('proves Profile SQLite databases remain untouched and uncorrupted through PIN changes and device revocation', async () => {
      const install = await installationService.getOrCreateInstallation();
      const testDir = getDatabasesDir();
      const profileDbFile = path.resolve(testDir, `profile_sec_iso_${Date.now()}.db`);
      const templatePath = getDatabaseTemplatePath();
      expect(templatePath).toBeDefined();
      fs.copyFileSync(templatePath!, profileDbFile);

      const initialHash = crypto.createHash('sha256').update(fs.readFileSync(profileDbFile)).digest('hex');

      const devId = `dev-db-iso-${Date.now()}`;
      await systemPrisma.device.create({
        data: {
          deviceId: devId,
          installationId: install.id,
          deviceName: 'DB-Iso-Terminal',
          platform: 'WINDOWS',
          status: 'ACTIVE',
        },
      });

      // Perform security operations: PIN setup, verification, change, lock, revoke
      await deviceSecurityService.setupPin(devId, '639102');
      await deviceSecurityService.verifyPin(devId, '639102');
      await deviceSecurityService.changePin(devId, '639102', '940182');
      await deviceSecurityService.lockApplication(devId);
      await installationService.revokeDevice(devId, 'Security test');

      // Verify physical profile DB file still exists and its content hash is unchanged
      expect(fs.existsSync(profileDbFile)).toBe(true);
      const postHash = crypto.createHash('sha256').update(fs.readFileSync(profileDbFile)).digest('hex');
      expect(postHash).toBe(initialHash);

      // Cleanup
      try { fs.unlinkSync(profileDbFile); } catch {}
    });
  });

  describe('4. Security Audit & Zero Plaintext / Hash Leakage Verification', () => {
    it('verifies that system DB contains zero plaintext PINs and audit trails contain no sensitive data', async () => {
      const install = await installationService.getOrCreateInstallation();
      const devId = `dev-leak-audit-${Date.now()}`;
      await systemPrisma.device.create({
        data: {
          deviceId: devId,
          installationId: install.id,
          deviceName: 'Audit-Leak-Terminal',
          platform: 'WINDOWS',
          status: 'ACTIVE',
        },
      });

      const testPin = '948201';
      await deviceSecurityService.setupPin(devId, testPin);

      // 1. Direct inspection of DeviceSecurity table in database
      const securityRow = await systemPrisma.deviceSecurity.findUnique({
        where: { deviceId: devId },
      });
      expect(securityRow).toBeDefined();
      expect(securityRow!.pinHash).toBeDefined();
      expect(securityRow!.pinHash).not.toBe(testPin);
      expect(securityRow!.pinHash).not.toContain(testPin);

      // 2. Direct inspection of AuditEvent table for this device
      const auditEvents = await systemPrisma.auditEvent.findMany({
        where: { entityId: devId },
      });
      expect(auditEvents.length).toBeGreaterThan(0);

      for (const event of auditEvents) {
        expect(event.description).not.toContain(testPin);
        if (event.metadata) {
          expect(event.metadata).not.toContain(testPin);
          expect(event.metadata).not.toContain(securityRow!.pinHash!);
          expect(event.metadata).not.toContain('pin');
          expect(event.metadata).not.toContain('pinHash');
        }
      }

      // 3. API DTO inspection: getSecurityStatus returns no pinHash
      const statusDto = await deviceSecurityService.getSecurityStatus(devId);
      expect((statusDto as any).pinHash).toBeUndefined();
      expect((statusDto as any).pin).toBeUndefined();
      expect(statusDto.isPinConfigured).toBe(true);
    });
  });
});
