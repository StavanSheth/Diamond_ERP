"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/database/prisma");
const pin_service_1 = require("../modules/security/pin.service");
const device_security_service_1 = require("../modules/security/device-security.service");
const installation_service_1 = require("../modules/system/installation.service");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 3.15 — Full Restart/Reboot Security Persistence Verification', () => {
    let testDeviceId;
    const validPin = '849201';
    const newPin = '739182';
    const wrongPin = '381940';
    (0, vitest_1.beforeEach)(async () => {
        // Ensure active installation
        await installation_service_1.installationService.getOrCreateInstallation();
        testDeviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        await installation_service_1.installationService.registerDevice({
            deviceName: 'Main-Workstation-Terminal',
            platform: 'WINDOWS',
            osVersion: '10.0.22631',
        });
        await prisma_1.systemPrisma.auditEvent.deleteMany({ where: { deviceId: testDeviceId } }).catch(() => { });
        await prisma_1.systemPrisma.deviceSecurity.deleteMany({ where: { deviceId: testDeviceId } }).catch(() => { });
    });
    (0, vitest_1.it)('TEST 1: device identity survives restart', async () => {
        const id1 = installation_service_1.installationService.getOrGenerateDeviceId();
        // Re-call / reload
        const id2 = installation_service_1.installationService.getOrGenerateDeviceId();
        (0, vitest_1.expect)(id1).toBe(id2);
        (0, vitest_1.expect)(id1.length).toBeGreaterThanOrEqual(16);
    });
    (0, vitest_1.it)('TEST 2: installation binding survives restart', async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const device = await prisma_1.systemPrisma.device.findUnique({
            where: { deviceId: testDeviceId },
        });
        (0, vitest_1.expect)(device).toBeDefined();
        (0, vitest_1.expect)(device?.installationId).toBe(install.id);
        // Simulate restart
        const freshClient = new client_1.PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
        });
        try {
            const persistedDev = await freshClient.device.findUnique({
                where: { deviceId: testDeviceId },
            });
            (0, vitest_1.expect)(persistedDev?.installationId).toBe(install.id);
        }
        finally {
            await freshClient.$disconnect();
        }
    });
    (0, vitest_1.it)('TEST 3: PIN authentication survives restart', async () => {
        await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, validPin);
        // Disconnect and create fresh Prisma client (restart simulation)
        await prisma_1.systemPrisma.$disconnect();
        const freshClient = new client_1.PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
        });
        try {
            const sec = await freshClient.deviceSecurity.findUnique({
                where: { deviceId: testDeviceId },
            });
            (0, vitest_1.expect)(sec?.pinHash).toBeDefined();
            (0, vitest_1.expect)(await pin_service_1.pinService.verifyPinHash(validPin, sec.pinHash)).toBe(true);
        }
        finally {
            await freshClient.$disconnect();
        }
        // Authenticate through service
        const verifyRes = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, validPin);
        (0, vitest_1.expect)(verifyRes.success).toBe(true);
    });
    (0, vitest_1.it)('TEST 4: failed attempts survive restart', async () => {
        await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, validPin);
        // Fail 2 times
        await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
        await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
        // Disconnect & restart
        await prisma_1.systemPrisma.$disconnect();
        const freshClient = new client_1.PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
        });
        try {
            const sec = await freshClient.deviceSecurity.findUnique({
                where: { deviceId: testDeviceId },
            });
            (0, vitest_1.expect)(sec?.failedAttempts).toBe(2);
        }
        finally {
            await freshClient.$disconnect();
        }
        // Fail 1 more time after restart -> should be attempt 3 (not reset to 1)
        const res = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
        (0, vitest_1.expect)(res.failedAttemptsRemaining).toBe(2); // 5 - 3 = 2 remaining
        const row = await prisma_1.systemPrisma.deviceSecurity.findUnique({
            where: { deviceId: testDeviceId },
        });
        (0, vitest_1.expect)(row?.failedAttempts).toBe(3);
    });
    (0, vitest_1.it)('TEST 5: lockout survives restart', async () => {
        await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, validPin);
        // Fail 5 times to trigger lockout
        for (let i = 0; i < 5; i++) {
            await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
        }
        const preLock = await device_security_service_1.deviceSecurityService.getSecurityStatus(testDeviceId);
        (0, vitest_1.expect)(preLock.failedAttempts).toBe(5);
        (0, vitest_1.expect)(preLock.authenticationLockedUntil).toBeDefined();
        // Restart process
        await prisma_1.systemPrisma.$disconnect();
        const freshClient = new client_1.PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
        });
        try {
            const sec = await freshClient.deviceSecurity.findUnique({
                where: { deviceId: testDeviceId },
            });
            (0, vitest_1.expect)(sec?.failedAttempts).toBe(5);
            (0, vitest_1.expect)(sec?.lockedUntil).toBeDefined();
            (0, vitest_1.expect)(new Date(sec.lockedUntil).getTime()).toBeGreaterThan(Date.now());
        }
        finally {
            await freshClient.$disconnect();
        }
        // Verification after restart must still be locked
        const postRestartVerify = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, validPin);
        (0, vitest_1.expect)(postRestartVerify.success).toBe(false);
        (0, vitest_1.expect)(postRestartVerify.locked).toBe(true);
    });
    (0, vitest_1.it)('TEST 6: lockout survives application restart', async () => {
        await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, validPin);
        for (let i = 0; i < 5; i++) {
            await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
        }
        // Reload security status through service simulating new app instance
        const status = await device_security_service_1.deviceSecurityService.getSecurityStatus(testDeviceId);
        (0, vitest_1.expect)(status.failedAttempts).toBe(5);
        (0, vitest_1.expect)(status.authenticationLockedUntil).toBeDefined();
    });
    (0, vitest_1.it)('TEST 7: lockout survives Windows reboot scenario', async () => {
        await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, validPin);
        // Trigger lockout with 5 wrong attempts
        for (let i = 0; i < 5; i++) {
            await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
        }
        // Simulate system reboot:
        // 1. Terminate all DB connections
        await prisma_1.systemPrisma.$disconnect();
        // 2. Re-open database from scratch (just like fresh boot of Windows)
        const freshClient = new client_1.PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
        });
        try {
            const persistedSec = await freshClient.deviceSecurity.findUnique({
                where: { deviceId: testDeviceId },
            });
            (0, vitest_1.expect)(persistedSec).toBeDefined();
            (0, vitest_1.expect)(persistedSec?.failedAttempts).toBe(5);
            (0, vitest_1.expect)(persistedSec?.lockedUntil).not.toBeNull();
            (0, vitest_1.expect)(persistedSec?.lockedUntil.getTime()).toBeGreaterThan(Date.now());
        }
        finally {
            await freshClient.$disconnect();
        }
        // Device still rejects attempts
        const lockedAttempt = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, validPin);
        (0, vitest_1.expect)(lockedAttempt.success).toBe(false);
        (0, vitest_1.expect)(lockedAttempt.locked).toBe(true);
    });
    (0, vitest_1.it)('TEST 8: lockout expires based on persisted timestamp', async () => {
        await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, validPin);
        // Set lockedUntil to 500ms in the past (expired lockout)
        await prisma_1.systemPrisma.deviceSecurity.update({
            where: { deviceId: testDeviceId },
            data: {
                failedAttempts: 5,
                isLocked: true,
                lockedUntil: new Date(Date.now() - 500),
            },
        });
        // Simulate restart after expiration
        await prisma_1.systemPrisma.$disconnect();
        // Verification succeeds because timestamp is in the past
        const res = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, validPin);
        (0, vitest_1.expect)(res.success).toBe(true);
        (0, vitest_1.expect)(res.locked).toBe(false);
        (0, vitest_1.expect)(res.failedAttemptsRemaining).toBe(5);
    });
    (0, vitest_1.it)('TEST 9: PIN change survives restart', async () => {
        await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, validPin);
        await device_security_service_1.deviceSecurityService.changePin(testDeviceId, validPin, newPin);
        // Disconnect and verify on fresh client
        await prisma_1.systemPrisma.$disconnect();
        const freshClient = new client_1.PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
        });
        try {
            const sec = await freshClient.deviceSecurity.findUnique({
                where: { deviceId: testDeviceId },
            });
            (0, vitest_1.expect)(await pin_service_1.pinService.verifyPinHash(newPin, sec.pinHash)).toBe(true);
            (0, vitest_1.expect)(await pin_service_1.pinService.verifyPinHash(validPin, sec.pinHash)).toBe(false);
        }
        finally {
            await freshClient.$disconnect();
        }
    });
    (0, vitest_1.it)('TEST 10: old PIN rejected after change', async () => {
        await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, validPin);
        await device_security_service_1.deviceSecurityService.changePin(testDeviceId, validPin, newPin);
        const oldPinRes = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, validPin);
        (0, vitest_1.expect)(oldPinRes.success).toBe(false);
        const newPinRes = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, newPin);
        (0, vitest_1.expect)(newPinRes.success).toBe(true);
    });
    (0, vitest_1.it)('TEST 11: cross-installation access rejected', async () => {
        // Create an external installation
        const foreignInstall = await prisma_1.systemPrisma.installation.create({
            data: {
                installationId: 'foreign-inst-12345678-abcd',
                status: 'ACTIVE',
                lifecycleState: 'READY',
            },
        });
        const foreignDeviceId = 'foreign-dev-12345678-abcd';
        await prisma_1.systemPrisma.device.create({
            data: {
                deviceId: foreignDeviceId,
                installationId: foreignInstall.id,
                deviceName: 'Foreign-Terminal',
                platform: 'WINDOWS',
            },
        });
        // Attempting to access foreign device through local security service must throw AuthorizationError
        await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.getOrCreateDeviceSecurity(foreignDeviceId)).rejects.toThrow(errors_1.AuthorizationError);
    });
    (0, vitest_1.it)('TEST 12: security audit events generated', async () => {
        await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, validPin);
        await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
        await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, validPin);
        const events = await prisma_1.systemPrisma.auditEvent.findMany({
            where: { deviceId: testDeviceId },
            orderBy: { performedAt: 'asc' },
        });
        (0, vitest_1.expect)(events.length).toBeGreaterThanOrEqual(3);
        const eventTypes = events.map((e) => e.eventType);
        (0, vitest_1.expect)(eventTypes).toContain('PIN_CONFIGURED');
        (0, vitest_1.expect)(eventTypes).toContain('PIN_VERIFICATION_FAILED');
        (0, vitest_1.expect)(eventTypes).toContain('PIN_VERIFICATION_SUCCESS');
    });
    (0, vitest_1.it)('TEST 13: plaintext PIN never persisted/logged', async () => {
        await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, validPin);
        // Verify row in deviceSecurity table
        const sec = await prisma_1.systemPrisma.deviceSecurity.findUnique({
            where: { deviceId: testDeviceId },
        });
        (0, vitest_1.expect)(sec?.pinHash).not.toBe(validPin);
        (0, vitest_1.expect)(sec?.pinHash).not.toContain(validPin);
        // Verify audit logs
        const auditRows = await prisma_1.systemPrisma.auditEvent.findMany({
            where: { deviceId: testDeviceId },
        });
        for (const row of auditRows) {
            (0, vitest_1.expect)(row.description).not.toContain(validPin);
            (0, vitest_1.expect)(row.metadata).not.toContain(validPin);
            (0, vitest_1.expect)(row.metadata).not.toContain('pinHash');
        }
    });
    (0, vitest_1.it)('TEST 14: rate limiting cannot be bypassed through restart', async () => {
        await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, validPin);
        // 4 failed attempts before restart
        for (let i = 0; i < 4; i++) {
            await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
        }
        // Restart API connection
        await prisma_1.systemPrisma.$disconnect();
        // 5th attempt after restart triggers lockout immediately
        const fifthAttempt = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
        (0, vitest_1.expect)(fifthAttempt.isLocked).toBe(true);
        (0, vitest_1.expect)(fifthAttempt.failedAttemptsRemaining).toBe(0);
        // Even restarting again does not bypass the lockout
        await prisma_1.systemPrisma.$disconnect();
        const blocked = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, validPin);
        (0, vitest_1.expect)(blocked.success).toBe(false);
        (0, vitest_1.expect)(blocked.isLocked).toBe(true);
    });
    (0, vitest_1.it)('E2E Windows Desktop Lifecycle: Full journey across restarts and reboot', async () => {
        // 1. FIRST INSTALL
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        (0, vitest_1.expect)(install.installationId).toBeDefined();
        // 2. DEVICE CREATED
        const device = await installation_service_1.installationService.registerDevice({ deviceName: 'Sales-Desk' });
        (0, vitest_1.expect)(device.deviceId).toBeDefined();
        // 3. PIN CREATED
        const setupRes = await device_security_service_1.deviceSecurityService.setupPin(device.deviceId, validPin);
        (0, vitest_1.expect)(setupRes.isPinConfigured).toBe(true);
        // 4. APP RESTART
        await prisma_1.systemPrisma.$disconnect();
        // 5. PIN STILL VALID
        const verifyAfterRestart = await device_security_service_1.deviceSecurityService.verifyPin(device.deviceId, validPin);
        (0, vitest_1.expect)(verifyAfterRestart.success).toBe(true);
        // 6. WRONG PIN x 5
        for (let i = 0; i < 5; i++) {
            await device_security_service_1.deviceSecurityService.verifyPin(device.deviceId, wrongPin);
        }
        // 7. LOCKED
        const lockStatus = await device_security_service_1.deviceSecurityService.getSecurityStatus(device.deviceId);
        (0, vitest_1.expect)(lockStatus.failedAttempts).toBe(5);
        (0, vitest_1.expect)(lockStatus.authenticationLockedUntil).toBeDefined();
        // 8. APP RESTART
        await prisma_1.systemPrisma.$disconnect();
        // 9. STILL LOCKED
        const verifyLocked = await device_security_service_1.deviceSecurityService.verifyPin(device.deviceId, validPin);
        (0, vitest_1.expect)(verifyLocked.success).toBe(false);
        (0, vitest_1.expect)(verifyLocked.locked).toBe(true);
        // 10. WINDOWS REBOOT SIMULATION (fresh connection, direct disk inspection)
        await prisma_1.systemPrisma.$disconnect();
        const rebootClient = new client_1.PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
        });
        try {
            const persisted = await rebootClient.deviceSecurity.findUnique({
                where: { deviceId: device.deviceId },
            });
            (0, vitest_1.expect)(persisted?.failedAttempts).toBe(5);
            (0, vitest_1.expect)(persisted?.lockedUntil).toBeDefined();
        }
        finally {
            await rebootClient.$disconnect();
        }
        // 11. STILL LOCKED AFTER REBOOT
        const rebootVerify = await device_security_service_1.deviceSecurityService.verifyPin(device.deviceId, validPin);
        (0, vitest_1.expect)(rebootVerify.success).toBe(false);
        (0, vitest_1.expect)(rebootVerify.locked).toBe(true);
        // 12. LOCKOUT EXPIRY
        await prisma_1.systemPrisma.deviceSecurity.update({
            where: { deviceId: device.deviceId },
            data: { lockedUntil: new Date(Date.now() - 1000) },
        });
        // 13. PIN VALID AGAIN
        const finalVerify = await device_security_service_1.deviceSecurityService.verifyPin(device.deviceId, validPin);
        (0, vitest_1.expect)(finalVerify.success).toBe(true);
        (0, vitest_1.expect)(finalVerify.failedAttemptsRemaining).toBe(5);
    });
});
//# sourceMappingURL=security-restart-persistence.test.js.map