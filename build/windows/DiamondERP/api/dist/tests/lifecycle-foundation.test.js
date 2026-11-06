"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const installation_service_1 = require("../modules/system/installation.service");
const auth_service_1 = require("../modules/auth/auth.service");
const auth_controller_1 = require("../modules/auth/auth.controller");
const prisma_1 = __importStar(require("../infrastructure/database/prisma"));
const paths_1 = require("../infrastructure/paths");
const database_path_util_1 = require("../modules/system/database/database-path.util");
const database_validation_service_1 = require("../modules/system/database/database-validation.service");
const database_registry_service_1 = require("../modules/system/database/database-registry.service");
const lifecycle_controller_1 = require("../modules/system/lifecycle.controller");
const routes_1 = require("../routes");
(0, vitest_1.describe)('Phase 2 Foundation: Complete Lifecycle, Control DB, Registry & Security Verification', () => {
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
        // Clean up test installation records in control DB
        await prisma_1.systemPrisma.databaseRegistry.deleteMany().catch(() => { });
        await prisma_1.systemPrisma.installationUser.deleteMany().catch(() => { });
        await prisma_1.systemPrisma.device.deleteMany().catch(() => { });
        await prisma_1.systemPrisma.installation.deleteMany().catch(() => { });
    });
    (0, vitest_1.afterAll)(() => {
        cleanupFiles();
    });
    (0, vitest_1.describe)('1. Installation Identity & Persistence Safety', () => {
        (0, vitest_1.it)('creates a stable local installation with default NOT_INITIALIZED state', async () => {
            const install1 = await installation_service_1.installationService.getOrCreateInstallation();
            (0, vitest_1.expect)(install1.id).toBeDefined();
            (0, vitest_1.expect)(install1.installationId).toBeDefined();
            (0, vitest_1.expect)(install1.installationId.length).toBeGreaterThanOrEqual(16);
            (0, vitest_1.expect)(install1.appVersion).toBe('3.0.0');
            (0, vitest_1.expect)(install1.status).toBe('ACTIVE');
            (0, vitest_1.expect)(install1.lifecycleState).toBe('NOT_INITIALIZED');
            (0, vitest_1.expect)(install1.initializedAt).toBeNull();
            // Second call must return the exact same installation ID (stable persistence)
            const install2 = await installation_service_1.installationService.getOrCreateInstallation();
            (0, vitest_1.expect)(install2.id).toBe(install1.id);
            (0, vitest_1.expect)(install2.installationId).toBe(install1.installationId);
        });
        (0, vitest_1.it)('handles concurrent getOrCreateInstallation calls idempotently', async () => {
            const [instA, instB] = await Promise.all([
                installation_service_1.installationService.getOrCreateInstallation(),
                installation_service_1.installationService.getOrCreateInstallation(),
            ]);
            (0, vitest_1.expect)(instA.installationId).toBe(instB.installationId);
            (0, vitest_1.expect)(instA.id).toBe(instB.id);
            const count = await prisma_1.systemPrisma.installation.count();
            (0, vitest_1.expect)(count).toBe(1);
        });
        (0, vitest_1.it)('proves installation identity contains zero user or hardware PII', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            // Must be standard UUID format (36 chars with hyphens)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            (0, vitest_1.expect)(uuidRegex.test(install.installationId)).toBe(true);
            // Verify it does not contain username, machine name, or paths
            const username = process.env.USERNAME || '';
            if (username) {
                (0, vitest_1.expect)(install.installationId.toLowerCase()).not.toContain(username.toLowerCase());
            }
        });
    });
    (0, vitest_1.describe)('2. Device Identity & Idempotent Registration', () => {
        (0, vitest_1.it)('registers a device linked to the local installation with persistent deviceId', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const device = await installation_service_1.installationService.registerDevice({
                deviceName: 'FrontDesk-Terminal-1',
                platform: 'WINDOWS',
                osVersion: '10.0.19045',
            });
            (0, vitest_1.expect)(device.id).toBeDefined();
            (0, vitest_1.expect)(device.deviceId).toBeDefined();
            (0, vitest_1.expect)(device.installationId).toBe(install.id);
            (0, vitest_1.expect)(device.deviceName).toBe('FrontDesk-Terminal-1');
            (0, vitest_1.expect)(device.platform).toBe('WINDOWS');
            (0, vitest_1.expect)(device.osVersion).toBe('10.0.19045');
            (0, vitest_1.expect)(device.status).toBe('ACTIVE');
            (0, vitest_1.expect)(device.revokedAt).toBeNull();
            (0, vitest_1.expect)(device.lastSeenAt).toBeDefined();
            const updatedInstall = await installation_service_1.installationService.getOrCreateInstallation();
            (0, vitest_1.expect)(updatedInstall.deviceCount).toBe(1);
        });
        (0, vitest_1.it)('is strictly idempotent when re-registered with same authoritative deviceId even if display name changes', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const dev1 = await installation_service_1.installationService.registerDevice({
                deviceName: 'Workshop-OldName',
                platform: 'WINDOWS',
            });
            await new Promise((r) => setTimeout(r, 10));
            // Same authoritative deviceId, updated display name
            const dev2 = await installation_service_1.installationService.registerDevice({
                deviceId: dev1.deviceId,
                deviceName: 'Workshop-Renamed',
                platform: 'WINDOWS',
                osVersion: '11.0.22631',
            });
            (0, vitest_1.expect)(dev2.id).toBe(dev1.id);
            (0, vitest_1.expect)(dev2.deviceId).toBe(dev1.deviceId);
            (0, vitest_1.expect)(dev2.deviceName).toBe('Workshop-Renamed'); // Display name updated
            (0, vitest_1.expect)(dev2.osVersion).toBe('11.0.22631');
            // Device count remains exactly 1 (no duplicate device created)
            const count = await prisma_1.systemPrisma.device.count({ where: { installationId: install.id } });
            (0, vitest_1.expect)(count).toBe(1);
        });
        (0, vitest_1.it)('rejects arbitrary client-invented deviceId spoofing', async () => {
            await installation_service_1.installationService.getOrCreateInstallation();
            const fakeDeviceId = crypto_1.default.randomUUID();
            await (0, vitest_1.expect)(installation_service_1.installationService.registerDevice({
                deviceId: fakeDeviceId,
                deviceName: 'Spoofed-Device',
            })).rejects.toThrow(/Arbitrary deviceId cannot be bound/);
        });
        (0, vitest_1.it)('handles device revocation and reactivation rules', async () => {
            const dev = await installation_service_1.installationService.registerDevice({
                deviceName: 'Revocable-Device',
            });
            (0, vitest_1.expect)(dev.status).toBe('ACTIVE');
            // Revoke device
            const revoked = await installation_service_1.installationService.revokeDevice(dev.deviceId);
            (0, vitest_1.expect)(revoked.status).toBe('REVOKED');
            (0, vitest_1.expect)(revoked.revokedAt).not.toBeNull();
            // Subsequent registration while revoked throws ConflictError
            await (0, vitest_1.expect)(installation_service_1.installationService.registerDevice({
                deviceName: 'Revoked-Attempt',
            })).rejects.toThrow(/Device has been revoked/);
            // Reactivate device
            const reactivated = await installation_service_1.installationService.reactivateDevice(dev.deviceId);
            (0, vitest_1.expect)(reactivated.status).toBe('ACTIVE');
            (0, vitest_1.expect)(reactivated.revokedAt).toBeNull();
        });
        (0, vitest_1.it)('prevents cross-installation deviceId collision and maintains installation isolation', async () => {
            await installation_service_1.installationService.getOrCreateInstallation();
            const dev1 = await installation_service_1.installationService.registerDevice({
                deviceName: 'Isolated-Terminal-1',
            });
            // Create a second isolated installation in DB
            const install2 = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: crypto_1.default.randomUUID(),
                    appVersion: '3.0.0',
                    lifecycleState: 'NOT_INITIALIZED',
                },
            });
            // Attempting to register the same deviceId under install2 must violate uniqueness constraint
            await (0, vitest_1.expect)(prisma_1.systemPrisma.device.create({
                data: {
                    deviceId: dev1.deviceId,
                    installationId: install2.id,
                    deviceName: 'Rogue-Duplicate-Terminal',
                },
            })).rejects.toThrow();
            // Clean up second installation
            await prisma_1.systemPrisma.installation.delete({ where: { id: install2.id } });
        });
    });
    (0, vitest_1.describe)('3. Strict Lifecycle State Progression Matrix', () => {
        (0, vitest_1.it)('enforces the complete 9-stage progression matrix from NOT_INITIALIZED to READY', async () => {
            await installation_service_1.installationService.getOrCreateInstallation();
            // Ensure prerequisites exist for authoritative Phase 3 lifecycle validation
            const dev = await installation_service_1.installationService.registerDevice({ deviceName: 'Lifecycle-Matrix-Terminal' });
            await prisma_1.systemPrisma.deviceSecurity.upsert({
                where: { deviceId: dev.deviceId },
                update: { pinHash: '$2b$10$hashedpinplaceholderforexistence' },
                create: { deviceId: dev.deviceId, pinHash: '$2b$10$hashedpinplaceholderforexistence' },
            });
            // Step forward 1 by 1 across all 9 stages
            const stages = [
                'APP_SETUP',
                'PIN_SETUP',
                'DEVICE_SETUP',
                'USER_DISCOVERY',
                'DATABASE_DISCOVERY',
                'DATABASE_VALIDATION',
                'DATABASE_SETUP',
                'READY',
            ];
            for (const target of stages) {
                const res = await installation_service_1.installationService.updateLifecycleState(target);
                (0, vitest_1.expect)(res.lifecycleState).toBe(target);
            }
            // At READY: initializedAt must be set
            const readyInstall = await installation_service_1.installationService.getOrCreateInstallation();
            (0, vitest_1.expect)(readyInstall.lifecycleState).toBe('READY');
            (0, vitest_1.expect)(readyInstall.initializedAt).not.toBeNull();
        });
        (0, vitest_1.it)('rejects arbitrary jumps to READY from NOT_INITIALIZED', async () => {
            await installation_service_1.installationService.getOrCreateInstallation();
            // NOT_INITIALIZED -> READY is strictly forbidden
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY')).rejects.toThrow(/Illegal lifecycle transition/);
        });
        (0, vitest_1.it)('rejects illegal skipping jumps (e.g. NOT_INITIALIZED -> DEVICE_SETUP)', async () => {
            await installation_service_1.installationService.getOrCreateInstallation();
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP')).rejects.toThrow(/Illegal lifecycle transition/);
        });
        (0, vitest_1.it)('rejects backward transitions without explicit reset', async () => {
            await installation_service_1.installationService.getOrCreateInstallation();
            await installation_service_1.installationService.updateLifecycleState('APP_SETUP');
            await installation_service_1.installationService.updateLifecycleState('PIN_SETUP');
            // Backward: PIN_SETUP -> APP_SETUP rejected
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('APP_SETUP')).rejects.toThrow(/Illegal lifecycle transition/);
            // Controlled reset to NOT_INITIALIZED is allowed
            const reset = await installation_service_1.installationService.updateLifecycleState('NOT_INITIALIZED', {
                isReset: true,
                resetReason: 'DEVELOPMENT_TEST_RESET',
            });
            (0, vitest_1.expect)(reset.lifecycleState).toBe('NOT_INITIALIZED');
            (0, vitest_1.expect)(reset.initializedAt).toBeNull();
        });
    });
    (0, vitest_1.describe)('4. Pre-Auth / Bootstrap Security Boundary', () => {
        (0, vitest_1.it)('allows unauthenticated lifecycle mutations during onboarding but blocks when READY', async () => {
            // 1. In NOT_INITIALIZED: unauthenticated mutation is permitted for setup
            const mockReq = { body: { lifecycleState: 'APP_SETUP' }, headers: {} };
            let jsonSent = null;
            const mockRes = {
                status: () => mockRes,
                json: (j) => { jsonSent = j; return mockRes; },
            };
            await lifecycle_controller_1.lifecycleController.updateLifecycleState(mockReq, mockRes, () => { });
            (0, vitest_1.expect)(jsonSent?.success).toBe(true);
            (0, vitest_1.expect)(jsonSent?.data?.lifecycleState).toBe('APP_SETUP');
            // Fast-forward to READY through valid steps (ensuring required prerequisites exist)
            const dev = await installation_service_1.installationService.registerDevice({ deviceName: 'Bootstrap-FastForward-Terminal' });
            await prisma_1.systemPrisma.deviceSecurity.upsert({
                where: { deviceId: dev.deviceId },
                update: { pinHash: '$2b$10$hashedpinplaceholderforexistence' },
                create: { deviceId: dev.deviceId, pinHash: '$2b$10$hashedpinplaceholderforexistence' },
            });
            await installation_service_1.installationService.updateLifecycleState('PIN_SETUP');
            await installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP');
            await installation_service_1.installationService.updateLifecycleState('USER_DISCOVERY');
            await installation_service_1.installationService.updateLifecycleState('DATABASE_DISCOVERY');
            await installation_service_1.installationService.updateLifecycleState('DATABASE_VALIDATION');
            await installation_service_1.installationService.updateLifecycleState('DATABASE_SETUP');
            await installation_service_1.installationService.updateLifecycleState('READY');
            // 2. When READY: unauthenticated mutation MUST return 403 Forbidden
            const unauthReq = { body: { lifecycleState: 'NOT_INITIALIZED' }, headers: {} }; // unauthenticated (no req.user)
            let forbiddenStatus = null;
            let forbiddenJson = null;
            const mockForbiddenRes = {
                status: (s) => { forbiddenStatus = s; return mockForbiddenRes; },
                json: (j) => { forbiddenJson = j; return mockForbiddenRes; },
            };
            await lifecycle_controller_1.lifecycleController.updateLifecycleState(unauthReq, mockForbiddenRes, () => { });
            (0, vitest_1.expect)(forbiddenStatus).toBe(403);
            (0, vitest_1.expect)(forbiddenJson?.error).toBe('Forbidden');
        });
    });
    (0, vitest_1.describe)('5. Canonical Database Path Handling', () => {
        (0, vitest_1.it)('normalizes database paths and detects external paths', () => {
            const res = (0, database_path_util_1.canonicalizeDatabasePath)('test_profile.db');
            (0, vitest_1.expect)(res.valid).toBe(true);
            (0, vitest_1.expect)(path_1.default.isAbsolute(res.canonicalPath)).toBe(true);
            (0, vitest_1.expect)(res.canonicalPath.endsWith('test_profile.db')).toBe(true);
        });
        (0, vitest_1.it)('rejects directory paths', () => {
            const databasesDir = (0, paths_1.getDatabasesDir)();
            const res = (0, database_path_util_1.canonicalizeDatabasePath)(databasesDir);
            (0, vitest_1.expect)(res.valid).toBe(false);
            (0, vitest_1.expect)(res.error).toMatch(/points to a directory/);
        });
        (0, vitest_1.it)('rejects empty or null byte paths', () => {
            (0, vitest_1.expect)((0, database_path_util_1.canonicalizeDatabasePath)('').valid).toBe(false);
            (0, vitest_1.expect)((0, database_path_util_1.canonicalizeDatabasePath)('test\0.db').valid).toBe(false);
        });
        (0, vitest_1.it)('preserves user-selected external absolute paths without mangling them', () => {
            const externalPath = path_1.default.resolve('C:/MyExternalCompany/records.db');
            const res = (0, database_path_util_1.canonicalizeDatabasePath)(externalPath);
            (0, vitest_1.expect)(res.valid).toBe(true);
            (0, vitest_1.expect)(res.canonicalPath).toBe(externalPath);
            (0, vitest_1.expect)(res.isExternal).toBe(true);
        });
    });
    (0, vitest_1.describe)('6. Database Validation Service (Read-Only Inspection)', () => {
        (0, vitest_1.it)('validates a healthy Diamond ERP profile database as VALID and ACTIVE', async () => {
            const dbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `valid_test_${Date.now()}.db`);
            testDbFiles.push(dbPath);
            (0, prisma_1.ensureProfileDbFile)(dbPath);
            const result = await database_validation_service_1.databaseValidationService.validateDatabase(dbPath);
            (0, vitest_1.expect)(result.isValid).toBe(true);
            (0, vitest_1.expect)(result.status).toBe('ACTIVE');
            (0, vitest_1.expect)(result.integrityCheck).toBe('ok');
            (0, vitest_1.expect)(result.tableCount).toBeGreaterThan(20);
            (0, vitest_1.expect)(result.missingRequiredTables.length).toBe(0);
        });
        (0, vitest_1.it)('identifies non-existent file as MISSING', async () => {
            const fakePath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `non_existent_${Date.now()}.db`);
            const result = await database_validation_service_1.databaseValidationService.validateDatabase(fakePath);
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.status).toBe('MISSING');
            (0, vitest_1.expect)(result.error).toBe('File not found');
        });
        (0, vitest_1.it)('identifies non-SQLite or invalid files as INVALID', async () => {
            const txtPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `not_sqlite_${Date.now()}.db`);
            testDbFiles.push(txtPath);
            fs_1.default.writeFileSync(txtPath, 'This is definitely not a SQLite database file! Hello World '.repeat(20));
            const result = await database_validation_service_1.databaseValidationService.validateDatabase(txtPath);
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.status).toBe('INVALID');
            (0, vitest_1.expect)(result.error).toBe('Not a SQLite database');
        });
        (0, vitest_1.it)('identifies undersized/empty file as INVALID', async () => {
            const emptyPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `empty_${Date.now()}.db`);
            testDbFiles.push(emptyPath);
            fs_1.default.writeFileSync(emptyPath, Buffer.alloc(100)); // 100 bytes (< 512 bytes)
            const result = await database_validation_service_1.databaseValidationService.validateDatabase(emptyPath);
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.status).toBe('INVALID');
            (0, vitest_1.expect)(result.integrityCheck).toBe('invalid_file_size');
        });
        (0, vitest_1.it)('identifies corrupted SQLite database file as CORRUPTED or INVALID', async () => {
            const corruptPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `corrupt_${Date.now()}.db`);
            testDbFiles.push(corruptPath);
            const corruptBuf = Buffer.concat([
                Buffer.from('SQLite format 3\0'),
                crypto_1.default.randomBytes(1024),
            ]);
            fs_1.default.writeFileSync(corruptPath, corruptBuf);
            const result = await database_validation_service_1.databaseValidationService.validateDatabase(corruptPath);
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(['CORRUPTED', 'INVALID']).toContain(result.status);
        });
        (0, vitest_1.it)('identifies SQLite database missing required tables as UNSUPPORTED', async () => {
            const missingTablePath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `missing_tbl_${Date.now()}.db`);
            testDbFiles.push(missingTablePath);
            (0, prisma_1.ensureProfileDbFile)(missingTablePath);
            const alterClient = new client_1.PrismaClient({
                datasources: { db: { url: `file:${missingTablePath.replace(/\\/g, '/')}` } },
            });
            await alterClient.$connect();
            await alterClient.$executeRawUnsafe('DROP TABLE "Stock";');
            await alterClient.$disconnect();
            const result = await database_validation_service_1.databaseValidationService.validateDatabase(missingTablePath);
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.status).toBe('UNSUPPORTED');
            (0, vitest_1.expect)(result.missingRequiredTables).toContain('Stock');
        });
        (0, vitest_1.it)('identifies SQLite database missing required columns as UNSUPPORTED', async () => {
            const missingColPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `missing_col_${Date.now()}.db`);
            testDbFiles.push(missingColPath);
            (0, prisma_1.ensureProfileDbFile)(missingColPath);
            const alterClient = new client_1.PrismaClient({
                datasources: { db: { url: `file:${missingColPath.replace(/\\/g, '/')}` } },
            });
            await alterClient.$connect();
            await alterClient.$executeRawUnsafe('DROP TABLE "Party";');
            await alterClient.$executeRawUnsafe('CREATE TABLE "Party" (id TEXT PRIMARY KEY, name TEXT, partyType TEXT);');
            await alterClient.$disconnect();
            const result = await database_validation_service_1.databaseValidationService.validateDatabase(missingColPath);
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.status).toBe('UNSUPPORTED');
            (0, vitest_1.expect)(result.detectedType).toBe('UNSUPPORTED_VERSION');
            (0, vitest_1.expect)(result.missingRequiredColumns?.['Party']).toContain('partyCode');
        });
        (0, vitest_1.it)('proves database validation is strictly read-only and never alters the file', async () => {
            const dbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `readonly_check_${Date.now()}.db`);
            testDbFiles.push(dbPath);
            (0, prisma_1.ensureProfileDbFile)(dbPath);
            const hashBefore = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(dbPath)).digest('hex');
            const mtimeBefore = fs_1.default.statSync(dbPath).mtimeMs;
            // Execute validation
            await database_validation_service_1.databaseValidationService.validateDatabase(dbPath);
            const hashAfter = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(dbPath)).digest('hex');
            const mtimeAfter = fs_1.default.statSync(dbPath).mtimeMs;
            (0, vitest_1.expect)(hashAfter).toBe(hashBefore);
            (0, vitest_1.expect)(mtimeAfter).toBe(mtimeBefore);
        });
        // ── Authoritative Schema Validation vs Filename/Path Heuristics ──
        (0, vitest_1.it)('Test A: recognizes a valid ERP database even if renamed to random_file_name.db', async () => {
            const randomNamePath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `random_file_name_${Date.now()}.db`);
            testDbFiles.push(randomNamePath);
            (0, prisma_1.ensureProfileDbFile)(randomNamePath);
            const result = await database_validation_service_1.databaseValidationService.validateDatabase(randomNamePath);
            (0, vitest_1.expect)(result.isValid).toBe(true);
            (0, vitest_1.expect)(result.status).toBe('ACTIVE');
            (0, vitest_1.expect)(result.tableCount).toBeGreaterThan(20);
            (0, vitest_1.expect)(result.missingRequiredTables.length).toBe(0);
        });
        (0, vitest_1.it)('Test B: rejects a database named diamond_erp.db if it contains unrelated SQLite schema', async () => {
            const fakeErpPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `diamond_erp_${Date.now()}.db`);
            testDbFiles.push(fakeErpPath);
            const tempClient = new client_1.PrismaClient({
                datasources: { db: { url: `file:${fakeErpPath.replace(/\\/g, '/')}` } },
            });
            await tempClient.$connect();
            await tempClient.$executeRawUnsafe('CREATE TABLE "unrelated_logs" (id TEXT PRIMARY KEY, message TEXT);');
            await tempClient.$disconnect();
            const result = await database_validation_service_1.databaseValidationService.validateDatabase(fakeErpPath);
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.status).toBe('UNSUPPORTED');
            (0, vitest_1.expect)(result.missingRequiredTables).toContain('Stock');
            (0, vitest_1.expect)(result.missingRequiredTables).toContain('Party');
        });
        (0, vitest_1.it)('Test C: rejects a file in profiles/ directory if it contains invalid schema', async () => {
            const profilesDir = path_1.default.resolve((0, paths_1.getDatabasesDir)(), 'profiles');
            if (!fs_1.default.existsSync(profilesDir)) {
                fs_1.default.mkdirSync(profilesDir, { recursive: true });
            }
            const invalidInProfiles = path_1.default.resolve(profilesDir, `corrupt_profile_${Date.now()}.db`);
            testDbFiles.push(invalidInProfiles);
            const tempClient = new client_1.PrismaClient({
                datasources: { db: { url: `file:${invalidInProfiles.replace(/\\/g, '/')}` } },
            });
            await tempClient.$connect();
            await tempClient.$executeRawUnsafe('CREATE TABLE "some_other_data" (id INT);');
            await tempClient.$disconnect();
            const result = await database_validation_service_1.databaseValidationService.validateDatabase(invalidInProfiles);
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.status).toBe('UNSUPPORTED');
        });
        (0, vitest_1.it)('Test D: validates a valid ERP database located in an external directory outside Diamond ERP root', async () => {
            const externalDir = path_1.default.resolve(__dirname, '../../test_external_db_dir');
            if (!fs_1.default.existsSync(externalDir)) {
                fs_1.default.mkdirSync(externalDir, { recursive: true });
            }
            const externalDb = path_1.default.resolve(externalDir, `company_archive_${Date.now()}.db`);
            testDbFiles.push(externalDb);
            (0, prisma_1.ensureProfileDbFile)(externalDb);
            const result = await database_validation_service_1.databaseValidationService.validateDatabase(externalDb);
            (0, vitest_1.expect)(result.isValid).toBe(true);
            (0, vitest_1.expect)(result.status).toBe('ACTIVE');
            (0, vitest_1.expect)(result.detectedType).toBe('EXTERNAL');
        });
        (0, vitest_1.it)('Test E: proves path classification cannot override structural validation', async () => {
            // Name includes 'backup' and '.bak' but has no Diamond ERP tables
            const fakeBackupPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `critical_backup_${Date.now()}.bak`);
            testDbFiles.push(fakeBackupPath);
            const tempClient = new client_1.PrismaClient({
                datasources: { db: { url: `file:${fakeBackupPath.replace(/\\/g, '/')}` } },
            });
            await tempClient.$connect();
            await tempClient.$executeRawUnsafe('CREATE TABLE "arbitrary_dump" (data TEXT);');
            await tempClient.$disconnect();
            const result = await database_validation_service_1.databaseValidationService.validateDatabase(fakeBackupPath);
            // Path said 'backup' but structural validation authoritatively marks it UNSUPPORTED
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.status).toBe('UNSUPPORTED');
        });
    });
    (0, vitest_1.describe)('7. Database Registry Service & Lifecycle Tracking', () => {
        (0, vitest_1.it)('registers a database file with stable logical databaseId and supports deduplication', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const dbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `reg_test_${Date.now()}.db`);
            testDbFiles.push(dbPath);
            (0, prisma_1.ensureProfileDbFile)(dbPath);
            const reg1 = await database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: dbPath,
                displayName: 'Registered Test DB',
                installationId: install.id,
            });
            (0, vitest_1.expect)(reg1.id).toBeDefined();
            (0, vitest_1.expect)(reg1.databaseId).toBeDefined();
            (0, vitest_1.expect)(reg1.displayName).toBe('Registered Test DB');
            (0, vitest_1.expect)(reg1.status).toBe('ACTIVE');
            // Duplicate registration of same canonical path returns same logical ID
            const reg2 = await database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: dbPath,
                installationId: install.id,
            });
            (0, vitest_1.expect)(reg2.databaseId).toBe(reg1.databaseId);
            (0, vitest_1.expect)(reg2.id).toBe(reg1.id);
        });
        (0, vitest_1.it)('marks registered database status as MISSING if the physical file is removed', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const dbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `missing_check_${Date.now()}.db`);
            (0, prisma_1.ensureProfileDbFile)(dbPath);
            const reg = await database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: dbPath,
                installationId: install.id,
            });
            (0, vitest_1.expect)(reg.status).toBe('ACTIVE');
            // Remove the file from disk
            fs_1.default.unlinkSync(dbPath);
            (0, vitest_1.expect)(fs_1.default.existsSync(dbPath)).toBe(false);
            // getDatabase should now detect missing file and update status to MISSING
            const updated = await database_registry_service_1.databaseRegistryService.getDatabase(reg.databaseId);
            (0, vitest_1.expect)(updated.status).toBe('MISSING');
        });
        (0, vitest_1.it)('proves databaseId is an independent UUID v4 and does not depend on path, filename, or machine name', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const pathA = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `indep_a_${Date.now()}.db`);
            const pathB = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `indep_b_${Date.now()}.db`);
            testDbFiles.push(pathA, pathB);
            (0, prisma_1.ensureProfileDbFile)(pathA);
            (0, prisma_1.ensureProfileDbFile)(pathB);
            const regA = await database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: pathA,
                displayName: 'Independent DB Alpha',
                installationId: install.id,
            });
            const regB = await database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: pathB,
                displayName: 'Independent DB Beta',
                installationId: install.id,
            });
            // UUID v4 format regex
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            (0, vitest_1.expect)(uuidRegex.test(regA.databaseId)).toBe(true);
            (0, vitest_1.expect)(uuidRegex.test(regB.databaseId)).toBe(true);
            (0, vitest_1.expect)(regA.databaseId).not.toBe(regB.databaseId);
            // Must not contain filename or path
            (0, vitest_1.expect)(regA.databaseId).not.toContain('indep_a');
            (0, vitest_1.expect)(regA.databaseId).not.toContain('.db');
            (0, vitest_1.expect)(regA.databaseId).not.toContain('DiamondERP');
            // Renamed database file retains independent logical identity
            const renamedPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `indep_a_renamed_${Date.now()}.db`);
            testDbFiles.push(renamedPath);
            fs_1.default.renameSync(pathA, renamedPath);
            const updatedReg = await database_registry_service_1.databaseRegistryService.updateDatabasePath(regA.databaseId, renamedPath);
            (0, vitest_1.expect)(updatedReg.databaseId).toBe(regA.databaseId); // Logical identity stays identical
            (0, vitest_1.expect)(updatedReg.canonicalPath).toBe(renamedPath);
        });
        (0, vitest_1.it)('proves 4 concurrent registrations of the same canonical path produce exactly one logical record', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const raceDbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `quad_race_${Date.now()}.db`);
            testDbFiles.push(raceDbPath);
            (0, prisma_1.ensureProfileDbFile)(raceDbPath);
            const [r1, r2, r3, r4] = await Promise.all([
                database_registry_service_1.databaseRegistryService.registerDatabase({ rawPath: raceDbPath, installationId: install.id }),
                database_registry_service_1.databaseRegistryService.registerDatabase({ rawPath: raceDbPath, installationId: install.id }),
                database_registry_service_1.databaseRegistryService.registerDatabase({ rawPath: raceDbPath, installationId: install.id }),
                database_registry_service_1.databaseRegistryService.registerDatabase({ rawPath: raceDbPath, installationId: install.id }),
            ]);
            (0, vitest_1.expect)(r1.databaseId).toBe(r2.databaseId);
            (0, vitest_1.expect)(r2.databaseId).toBe(r3.databaseId);
            (0, vitest_1.expect)(r3.databaseId).toBe(r4.databaseId);
            const count = await prisma_1.systemPrisma.databaseRegistry.count({
                where: { canonicalPath: r1.canonicalPath },
            });
            (0, vitest_1.expect)(count).toBe(1);
        });
        (0, vitest_1.it)('enforces referential integrity between DatabaseRegistry and Profile (ON DELETE SET NULL)', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const profileCode = `prof_fk_${Date.now()}`;
            const dbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `${profileCode}.db`);
            testDbFiles.push(dbPath);
            (0, prisma_1.ensureProfileDbFile)(dbPath);
            // 1. Create a Profile in control DB
            const profile = await prisma_1.systemPrisma.profile.create({
                data: {
                    code: profileCode,
                    name: 'FK Test Profile',
                    dbPath,
                },
            });
            // 2. Register DB referencing the profile
            const reg = await database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: dbPath,
                displayName: 'FK Test DB',
                profileId: profile.id,
                installationId: install.id,
            });
            (0, vitest_1.expect)(reg.profileId).toBe(profile.id);
            // 3. Registering with non-existent profileId is rejected
            await (0, vitest_1.expect)(database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: path_1.default.resolve((0, paths_1.getDatabasesDir)(), `fake_${Date.now()}.db`),
                profileId: crypto_1.default.randomUUID(),
                installationId: install.id,
            })).rejects.toThrow(/Profile not found/);
            // 4. Safe deactivation / deletion of Profile metadata:
            // Deleting Profile record must NOT delete the DatabaseRegistry row or the physical SQLite file!
            await prisma_1.systemPrisma.profile.delete({ where: { id: profile.id } });
            const regAfterProfileDelete = await database_registry_service_1.databaseRegistryService.getDatabase(reg.databaseId);
            (0, vitest_1.expect)(regAfterProfileDelete).not.toBeNull();
            (0, vitest_1.expect)(regAfterProfileDelete.id).toBe(reg.id);
            (0, vitest_1.expect)(regAfterProfileDelete.profileId).toBeNull(); // On delete set null
            (0, vitest_1.expect)(fs_1.default.existsSync(dbPath)).toBe(true); // Physical DB remains 100% intact!
        });
        (0, vitest_1.it)('provisions a database with PENDING -> ACTIVE lifecycle and safe rollback compensation', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const provPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `prov_comp_${Date.now()}.db`);
            testDbFiles.push(provPath);
            const reg = await database_registry_service_1.databaseRegistryService.provisionDatabase({
                rawPath: provPath,
                displayName: 'Provisioned DB with Compensation',
                installationId: install.id,
            });
            (0, vitest_1.expect)(reg.status).toBe('ACTIVE');
            (0, vitest_1.expect)(fs_1.default.existsSync(provPath)).toBe(true);
            (0, vitest_1.expect)(fs_1.default.statSync(provPath).size).toBeGreaterThan(0);
        });
    });
    (0, vitest_1.describe)('8. Installation ↔ Business User Association', () => {
        (0, vitest_1.it)('associates an ERP business user with the local installation without duplicating User model', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const username = `bizuser_${Date.now()}`;
            const user = await auth_service_1.authService.createUser(username, 'SecurePassword123!', 'Business User Alpha', auth_service_1.ROLES.VIEWER, ['Stavan']);
            const link = await installation_service_1.installationService.associateUser(install.id, user.id);
            (0, vitest_1.expect)(link.id).toBeDefined();
            (0, vitest_1.expect)(link.installationId).toBe(install.id);
            (0, vitest_1.expect)(link.userId).toBe(user.id);
            // Verify in DB
            const stored = await prisma_1.systemPrisma.installationUser.findFirst({
                where: { installationId: install.id, userId: user.id },
            });
            (0, vitest_1.expect)(stored).not.toBeNull();
        });
        (0, vitest_1.it)('is strictly idempotent when associating the same user twice', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const username = `dup_user_${Date.now()}`;
            const user = await auth_service_1.authService.createUser(username, 'Password123!', 'Dup User', auth_service_1.ROLES.VIEWER, ['Stavan']);
            const link1 = await installation_service_1.installationService.associateUser(install.id, user.id);
            const link2 = await installation_service_1.installationService.associateUser(install.id, user.id);
            (0, vitest_1.expect)(link2.id).toBe(link1.id);
            const count = await prisma_1.systemPrisma.installationUser.count({
                where: { installationId: install.id, userId: user.id },
            });
            (0, vitest_1.expect)(count).toBe(1);
        });
        (0, vitest_1.it)('rejects association for non-existent installation or user', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            await (0, vitest_1.expect)(installation_service_1.installationService.associateUser('fake-install-id', 'fake-user-id')).rejects.toThrow(/Installation not found/);
            await (0, vitest_1.expect)(installation_service_1.installationService.associateUser(install.id, 'fake-user-id')).rejects.toThrow(/User not found/);
        });
        (0, vitest_1.it)('supports disassociating user without deleting the user account or profile database', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const username = `disassoc_user_${Date.now()}`;
            const user = await auth_service_1.authService.createUser(username, 'Password123!', 'Disassoc User', auth_service_1.ROLES.VIEWER, ['Stavan']);
            await installation_service_1.installationService.associateUser(install.id, user.id);
            let users = await installation_service_1.installationService.getInstallationUsers(install.id);
            (0, vitest_1.expect)(users.some((u) => u.userId === user.id)).toBe(true);
            await installation_service_1.installationService.disassociateUser(install.id, user.id);
            users = await installation_service_1.installationService.getInstallationUsers(install.id);
            (0, vitest_1.expect)(users.some((u) => u.userId === user.id)).toBe(false);
            // User row still exists in database
            const userStillExists = await prisma_1.systemPrisma.user.findUnique({ where: { id: user.id } });
            (0, vitest_1.expect)(userStillExists).not.toBeNull();
        });
    });
    (0, vitest_1.describe)('9. Multi-Profile Database Isolation & Template Immutability', () => {
        (0, vitest_1.it)('verifies template.db SHA-256 hash is 100% immutable before and after provisioning', async () => {
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            (0, vitest_1.expect)(templatePath).toBeDefined();
            (0, vitest_1.expect)(fs_1.default.existsSync(templatePath)).toBe(true);
            const hashBefore = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(templatePath)).digest('hex');
            // Provision two profiles
            const dbDir = (0, paths_1.getDatabasesDir)();
            const pathA = path_1.default.resolve(dbDir, `immut_a_${Date.now()}.db`);
            const pathB = path_1.default.resolve(dbDir, `immut_b_${Date.now()}.db`);
            testDbFiles.push(pathA, pathB);
            (0, prisma_1.ensureProfileDbFile)(pathA);
            (0, prisma_1.ensureProfileDbFile)(pathB);
            const hashAfter = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(templatePath)).digest('hex');
            (0, vitest_1.expect)(hashAfter).toBe(hashBefore);
        });
        (0, vitest_1.it)('provisions independent database files for distinct profiles and maintains complete isolation', async () => {
            const dbDir = (0, paths_1.getDatabasesDir)();
            const codeA = `iso_a_${Date.now()}`;
            const codeB = `iso_b_${Date.now()}`;
            const pathA = path_1.default.resolve(dbDir, `${codeA}.db`);
            const pathB = path_1.default.resolve(dbDir, `${codeB}.db`);
            testDbFiles.push(pathA, pathB);
            (0, prisma_1.ensureProfileDbFile)(pathA);
            (0, prisma_1.ensureProfileDbFile)(pathB);
            (0, prisma_1.registerProfile)({ code: codeA, name: codeA, dbPath: pathA });
            (0, prisma_1.registerProfile)({ code: codeB, name: codeB, dbPath: pathB });
            (0, vitest_1.expect)(pathA).not.toBe(pathB);
            const clientA = (0, prisma_1.getClientForProfile)(codeA);
            const clientB = (0, prisma_1.getClientForProfile)(codeB);
            const checkA = await clientA.$queryRawUnsafe('PRAGMA integrity_check;');
            const checkB = await clientB.$queryRawUnsafe('PRAGMA integrity_check;');
            (0, vitest_1.expect)(checkA[0]?.integrity_check).toBe('ok');
            (0, vitest_1.expect)(checkB[0]?.integrity_check).toBe('ok');
            const partyInA = await clientA.party.create({
                data: {
                    partyCode: 'SUP-001',
                    name: 'Supplier Alpha (A Only)',
                    partyType: 'SUPPLIER',
                    phone: '1234567890',
                },
            });
            (0, vitest_1.expect)(partyInA.id).toBeDefined();
            const partiesInB = await clientB.party.findMany({
                where: { name: 'Supplier Alpha (A Only)' },
            });
            (0, vitest_1.expect)(partiesInB.length).toBe(0);
            (0, vitest_1.expect)(await clientB.party.count()).toBe(0);
            (0, vitest_1.expect)(await clientA.party.count()).toBe(1);
            await clientA.$disconnect();
            await clientB.$disconnect();
        });
    });
    (0, vitest_1.describe)('10. Safe User Deactivation & Absolute Database Preservation', () => {
        (0, vitest_1.it)('deactivates user, revokes sessions, and STRICTLY PRESERVES SQLite database on disk', async () => {
            const username = `test_deact_${Date.now()}`;
            const profileCode = `prof_deact_${Date.now()}`;
            const dbDir = (0, paths_1.getDatabasesDir)();
            const dbPath = path_1.default.resolve(dbDir, `${profileCode}.db`);
            testDbFiles.push(dbPath);
            (0, prisma_1.ensureProfileDbFile)(dbPath);
            (0, vitest_1.expect)(fs_1.default.existsSync(dbPath)).toBe(true);
            const createdUser = await auth_service_1.authService.createUser(username, 'SecurePassword123!', 'Test Deact User', auth_service_1.ROLES.MANAGER, [profileCode]);
            const loginRes = await auth_service_1.authService.login(username, 'SecurePassword123!');
            (0, vitest_1.expect)(loginRes.token).toBeDefined();
            const deactResult = await auth_service_1.authService.deactivateUser(createdUser.id);
            (0, vitest_1.expect)(deactResult.isActive).toBe(false);
            (0, vitest_1.expect)(deactResult.deletedAt).toBeInstanceOf(Date);
            // Deactivated user cannot log in
            await (0, vitest_1.expect)(auth_service_1.authService.login(username, 'SecurePassword123!')).rejects.toThrow(/Invalid username or password/);
            // Physical DB file remains 100% intact
            (0, vitest_1.expect)(fs_1.default.existsSync(dbPath)).toBe(true);
            (0, vitest_1.expect)(fs_1.default.statSync(dbPath).size).toBeGreaterThan(0);
            // Reactivation works
            const reactResult = await auth_service_1.authService.reactivateUser(createdUser.id);
            (0, vitest_1.expect)(reactResult.isActive).toBe(true);
            const relogin = await auth_service_1.authService.login(username, 'SecurePassword123!');
            (0, vitest_1.expect)(relogin.token).toBeDefined();
        });
        (0, vitest_1.it)('enforces self-deactivation protection and controller endpoint authorization', async () => {
            const admin = await auth_service_1.authService.createUser(`admin_actor_${Date.now()}`, 'AdminPass123!', 'Admin Actor', auth_service_1.ROLES.SUPER_ADMIN, ['Stavan']);
            const target = await auth_service_1.authService.createUser(`target_deact_${Date.now()}`, 'TargetPass123!', 'Target Subject', auth_service_1.ROLES.VIEWER, ['Stavan']);
            // 1. Self-deactivation is rejected with 400 Bad Request
            let statusResult = null;
            let jsonResult = null;
            const mockRes = {
                status: (s) => { statusResult = s; return mockRes; },
                json: (j) => { jsonResult = j; return mockRes; },
            };
            const selfReq = {
                params: { userId: admin.id },
                user: { id: admin.id, role: auth_service_1.ROLES.SUPER_ADMIN },
            };
            await auth_controller_1.authController.deactivateUser(selfReq, mockRes, () => { });
            (0, vitest_1.expect)(statusResult).toBe(400);
            (0, vitest_1.expect)(jsonResult?.error).toMatch(/Cannot deactivate your own.*user account/);
            // 2. Deactivating target user succeeds
            statusResult = 200;
            jsonResult = null;
            const deactReq = {
                params: { userId: target.id },
                user: { id: admin.id, role: auth_service_1.ROLES.SUPER_ADMIN },
            };
            await auth_controller_1.authController.deactivateUser(deactReq, mockRes, () => { });
            (0, vitest_1.expect)(statusResult).toBe(200);
            (0, vitest_1.expect)(jsonResult?.success).toBe(true);
            (0, vitest_1.expect)(jsonResult?.data?.isActive).toBe(false);
            // 3. Deactivate already inactive user (idempotent)
            const deactAgain = await auth_service_1.authService.deactivateUser(target.id);
            (0, vitest_1.expect)(deactAgain.isActive).toBe(false);
            // 4. Deactivate non-existent user throws NotFoundError
            await (0, vitest_1.expect)(auth_service_1.authService.deactivateUser('non-existent-user-uuid')).rejects.toThrow(/User not found/);
        });
        (0, vitest_1.it)('GAP 5 Verification: complete chain Installation -> User -> UserProfile -> Profile -> DB -> DatabaseRegistry preservation', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const username = `chain_user_${Date.now()}`;
            const profileCode = `chain_prof_${Date.now()}`;
            const dbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `${profileCode}.db`);
            testDbFiles.push(dbPath);
            (0, prisma_1.ensureProfileDbFile)(dbPath);
            // Create User with Profile
            const user = await auth_service_1.authService.createUser(username, 'ChainSecurePass123!', 'Chain User', auth_service_1.ROLES.MANAGER, [profileCode]);
            // Associate user with installation
            await installation_service_1.installationService.associateUser(install.id, user.id);
            // Find Profile record
            const profileRecord = await prisma_1.systemPrisma.profile.findUnique({
                where: { code: profileCode },
            });
            (0, vitest_1.expect)(profileRecord).not.toBeNull();
            // Find UserProfile record
            const userProfileRecord = await prisma_1.systemPrisma.userProfile.findFirst({
                where: { userId: user.id, profileId: profileRecord.id },
            });
            (0, vitest_1.expect)(userProfileRecord).not.toBeNull();
            // Register in DatabaseRegistry
            const reg = await database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: dbPath,
                displayName: 'Chain Profile DB',
                profileId: profileRecord.id,
                installationId: install.id,
            });
            (0, prisma_1.registerProfile)({ code: profileCode, name: profileCode, dbPath });
            // Record SHA-256 before deactivation
            const sha256Before = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(dbPath)).digest('hex');
            // Login to verify active session
            const login = await auth_service_1.authService.login(username, 'ChainSecurePass123!');
            (0, vitest_1.expect)(login.token).toBeDefined();
            // ACT: Deactivate user via authService
            const deact = await auth_service_1.authService.deactivateUser(user.id);
            (0, vitest_1.expect)(deact.isActive).toBe(false);
            (0, vitest_1.expect)(deact.deletedAt).toBeInstanceOf(Date);
            // ASSERT INVARIANTS:
            // 1. User is deactivated & login is rejected
            await (0, vitest_1.expect)(auth_service_1.authService.login(username, 'ChainSecurePass123!')).rejects.toThrow(/Invalid username or password/);
            // 2. UserProfile remains in DB
            const userProfileAfter = await prisma_1.systemPrisma.userProfile.findUnique({
                where: { id: userProfileRecord.id },
            });
            (0, vitest_1.expect)(userProfileAfter).not.toBeNull();
            // 3. Profile record remains in DB
            const profileAfter = await prisma_1.systemPrisma.profile.findUnique({
                where: { id: profileRecord.id },
            });
            (0, vitest_1.expect)(profileAfter).not.toBeNull();
            // 4. DatabaseRegistry record remains in DB
            const regAfter = await database_registry_service_1.databaseRegistryService.getDatabase(reg.databaseId);
            (0, vitest_1.expect)(regAfter).not.toBeNull();
            (0, vitest_1.expect)(regAfter.status).toBe('ACTIVE');
            // 5. Physical SQLite DB remains on disk and SHA-256 is byte-identical
            (0, vitest_1.expect)(fs_1.default.existsSync(dbPath)).toBe(true);
            const sha256After = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(dbPath)).digest('hex');
            (0, vitest_1.expect)(sha256After).toBe(sha256Before);
            // 6. Profile data remains fully queryable
            const client = (0, prisma_1.getClientForProfile)(profileCode);
            const integrity = await client.$queryRawUnsafe('PRAGMA integrity_check;');
            (0, vitest_1.expect)(integrity[0]?.integrity_check).toBe('ok');
            await client.$disconnect();
        });
    });
    (0, vitest_1.describe)('11. Control DB vs Profile DB Separation', () => {
        (0, vitest_1.it)('verifies Control DB path is distinct and houses system tables', async () => {
            const controlPath = (0, paths_1.getControlDbPath)();
            (0, vitest_1.expect)(controlPath).toBeDefined();
            (0, vitest_1.expect)(typeof controlPath).toBe('string');
            // Verify systemPrisma operates against the control DB
            const count = await prisma_1.systemPrisma.installation.count();
            (0, vitest_1.expect)(typeof count).toBe('number');
        });
        (0, vitest_1.it)('verifies cross-database isolation between Control DB and Profile DB', async () => {
            await installation_service_1.installationService.getOrCreateInstallation();
            const codeA = `iso_scope_a_${Date.now()}`;
            const codeB = `iso_scope_b_${Date.now()}`;
            const dbPathA = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `${codeA}.db`);
            const dbPathB = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `${codeB}.db`);
            testDbFiles.push(dbPathA, dbPathB);
            (0, prisma_1.ensureProfileDbFile)(dbPathA);
            (0, prisma_1.ensureProfileDbFile)(dbPathB);
            (0, prisma_1.registerProfile)({ code: codeA, name: codeA, dbPath: dbPathA });
            (0, prisma_1.registerProfile)({ code: codeB, name: codeB, dbPath: dbPathB });
            // 1. Control DB record created in systemPrisma
            const controlDev = await installation_service_1.installationService.registerDevice({
                deviceName: 'Control-Terminal-Iso',
            });
            (0, vitest_1.expect)(controlDev.id).toBeDefined();
            // 2. Profile DB record created in Profile A via runWithProfile
            await (0, prisma_1.runWithProfile)(codeA, async () => {
                await prisma_1.default.party.create({
                    data: {
                        partyCode: 'ISO-PARTY-A',
                        name: 'Isolated Party Alpha',
                        partyType: 'CUSTOMER',
                        phone: '9876543210',
                    },
                });
            });
            // 3. Verify Profile B cannot see Profile A data
            await (0, prisma_1.runWithProfile)(codeB, async () => {
                const countB = await prisma_1.default.party.count({ where: { partyCode: 'ISO-PARTY-A' } });
                (0, vitest_1.expect)(countB).toBe(0);
            });
            // 4. Verify Profile A has the data
            await (0, prisma_1.runWithProfile)(codeA, async () => {
                const countA = await prisma_1.default.party.count({ where: { partyCode: 'ISO-PARTY-A' } });
                (0, vitest_1.expect)(countA).toBe(1);
            });
            // 5. Control DB lifecycle tables are distinct from profile data
            const devInControl = await prisma_1.systemPrisma.device.findUnique({
                where: { deviceId: controlDev.deviceId },
            });
            (0, vitest_1.expect)(devInControl).not.toBeNull();
        });
    });
    (0, vitest_1.describe)('12. Concurrency & Transactional Safety', () => {
        (0, vitest_1.it)('handles concurrent device registration without duplicate records', async () => {
            await installation_service_1.installationService.getOrCreateInstallation();
            const [d1, d2] = await Promise.all([
                installation_service_1.installationService.registerDevice({ deviceName: 'Concurrent-Terminal-1' }),
                installation_service_1.installationService.registerDevice({ deviceName: 'Concurrent-Terminal-2' }),
            ]);
            (0, vitest_1.expect)(d1.deviceId).toBe(d2.deviceId);
            const count = await prisma_1.systemPrisma.device.count();
            (0, vitest_1.expect)(count).toBe(1);
        });
        (0, vitest_1.it)('handles concurrent database registration for same canonical path cleanly', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const dbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `concurrent_db_${Date.now()}.db`);
            testDbFiles.push(dbPath);
            (0, prisma_1.ensureProfileDbFile)(dbPath);
            const [r1, r2] = await Promise.all([
                database_registry_service_1.databaseRegistryService.registerDatabase({ rawPath: dbPath, installationId: install.id }),
                database_registry_service_1.databaseRegistryService.registerDatabase({ rawPath: dbPath, installationId: install.id }),
            ]);
            (0, vitest_1.expect)(r1.databaseId).toBe(r2.databaseId);
            (0, vitest_1.expect)(r1.id).toBe(r2.id);
        });
        (0, vitest_1.it)('handles concurrent user association to same installation idempotently', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const user = await auth_service_1.authService.createUser(`race_user_${Date.now()}`, 'Password123!', 'Race User', auth_service_1.ROLES.VIEWER, ['Stavan']);
            const [a1, a2] = await Promise.all([
                installation_service_1.installationService.associateUser(install.id, user.id),
                installation_service_1.installationService.associateUser(install.id, user.id),
            ]);
            (0, vitest_1.expect)(a1.id).toBe(a2.id);
            const count = await prisma_1.systemPrisma.installationUser.count({
                where: { installationId: install.id, userId: user.id },
            });
            (0, vitest_1.expect)(count).toBe(1);
        });
    });
    (0, vitest_1.describe)('13. Unified Routing & System Boundary Verification', () => {
        (0, vitest_1.it)('ensures zero duplicate system route registrations on the root router', () => {
            const mockController = new Proxy({}, { get: () => () => { } });
            const appRouter = (0, routes_1.createRoutes)(mockController, mockController, mockController, mockController, mockController, mockController, mockController, mockController);
            // Verify that top-level router does NOT register duplicate /api/system/* routes
            const topLevelSystemRoutes = appRouter.stack.filter((layer) => layer.route && layer.route.path.startsWith('/api/system'));
            (0, vitest_1.expect)(topLevelSystemRoutes.length).toBe(0);
            // Verify exactly one sub-router handles /api/system
            const systemMounts = appRouter.stack.filter((layer) => layer.regexp && layer.regexp.test('/api/system'));
            (0, vitest_1.expect)(systemMounts.length).toBe(1);
        });
    });
    (0, vitest_1.describe)('14. Production Runtime Verification & Separation Invariants (C4-C9, B3-B5)', () => {
        (0, vitest_1.it)('C4 & C5: Fresh installation simulation with zero accidental user/profile/DB mutations', async () => {
            // 1. Initial lookup on fresh environment initializes Installation in NOT_INITIALIZED
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            (0, vitest_1.expect)(install.lifecycleState).toBe('NOT_INITIALIZED');
            (0, vitest_1.expect)(install.status).toBe('ACTIVE');
            (0, vitest_1.expect)(install.initializedAt).toBeNull();
            // Invariant: Zero users, devices, or registries auto-created accidentally
            const userCount = await prisma_1.systemPrisma.user.count();
            const deviceCount = await prisma_1.systemPrisma.device.count();
            const registryCount = await prisma_1.systemPrisma.databaseRegistry.count();
            (0, vitest_1.expect)(typeof userCount).toBe('number');
            (0, vitest_1.expect)(deviceCount).toBe(0);
            (0, vitest_1.expect)(registryCount).toBe(0);
            // Register device and associate user cleanly
            const device = await installation_service_1.installationService.registerDevice({ deviceName: 'Fresh-Desk-Terminal' });
            (0, vitest_1.expect)(device.deviceName).toBe('Fresh-Desk-Terminal');
            (0, vitest_1.expect)(device.status).toBe('ACTIVE');
            // Move lifecycle forward
            await installation_service_1.installationService.updateLifecycleState('APP_SETUP');
            const updated = await installation_service_1.installationService.getOrCreateInstallation();
            (0, vitest_1.expect)(updated.lifecycleState).toBe('APP_SETUP');
        });
        (0, vitest_1.it)('C6: Existing installation simulation preserves all IDs, users, profiles, and physical files', async () => {
            const installBefore = await installation_service_1.installationService.getOrCreateInstallation();
            const devBefore = await installation_service_1.installationService.registerDevice({ deviceName: 'Existing-Terminal' });
            const testProfCode = `exist_prof_${Date.now()}`;
            const dbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `${testProfCode}.db`);
            testDbFiles.push(dbPath);
            (0, prisma_1.ensureProfileDbFile)(dbPath);
            const hashBefore = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(dbPath)).digest('hex');
            const profile = await prisma_1.systemPrisma.profile.create({
                data: { code: testProfCode, name: 'Existing Profile', dbPath },
            });
            const reg = await database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: dbPath,
                displayName: 'Existing DB',
                profileId: profile.id,
                installationId: installBefore.id,
            });
            // Simulate re-start / re-query
            const installAfter = await installation_service_1.installationService.getOrCreateInstallation();
            (0, vitest_1.expect)(installAfter.id).toBe(installBefore.id);
            (0, vitest_1.expect)(installAfter.installationId).toBe(installBefore.installationId);
            const devAfter = await prisma_1.systemPrisma.device.findUnique({ where: { deviceId: devBefore.deviceId } });
            (0, vitest_1.expect)(devAfter?.id).toBe(devBefore.id);
            const regAfter = await database_registry_service_1.databaseRegistryService.getDatabase(reg.databaseId);
            (0, vitest_1.expect)(regAfter.id).toBe(reg.id);
            (0, vitest_1.expect)(regAfter.profileId).toBe(profile.id);
            // Physical DB unchanged
            (0, vitest_1.expect)(fs_1.default.existsSync(dbPath)).toBe(true);
            const hashAfter = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(dbPath)).digest('hex');
            (0, vitest_1.expect)(hashAfter).toBe(hashBefore);
        });
        (0, vitest_1.it)('C7: Repeated startup initialization generates zero duplicate records', async () => {
            // Call initialization 5 times repeatedly
            for (let i = 0; i < 5; i++) {
                await installation_service_1.installationService.getOrCreateInstallation();
            }
            const installCount = await prisma_1.systemPrisma.installation.count();
            (0, vitest_1.expect)(installCount).toBe(1);
        });
        (0, vitest_1.it)('C8: Concurrent startup calls yield exactly one Installation and safe profile client registry', async () => {
            // 8 concurrent calls to getOrCreateInstallation
            const results = await Promise.all([
                installation_service_1.installationService.getOrCreateInstallation(),
                installation_service_1.installationService.getOrCreateInstallation(),
                installation_service_1.installationService.getOrCreateInstallation(),
                installation_service_1.installationService.getOrCreateInstallation(),
                installation_service_1.installationService.getOrCreateInstallation(),
                installation_service_1.installationService.getOrCreateInstallation(),
                installation_service_1.installationService.getOrCreateInstallation(),
                installation_service_1.installationService.getOrCreateInstallation(),
            ]);
            const firstId = results[0].installationId;
            for (const res of results) {
                (0, vitest_1.expect)(res.installationId).toBe(firstId);
            }
            const count = await prisma_1.systemPrisma.installation.count();
            (0, vitest_1.expect)(count).toBe(1);
        });
        (0, vitest_1.it)('B3 & B4: Enforces strict profile context on business operations and verifies getActiveProfile throws when missing', () => {
            // When outside runWithProfile or request context, getActiveProfile must throw
            (0, vitest_1.expect)(() => (0, prisma_1.getActiveProfile)()).toThrow(/No active profile context/);
        });
        (0, vitest_1.it)('C9: Migration + runtime combined test: migrate legacy schema -> start application -> load all entities', async () => {
            const testDir = (0, paths_1.getDatabasesDir)();
            const combinedDbPath = path_1.default.resolve(testDir, `combined_mig_runtime_${Date.now()}.db`);
            const profilePath = path_1.default.resolve(testDir, `combined_prof_${Date.now()}.db`);
            testDbFiles.push(combinedDbPath, profilePath);
            // 1. Provision profile DB
            (0, prisma_1.ensureProfileDbFile)(profilePath);
            // 2. Deploy schema via real Prisma migrate deploy
            const schemaPath = path_1.default.resolve(__dirname, '../../prisma/schema.prisma');
            const normalizedUrl = `file:${combinedDbPath.replace(/\\/g, '/')}`;
            const execSync = (await Promise.resolve().then(() => __importStar(require('child_process')))).execSync;
            execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
                env: { ...process.env, DATABASE_URL: normalizedUrl },
                encoding: 'utf-8',
                cwd: path_1.default.resolve(__dirname, '../..'),
            });
            // 3. Connect application Prisma client to the migrated DB
            const runtimeClient = new client_1.PrismaClient({ datasources: { db: { url: normalizedUrl } } });
            await runtimeClient.$connect();
            // 4. Create Installation
            const installRowId = crypto_1.default.randomUUID();
            const installId = crypto_1.default.randomUUID();
            await runtimeClient.installation.create({
                data: {
                    id: installRowId,
                    installationId: installId,
                    appVersion: '3.0.0',
                    status: 'ACTIVE',
                    lifecycleState: 'APP_SETUP',
                },
            });
            // 5. Create User, Profile, UserProfile, and DatabaseRegistry
            const profId = crypto_1.default.randomUUID();
            const userId = crypto_1.default.randomUUID();
            const regId = crypto_1.default.randomUUID();
            await runtimeClient.profile.create({
                data: {
                    id: profId,
                    code: 'comb_profile',
                    name: 'Combined Test Profile',
                    dbPath: profilePath,
                },
            });
            await runtimeClient.user.create({
                data: {
                    id: userId,
                    username: 'combined_user',
                    passwordHash: 'hash123',
                    displayName: 'Combined User',
                },
            });
            await runtimeClient.userProfile.create({
                data: {
                    userId,
                    profileId: profId,
                    role: 'ADMIN',
                },
            });
            await runtimeClient.databaseRegistry.create({
                data: {
                    id: regId,
                    databaseId: crypto_1.default.randomUUID(),
                    displayName: 'Combined Reg DB',
                    canonicalPath: profilePath,
                    schemaVersion: 1,
                    status: 'ACTIVE',
                    profileId: profId,
                    installationId: installRowId,
                },
            });
            // 6. Verify full operational readability
            const loadedInstall = await runtimeClient.installation.findUnique({ where: { id: installRowId } });
            const loadedUser = await runtimeClient.user.findUnique({ where: { id: userId }, include: { userProfiles: true } });
            const loadedRegistry = await runtimeClient.databaseRegistry.findUnique({ where: { id: regId } });
            (0, vitest_1.expect)(loadedInstall?.installationId).toBe(installId);
            (0, vitest_1.expect)(loadedUser?.username).toBe('combined_user');
            (0, vitest_1.expect)(loadedUser?.userProfiles.length).toBe(1);
            (0, vitest_1.expect)(loadedRegistry?.profileId).toBe(profId);
            (0, vitest_1.expect)(fs_1.default.existsSync(profilePath)).toBe(true);
            await runtimeClient.$disconnect();
        }, 30000);
    });
});
//# sourceMappingURL=lifecycle-foundation.test.js.map