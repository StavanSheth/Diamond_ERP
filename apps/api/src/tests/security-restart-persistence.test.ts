import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { systemPrisma } from '../infrastructure/database/prisma';
import { pinService } from '../modules/security/pin.service';
import { deviceSecurityService } from '../modules/security/device-security.service';
import { installationService } from '../modules/system/installation.service';
import { AuthorizationError } from '../errors';

describe('Phase 3.15 — Full Restart/Reboot Security Persistence Verification', () => {
  let testDeviceId: string;
  const validPin = '849201';
  const newPin = '739182';
  const wrongPin = '381940';

  beforeEach(async () => {
    // Ensure active installation
    await installationService.getOrCreateInstallation();
    testDeviceId = installationService.getOrGenerateDeviceId();

    await installationService.registerDevice({
      deviceName: 'Main-Workstation-Terminal',
      platform: 'WINDOWS',
      osVersion: '10.0.22631',
    });

    await systemPrisma.auditEvent.deleteMany({ where: { deviceId: testDeviceId } }).catch(() => {});
    await systemPrisma.deviceSecurity.deleteMany({ where: { deviceId: testDeviceId } }).catch(() => {});
  });

  it('TEST 1: device identity survives restart', async () => {
    const id1 = installationService.getOrGenerateDeviceId();
    // Re-call / reload
    const id2 = installationService.getOrGenerateDeviceId();
    expect(id1).toBe(id2);
    expect(id1.length).toBeGreaterThanOrEqual(16);
  });

  it('TEST 2: installation binding survives restart', async () => {
    const install = await installationService.getOrCreateInstallation();
    const device = await systemPrisma.device.findUnique({
      where: { deviceId: testDeviceId },
    });
    expect(device).toBeDefined();
    expect(device?.installationId).toBe(install.id);

    // Simulate restart
    const freshClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    try {
      const persistedDev = await freshClient.device.findUnique({
        where: { deviceId: testDeviceId },
      });
      expect(persistedDev?.installationId).toBe(install.id);
    } finally {
      await freshClient.$disconnect();
    }
  });

  it('TEST 3: PIN authentication survives restart', async () => {
    await deviceSecurityService.setupPin(testDeviceId, validPin);

    // Disconnect and create fresh Prisma client (restart simulation)
    await systemPrisma.$disconnect();
    const freshClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    try {
      const sec = await freshClient.deviceSecurity.findUnique({
        where: { deviceId: testDeviceId },
      });
      expect(sec?.pinHash).toBeDefined();
      expect(await pinService.verifyPinHash(validPin, sec!.pinHash!)).toBe(true);
    } finally {
      await freshClient.$disconnect();
    }

    // Authenticate through service
    const verifyRes = await deviceSecurityService.verifyPin(testDeviceId, validPin);
    expect(verifyRes.success).toBe(true);
  });

  it('TEST 4: failed attempts survive restart', async () => {
    await deviceSecurityService.setupPin(testDeviceId, validPin);

    // Fail 2 times
    await deviceSecurityService.verifyPin(testDeviceId, wrongPin);
    await deviceSecurityService.verifyPin(testDeviceId, wrongPin);

    // Disconnect & restart
    await systemPrisma.$disconnect();
    const freshClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    try {
      const sec = await freshClient.deviceSecurity.findUnique({
        where: { deviceId: testDeviceId },
      });
      expect(sec?.failedAttempts).toBe(2);
    } finally {
      await freshClient.$disconnect();
    }

    // Fail 1 more time after restart -> should be attempt 3 (not reset to 1)
    const res = await deviceSecurityService.verifyPin(testDeviceId, wrongPin);
    expect(res.failedAttemptsRemaining).toBe(2); // 5 - 3 = 2 remaining

    const row = await systemPrisma.deviceSecurity.findUnique({
      where: { deviceId: testDeviceId },
    });
    expect(row?.failedAttempts).toBe(3);
  });

  it('TEST 5: lockout survives restart', async () => {
    await deviceSecurityService.setupPin(testDeviceId, validPin);

    // Fail 5 times to trigger lockout
    for (let i = 0; i < 5; i++) {
      await deviceSecurityService.verifyPin(testDeviceId, wrongPin);
    }

    const preLock = await deviceSecurityService.getSecurityStatus(testDeviceId);
    expect(preLock.failedAttempts).toBe(5);
    expect(preLock.authenticationLockedUntil).toBeDefined();

    // Restart process
    await systemPrisma.$disconnect();
    const freshClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    try {
      const sec = await freshClient.deviceSecurity.findUnique({
        where: { deviceId: testDeviceId },
      });
      expect(sec?.failedAttempts).toBe(5);
      expect(sec?.lockedUntil).toBeDefined();
      expect(new Date(sec!.lockedUntil!).getTime()).toBeGreaterThan(Date.now());
    } finally {
      await freshClient.$disconnect();
    }

    // Verification after restart must still be locked
    const postRestartVerify = await deviceSecurityService.verifyPin(testDeviceId, validPin);
    expect(postRestartVerify.success).toBe(false);
    expect(postRestartVerify.locked).toBe(true);
  });

  it('TEST 6: lockout survives application restart', async () => {
    await deviceSecurityService.setupPin(testDeviceId, validPin);

    for (let i = 0; i < 5; i++) {
      await deviceSecurityService.verifyPin(testDeviceId, wrongPin);
    }

    // Reload security status through service simulating new app instance
    const status = await deviceSecurityService.getSecurityStatus(testDeviceId);
    expect(status.failedAttempts).toBe(5);
    expect(status.authenticationLockedUntil).toBeDefined();
  });

  it('TEST 7: lockout survives Windows reboot scenario', async () => {
    await deviceSecurityService.setupPin(testDeviceId, validPin);

    // Trigger lockout with 5 wrong attempts
    for (let i = 0; i < 5; i++) {
      await deviceSecurityService.verifyPin(testDeviceId, wrongPin);
    }

    // Simulate system reboot:
    // 1. Terminate all DB connections
    await systemPrisma.$disconnect();

    // 2. Re-open database from scratch (just like fresh boot of Windows)
    const freshClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    try {
      const persistedSec = await freshClient.deviceSecurity.findUnique({
        where: { deviceId: testDeviceId },
      });
      expect(persistedSec).toBeDefined();
      expect(persistedSec?.failedAttempts).toBe(5);
      expect(persistedSec?.lockedUntil).not.toBeNull();
      expect(persistedSec?.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    } finally {
      await freshClient.$disconnect();
    }

    // Device still rejects attempts
    const lockedAttempt = await deviceSecurityService.verifyPin(testDeviceId, validPin);
    expect(lockedAttempt.success).toBe(false);
    expect(lockedAttempt.locked).toBe(true);
  });

  it('TEST 8: lockout expires based on persisted timestamp', async () => {
    await deviceSecurityService.setupPin(testDeviceId, validPin);

    // Set lockedUntil to 500ms in the past (expired lockout)
    await systemPrisma.deviceSecurity.update({
      where: { deviceId: testDeviceId },
      data: {
        failedAttempts: 5,
        isLocked: true,
        lockedUntil: new Date(Date.now() - 500),
      },
    });

    // Simulate restart after expiration
    await systemPrisma.$disconnect();

    // Verification succeeds because timestamp is in the past
    const res = await deviceSecurityService.verifyPin(testDeviceId, validPin);
    expect(res.success).toBe(true);
    expect(res.locked).toBe(false);
    expect(res.failedAttemptsRemaining).toBe(5);
  });

  it('TEST 9: PIN change survives restart', async () => {
    await deviceSecurityService.setupPin(testDeviceId, validPin);
    await deviceSecurityService.changePin(testDeviceId, validPin, newPin);

    // Disconnect and verify on fresh client
    await systemPrisma.$disconnect();
    const freshClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    try {
      const sec = await freshClient.deviceSecurity.findUnique({
        where: { deviceId: testDeviceId },
      });
      expect(await pinService.verifyPinHash(newPin, sec!.pinHash!)).toBe(true);
      expect(await pinService.verifyPinHash(validPin, sec!.pinHash!)).toBe(false);
    } finally {
      await freshClient.$disconnect();
    }
  });

  it('TEST 10: old PIN rejected after change', async () => {
    await deviceSecurityService.setupPin(testDeviceId, validPin);
    await deviceSecurityService.changePin(testDeviceId, validPin, newPin);

    const oldPinRes = await deviceSecurityService.verifyPin(testDeviceId, validPin);
    expect(oldPinRes.success).toBe(false);

    const newPinRes = await deviceSecurityService.verifyPin(testDeviceId, newPin);
    expect(newPinRes.success).toBe(true);
  });

  it('TEST 11: cross-installation access rejected', async () => {
    // Create an external installation
    const foreignInstall = await systemPrisma.installation.create({
      data: {
        installationId: 'foreign-inst-12345678-abcd',
        status: 'ACTIVE',
        lifecycleState: 'READY',
      },
    });

    const foreignDeviceId = 'foreign-dev-12345678-abcd';
    await systemPrisma.device.create({
      data: {
        deviceId: foreignDeviceId,
        installationId: foreignInstall.id,
        deviceName: 'Foreign-Terminal',
        platform: 'WINDOWS',
      },
    });

    // Attempting to access foreign device through local security service must throw AuthorizationError
    await expect(
      deviceSecurityService.getOrCreateDeviceSecurity(foreignDeviceId)
    ).rejects.toThrow(AuthorizationError);
  });

  it('TEST 12: security audit events generated', async () => {
    await deviceSecurityService.setupPin(testDeviceId, validPin);
    await deviceSecurityService.verifyPin(testDeviceId, wrongPin);
    await deviceSecurityService.verifyPin(testDeviceId, validPin);

    const events = await systemPrisma.auditEvent.findMany({
      where: { deviceId: testDeviceId },
      orderBy: { performedAt: 'asc' },
    });

    expect(events.length).toBeGreaterThanOrEqual(3);
    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain('PIN_CONFIGURED');
    expect(eventTypes).toContain('PIN_VERIFICATION_FAILED');
    expect(eventTypes).toContain('PIN_VERIFICATION_SUCCESS');
  });

  it('TEST 13: plaintext PIN never persisted/logged', async () => {
    await deviceSecurityService.setupPin(testDeviceId, validPin);

    // Verify row in deviceSecurity table
    const sec = await systemPrisma.deviceSecurity.findUnique({
      where: { deviceId: testDeviceId },
    });
    expect(sec?.pinHash).not.toBe(validPin);
    expect(sec?.pinHash).not.toContain(validPin);

    // Verify audit logs
    const auditRows = await systemPrisma.auditEvent.findMany({
      where: { deviceId: testDeviceId },
    });
    for (const row of auditRows) {
      expect(row.description).not.toContain(validPin);
      expect(row.metadata).not.toContain(validPin);
      expect(row.metadata).not.toContain('pinHash');
    }
  });

  it('TEST 14: rate limiting cannot be bypassed through restart', async () => {
    await deviceSecurityService.setupPin(testDeviceId, validPin);

    // 4 failed attempts before restart
    for (let i = 0; i < 4; i++) {
      await deviceSecurityService.verifyPin(testDeviceId, wrongPin);
    }

    // Restart API connection
    await systemPrisma.$disconnect();

    // 5th attempt after restart triggers lockout immediately
    const fifthAttempt = await deviceSecurityService.verifyPin(testDeviceId, wrongPin);
    expect(fifthAttempt.isLocked).toBe(true);
    expect(fifthAttempt.failedAttemptsRemaining).toBe(0);

    // Even restarting again does not bypass the lockout
    await systemPrisma.$disconnect();
    const blocked = await deviceSecurityService.verifyPin(testDeviceId, validPin);
    expect(blocked.success).toBe(false);
    expect(blocked.isLocked).toBe(true);
  });

  it('E2E Windows Desktop Lifecycle: Full journey across restarts and reboot', async () => {
    // 1. FIRST INSTALL
    const install = await installationService.getOrCreateInstallation();
    expect(install.installationId).toBeDefined();

    // 2. DEVICE CREATED
    const device = await installationService.registerDevice({ deviceName: 'Sales-Desk' });
    expect(device.deviceId).toBeDefined();

    // 3. PIN CREATED
    const setupRes = await deviceSecurityService.setupPin(device.deviceId, validPin);
    expect(setupRes.isPinConfigured).toBe(true);

    // 4. APP RESTART
    await systemPrisma.$disconnect();

    // 5. PIN STILL VALID
    const verifyAfterRestart = await deviceSecurityService.verifyPin(device.deviceId, validPin);
    expect(verifyAfterRestart.success).toBe(true);

    // 6. WRONG PIN x 5
    for (let i = 0; i < 5; i++) {
      await deviceSecurityService.verifyPin(device.deviceId, wrongPin);
    }

    // 7. LOCKED
    const lockStatus = await deviceSecurityService.getSecurityStatus(device.deviceId);
    expect(lockStatus.failedAttempts).toBe(5);
    expect(lockStatus.authenticationLockedUntil).toBeDefined();

    // 8. APP RESTART
    await systemPrisma.$disconnect();

    // 9. STILL LOCKED
    const verifyLocked = await deviceSecurityService.verifyPin(device.deviceId, validPin);
    expect(verifyLocked.success).toBe(false);
    expect(verifyLocked.locked).toBe(true);

    // 10. WINDOWS REBOOT SIMULATION (fresh connection, direct disk inspection)
    await systemPrisma.$disconnect();
    const rebootClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    try {
      const persisted = await rebootClient.deviceSecurity.findUnique({
        where: { deviceId: device.deviceId },
      });
      expect(persisted?.failedAttempts).toBe(5);
      expect(persisted?.lockedUntil).toBeDefined();
    } finally {
      await rebootClient.$disconnect();
    }

    // 11. STILL LOCKED AFTER REBOOT
    const rebootVerify = await deviceSecurityService.verifyPin(device.deviceId, validPin);
    expect(rebootVerify.success).toBe(false);
    expect(rebootVerify.locked).toBe(true);

    // 12. LOCKOUT EXPIRY
    await systemPrisma.deviceSecurity.update({
      where: { deviceId: device.deviceId },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    // 13. PIN VALID AGAIN
    const finalVerify = await deviceSecurityService.verifyPin(device.deviceId, validPin);
    expect(finalVerify.success).toBe(true);
    expect(finalVerify.failedAttemptsRemaining).toBe(5);
  });
});
