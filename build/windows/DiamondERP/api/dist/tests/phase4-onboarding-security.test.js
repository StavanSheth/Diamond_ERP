"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const prisma_1 = require("../infrastructure/database/prisma");
const installation_service_1 = require("../modules/system/installation.service");
const onboarding_controller_1 = require("../modules/system/onboarding/onboarding.controller");
const auth_service_1 = require("../modules/auth/auth.service");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Diamond ERP V3 — Phase 4: Bootstrap Security Matrix & Boundary Hardening', () => {
    let installId;
    let localDeviceId;
    (0, vitest_1.beforeEach)(async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        installId = install.id;
        localDeviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        // Ensure local device is registered and ACTIVE
        await prisma_1.systemPrisma.device.upsert({
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
        await prisma_1.systemPrisma.installation.update({
            where: { id: installId },
            data: { lifecycleState: 'NOT_INITIALIZED', status: 'ACTIVE' },
        });
    });
    // ── Helper to invoke controller with mock Express req/res ───────────────
    const callController = async (handler, reqPartial = {}) => {
        let statusCode = 200;
        let jsonResult = null;
        let nextError = null;
        const mockReq = {
            headers: {},
            body: {},
            ...reqPartial,
        };
        const mockRes = {
            status: (code) => {
                statusCode = code;
                return mockRes;
            },
            json: (data) => {
                jsonResult = data;
                return mockRes;
            },
        };
        const mockNext = (err) => {
            nextError = err;
        };
        await handler(mockReq, mockRes, mockNext);
        return { statusCode, jsonResult, nextError };
    };
    // ── 1. Bootstrap State-Based Access Matrix ──────────────────────────────
    (0, vitest_1.describe)('1. Pre-READY Bootstrap State-Based Matrix', () => {
        (0, vitest_1.it)('allows only status and initializeApp when in NOT_INITIALIZED state', async () => {
            // 1. Status is allowed
            const statusRes = await callController(onboarding_controller_1.onboardingController.getOnboardingStatus);
            (0, vitest_1.expect)(statusRes.statusCode).toBe(200);
            (0, vitest_1.expect)(statusRes.jsonResult.success).toBe(true);
            // 2. Initialize app is allowed
            const initRes = await callController(onboarding_controller_1.onboardingController.initializeApp);
            (0, vitest_1.expect)(initRes.statusCode).toBe(200);
            // Reset back to NOT_INITIALIZED to test forbidden mutations
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'NOT_INITIALIZED' },
            });
            // 3. User creation is forbidden at NOT_INITIALIZED
            const userRes = await callController(onboarding_controller_1.onboardingController.createUser, {
                body: { username: 'testuser', password: 'Password123456!', displayName: 'Test' },
            });
            (0, vitest_1.expect)(userRes.nextError).toBeInstanceOf(errors_1.AuthorizationError);
            (0, vitest_1.expect)(userRes.nextError.message).toContain('forbidden at lifecycle state NOT_INITIALIZED');
            // 4. DB creation is forbidden at NOT_INITIALIZED
            const dbRes = await callController(onboarding_controller_1.onboardingController.createDatabase, {
                body: { displayName: 'NewDB' },
            });
            (0, vitest_1.expect)(dbRes.nextError).toBeInstanceOf(errors_1.AuthorizationError);
            // 5. Complete onboarding is forbidden at NOT_INITIALIZED
            const compRes = await callController(onboarding_controller_1.onboardingController.completeOnboarding);
            (0, vitest_1.expect)(compRes.nextError).toBeInstanceOf(errors_1.AuthorizationError);
        });
        (0, vitest_1.it)('allows user discovery/selection in USER_DISCOVERY, but forbids database operations', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'USER_DISCOVERY' },
            });
            // User discovery allowed
            const usersRes = await callController(onboarding_controller_1.onboardingController.discoverUsers);
            (0, vitest_1.expect)(usersRes.statusCode).toBe(200);
            (0, vitest_1.expect)(usersRes.jsonResult.success).toBe(true);
            // Database operations forbidden
            const dbRes = await callController(onboarding_controller_1.onboardingController.createDatabase, {
                body: { displayName: 'PrematureDB' },
            });
            (0, vitest_1.expect)(dbRes.nextError).toBeInstanceOf(errors_1.AuthorizationError);
            (0, vitest_1.expect)(dbRes.nextError.message).toContain('forbidden at lifecycle state USER_DISCOVERY');
            const attachRes = await callController(onboarding_controller_1.onboardingController.attachDatabase, {
                body: { path: 'C:\\test.db', confirmAttachment: true },
            });
            (0, vitest_1.expect)(attachRes.nextError).toBeInstanceOf(errors_1.AuthorizationError);
        });
        (0, vitest_1.it)('allows database operations in DATABASE_VALIDATION and DATABASE_SETUP', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DATABASE_SETUP' },
            });
            // Discover databases allowed
            const dbsRes = await callController(onboarding_controller_1.onboardingController.discoverDatabases);
            (0, vitest_1.expect)(dbsRes.statusCode).toBe(200);
            // Inspect allowed
            const inspRes = await callController(onboarding_controller_1.onboardingController.inspectDatabase, {
                body: { path: 'nonexistent.db' },
            });
            (0, vitest_1.expect)(inspRes.statusCode).toBe(200);
        });
    });
    // ── 2. Post-READY Production Security Boundary ──────────────────────────
    (0, vitest_1.describe)('2. Post-READY Production Boundary', () => {
        (0, vitest_1.beforeEach)(async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'READY' },
            });
        });
        (0, vitest_1.it)('allows anonymous read of onboarding status when READY', async () => {
            const res = await callController(onboarding_controller_1.onboardingController.getOnboardingStatus);
            (0, vitest_1.expect)(res.statusCode).toBe(200);
            (0, vitest_1.expect)(res.jsonResult.success).toBe(true);
            (0, vitest_1.expect)(res.jsonResult.data.lifecycleState).toBe('READY');
        });
        (0, vitest_1.it)('rejects mutations with AuthenticationError (401) when anonymous in READY state', async () => {
            const res = await callController(onboarding_controller_1.onboardingController.createDatabase, {
                body: { displayName: 'UnauthDB' },
            });
            (0, vitest_1.expect)(res.nextError).toBeInstanceOf(errors_1.AuthenticationError);
            (0, vitest_1.expect)(res.nextError.message).toContain('Authentication required');
        });
        (0, vitest_1.it)('rejects mutations with AuthorizationError (403) when user has VIEWER role in READY state', async () => {
            const viewer = await auth_service_1.authService.createUser(`viewer_${Date.now()}`, 'Password123456!', 'Viewer User', 'VIEWER');
            const token = auth_service_1.authService.generateToken({
                userId: viewer.id,
                username: viewer.username,
                role: viewer.role,
                tokenVersion: 1,
            });
            const res = await callController(onboarding_controller_1.onboardingController.createDatabase, {
                headers: { authorization: `Bearer ${token}` },
                body: { displayName: 'ViewerDB' },
            });
            (0, vitest_1.expect)(res.nextError).toBeInstanceOf(errors_1.AuthorizationError);
            (0, vitest_1.expect)(res.nextError.message).toContain('requires ADMIN role');
        });
        (0, vitest_1.it)('allows mutations when authenticated as active ADMIN in READY state', async () => {
            const admin = await auth_service_1.authService.createUser(`admin_${Date.now()}`, 'Password123456!', 'Admin User', 'ADMIN');
            const token = auth_service_1.authService.generateToken({
                userId: admin.id,
                username: admin.username,
                role: admin.role,
                tokenVersion: 1,
            });
            // Attempt inspection (authorized, then schema validation handles body)
            const res = await callController(onboarding_controller_1.onboardingController.inspectDatabase, {
                headers: { authorization: `Bearer ${token}` },
                body: { path: 'test_candidate.db' },
            });
            (0, vitest_1.expect)(res.nextError).toBeNull();
            (0, vitest_1.expect)(res.statusCode).toBe(200);
        });
        (0, vitest_1.it)('rejects any mutation if the local device is REVOKED', async () => {
            // Revoke the device
            await prisma_1.systemPrisma.device.update({
                where: { deviceId: localDeviceId },
                data: { status: 'REVOKED', revokedAt: new Date() },
            });
            const admin = await auth_service_1.authService.createUser(`revadmin_${Date.now()}`, 'Password123456!', 'Revoked Admin', 'ADMIN');
            const token = auth_service_1.authService.generateToken({
                userId: admin.id,
                username: admin.username,
                role: admin.role,
                tokenVersion: 1,
            });
            const res = await callController(onboarding_controller_1.onboardingController.createDatabase, {
                headers: { authorization: `Bearer ${token}` },
                body: { displayName: 'RevokedDB' },
            });
            (0, vitest_1.expect)(res.nextError).toBeInstanceOf(errors_1.AuthorizationError);
            (0, vitest_1.expect)(res.nextError.message).toContain('is REVOKED and cannot perform onboarding');
        });
        (0, vitest_1.it)('strictly forbids special-case privilege bypass for default-admin without valid token', async () => {
            const res = await callController(onboarding_controller_1.onboardingController.createDatabase, {
                body: { displayName: 'HackerDB' },
                user: { id: 'default-admin' }, // Old bypass attempt
            });
            // Must be rejected because default-admin does not exist in Control DB as an active ADMIN user
            (0, vitest_1.expect)(res.nextError).toBeInstanceOf(errors_1.AuthorizationError);
        });
    });
    // ── 3. Zero Secret Leakage Verification ──────────────────────────────────
    (0, vitest_1.describe)('3. Zero Secret Leakage Across All Onboarding DTOs', () => {
        (0, vitest_1.it)('ensures no passwordHash, pinHash, or secret tokens are present in any response', async () => {
            // 1. Status DTO
            const statusRes = await callController(onboarding_controller_1.onboardingController.getOnboardingStatus);
            const statusStr = JSON.stringify(statusRes.jsonResult);
            (0, vitest_1.expect)(statusStr).not.toContain('pinHash');
            (0, vitest_1.expect)(statusStr).not.toContain('passwordHash');
            (0, vitest_1.expect)(statusStr).not.toContain('tokenVersion');
            // 2. Discover Users DTO
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'USER_DISCOVERY' },
            });
            const usersRes = await callController(onboarding_controller_1.onboardingController.discoverUsers);
            const usersStr = JSON.stringify(usersRes.jsonResult);
            (0, vitest_1.expect)(usersStr).not.toContain('pinHash');
            (0, vitest_1.expect)(usersStr).not.toContain('passwordHash');
            (0, vitest_1.expect)(usersStr).not.toContain('tokenVersion');
            (0, vitest_1.expect)(usersStr).not.toContain('password');
            // 3. User Creation DTO
            const createRes = await callController(onboarding_controller_1.onboardingController.createUser, {
                body: {
                    username: `safeuser_${Date.now()}`,
                    password: 'Password123456!',
                    displayName: 'Safe User',
                },
            });
            const createStr = JSON.stringify(createRes.jsonResult);
            (0, vitest_1.expect)(createStr).not.toContain('passwordHash');
            (0, vitest_1.expect)(createStr).not.toContain('pinHash');
            (0, vitest_1.expect)(createStr).not.toContain('token');
        });
    });
});
//# sourceMappingURL=phase4-onboarding-security.test.js.map