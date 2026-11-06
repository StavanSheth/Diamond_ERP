"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const prisma_1 = require("../infrastructure/database/prisma");
const security_service_1 = require("../modules/security/security.service");
const device_security_service_1 = require("../modules/security/device-security.service");
const security_controller_1 = require("../modules/security/security.controller");
const installation_service_1 = require("../modules/system/installation.service");
const auth_service_1 = require("../modules/auth/auth.service");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 3 Remediation: Authoritative Security Boundary & Attack Regression Suite', () => {
    let localDeviceId;
    let foreignDeviceId;
    let anotherLocalDeviceId;
    (0, vitest_1.beforeEach)(async () => {
        // 1. Ensure current installation
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        localDeviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        // Ensure local device is registered and active
        await prisma_1.systemPrisma.device.upsert({
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
        await prisma_1.systemPrisma.deviceSecurity.deleteMany({
            where: { deviceId: localDeviceId },
        });
        // 2. Set up another valid device under the SAME installation
        anotherLocalDeviceId = `dev-sibling-${Date.now()}`;
        await prisma_1.systemPrisma.device.create({
            data: {
                deviceId: anotherLocalDeviceId,
                installationId: install.id,
                deviceName: 'Sibling-Terminal',
                platform: 'WINDOWS',
                status: 'ACTIVE',
            },
        });
        // 3. Set up a foreign installation and a device belonging to IT
        const foreignInstall = await prisma_1.systemPrisma.installation.create({
            data: {
                installationId: `foreign-install-${Date.now()}`,
                appVersion: '3.0.0',
                status: 'ACTIVE',
                lifecycleState: 'READY',
            },
        });
        foreignDeviceId = `foreign-dev-${Date.now()}`;
        await prisma_1.systemPrisma.device.create({
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
    (0, vitest_1.describe)('Section 48: Ten Authoritative Security Attack Scenarios', () => {
        (0, vitest_1.it)('Attack 1: User sends another valid device ID from the same installation -> REJECTED', async () => {
            // Local node should only operate on its authoritative local device
            // Passing another sibling deviceId must be rejected with ValidationError
            (0, vitest_1.expect)(() => {
                security_service_1.securityService.resolveAuthoritativeDeviceId(anotherLocalDeviceId);
            }).toThrow(errors_1.ValidationError);
            await (0, vitest_1.expect)(security_service_1.securityService.getStatus(anotherLocalDeviceId)).rejects.toThrow(errors_1.ValidationError);
            await (0, vitest_1.expect)(security_service_1.securityService.setupPin('849201', anotherLocalDeviceId)).rejects.toThrow(errors_1.ValidationError);
        });
        (0, vitest_1.it)('Attack 2: User sends a device ID from another installation -> REJECTED', async () => {
            // Direct service or client resolution passing foreign device must fail
            (0, vitest_1.expect)(() => {
                security_service_1.securityService.resolveAuthoritativeDeviceId(foreignDeviceId);
            }).toThrow(errors_1.ValidationError);
            // Low-level device security service cross-installation enforcement check
            await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.getOrCreateDeviceSecurity(foreignDeviceId)).rejects.toThrow(errors_1.AuthorizationError);
            await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.setupPin(foreignDeviceId, '849201')).rejects.toThrow(errors_1.AuthorizationError);
        });
        (0, vitest_1.it)('Attack 3: User calls PIN change without authentication after READY -> REJECTED', async () => {
            // Configure initial PIN first
            await device_security_service_1.deviceSecurityService.setupPin(localDeviceId, '849201');
            // Advance lifecycle to READY
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            await prisma_1.systemPrisma.installation.update({
                where: { id: install.id },
                data: { lifecycleState: 'READY' },
            });
            // Mock unauthenticated request without Authorization header
            const req = {
                body: {
                    currentPin: '849201',
                    newPin: '930182',
                },
                headers: {},
            };
            const res = {
                status: () => res,
                json: () => res,
            };
            let errorThrown = null;
            const next = (err) => {
                if (err)
                    errorThrown = err;
            };
            await security_controller_1.securityController.changePin(req, res, next);
            (0, vitest_1.expect)(errorThrown).toBeDefined();
            (0, vitest_1.expect)(errorThrown).toBeInstanceOf(errors_1.AuthorizationError);
            (0, vitest_1.expect)(errorThrown.message).toContain('active authenticated session');
        });
        (0, vitest_1.it)('Attack 4: User calls lock on another device -> REJECTED', async () => {
            // Calling lock on a different device must be rejected by authoritative resolution
            await (0, vitest_1.expect)(security_service_1.securityService.lock(anotherLocalDeviceId)).rejects.toThrow(errors_1.ValidationError);
            await (0, vitest_1.expect)(security_service_1.securityService.lock(foreignDeviceId)).rejects.toThrow(errors_1.ValidationError);
        });
        (0, vitest_1.it)('Attack 5: User calls unlock on another device -> REJECTED', async () => {
            // Calling unlock on a different device must be rejected by authoritative resolution
            await (0, vitest_1.expect)(security_service_1.securityService.unlock('849201', anotherLocalDeviceId)).rejects.toThrow(errors_1.ValidationError);
            await (0, vitest_1.expect)(security_service_1.securityService.unlock('849201', foreignDeviceId)).rejects.toThrow(errors_1.ValidationError);
        });
        (0, vitest_1.it)('Attack 6: Revoked device attempts authentication -> REJECTED', async () => {
            await device_security_service_1.deviceSecurityService.setupPin(localDeviceId, '849201');
            // Administratively revoke the device
            await installation_service_1.installationService.revokeDevice(localDeviceId, 'Compromised hardware');
            // Attempting to verify PIN on revoked device must fail with AuthorizationError
            await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.verifyPin(localDeviceId, '849201')).rejects.toThrow(errors_1.AuthorizationError);
            // Attempting to unlock on revoked device must fail with AuthorizationError
            await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.unlockApplication(localDeviceId, '849201')).rejects.toThrow(errors_1.AuthorizationError);
        });
        (0, vitest_1.it)('Attack 7: Old session after PIN change -> REJECTED', async () => {
            const originalPin = '519284';
            await device_security_service_1.deviceSecurityService.setupPin(localDeviceId, originalPin);
            // Create a user and log in, binding the session to localDeviceId
            const username = `session-user-${Date.now()}`;
            await auth_service_1.authService.createUser(username, 'Password123!', 'Session Test User', 'ADMIN');
            const login = await auth_service_1.authService.login(username, 'Password123!', { deviceId: localDeviceId });
            // Verify token works before PIN change
            let authStatus = null;
            let authError = null;
            const mockReqBefore = {
                headers: { authorization: `Bearer ${login.token}` },
                socket: {},
            };
            const mockResBefore = {
                status: (code) => {
                    authStatus = code;
                    return {
                        json: (payload) => {
                            authError = payload.error;
                        },
                    };
                },
            };
            await (0, auth_1.authenticate)(mockReqBefore, mockResBefore, () => { });
            (0, vitest_1.expect)(authStatus).toBeNull(); // 200 / Next() called
            // Now change PIN on the device
            await device_security_service_1.deviceSecurityService.changePin(localDeviceId, originalPin, '839201');
            // Verify the OLD session token is now rejected with 401
            const mockReqAfter = {
                headers: { authorization: `Bearer ${login.token}` },
                socket: {},
            };
            const mockResAfter = {
                status: (code) => {
                    authStatus = code;
                    return {
                        json: (payload) => {
                            authError = payload.error;
                        },
                    };
                },
            };
            await (0, auth_1.authenticate)(mockReqAfter, mockResAfter, () => { });
            (0, vitest_1.expect)(authStatus).toBe(401);
            (0, vitest_1.expect)(authError).toContain('revoked');
        });
        (0, vitest_1.it)('Attack 8: Old session after device revocation -> REJECTED', async () => {
            await device_security_service_1.deviceSecurityService.setupPin(localDeviceId, '849201');
            // Create user and log in bound to device
            const username = `rev-user-${Date.now()}`;
            await auth_service_1.authService.createUser(username, 'Password123!', 'Rev Test User', 'ADMIN');
            const login = await auth_service_1.authService.login(username, 'Password123!', { deviceId: localDeviceId });
            // Revoke the device
            await installation_service_1.installationService.revokeDevice(localDeviceId, 'Audit termination');
            // The active session must be rejected with 401
            let authStatus = null;
            let authError = null;
            const mockReq = {
                headers: { authorization: `Bearer ${login.token}` },
                socket: {},
            };
            const mockRes = {
                status: (code) => {
                    authStatus = code;
                    return {
                        json: (payload) => {
                            authError = payload.error;
                        },
                    };
                },
            };
            await (0, auth_1.authenticate)(mockReq, mockRes, () => { });
            (0, vitest_1.expect)(authStatus).toBe(401);
            (0, vitest_1.expect)(authError).toBeDefined();
        });
        (0, vitest_1.it)('Attack 9: Old revoked session after device reactivation -> REJECTED', async () => {
            await device_security_service_1.deviceSecurityService.setupPin(localDeviceId, '849201');
            // Create user and log in
            const username = `react-user-${Date.now()}`;
            await auth_service_1.authService.createUser(username, 'Password123!', 'Reactivate Test User', 'ADMIN');
            const login = await auth_service_1.authService.login(username, 'Password123!', { deviceId: localDeviceId });
            // Revoke device (invalidates sessions)
            await installation_service_1.installationService.revokeDevice(localDeviceId, 'Temporary lock');
            // Reactivate device (restores active device, but must NOT resurrect old sessions)
            await installation_service_1.installationService.reactivateDevice(localDeviceId);
            // Verify the old session from before revocation is STILL REJECTED
            let authStatus = null;
            let authError = null;
            const mockReq = {
                headers: { authorization: `Bearer ${login.token}` },
                socket: {},
            };
            const mockRes = {
                status: (code) => {
                    authStatus = code;
                    return {
                        json: (payload) => {
                            authError = payload.error;
                        },
                    };
                },
            };
            await (0, auth_1.authenticate)(mockReq, mockRes, () => { });
            (0, vitest_1.expect)(authStatus).toBe(401);
            (0, vitest_1.expect)(authError).toContain('revoked');
        });
        (0, vitest_1.it)('Attack 10: Correct PIN during active authentication lockout -> REJECTED', async () => {
            const validPin = '719284';
            const wrongPin = '111222';
            await device_security_service_1.deviceSecurityService.setupPin(localDeviceId, validPin);
            // Trigger lockout with 5 failed attempts
            for (let i = 0; i < 4; i++) {
                await device_security_service_1.deviceSecurityService.verifyPin(localDeviceId, wrongPin);
            }
            const fifthAttempt = await device_security_service_1.deviceSecurityService.verifyPin(localDeviceId, wrongPin);
            (0, vitest_1.expect)(fifthAttempt.isLocked).toBe(true);
            (0, vitest_1.expect)(fifthAttempt.authenticationLockedUntil).toBeDefined();
            // Submit CORRECT PIN during active lockout window
            const attackRes = await device_security_service_1.deviceSecurityService.verifyPin(localDeviceId, validPin);
            // Must be rejected!
            (0, vitest_1.expect)(attackRes.success).toBe(false);
            (0, vitest_1.expect)(attackRes.failedAttemptsRemaining).toBe(0);
            (0, vitest_1.expect)(attackRes.authenticationLockedUntil).toBeDefined();
            (0, vitest_1.expect)(attackRes.message).toContain('locked out');
        });
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 49: DECOUPLED LOCK-STATE MATRIX TESTS
    // ═══════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('Section 49: Lock-State Matrix & Predictable Semantics', () => {
        (0, vitest_1.it)('State A: applicationLocked = true, authenticationLockedUntil = null (Workstation locked, no lockout)', async () => {
            await device_security_service_1.deviceSecurityService.setupPin(localDeviceId, '849201');
            // Lock workstation
            const lockRes = await device_security_service_1.deviceSecurityService.lockApplication(localDeviceId);
            (0, vitest_1.expect)(lockRes.applicationLocked).toBe(true);
            (0, vitest_1.expect)(lockRes.authenticationLockedUntil).toBeNull();
            (0, vitest_1.expect)(lockRes.isLocked).toBe(true); // Compatibility alias
            const status = await device_security_service_1.deviceSecurityService.getSecurityStatus(localDeviceId);
            (0, vitest_1.expect)(status.applicationLocked).toBe(true);
            (0, vitest_1.expect)(status.authenticationLockedUntil).toBeNull();
            (0, vitest_1.expect)(status.isLocked).toBe(true);
        });
        (0, vitest_1.it)('State B: applicationLocked = false, authenticationLockedUntil = future (Workstation unlocked, auth locked out)', async () => {
            await device_security_service_1.deviceSecurityService.setupPin(localDeviceId, '849201');
            // Trigger 5 wrong attempts without locking workstation
            for (let i = 0; i < 5; i++) {
                await device_security_service_1.deviceSecurityService.verifyPin(localDeviceId, '999888');
            }
            const status = await device_security_service_1.deviceSecurityService.getSecurityStatus(localDeviceId);
            (0, vitest_1.expect)(status.applicationLocked).toBe(false); // Workstation itself is not locked
            (0, vitest_1.expect)(status.authenticationLockedUntil).toBeDefined();
            (0, vitest_1.expect)(status.authenticationLockedUntil).not.toBeNull();
            (0, vitest_1.expect)(status.isLocked).toBe(true); // Backward-compatible alias reports true during lockout
        });
        (0, vitest_1.it)('State C: applicationLocked = true, authenticationLockedUntil = future (Workstation locked AND auth locked out)', async () => {
            await device_security_service_1.deviceSecurityService.setupPin(localDeviceId, '849201');
            // First lock workstation
            await device_security_service_1.deviceSecurityService.lockApplication(localDeviceId);
            // Now fail PIN verification 5 times on the lock screen
            for (let i = 0; i < 5; i++) {
                await device_security_service_1.deviceSecurityService.verifyPin(localDeviceId, '999888');
            }
            const status = await device_security_service_1.deviceSecurityService.getSecurityStatus(localDeviceId);
            (0, vitest_1.expect)(status.applicationLocked).toBe(true);
            (0, vitest_1.expect)(status.authenticationLockedUntil).toBeDefined();
            (0, vitest_1.expect)(status.authenticationLockedUntil).not.toBeNull();
        });
        (0, vitest_1.it)('State D: Lockout expires -> correct PIN unlocks workstation', async () => {
            const pin = '849201';
            await device_security_service_1.deviceSecurityService.setupPin(localDeviceId, pin);
            // Workstation is locked
            await device_security_service_1.deviceSecurityService.lockApplication(localDeviceId);
            // Simulate expired lockout in database
            const past = new Date(Date.now() - 2000);
            await prisma_1.systemPrisma.deviceSecurity.update({
                where: { deviceId: localDeviceId },
                data: {
                    failedAttempts: 5,
                    lockedUntil: past,
                },
            });
            // Correct PIN now succeeds and unlocks application
            const unlockRes = await device_security_service_1.deviceSecurityService.unlockApplication(localDeviceId, pin);
            (0, vitest_1.expect)(unlockRes.applicationLocked).toBe(false);
            (0, vitest_1.expect)(unlockRes.authenticationLockedUntil).toBeNull();
            (0, vitest_1.expect)(unlockRes.isLocked).toBe(false);
            const status = await device_security_service_1.deviceSecurityService.getSecurityStatus(localDeviceId);
            (0, vitest_1.expect)(status.applicationLocked).toBe(false);
            (0, vitest_1.expect)(status.authenticationLockedUntil).toBeNull();
            (0, vitest_1.expect)(status.isLocked).toBe(false);
        });
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 50: CONCURRENCY TESTS
    // ═══════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('Section 50: Concurrency & State Invariance', () => {
        (0, vitest_1.it)('handles 2 simultaneous PIN setup requests with exactly 1 success and 1 conflict', async () => {
            const devId = `concurrent-setup-${Date.now()}`;
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            await prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: devId,
                    installationId: install.id,
                    deviceName: 'Concurrent-Setup-Terminal',
                    platform: 'WINDOWS',
                    status: 'ACTIVE',
                },
            });
            const results = await Promise.allSettled([
                device_security_service_1.deviceSecurityService.setupPin(devId, '839201'),
                device_security_service_1.deviceSecurityService.setupPin(devId, '749102'),
            ]);
            const fulfilled = results.filter((r) => r.status === 'fulfilled');
            const rejected = results.filter((r) => r.status === 'rejected');
            (0, vitest_1.expect)(fulfilled.length).toBe(1);
            (0, vitest_1.expect)(rejected.length).toBe(1);
            (0, vitest_1.expect)(rejected[0].reason).toBeInstanceOf(errors_1.ConflictError);
        });
        (0, vitest_1.it)('handles 10 concurrent wrong PIN attempts without counter or lockout corruption', async () => {
            const devId = `concurrent-fail-${Date.now()}`;
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            await prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: devId,
                    installationId: install.id,
                    deviceName: 'Concurrent-Fail-Terminal',
                    platform: 'WINDOWS',
                    status: 'ACTIVE',
                },
            });
            await device_security_service_1.deviceSecurityService.setupPin(devId, '839201');
            // Fire 10 simultaneous incorrect attempts
            const attempts = Array.from({ length: 10 }).map(() => device_security_service_1.deviceSecurityService.verifyPin(devId, '123456'));
            await Promise.all(attempts);
            const status = await device_security_service_1.deviceSecurityService.getSecurityStatus(devId);
            (0, vitest_1.expect)(status.failedAttempts).toBeGreaterThanOrEqual(5);
            (0, vitest_1.expect)(status.authenticationLockedUntil).toBeDefined();
            (0, vitest_1.expect)(status.failedAttemptsRemaining).toBe(0);
        });
        (0, vitest_1.it)('handles 2 simultaneous PIN changes without corrupted PIN state', async () => {
            const devId = `concurrent-change-${Date.now()}`;
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            await prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: devId,
                    installationId: install.id,
                    deviceName: 'Concurrent-Change-Terminal',
                    platform: 'WINDOWS',
                    status: 'ACTIVE',
                },
            });
            const initialPin = '839201';
            await device_security_service_1.deviceSecurityService.setupPin(devId, initialPin);
            // Attempt 2 concurrent PIN changes using initialPin
            const results = await Promise.allSettled([
                device_security_service_1.deviceSecurityService.changePin(devId, initialPin, '192834'),
                device_security_service_1.deviceSecurityService.changePin(devId, initialPin, '583920'),
            ]);
            const fulfilled = results.filter((r) => r.status === 'fulfilled');
            (0, vitest_1.expect)(fulfilled.length).toBeGreaterThanOrEqual(1);
            // Device PIN must be one of the new valid PINs and must verify cleanly
            const verify1 = await device_security_service_1.deviceSecurityService.verifyPin(devId, '192834');
            const verify2 = await device_security_service_1.deviceSecurityService.verifyPin(devId, '583920');
            // Exactly one new PIN must be active
            (0, vitest_1.expect)(verify1.success !== verify2.success).toBe(true);
        });
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 51: ZERO SECRET LEAKAGE VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('Section 51: Strict Zero Secret Leakage Verification', () => {
        (0, vitest_1.it)('verifies PIN plaintext, hash, and secrets are never present in status DTO or audit metadata', async () => {
            const pin = '948201';
            await device_security_service_1.deviceSecurityService.setupPin(localDeviceId, pin);
            // 1. Status DTO inspection
            const status = await security_service_1.securityService.getStatus();
            const statusJson = JSON.stringify(status);
            (0, vitest_1.expect)(statusJson).not.toContain(pin);
            (0, vitest_1.expect)(statusJson).not.toContain('pinHash');
            (0, vitest_1.expect)(status.pinHash).toBeUndefined();
            (0, vitest_1.expect)(status.pin).toBeUndefined();
            // 2. Perform security actions: failure, change, lock
            await device_security_service_1.deviceSecurityService.verifyPin(localDeviceId, '111222');
            await device_security_service_1.deviceSecurityService.changePin(localDeviceId, pin, '839204');
            await device_security_service_1.deviceSecurityService.lockApplication(localDeviceId);
            // 3. Inspect all AuditEvent rows for this device
            const auditEvents = await prisma_1.systemPrisma.auditEvent.findMany({
                where: { entityId: localDeviceId },
            });
            (0, vitest_1.expect)(auditEvents.length).toBeGreaterThan(0);
            for (const event of auditEvents) {
                (0, vitest_1.expect)(event.description).not.toContain(pin);
                (0, vitest_1.expect)(event.description).not.toContain('839204');
                if (event.metadata) {
                    (0, vitest_1.expect)(event.metadata).not.toContain(pin);
                    (0, vitest_1.expect)(event.metadata).not.toContain('839204');
                    (0, vitest_1.expect)(event.metadata).not.toContain('pinHash');
                    (0, vitest_1.expect)(event.metadata).not.toContain('password');
                    (0, vitest_1.expect)(event.metadata).not.toContain('secret');
                }
            }
        });
        (0, vitest_1.it)('rejects changing PIN to the identical existing PIN (Same-PIN reuse prevention)', async () => {
            const pin = '948201';
            await device_security_service_1.deviceSecurityService.setupPin(localDeviceId, pin);
            await (0, vitest_1.expect)(device_security_service_1.deviceSecurityService.changePin(localDeviceId, pin, pin)).rejects.toThrow(errors_1.ValidationError);
        });
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 52: CONCURRENCY INVARIANTS, REVOCATION GUARDS & LIFECYCLE TESTS
    // ═══════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('Section 52: Hardened Concurrency Invariants, Revocation Guards & Full Lifecycle', () => {
        (0, vitest_1.it)('handles 5 simultaneous incorrect PIN requests resulting in exactly 5 failures and active lockout', async () => {
            const devId = `dev-concurrent-5-${Date.now()}`;
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            await prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: devId,
                    installationId: install.id,
                    deviceName: 'Concurrent-5-Terminal',
                    platform: 'WINDOWS',
                    status: 'ACTIVE',
                },
            });
            const validPin = '839201';
            await device_security_service_1.deviceSecurityService.setupPin(devId, validPin);
            // Fire 5 concurrent wrong PIN verifications
            const results = await Promise.all([
                device_security_service_1.deviceSecurityService.verifyPin(devId, '111222'),
                device_security_service_1.deviceSecurityService.verifyPin(devId, '222333'),
                device_security_service_1.deviceSecurityService.verifyPin(devId, '333444'),
                device_security_service_1.deviceSecurityService.verifyPin(devId, '444555'),
                device_security_service_1.deviceSecurityService.verifyPin(devId, '555666'),
            ]);
            for (const r of results) {
                (0, vitest_1.expect)(r.success).toBe(false);
            }
            const status = await device_security_service_1.deviceSecurityService.getSecurityStatus(devId);
            (0, vitest_1.expect)(status.failedAttempts).toBe(5);
            (0, vitest_1.expect)(status.authenticationLockedUntil).not.toBeNull();
            (0, vitest_1.expect)(status.isLocked).toBe(true);
            // Verify: Correct PIN is rejected during active lockout
            const duringLockout = await device_security_service_1.deviceSecurityService.verifyPin(devId, validPin);
            (0, vitest_1.expect)(duringLockout.success).toBe(false);
            (0, vitest_1.expect)(duringLockout.locked).toBe(true);
        });
        (0, vitest_1.it)('handles 4 concurrent failures + 1 correct PIN with consistent non-lockout state', async () => {
            const devId = `dev-concurrent-mixed-${Date.now()}`;
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            await prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: devId,
                    installationId: install.id,
                    deviceName: 'Concurrent-Mixed-Terminal',
                    platform: 'WINDOWS',
                    status: 'ACTIVE',
                },
            });
            const validPin = '739102';
            await device_security_service_1.deviceSecurityService.setupPin(devId, validPin);
            // 4 wrong attempts + 1 correct attempt simultaneously
            await Promise.all([
                device_security_service_1.deviceSecurityService.verifyPin(devId, '111222'),
                device_security_service_1.deviceSecurityService.verifyPin(devId, '222333'),
                device_security_service_1.deviceSecurityService.verifyPin(devId, '333444'),
                device_security_service_1.deviceSecurityService.verifyPin(devId, '444555'),
                device_security_service_1.deviceSecurityService.verifyPin(devId, validPin),
            ]);
            const status = await device_security_service_1.deviceSecurityService.getSecurityStatus(devId);
            // Because there were only 4 failures, device must NEVER be locked out
            (0, vitest_1.expect)(status.authenticationLockedUntil).toBeNull();
            (0, vitest_1.expect)(status.failedAttempts).toBeLessThan(5);
        });
        (0, vitest_1.it)('proves application screen lock remains locked when auth lockout expires until correct PIN unlocks', async () => {
            const devId = `dev-screen-shield-${Date.now()}`;
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            await prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: devId,
                    installationId: install.id,
                    deviceName: 'Screen-Shield-Terminal',
                    platform: 'WINDOWS',
                    status: 'ACTIVE',
                },
            });
            const validPin = '629104';
            await device_security_service_1.deviceSecurityService.setupPin(devId, validPin);
            // 1. User locks workstation screen shield
            await device_security_service_1.deviceSecurityService.lockApplication(devId);
            let status = await device_security_service_1.deviceSecurityService.getSecurityStatus(devId);
            (0, vitest_1.expect)(status.applicationLocked).toBe(true);
            (0, vitest_1.expect)(status.authenticationLockedUntil).toBeNull();
            // 2. Set expired lockout in DB (15 minutes elapsed)
            const past = new Date(Date.now() - 5000);
            await prisma_1.systemPrisma.deviceSecurity.update({
                where: { deviceId: devId },
                data: {
                    failedAttempts: 5,
                    lockedUntil: past,
                },
            });
            // Status query shows auth lockout has cleared, but application screen lock remains true!
            status = await device_security_service_1.deviceSecurityService.getSecurityStatus(devId);
            (0, vitest_1.expect)(status.applicationLocked).toBe(true);
            (0, vitest_1.expect)(status.authenticationLockedUntil).toBeNull();
            // 3. User provides correct PIN to unlock workstation
            const unlockRes = await device_security_service_1.deviceSecurityService.unlockApplication(devId, validPin);
            (0, vitest_1.expect)(unlockRes.applicationLocked).toBe(false);
            status = await device_security_service_1.deviceSecurityService.getSecurityStatus(devId);
            (0, vitest_1.expect)(status.applicationLocked).toBe(false);
            (0, vitest_1.expect)(status.isLocked).toBe(false);
        });
        (0, vitest_1.it)('rejects new session creation on login when deviceId is REVOKED', async () => {
            const devId = `dev-rev-login-${Date.now()}`;
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            await prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: devId,
                    installationId: install.id,
                    deviceName: 'Revoked-Login-Terminal',
                    platform: 'WINDOWS',
                    status: 'ACTIVE',
                },
            });
            const username = `revlogin-${Date.now()}`;
            await auth_service_1.authService.createUser(username, 'Password123!', 'Revoked Login User', 'ADMIN');
            // Administratively revoke device
            await installation_service_1.installationService.revokeDevice(devId, 'Compromised workstation');
            // Attempting to log in with this revoked deviceId must be rejected
            await (0, vitest_1.expect)(auth_service_1.authService.login(username, 'Password123!', { deviceId: devId })).rejects.toThrow(errors_1.AuthorizationError);
        });
        (0, vitest_1.it)('strictly validates full lifecycle transitions and rejects illegal jumps', async () => {
            // 1. Illegal transitions must fail
            await installation_service_1.installationService.updateLifecycleState('NOT_INITIALIZED', { isReset: true });
            // Jump: NOT_INITIALIZED -> DEVICE_SETUP (illegal jump)
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP')).rejects.toThrow(errors_1.ConflictError);
            // Jump: NOT_INITIALIZED -> READY (illegal jump)
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY')).rejects.toThrow(errors_1.ConflictError);
            // Step forward to APP_SETUP
            await installation_service_1.installationService.updateLifecycleState('APP_SETUP');
            // Jump: APP_SETUP -> READY (illegal jump)
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY')).rejects.toThrow(errors_1.ConflictError);
            // Step forward to PIN_SETUP
            await installation_service_1.installationService.updateLifecycleState('PIN_SETUP');
            // Ensure no PIN is configured on local device
            const localId = installation_service_1.installationService.getOrGenerateDeviceId();
            await prisma_1.systemPrisma.deviceSecurity.deleteMany({ where: { deviceId: localId } });
            // Invariant check: PIN_SETUP -> DEVICE_SETUP without PIN fails
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP')).rejects.toThrow(errors_1.ConflictError);
            // Configure PIN
            await device_security_service_1.deviceSecurityService.setupPin(localId, '839201');
            // Now PIN_SETUP -> DEVICE_SETUP succeeds
            await installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP');
            // Invalidate device status to REVOKED
            await prisma_1.systemPrisma.device.update({
                where: { deviceId: localId },
                data: { status: 'REVOKED' },
            });
            // Invariant check: DEVICE_SETUP -> USER_DISCOVERY without active device fails
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('USER_DISCOVERY')).rejects.toThrow(errors_1.ConflictError);
            // Restore active device status
            await prisma_1.systemPrisma.device.update({
                where: { deviceId: localId },
                data: { status: 'ACTIVE' },
            });
            // Valid full sequence:
            // USER_DISCOVERY -> DATABASE_DISCOVERY -> DATABASE_VALIDATION -> DATABASE_SETUP -> READY
            const step4 = await installation_service_1.installationService.updateLifecycleState('USER_DISCOVERY');
            (0, vitest_1.expect)(step4.lifecycleState).toBe('USER_DISCOVERY');
            const step5 = await installation_service_1.installationService.updateLifecycleState('DATABASE_DISCOVERY');
            (0, vitest_1.expect)(step5.lifecycleState).toBe('DATABASE_DISCOVERY');
            const step6 = await installation_service_1.installationService.updateLifecycleState('DATABASE_VALIDATION');
            (0, vitest_1.expect)(step6.lifecycleState).toBe('DATABASE_VALIDATION');
            const step7 = await installation_service_1.installationService.updateLifecycleState('DATABASE_SETUP');
            (0, vitest_1.expect)(step7.lifecycleState).toBe('DATABASE_SETUP');
            const step8 = await installation_service_1.installationService.updateLifecycleState('READY');
            (0, vitest_1.expect)(step8.lifecycleState).toBe('READY');
            (0, vitest_1.expect)(step8.initializedAt).not.toBeNull();
        });
    });
});
//# sourceMappingURL=security-boundary.test.js.map