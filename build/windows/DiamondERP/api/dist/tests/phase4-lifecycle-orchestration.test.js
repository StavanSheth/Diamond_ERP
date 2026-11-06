"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../infrastructure/database/prisma");
const onboarding_service_1 = require("../modules/system/onboarding/onboarding.service");
const installation_service_1 = require("../modules/system/installation.service");
const onboarding_authorization_service_1 = require("../modules/system/onboarding/onboarding-authorization.service");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Diamond ERP V3 — Phase 4: Lifecycle Orchestration & State Machine Verification', () => {
    let installId;
    let localDeviceId;
    const createdTestFiles = [];
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
                deviceName: 'Orchestration-Test-Terminal',
                platform: 'WINDOWS',
                status: 'ACTIVE',
            },
        });
        // Reset installation to NOT_INITIALIZED for clean state machine test
        await prisma_1.systemPrisma.installation.update({
            where: { id: installId },
            data: { lifecycleState: 'NOT_INITIALIZED', initializedAt: null, status: 'ACTIVE' },
        });
        // Clean device security state and database registry
        await prisma_1.systemPrisma.deviceSecurity.deleteMany({
            where: { deviceId: localDeviceId },
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
    // ── 1. Legal Forward Transitions ──────────────────────────────────────────
    (0, vitest_1.describe)('1. Legal Forward Transitions (Step-by-step)', () => {
        (0, vitest_1.it)('executes the complete 9-stage lifecycle strictly in order', async () => {
            // 1. NOT_INITIALIZED -> APP_SETUP
            let status = await onboarding_service_1.onboardingService.initializeApplication();
            (0, vitest_1.expect)(status.lifecycleState).toBe('APP_SETUP');
            (0, vitest_1.expect)(status.installationInitialized).toBe(true);
            // 2. APP_SETUP -> PIN_SETUP -> DEVICE_SETUP via atomic setupPin
            status = await onboarding_service_1.onboardingService.setupPin('847291');
            (0, vitest_1.expect)(status.lifecycleState).toBe('DEVICE_SETUP');
            (0, vitest_1.expect)(status.pinConfigured).toBe(true);
            // 3. DEVICE_SETUP -> USER_DISCOVERY via atomic registerDevice
            status = await onboarding_service_1.onboardingService.registerDevice('Front-Desk-Terminal');
            (0, vitest_1.expect)(status.lifecycleState).toBe('USER_DISCOVERY');
            (0, vitest_1.expect)(status.deviceConfigured).toBe(true);
            // 4. USER_DISCOVERY -> DATABASE_DISCOVERY via user creation/selection
            const suffix = Date.now().toString();
            const userRes = await onboarding_service_1.onboardingService.createBusinessUser({
                username: `orchestration_user_${suffix}`,
                password: 'Password123456!',
                displayName: 'Orchestration Admin',
                role: 'ADMIN',
            });
            status = await onboarding_service_1.onboardingService.getOnboardingState();
            (0, vitest_1.expect)(status.lifecycleState).toBe('DATABASE_DISCOVERY');
            (0, vitest_1.expect)(status.userConfigured).toBe(true);
            // 5. DATABASE_DISCOVERY -> DATABASE_VALIDATION -> DATABASE_SETUP via new DB creation
            const dbRes = await onboarding_service_1.onboardingService.createNewDatabase({
                userId: userRes.user.id,
                displayName: `Orchestration_DB_${suffix}`,
            });
            createdTestFiles.push(path_1.default.resolve((0, paths_1.getDatabasesDir)(), `orchestration_db_${suffix}.db`));
            (0, vitest_1.expect)(dbRes.success).toBe(true);
            status = await onboarding_service_1.onboardingService.getOnboardingState();
            (0, vitest_1.expect)(status.lifecycleState).toBe('DATABASE_SETUP');
            (0, vitest_1.expect)(status.databaseConfigured).toBe(true);
            // 6. DATABASE_SETUP -> READY via completeOnboarding
            status = await onboarding_service_1.onboardingService.completeOnboarding();
            (0, vitest_1.expect)(status.lifecycleState).toBe('READY');
            (0, vitest_1.expect)(status.ready).toBe(true);
        });
    });
    // ── 2. Illegal State Transitions ──────────────────────────────────────────
    (0, vitest_1.describe)('2. Illegal Forward & Skip Transitions', () => {
        (0, vitest_1.it)('rejects NOT_INITIALIZED -> READY', async () => {
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY')).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('rejects NOT_INITIALIZED -> DEVICE_SETUP', async () => {
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP')).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('rejects PIN_SETUP -> READY', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'PIN_SETUP' },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY')).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('rejects DEVICE_SETUP -> READY', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DEVICE_SETUP' },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY')).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('rejects USER_DISCOVERY -> READY', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'USER_DISCOVERY' },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY')).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('rejects DATABASE_DISCOVERY -> READY', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DATABASE_DISCOVERY' },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY')).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('rejects DATABASE_VALIDATION -> READY', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DATABASE_VALIDATION' },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY')).rejects.toThrow(errors_1.ConflictError);
        });
    });
    // ── 3. Prerequisite Blocking Tests ────────────────────────────────────────
    (0, vitest_1.describe)('3. Mandatory Prerequisite Enforcement', () => {
        (0, vitest_1.it)('blocks advancing from PIN_SETUP to DEVICE_SETUP if PIN was never configured', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'PIN_SETUP' },
            });
            // Ensure no PIN hash exists
            await prisma_1.systemPrisma.deviceSecurity.deleteMany({
                where: { deviceId: localDeviceId },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP')).rejects.toThrow(/Application PIN must be configured/i);
        });
        (0, vitest_1.it)('blocks advancing from DEVICE_SETUP to USER_DISCOVERY if device is REVOKED', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DEVICE_SETUP' },
            });
            await prisma_1.systemPrisma.device.update({
                where: { deviceId: localDeviceId },
                data: { status: 'REVOKED' },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('USER_DISCOVERY')).rejects.toThrow(/active device registration is required/i);
        });
        (0, vitest_1.it)('blocks transition to READY if database is missing or unattached', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DATABASE_SETUP' },
            });
            // Remove any registered databases for this installation
            await prisma_1.systemPrisma.databaseRegistry.deleteMany({
                where: { installationId: installId },
            });
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.completeOnboarding()).rejects.toThrow(errors_1.ConflictError);
        });
    });
    // ── 4. Resumability Across Incomplete States ──────────────────────────────
    (0, vitest_1.describe)('4. Incomplete State Resumability', () => {
        const TEST_STATES = [
            'APP_SETUP',
            'PIN_SETUP',
            'DEVICE_SETUP',
            'USER_DISCOVERY',
            'DATABASE_DISCOVERY',
            'DATABASE_VALIDATION',
            'DATABASE_SETUP',
            'READY',
        ];
        for (const state of TEST_STATES) {
            (0, vitest_1.it)(`resumes from persisted state "${state}" without resetting`, async () => {
                await prisma_1.systemPrisma.installation.update({
                    where: { id: installId },
                    data: { lifecycleState: state },
                });
                // Simulate restarting / re-reading state from backend
                const status = await onboarding_service_1.onboardingService.getOnboardingState();
                (0, vitest_1.expect)(status.lifecycleState).toBe(state);
            });
        }
    });
    // ── 5. Idempotency & Repeat Safety ────────────────────────────────────────
    (0, vitest_1.describe)('5. Step Idempotency', () => {
        (0, vitest_1.it)('executes initializeApplication repeatedly without corrupting identity', async () => {
            const res1 = await onboarding_service_1.onboardingService.initializeApplication();
            const res2 = await onboarding_service_1.onboardingService.initializeApplication();
            (0, vitest_1.expect)(res1.installation?.id).toBe(res2.installation?.id);
            (0, vitest_1.expect)(res1.installation?.installationId).toBe(res2.installation?.installationId);
            (0, vitest_1.expect)(res2.lifecycleState).toBe('APP_SETUP');
        });
        (0, vitest_1.it)('registers workstation device repeatedly without creating duplicate device IDs', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DEVICE_SETUP' },
            });
            await installation_service_1.installationService.registerDevice({ deviceName: 'Terminal A', platform: 'WINDOWS' });
            await installation_service_1.installationService.registerDevice({ deviceName: 'Terminal A Renamed', platform: 'WINDOWS' });
            const devices = await prisma_1.systemPrisma.device.findMany({
                where: { deviceId: localDeviceId },
            });
            (0, vitest_1.expect)(devices.length).toBe(1);
        });
    });
    // ── 6. Post-READY Security Boundary ───────────────────────────────────────
    (0, vitest_1.describe)('6. Post-READY Security Boundary Hardening', () => {
        (0, vitest_1.it)('forbids unauthenticated lifecycle mutations once in READY state', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'READY' },
            });
            const mockReq = { headers: {} };
            await (0, vitest_1.expect)(onboarding_authorization_service_1.onboardingAuthorizationService.authorize(mockReq, 'INITIALIZE_APPLICATION')).rejects.toThrow(errors_1.AuthenticationError);
        });
        (0, vitest_1.it)('permits reading onboarding status freely at any state including READY', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'READY' },
            });
            const mockReq = { headers: {} };
            await (0, vitest_1.expect)(onboarding_authorization_service_1.onboardingAuthorizationService.authorize(mockReq, 'READ_ONBOARDING_STATUS')).resolves.not.toThrow();
        });
    });
});
//# sourceMappingURL=phase4-lifecycle-orchestration.test.js.map