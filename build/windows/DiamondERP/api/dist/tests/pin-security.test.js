"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const prisma_1 = require("../infrastructure/database/prisma");
const pin_service_1 = require("../modules/security/pin.service");
const device_security_service_1 = require("../modules/security/device-security.service");
const installation_service_1 = require("../modules/system/installation.service");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 3: PIN Security Service & Cryptographic Verification', () => {
    let testDeviceId;
    (0, vitest_1.beforeEach)(async () => {
        // Ensure installation exists
        await installation_service_1.installationService.getOrCreateInstallation();
        // Use authoritative local device ID
        testDeviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        // Ensure device is registered
        await installation_service_1.installationService.registerDevice({
            deviceName: 'PIN-Test-Terminal',
            platform: 'WINDOWS',
        });
        // Clean device security state for a fresh test
        await prisma_1.systemPrisma.deviceSecurity.deleteMany({
            where: { deviceId: testDeviceId },
        });
    });
    (0, vitest_1.describe)('A. PIN Policy Validation', () => {
        (0, vitest_1.it)('accepts a valid 6-digit non-trivial numeric PIN', () => {
            const res = pin_service_1.pinService.validatePin('849201');
            (0, vitest_1.expect)(res.valid).toBe(true);
            (0, vitest_1.expect)(res.reason).toBeUndefined();
        });
        (0, vitest_1.it)('rejects empty or non-string input', () => {
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('').valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin(null).valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin(undefined).valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin(123456).valid).toBe(false);
        });
        (0, vitest_1.it)('rejects whitespace and padded inputs without silent trimming', () => {
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin(' 849201').valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('849201 ').valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('84 201').valid).toBe(false);
        });
        (0, vitest_1.it)('rejects PINs shorter or longer than 6 digits', () => {
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('12345').valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('1234567').valid).toBe(false);
        });
        (0, vitest_1.it)('rejects non-numeric alphabetic or symbolic characters', () => {
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('12345a').valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('abcdef').valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('12@456').valid).toBe(false);
        });
        (0, vitest_1.it)('rejects trivially repeated digits (000000, 777777)', () => {
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('000000').valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('777777').valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('999999').valid).toBe(false);
        });
        (0, vitest_1.it)('rejects ascending and descending sequential runs (123456, 654321)', () => {
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('123456').valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('654321').valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('012345').valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('543210').valid).toBe(false);
        });
        (0, vitest_1.it)('rejects disallowed common patterns from security dictionary', () => {
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('121212').valid).toBe(false);
            (0, vitest_1.expect)(pin_service_1.pinService.validatePin('112233').valid).toBe(false);
        });
    });
    (0, vitest_1.describe)('B. PIN Cryptographic Hashing & Salt Invariance', () => {
        (0, vitest_1.it)('generates a salted bcrypt hash distinct from plaintext PIN', async () => {
            const pin = '582914';
            const hash = await pin_service_1.pinService.hashPin(pin);
            (0, vitest_1.expect)(hash).toBeDefined();
            (0, vitest_1.expect)(hash).not.toBe(pin);
            (0, vitest_1.expect)(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
            (0, vitest_1.expect)(hash.length).toBeGreaterThanOrEqual(59);
        });
        (0, vitest_1.it)('produces different salted hashes for the exact same PIN', async () => {
            const pin = '719382';
            const hash1 = await pin_service_1.pinService.hashPin(pin);
            const hash2 = await pin_service_1.pinService.hashPin(pin);
            (0, vitest_1.expect)(hash1).not.toBe(hash2);
            // Both hashes verify successfully despite distinct salts
            (0, vitest_1.expect)(await pin_service_1.pinService.verifyPinHash(pin, hash1)).toBe(true);
            (0, vitest_1.expect)(await pin_service_1.pinService.verifyPinHash(pin, hash2)).toBe(true);
        });
        (0, vitest_1.it)('fails verification gracefully when comparing against empty or invalid hash', async () => {
            (0, vitest_1.expect)(await pin_service_1.pinService.verifyPinHash('582914', '')).toBe(false);
            (0, vitest_1.expect)(await pin_service_1.pinService.verifyPinHash('', '$2a$10$...')).toBe(false);
            (0, vitest_1.expect)(await pin_service_1.pinService.verifyPinHash('582914', 'not-a-bcrypt-hash')).toBe(false);
        });
    });
    (0, vitest_1.describe)('C. PIN Setup Lifecycle', () => {
        (0, vitest_1.it)('sets up a PIN on unconfigured device and persists state in control DB', async () => {
            const pin = '839201';
            const res = await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, pin);
            (0, vitest_1.expect)(res.deviceId).toBe(testDeviceId);
            (0, vitest_1.expect)(res.isPinConfigured).toBe(true);
            (0, vitest_1.expect)(res.failedAttempts).toBe(0);
            (0, vitest_1.expect)(res.isLocked).toBe(false);
            // Verify row in database
            const row = await prisma_1.systemPrisma.deviceSecurity.findUnique({
                where: { deviceId: testDeviceId },
            });
            (0, vitest_1.expect)(row).toBeDefined();
            (0, vitest_1.expect)(row.pinHash).toBeDefined();
            (0, vitest_1.expect)(row.pinHash).not.toBe(pin); // Hash must not be plaintext!
            (0, vitest_1.expect)(row.pinConfiguredAt).toBeDefined();
        });
        (0, vitest_1.it)('rejects second setup attempt with ConflictError', async () => {
            const pin = '839201';
            await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, pin);
            await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.setupPin(testDeviceId, '948271')).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('handles concurrent setup attempts atomically so exactly one succeeds', async () => {
            const pinA = '482019';
            const pinB = '739105';
            const results = await Promise.allSettled([
                device_security_service_1.deviceSecurityService.setupPin(testDeviceId, pinA),
                device_security_service_1.deviceSecurityService.setupPin(testDeviceId, pinB),
            ]);
            const fulfilled = results.filter((r) => r.status === 'fulfilled');
            const rejected = results.filter((r) => r.status === 'rejected');
            (0, vitest_1.expect)(fulfilled.length).toBe(1);
            (0, vitest_1.expect)(rejected.length).toBe(1);
        });
    });
    (0, vitest_1.describe)('D. PIN Verification, Attempt Tracking & Automatic Lockout', () => {
        const validPin = '629401';
        const wrongPin = '391058';
        (0, vitest_1.beforeEach)(async () => {
            await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, validPin);
        });
        (0, vitest_1.it)('succeeds on correct PIN and resets remaining attempts', async () => {
            const res = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, validPin);
            (0, vitest_1.expect)(res.success).toBe(true);
            (0, vitest_1.expect)(res.isLocked).toBe(false);
            (0, vitest_1.expect)(res.failedAttemptsRemaining).toBe(5);
        });
        (0, vitest_1.it)('increments failedAttempts on wrong PIN and tracks remaining attempts', async () => {
            const res1 = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
            (0, vitest_1.expect)(res1.success).toBe(false);
            (0, vitest_1.expect)(res1.isLocked).toBe(false);
            (0, vitest_1.expect)(res1.failedAttemptsRemaining).toBe(4);
            const res2 = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
            (0, vitest_1.expect)(res2.success).toBe(false);
            (0, vitest_1.expect)(res2.isLocked).toBe(false);
            (0, vitest_1.expect)(res2.failedAttemptsRemaining).toBe(3);
            const dbRow = await prisma_1.systemPrisma.deviceSecurity.findUnique({
                where: { deviceId: testDeviceId },
            });
            (0, vitest_1.expect)(dbRow?.failedAttempts).toBe(2);
        });
        (0, vitest_1.it)('locks device for 15 minutes after 5 consecutive failures', async () => {
            for (let i = 0; i < 4; i++) {
                const r = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
                (0, vitest_1.expect)(r.isLocked).toBe(false);
            }
            // 5th failed attempt triggers lockout
            const lockRes = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, wrongPin);
            (0, vitest_1.expect)(lockRes.success).toBe(false);
            (0, vitest_1.expect)(lockRes.isLocked).toBe(true);
            (0, vitest_1.expect)(lockRes.failedAttemptsRemaining).toBe(0);
            (0, vitest_1.expect)(lockRes.lockedUntil).toBeDefined();
            // Ensure lockout state persisted in database
            const dbRow = await prisma_1.systemPrisma.deviceSecurity.findUnique({
                where: { deviceId: testDeviceId },
            });
            (0, vitest_1.expect)(dbRow?.lockedUntil).toBeDefined();
            (0, vitest_1.expect)(lockRes.authenticationLockedUntil).toBeDefined();
            // Subsequent attempt even with CORRECT PIN is blocked during active lockout
            const blockedRes = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, validPin);
            (0, vitest_1.expect)(blockedRes.success).toBe(false);
            (0, vitest_1.expect)(blockedRes.isLocked).toBe(true);
        });
        (0, vitest_1.it)('resets lockout and allows authentication after lockout duration has expired', async () => {
            // Force device into expired lockout state
            const pastTime = new Date(Date.now() - 1000); // Expired 1 second ago
            await prisma_1.systemPrisma.deviceSecurity.update({
                where: { deviceId: testDeviceId },
                data: {
                    failedAttempts: 5,
                    isLocked: true,
                    lockedUntil: pastTime,
                },
            });
            // Now verify with correct PIN: should recognize expired lockout and succeed
            const res = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, validPin);
            (0, vitest_1.expect)(res.success).toBe(true);
            (0, vitest_1.expect)(res.isLocked).toBe(false);
            (0, vitest_1.expect)(res.failedAttemptsRemaining).toBe(5);
            const dbRow = await prisma_1.systemPrisma.deviceSecurity.findUnique({
                where: { deviceId: testDeviceId },
            });
            (0, vitest_1.expect)(dbRow?.failedAttempts).toBe(0);
            (0, vitest_1.expect)(dbRow?.isLocked).toBe(false);
            (0, vitest_1.expect)(dbRow?.lockedUntil).toBeNull();
        });
        (0, vitest_1.it)('handles concurrent failed attempts without counter corruption', async () => {
            const devId = `concurrent-test-${Date.now()}`;
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            await prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: devId,
                    installationId: install.id,
                    deviceName: 'Concurrent-Term',
                    platform: 'WINDOWS',
                    status: 'ACTIVE',
                },
            });
            await device_security_service_1.deviceSecurityService.setupPin(devId, validPin);
            // Fire 5 concurrent wrong PIN verifications
            await Promise.all([
                device_security_service_1.deviceSecurityService.verifyPin(devId, wrongPin),
                device_security_service_1.deviceSecurityService.verifyPin(devId, wrongPin),
                device_security_service_1.deviceSecurityService.verifyPin(devId, wrongPin),
                device_security_service_1.deviceSecurityService.verifyPin(devId, wrongPin),
                device_security_service_1.deviceSecurityService.verifyPin(devId, wrongPin),
            ]);
            const status = await device_security_service_1.deviceSecurityService.getSecurityStatus(devId);
            (0, vitest_1.expect)(status.failedAttempts).toBe(5);
            (0, vitest_1.expect)(status.isLocked).toBe(true);
        });
    });
    (0, vitest_1.describe)('E. PIN Change Lifecycle', () => {
        const originalPin = '519284';
        const newPin = '839201';
        (0, vitest_1.beforeEach)(async () => {
            await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, originalPin);
        });
        (0, vitest_1.it)('changes PIN successfully when correct current PIN is provided', async () => {
            const res = await device_security_service_1.deviceSecurityService.changePin(testDeviceId, originalPin, newPin);
            (0, vitest_1.expect)(res.isPinConfigured).toBe(true);
            (0, vitest_1.expect)(res.failedAttempts).toBe(0);
            // Old PIN no longer works
            const verifyOld = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, originalPin);
            (0, vitest_1.expect)(verifyOld.success).toBe(false);
            // New PIN works
            const verifyNew = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, newPin);
            (0, vitest_1.expect)(verifyNew.success).toBe(true);
        });
        (0, vitest_1.it)('rejects PIN change when current PIN is incorrect and increments failed attempts', async () => {
            await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.changePin(testDeviceId, '999888', newPin)).rejects.toThrow(errors_1.AuthenticationError);
            const status = await device_security_service_1.deviceSecurityService.getSecurityStatus(testDeviceId);
            (0, vitest_1.expect)(status.failedAttempts).toBe(1);
        });
        (0, vitest_1.it)('rejects PIN change when new PIN violates policy', async () => {
            await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.changePin(testDeviceId, originalPin, '123456') // Sequential rejected
            ).rejects.toThrow(errors_1.ValidationError);
        });
    });
});
//# sourceMappingURL=pin-security.test.js.map