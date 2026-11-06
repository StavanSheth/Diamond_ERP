"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const prisma_1 = require("../infrastructure/database/prisma");
const device_security_service_1 = require("../modules/security/device-security.service");
const installation_service_1 = require("../modules/system/installation.service");
const auth_service_1 = require("../modules/auth/auth.service");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 3: Device Binding, Lock State & Security Lifecycle', () => {
    let testDeviceId;
    (0, vitest_1.beforeEach)(async () => {
        await installation_service_1.installationService.getOrCreateInstallation();
        testDeviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        await prisma_1.systemPrisma.device.updateMany({
            where: { deviceId: testDeviceId },
            data: { status: 'ACTIVE', revokedAt: null },
        });
        await installation_service_1.installationService.registerDevice({
            deviceName: 'Lock-Test-Terminal',
            platform: 'WINDOWS',
        });
        // Clean device security state
        await prisma_1.systemPrisma.deviceSecurity.deleteMany({
            where: { deviceId: testDeviceId },
        });
    });
    (0, vitest_1.describe)('1. Device Binding & Revocation State', () => {
        (0, vitest_1.it)('binds device security record and returns clean non-secret status', async () => {
            const status = await device_security_service_1.deviceSecurityService.getSecurityStatus(testDeviceId);
            (0, vitest_1.expect)(status.deviceId).toBe(testDeviceId);
            (0, vitest_1.expect)(status.isDeviceBound).toBe(true);
            (0, vitest_1.expect)(status.deviceStatus).toBe('ACTIVE');
            (0, vitest_1.expect)(status.isPinConfigured).toBe(false);
            (0, vitest_1.expect)(status.isLocked).toBe(false);
            (0, vitest_1.expect)(status.pinHash).toBeUndefined(); // Invariant: no hash leakage
        });
        (0, vitest_1.it)('blocks PIN setup and PIN verification on a REVOKED device', async () => {
            // Revoke the device
            await installation_service_1.installationService.revokeDevice(testDeviceId, 'Compromised workstation terminal');
            // Attempting to setup PIN must fail
            await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.setupPin(testDeviceId, '849201')).rejects.toThrow(errors_1.AuthorizationError);
            // Attempting to verify PIN must fail
            await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, '849201')).rejects.toThrow(errors_1.AuthorizationError);
        });
        (0, vitest_1.it)('allows authentication after an authorized administrative reactivation', async () => {
            // Setup PIN while active
            await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, '849201');
            // Revoke device
            await installation_service_1.installationService.revokeDevice(testDeviceId, 'Audit pause');
            // Rejected during revocation
            await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, '849201')).rejects.toThrow(errors_1.AuthorizationError);
            // Reactivate device
            await installation_service_1.installationService.reactivateDevice(testDeviceId);
            // Successfully authenticates
            const res = await device_security_service_1.deviceSecurityService.verifyPin(testDeviceId, '849201');
            (0, vitest_1.expect)(res.success).toBe(true);
        });
    });
    (0, vitest_1.describe)('2. Application Lock State (Screen Shield / Idle Lock)', () => {
        (0, vitest_1.beforeEach)(async () => {
            await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, '719302');
        });
        (0, vitest_1.it)('locks application explicitly and requires valid PIN to unlock', async () => {
            // Lock workstation
            const lockRes = await device_security_service_1.deviceSecurityService.lockApplication(testDeviceId);
            (0, vitest_1.expect)(lockRes.isLocked).toBe(true);
            const statusAfterLock = await device_security_service_1.deviceSecurityService.getSecurityStatus(testDeviceId);
            (0, vitest_1.expect)(statusAfterLock.isLocked).toBe(true);
            // Unlock with incorrect PIN fails
            await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.unlockApplication(testDeviceId, '999111')).rejects.toThrow(errors_1.AuthenticationError);
            // Application remains locked
            const stillLocked = await device_security_service_1.deviceSecurityService.getSecurityStatus(testDeviceId);
            (0, vitest_1.expect)(stillLocked.isLocked).toBe(true);
            // Unlock with correct PIN succeeds
            const unlockRes = await device_security_service_1.deviceSecurityService.unlockApplication(testDeviceId, '719302');
            (0, vitest_1.expect)(unlockRes.isLocked).toBe(false);
            const statusAfterUnlock = await device_security_service_1.deviceSecurityService.getSecurityStatus(testDeviceId);
            (0, vitest_1.expect)(statusAfterUnlock.isLocked).toBe(false);
        });
    });
    (0, vitest_1.describe)('3. Session Association & Invalidation on Security Changes', () => {
        (0, vitest_1.it)('associates deviceId with business session and revokes device sessions on PIN change', async () => {
            const pin = '629481';
            await device_security_service_1.deviceSecurityService.setupPin(testDeviceId, pin);
            // Create a test user
            const username = `sec-user-${Date.now()}`;
            const password = 'TestSecurePassword123!';
            const user = await auth_service_1.authService.createUser(username, password, 'Security Test User', 'ADMIN');
            // User logs in on this device
            const loginRes = await auth_service_1.authService.login(username, password, {
                deviceId: testDeviceId,
            });
            (0, vitest_1.expect)(loginRes.token).toBeDefined();
            // Find session in DB and verify deviceId was linked
            const session = await prisma_1.systemPrisma.session.findFirst({
                where: { userId: user.id, deviceId: testDeviceId },
            });
            (0, vitest_1.expect)(session).toBeDefined();
            (0, vitest_1.expect)(session?.deviceId).toBe(testDeviceId);
            (0, vitest_1.expect)(session?.revokedAt).toBeNull();
            // Now change PIN on the device
            await device_security_service_1.deviceSecurityService.changePin(testDeviceId, pin, '930184');
            // Verify that existing session on this device was revoked
            const updatedSession = await prisma_1.systemPrisma.session.findUnique({
                where: { id: session.id },
            });
            (0, vitest_1.expect)(updatedSession?.revokedAt).toBeDefined();
        });
    });
});
//# sourceMappingURL=device-security.test.js.map