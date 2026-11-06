"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../infrastructure/database/prisma");
const installation_service_1 = require("../modules/system/installation.service");
const onboarding_service_1 = require("../modules/system/onboarding/onboarding.service");
const lifecycle_controller_1 = require("../modules/system/lifecycle.controller");
const onboarding_controller_1 = require("../modules/system/onboarding/onboarding.controller");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Diamond ERP V3 — Phase 4: Lifecycle Bypass Hardening & Direct API Tests', () => {
    let installId;
    let localDeviceId;
    const createdTestFiles = [];
    // Helper to mock Express req, res, next
    const callController = async (handler, reqPartial = {}) => {
        let statusCode = 200;
        let jsonResult = null;
        let nextError = null;
        const mockReq = {
            headers: {},
            body: {},
            params: {},
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
    (0, vitest_1.beforeEach)(async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        installId = install.id;
        localDeviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        // Ensure active device
        await prisma_1.systemPrisma.device.upsert({
            where: { deviceId: localDeviceId },
            update: { status: 'ACTIVE', revokedAt: null, installationId: install.id },
            create: {
                deviceId: localDeviceId,
                installationId: install.id,
                deviceName: 'Harden-Test-Terminal',
                platform: 'WINDOWS',
                status: 'ACTIVE',
            },
        });
        // Reset installation to NOT_INITIALIZED for clean testing
        await prisma_1.systemPrisma.installation.update({
            where: { id: installId },
            data: { lifecycleState: 'NOT_INITIALIZED', initializedAt: null, status: 'ACTIVE' },
        });
        // Clean up device security, installation users, database registry
        await prisma_1.systemPrisma.deviceSecurity.deleteMany({
            where: { deviceId: localDeviceId },
        });
        await prisma_1.systemPrisma.installationUser.deleteMany({
            where: { installationId: installId },
        });
        await prisma_1.systemPrisma.databaseRegistry.deleteMany({
            where: { installationId: installId },
        });
    });
    (0, vitest_1.afterEach)(() => {
        for (const f of createdTestFiles) {
            if (fs_1.default.existsSync(f)) {
                try {
                    fs_1.default.unlinkSync(f);
                }
                catch { }
            }
            const wal = `${f}-wal`;
            const shm = `${f}-shm`;
            if (fs_1.default.existsSync(wal))
                try {
                    fs_1.default.unlinkSync(wal);
                }
                catch { }
            if (fs_1.default.existsSync(shm))
                try {
                    fs_1.default.unlinkSync(shm);
                }
                catch { }
        }
        createdTestFiles.length = 0;
    });
    // ── 1. Illegal Transitions Matrix via Direct API & Service ───────────────
    (0, vitest_1.describe)('1. Illegal Transitions Matrix (Direct API & Service)', () => {
        const illegalTransitions = [
            { from: 'NOT_INITIALIZED', to: 'READY' },
            { from: 'NOT_INITIALIZED', to: 'DATABASE_SETUP' },
            { from: 'APP_SETUP', to: 'READY' },
            { from: 'APP_SETUP', to: 'DEVICE_SETUP' },
            { from: 'PIN_SETUP', to: 'READY' },
            { from: 'DEVICE_SETUP', to: 'DATABASE_SETUP' },
            { from: 'USER_DISCOVERY', to: 'READY' },
            { from: 'DATABASE_DISCOVERY', to: 'READY' },
            { from: 'DATABASE_VALIDATION', to: 'READY' },
        ];
        for (const { from, to } of illegalTransitions) {
            (0, vitest_1.it)(`rejects illegal transition ${from} → ${to} directly via service and HTTP endpoint`, async () => {
                await prisma_1.systemPrisma.installation.update({
                    where: { id: installId },
                    data: { lifecycleState: from },
                });
                // 1. Direct Service Call
                await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState(to)).rejects.toThrow(errors_1.ConflictError);
                // 2. Direct HTTP Controller Call (POST /api/system/lifecycle-state)
                const httpRes = await callController(lifecycle_controller_1.lifecycleController.updateLifecycleState, {
                    body: { lifecycleState: to },
                });
                (0, vitest_1.expect)(httpRes.nextError).toBeInstanceOf(errors_1.ConflictError);
            });
        }
    });
    // ── 2. Strict Server-Side Prerequisite Invariants ────────────────────────
    (0, vitest_1.describe)('2. Strict Server-Side Prerequisite Invariants', () => {
        (0, vitest_1.it)('PIN Prerequisite: rejects PIN_SETUP → DEVICE_SETUP if PIN hash is absent', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'PIN_SETUP' },
            });
            // No PIN configured in deviceSecurity
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP')).rejects.toThrow(/Application PIN must be configured/i);
            // Direct HTTP endpoint must also reject
            const res = await callController(lifecycle_controller_1.lifecycleController.updateLifecycleState, {
                body: { lifecycleState: 'DEVICE_SETUP' },
            });
            (0, vitest_1.expect)(res.nextError).toBeInstanceOf(errors_1.ConflictError);
            (0, vitest_1.expect)(res.nextError.message).toContain('Application PIN must be configured');
        });
        (0, vitest_1.it)('Device Prerequisite: rejects DEVICE_SETUP → USER_DISCOVERY if device is not active', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DEVICE_SETUP' },
            });
            // Revoke the device
            await prisma_1.systemPrisma.device.update({
                where: { deviceId: localDeviceId },
                data: { status: 'REVOKED' },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('USER_DISCOVERY')).rejects.toThrow(/active device registration is required/i);
        });
        (0, vitest_1.it)('User Prerequisite: rejects USER_DISCOVERY → DATABASE_DISCOVERY if no active user is associated', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'USER_DISCOVERY' },
            });
            // No installationUser associated
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('DATABASE_DISCOVERY', { enforceInvariants: true })).rejects.toThrow(/active business user must be associated/i);
            const res = await callController(lifecycle_controller_1.lifecycleController.updateLifecycleState, {
                body: { lifecycleState: 'DATABASE_DISCOVERY' },
            });
            (0, vitest_1.expect)(res.nextError).toBeInstanceOf(errors_1.ConflictError);
            (0, vitest_1.expect)(res.nextError.message).toContain('active business user must be associated');
        });
        (0, vitest_1.it)('Database Prerequisite: rejects DATABASE_VALIDATION → DATABASE_SETUP without active database', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DATABASE_VALIDATION' },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('DATABASE_SETUP', { enforceInvariants: true })).rejects.toThrow(/active database file must exist/i);
        });
        (0, vitest_1.it)('READY Prerequisite: rejects DATABASE_SETUP → READY if database file is missing or invalid', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DATABASE_SETUP' },
            });
            // Provide valid PIN and user so it reaches the database check
            await prisma_1.systemPrisma.deviceSecurity.create({
                data: {
                    deviceId: localDeviceId,
                    pinHash: 'dummy_valid_pin_hash',
                },
            });
            const user = await prisma_1.systemPrisma.user.create({
                data: {
                    username: `ready_test_user_${Date.now()}`,
                    displayName: 'Ready User',
                    passwordHash: 'dummy_hash',
                    role: 'ADMIN',
                    isActive: true,
                },
            });
            await prisma_1.systemPrisma.installationUser.create({
                data: {
                    installationId: installId,
                    userId: user.id,
                },
            });
            // 1. Missing database registry
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY', { enforceInvariants: true })).rejects.toThrow(/No active database is registered/i);
            // 2. Database registered to non-existent file
            const nonExistentPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `missing_${Date.now()}.db`);
            const fakeReg = await prisma_1.systemPrisma.databaseRegistry.create({
                data: {
                    databaseId: 'test-fake-db',
                    displayName: 'Fake DB',
                    canonicalPath: nonExistentPath,
                    status: 'ACTIVE',
                    databaseType: 'EXTERNAL',
                    installationId: installId,
                },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY', { enforceInvariants: true })).rejects.toThrow(/Physical database file is missing/i);
            // Clean up fake registry and user
            await prisma_1.systemPrisma.databaseRegistry.delete({ where: { id: fakeReg.id } });
            await prisma_1.systemPrisma.installationUser.deleteMany({ where: { installationId: installId } });
            await prisma_1.systemPrisma.user.delete({ where: { id: user.id } });
        });
    });
    // ── 3. Direct Out-of-Order API Call Protection ───────────────────────────
    (0, vitest_1.describe)('3. Direct Out-of-Order API Call Protection', () => {
        (0, vitest_1.it)('forbids creating user when at APP_SETUP', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'APP_SETUP' },
            });
            const res = await callController(onboarding_controller_1.onboardingController.createUser, {
                body: { username: 'early_user', password: 'Password123456!', displayName: 'Early' },
            });
            (0, vitest_1.expect)(res.nextError).toBeInstanceOf(errors_1.AuthorizationError);
            (0, vitest_1.expect)(res.nextError.message).toContain('forbidden at lifecycle state APP_SETUP');
        });
        (0, vitest_1.it)('forbids creating database when at USER_DISCOVERY', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'USER_DISCOVERY' },
            });
            const res = await callController(onboarding_controller_1.onboardingController.createDatabase, {
                body: { displayName: 'EarlyDB' },
            });
            (0, vitest_1.expect)(res.nextError).toBeInstanceOf(errors_1.AuthorizationError);
            (0, vitest_1.expect)(res.nextError.message).toContain('forbidden at lifecycle state USER_DISCOVERY');
        });
        (0, vitest_1.it)('forbids calling completeOnboarding when at DATABASE_DISCOVERY', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DATABASE_DISCOVERY' },
            });
            const res = await callController(onboarding_controller_1.onboardingController.completeOnboarding);
            (0, vitest_1.expect)(res.nextError).toBeInstanceOf(errors_1.AuthorizationError);
            (0, vitest_1.expect)(res.nextError.message).toContain('forbidden at lifecycle state DATABASE_DISCOVERY');
        });
        (0, vitest_1.it)('forbids attaching database without explicit confirmAttachment = true', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DATABASE_DISCOVERY' },
            });
            const res = await callController(onboarding_controller_1.onboardingController.attachDatabase, {
                body: { path: 'C:\\test.db', confirmAttachment: false },
            });
            (0, vitest_1.expect)(res.nextError).toBeInstanceOf(errors_1.ValidationError);
            (0, vitest_1.expect)(res.nextError.message).toContain('Explicit confirmation is required');
        });
    });
    // ── 4. Concurrency Safety & Race Condition Protection ─────────────────────
    (0, vitest_1.describe)('4. Concurrency Safety & Race Condition Protection', () => {
        (0, vitest_1.it)('prevents race conditions when two concurrent requests attempt the same transition', async () => {
            // Set to PIN_SETUP with valid PIN configured
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'PIN_SETUP' },
            });
            await prisma_1.systemPrisma.deviceSecurity.create({
                data: {
                    deviceId: localDeviceId,
                    pinHash: 'dummy_hash',
                },
            });
            // Fire two simultaneous transitions to DEVICE_SETUP
            const [resA, resB] = await Promise.all([
                installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP'),
                installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP'),
            ]);
            // Both must succeed safely without throwing unhandled errors
            (0, vitest_1.expect)(resA.lifecycleState).toBe('DEVICE_SETUP');
            (0, vitest_1.expect)(resB.lifecycleState).toBe('DEVICE_SETUP');
            // Verify the database state is cleanly DEVICE_SETUP
            const current = await prisma_1.systemPrisma.installation.findUnique({ where: { id: installId } });
            (0, vitest_1.expect)(current?.lifecycleState).toBe('DEVICE_SETUP');
        });
    });
    // ── 5. Full Resume Verification Across All Stages ─────────────────────────
    (0, vitest_1.describe)('5. Full Resume Verification Across All Stages', () => {
        const STAGES = [
            'NOT_INITIALIZED',
            'APP_SETUP',
            'PIN_SETUP',
            'DEVICE_SETUP',
            'USER_DISCOVERY',
            'DATABASE_DISCOVERY',
            'DATABASE_VALIDATION',
            'DATABASE_SETUP',
            'READY',
        ];
        for (const stage of STAGES) {
            (0, vitest_1.it)(`resumes correctly from "${stage}" after simulated process restart`, async () => {
                await prisma_1.systemPrisma.installation.update({
                    where: { id: installId },
                    data: { lifecycleState: stage },
                });
                // Query status (simulating frontend startup probe on new application run)
                const status = await onboarding_service_1.onboardingService.getOnboardingState();
                (0, vitest_1.expect)(status.lifecycleState).toBe(stage);
                (0, vitest_1.expect)(status.currentStep).toBe(stage);
                if (stage === 'NOT_INITIALIZED') {
                    (0, vitest_1.expect)(status.installationInitialized).toBe(false);
                }
                else {
                    (0, vitest_1.expect)(status.installationInitialized).toBe(true);
                }
            });
        }
    });
});
//# sourceMappingURL=phase4-bypass-hardening.test.js.map