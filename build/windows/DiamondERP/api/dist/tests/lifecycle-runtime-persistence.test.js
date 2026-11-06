"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const client_1 = require("@prisma/client");
const installation_service_1 = require("../modules/system/installation.service");
const device_security_service_1 = require("../modules/security/device-security.service");
const auth_service_1 = require("../modules/auth/auth.service");
const database_registry_service_1 = require("../modules/system/database/database-registry.service");
const database_validation_service_1 = require("../modules/system/database/database-validation.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 2.14 — Runtime Use of Lifecycle Schema & Persistence Invariants', () => {
    const testDbFiles = [];
    const cleanupFiles = () => {
        for (const f of testDbFiles) {
            if (fs_1.default.existsSync(f)) {
                try {
                    fs_1.default.unlinkSync(f);
                }
                catch { }
            }
            const wal = f + '-wal';
            const shm = f + '-shm';
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
    };
    (0, vitest_1.beforeEach)(async () => {
        await prisma_1.systemPrisma.databaseRegistry.deleteMany().catch(() => { });
        await prisma_1.systemPrisma.installationUser.deleteMany().catch(() => { });
        await prisma_1.systemPrisma.deviceSecurity.deleteMany().catch(() => { });
        await prisma_1.systemPrisma.device.deleteMany().catch(() => { });
        await prisma_1.systemPrisma.installation.deleteMany().catch(() => { });
    });
    (0, vitest_1.afterAll)(async () => {
        cleanupFiles();
    });
    (0, vitest_1.it)('Step 1: Installation initialization from persistence and survives restart', async () => {
        const install1 = await installation_service_1.installationService.getOrCreateInstallation();
        (0, vitest_1.expect)(install1.installationId).toBeDefined();
        (0, vitest_1.expect)(install1.status).toBe('ACTIVE');
        // Simulate backend process restart: disconnect Prisma and read through a fresh connection
        const freshClient = new client_1.PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
        });
        try {
            const persisted = await freshClient.installation.findUnique({
                where: { id: install1.id },
            });
            (0, vitest_1.expect)(persisted).toBeDefined();
            (0, vitest_1.expect)(persisted?.installationId).toBe(install1.installationId);
            (0, vitest_1.expect)(persisted?.lifecycleState).toBe('NOT_INITIALIZED');
        }
        finally {
            await freshClient.$disconnect();
        }
    });
    (0, vitest_1.it)('Step 2: Device and DeviceSecurity persist and reuse stable identity across restart', async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const device = await installation_service_1.installationService.registerDevice({
            deviceName: 'Workstation-A',
            platform: 'WINDOWS',
            osVersion: '10.0.22631',
        });
        (0, vitest_1.expect)(device.id).toBeDefined();
        // Set up PIN for device with non-trivial digits
        await device_security_service_1.deviceSecurityService.setupPin(device.deviceId, '849201');
        // Simulate restart
        const freshClient = new client_1.PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
        });
        try {
            const persistedDev = await freshClient.device.findUnique({
                where: { deviceId: device.deviceId },
                include: { securityState: true },
            });
            (0, vitest_1.expect)(persistedDev).toBeDefined();
            (0, vitest_1.expect)(persistedDev?.installationId).toBe(install.id);
            (0, vitest_1.expect)(persistedDev?.securityState).toBeDefined();
            (0, vitest_1.expect)(persistedDev?.securityState?.pinHash).toBeDefined();
            (0, vitest_1.expect)(persistedDev?.securityState?.pinHash).not.toBe('849201');
        }
        finally {
            await freshClient.$disconnect();
        }
        // Calling registerDevice or getOrCreateDeviceSecurity again must NOT create duplicate records
        const device2 = await installation_service_1.installationService.registerDevice({
            deviceName: 'Workstation-A',
            platform: 'WINDOWS',
        });
        (0, vitest_1.expect)(device2.id).toBe(device.id);
        const devCount = await prisma_1.systemPrisma.device.count({ where: { installationId: install.id } });
        (0, vitest_1.expect)(devCount).toBe(1);
    });
    (0, vitest_1.it)('Step 3: User state and InstallationUser relationship survive restart', async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const user = await auth_service_1.authService.createUser('lifecycle_admin', 'SecurePass123!', 'Lifecycle Admin', 'ADMIN', []);
        await installation_service_1.installationService.associateUser(install.id, user.id);
        // Simulate restart
        const freshClient = new client_1.PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
        });
        try {
            const relation = await freshClient.installationUser.findUnique({
                where: {
                    installationId_userId: {
                        installationId: install.id,
                        userId: user.id,
                    },
                },
                include: { user: true, installation: true },
            });
            (0, vitest_1.expect)(relation).toBeDefined();
            (0, vitest_1.expect)(relation?.user.username).toBe('lifecycle_admin');
            (0, vitest_1.expect)(relation?.installation.installationId).toBe(install.installationId);
        }
        finally {
            await freshClient.$disconnect();
        }
    });
    (0, vitest_1.it)('Step 4: DatabaseRegistry updates on creation/attachment and survives restart', async () => {
        await installation_service_1.installationService.getOrCreateInstallation();
        const dbFile = path_1.default.resolve(__dirname, `../../test_reg_${Date.now()}.db`);
        testDbFiles.push(dbFile);
        const templatePath = (0, paths_1.getDatabaseTemplatePath)();
        if (templatePath && fs_1.default.existsSync(templatePath)) {
            fs_1.default.copyFileSync(templatePath, dbFile);
        }
        else {
            fs_1.default.writeFileSync(dbFile, 'SQLite format 3\0');
        }
        const reg = await database_registry_service_1.databaseRegistryService.registerDatabase({
            displayName: 'Test Company DB',
            rawPath: dbFile,
            databaseType: 'EXTERNAL',
        });
        (0, vitest_1.expect)(reg.id).toBeDefined();
        // Verify persistence across new Prisma connection
        const freshClient = new client_1.PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
        });
        try {
            const persistedReg = await freshClient.databaseRegistry.findUnique({
                where: { id: reg.id },
            });
            (0, vitest_1.expect)(persistedReg).toBeDefined();
            (0, vitest_1.expect)(persistedReg?.displayName).toBe('Test Company DB');
            (0, vitest_1.expect)(persistedReg?.status).toBe('ACTIVE');
        }
        finally {
            await freshClient.$disconnect();
        }
    });
    (0, vitest_1.it)('Step 5 & 6: Centralized state machine enforces valid progression and rejects invalid transitions', async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        (0, vitest_1.expect)(install.lifecycleState).toBe('NOT_INITIALIZED');
        // Illegal skip from NOT_INITIALIZED directly to READY must fail
        await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY')).rejects.toThrow(errors_1.ConflictError);
        // Illegal skip from NOT_INITIALIZED directly to DATABASE_SETUP must fail
        await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('DATABASE_SETUP')).rejects.toThrow(errors_1.ConflictError);
        // Valid transition to APP_SETUP
        const updated1 = await installation_service_1.installationService.updateLifecycleState('APP_SETUP');
        (0, vitest_1.expect)(updated1.lifecycleState).toBe('APP_SETUP');
        // Transition to PIN_SETUP requires PIN before advancing to DEVICE_SETUP
        await installation_service_1.installationService.updateLifecycleState('PIN_SETUP');
        await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP')).rejects.toThrow(errors_1.ConflictError); // Fails invariant: PIN must exist
        // Configure PIN with non-trivial digits
        const deviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        await device_security_service_1.deviceSecurityService.setupPin(deviceId, '739182');
        // Now advancing to DEVICE_SETUP succeeds
        const updated2 = await installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP');
        (0, vitest_1.expect)(updated2.lifecycleState).toBe('DEVICE_SETUP');
    });
    (0, vitest_1.it)('Step 7: Transactional consistency ensures multi-record operations rollback on failure', async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        // Verify transactional rollback: if user creation succeeds but secondary step fails
        const initialUserCount = await prisma_1.systemPrisma.user.count();
        const initialRelationCount = await prisma_1.systemPrisma.installationUser.count();
        try {
            await prisma_1.systemPrisma.$transaction(async (tx) => {
                const u = await tx.user.create({
                    data: {
                        username: 'tx_fail_user',
                        passwordHash: 'dummy',
                        displayName: 'Tx Fail',
                        role: 'VIEWER',
                    },
                });
                await tx.installationUser.create({
                    data: {
                        installationId: install.id,
                        userId: u.id,
                    },
                });
                // Intentionally trigger foreign key error or exception
                throw new Error('Simulated transaction rollback failure');
            });
        }
        catch {
            // Expected exception
        }
        const postUserCount = await prisma_1.systemPrisma.user.count();
        const postRelationCount = await prisma_1.systemPrisma.installationUser.count();
        (0, vitest_1.expect)(postUserCount).toBe(initialUserCount);
        (0, vitest_1.expect)(postRelationCount).toBe(initialRelationCount);
    });
    (0, vitest_1.it)('Step 8: Restart persistence test - state reloads identically across process resets', async () => {
        // 1. Set lifecycle state
        await installation_service_1.installationService.getOrCreateInstallation();
        await installation_service_1.installationService.updateLifecycleState('APP_SETUP');
        // 2. Stop / reset connection (simulating shutdown)
        await prisma_1.systemPrisma.$disconnect();
        // 3. Restart / instantiate fresh client
        const freshClient = new client_1.PrismaClient({
            datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
        });
        try {
            // 4. Read lifecycle state
            const reloaded = await freshClient.installation.findFirst();
            // 5. Verify same state is recovered
            (0, vitest_1.expect)(reloaded?.lifecycleState).toBe('APP_SETUP');
        }
        finally {
            await freshClient.$disconnect();
        }
    });
    (0, vitest_1.it)('Step 9: Schema version safety rejects corrupted or incompatible database files', async () => {
        const corruptFile = path_1.default.resolve(__dirname, `../../test_corrupt_${Date.now()}.db`);
        testDbFiles.push(corruptFile);
        fs_1.default.writeFileSync(corruptFile, 'NOT A SQLITE FILE HEADER 1234567890');
        const result = await database_validation_service_1.databaseValidationService.validateDatabase(corruptFile);
        (0, vitest_1.expect)(result.isValid).toBe(false);
        (0, vitest_1.expect)(['INVALID', 'CORRUPTED', 'UNSUPPORTED_VERSION']).toContain(result.status);
    });
    (0, vitest_1.it)('Step 10: Referential integrity across Installation, Device, and DatabaseRegistry', async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const dev = await installation_service_1.installationService.registerDevice({ deviceName: 'Ref-Terminal' });
        // Device belongs to Installation
        (0, vitest_1.expect)(dev.installationId).toBe(install.id);
        // Foreign key integrity check: querying through relation
        const found = await prisma_1.systemPrisma.installation.findUnique({
            where: { id: install.id },
            include: {
                devices: true,
                installationUsers: true,
            },
        });
        (0, vitest_1.expect)(found).toBeDefined();
        (0, vitest_1.expect)(found?.devices.some((d) => d.id === dev.id)).toBe(true);
    });
});
//# sourceMappingURL=lifecycle-runtime-persistence.test.js.map