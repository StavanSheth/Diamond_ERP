"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../infrastructure/database/prisma");
const onboarding_service_1 = require("../modules/system/onboarding/onboarding.service");
const installation_service_1 = require("../modules/system/installation.service");
const device_security_service_1 = require("../modules/security/device-security.service");
const auth_service_1 = require("../modules/auth/auth.service");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Diamond ERP V3 — Phase 4: First-Run Onboarding, User & Database Discovery', () => {
    let installId;
    let deviceId;
    const createdTestFiles = [];
    (0, vitest_1.beforeEach)(async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        installId = install.id;
        deviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        // Reset installation to APP_SETUP for deterministic test progression
        await prisma_1.systemPrisma.installation.update({
            where: { id: installId },
            data: { lifecycleState: 'APP_SETUP', initializedAt: null, status: 'ACTIVE' },
        });
        // Ensure active device
        await installation_service_1.installationService.registerDevice({
            deviceName: 'Phase4-Test-Terminal',
            platform: 'WINDOWS',
        });
        // Clean device security state for fresh test
        await prisma_1.systemPrisma.deviceSecurity.deleteMany({
            where: { deviceId },
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
    // ── Test Group 1 & 2: Fresh Install & App Setup Idempotency ────────────
    (0, vitest_1.describe)('Group 1 & 2: Fresh Install Detection & App Setup Idempotency', () => {
        (0, vitest_1.it)('initializes application setup and advances lifecycle from NOT_INITIALIZED to APP_SETUP', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'NOT_INITIALIZED' },
            });
            const status = await onboarding_service_1.onboardingService.initializeApplication();
            (0, vitest_1.expect)(status.installationInitialized).toBe(true);
            (0, vitest_1.expect)(status.lifecycleState).toBe('APP_SETUP');
        });
        (0, vitest_1.it)('is strictly idempotent on repeated app setup initialization', async () => {
            const first = await onboarding_service_1.onboardingService.initializeApplication();
            const second = await onboarding_service_1.onboardingService.initializeApplication();
            (0, vitest_1.expect)(first.installation?.installationId).toBe(second.installation?.installationId);
            (0, vitest_1.expect)(second.lifecycleState).toBe('APP_SETUP');
        });
    });
    // ── Test Group 3 & 4 & 5: User Discovery, Creation & Association ───────
    (0, vitest_1.describe)('Group 3, 4, 5: Business User Discovery, Creation & Association', () => {
        (0, vitest_1.it)('discovers existing users and correctly identifies installation association', async () => {
            const uniqueSuffix = Date.now().toString();
            const user = await auth_service_1.authService.createUser(`disc_user_${uniqueSuffix}`, 'Password123456!', 'Discovery User', 'ADMIN');
            const discovery = await onboarding_service_1.onboardingService.discoverUsers();
            (0, vitest_1.expect)(discovery.candidates.length).toBeGreaterThan(0);
            const found = discovery.candidates.find((c) => c.id === user.id);
            (0, vitest_1.expect)(found).toBeDefined();
            (0, vitest_1.expect)(found?.username).toBe(`disc_user_${uniqueSuffix}`);
            (0, vitest_1.expect)(found?.passwordHash).toBeUndefined(); // Zero secret leakage
            (0, vitest_1.expect)(found?.associatedWithInstallation).toBe(false);
            // Now associate
            await onboarding_service_1.onboardingService.selectExistingUser(user.id);
            const discoveryAfter = await onboarding_service_1.onboardingService.discoverUsers();
            const foundAfter = discoveryAfter.candidates.find((c) => c.id === user.id);
            (0, vitest_1.expect)(foundAfter?.associatedWithInstallation).toBe(true);
        });
        (0, vitest_1.it)('creates a new business user during onboarding with secure password hashing', async () => {
            const uniqueSuffix = Date.now().toString();
            const username = `new_adm_${uniqueSuffix}`;
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'USER_DISCOVERY' },
            });
            const result = await onboarding_service_1.onboardingService.createBusinessUser({
                username,
                password: 'SecurePassword123!',
                displayName: 'New Administrator',
            });
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.user.username).toBe(username);
            (0, vitest_1.expect)(result.user.passwordHash).toBeUndefined(); // Zero secret leakage
            // Verify associated in Control DB
            const installUser = await prisma_1.systemPrisma.installationUser.findFirst({
                where: { installationId: installId, userId: result.user.id },
            });
            (0, vitest_1.expect)(installUser).not.toBeNull();
            // Lifecycle advanced to DATABASE_DISCOVERY
            const state = await onboarding_service_1.onboardingService.getOnboardingState();
            (0, vitest_1.expect)(state.lifecycleState).toBe('DATABASE_DISCOVERY');
        });
        (0, vitest_1.it)('rejects association of non-existent or inactive users', async () => {
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.selectExistingUser('non-existent-user-uuid')).rejects.toThrow(errors_1.NotFoundError);
            const uniqueSuffix = Date.now().toString();
            const inactiveUser = await prisma_1.systemPrisma.user.create({
                data: {
                    username: `inactive_${uniqueSuffix}`,
                    passwordHash: 'hash',
                    displayName: 'Inactive User',
                    isActive: false,
                },
            });
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.selectExistingUser(inactiveUser.id)).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('disassociating user preserves database and user records', async () => {
            const uniqueSuffix = Date.now().toString();
            const user = await auth_service_1.authService.createUser(`keep_user_${uniqueSuffix}`, 'Password123456!', 'Keep User', 'ADMIN');
            await installation_service_1.installationService.associateUser(installId, user.id);
            await installation_service_1.installationService.disassociateUser(installId, user.id);
            // User must still exist in User table
            const userCheck = await prisma_1.systemPrisma.user.findUnique({ where: { id: user.id } });
            (0, vitest_1.expect)(userCheck).not.toBeNull();
        });
    });
    // ── Test Group 6 & 7: Database Discovery & Path Security ───────────────
    (0, vitest_1.describe)('Group 6 & 7: Database Discovery & Path Security', () => {
        (0, vitest_1.it)('discovers databases from local directories without whole-drive scan', async () => {
            const discovery = await onboarding_service_1.onboardingService.discoverDatabases();
            (0, vitest_1.expect)(discovery).toBeDefined();
            (0, vitest_1.expect)(Array.isArray(discovery.candidates)).toBe(true);
            // Invariant: control DB and template DB must NEVER appear as candidate business databases
            const controlDbPath = path_1.default.resolve((0, paths_1.getControlDbPath)()).toLowerCase();
            const templateDbPath = (0, paths_1.getDatabaseTemplatePath)()
                ? path_1.default.resolve((0, paths_1.getDatabaseTemplatePath)()).toLowerCase()
                : '';
            for (const candidate of discovery.candidates) {
                const canonical = path_1.default.resolve(candidate.canonicalPath).toLowerCase();
                (0, vitest_1.expect)(canonical).not.toBe(controlDbPath);
                if (templateDbPath) {
                    (0, vitest_1.expect)(canonical).not.toBe(templateDbPath);
                }
            }
        });
        (0, vitest_1.it)('rejects path traversal, null bytes, and directory paths during inspection', async () => {
            // Null byte
            const nullByte = await onboarding_service_1.onboardingService.inspectDatabaseCandidate('data\0.db');
            (0, vitest_1.expect)(nullByte.suitability).toBe('INVALID');
            // Directory
            const dirPreview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate((0, paths_1.getDatabasesDir)());
            (0, vitest_1.expect)(dirPreview.suitability).toBe('INVALID');
            (0, vitest_1.expect)(dirPreview.details).toContain('directory');
            // Non-existent path
            const missingPreview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate('C:\\non_existent_folder_xyz\\missing.db');
            (0, vitest_1.expect)(missingPreview.suitability).toBe('INVALID');
        });
        (0, vitest_1.it)('rejects candidate inspection targeting system.db or template.db', async () => {
            const controlDb = (0, paths_1.getControlDbPath)();
            const controlPreview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(controlDb);
            (0, vitest_1.expect)(controlPreview.suitability).toBe('CONFLICT');
            (0, vitest_1.expect)(controlPreview.conflictReason).toBe('DATABASE_IS_CONTROL_DB');
            const templateDb = (0, paths_1.getDatabaseTemplatePath)();
            if (templateDb) {
                const templatePreview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(templateDb);
                (0, vitest_1.expect)(templatePreview.suitability).toBe('CONFLICT');
                (0, vitest_1.expect)(templatePreview.conflictReason).toBe('DATABASE_IS_TEMPLATE');
            }
        });
    });
    // ── Test Group 8, 9, 10, 11: Database Attachment, New DB & Template Invariants
    (0, vitest_1.describe)('Group 8, 9, 10, 11: Database Attachment, New DB & Template Invariants', () => {
        (0, vitest_1.it)('requires explicit confirmation before attaching an existing database', async () => {
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            (0, vitest_1.expect)(templatePath).not.toBeNull();
            const candidatePath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `candidate_test_${Date.now()}.db`);
            fs_1.default.copyFileSync(templatePath, candidatePath);
            createdTestFiles.push(candidatePath);
            // Attachment without confirmation must fail
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.attachExistingDatabase({
                path: candidatePath,
                confirmAttachment: false,
            })).rejects.toThrow(errors_1.ValidationError);
        });
        (0, vitest_1.it)('attaches existing valid database upon explicit confirmation and preserves file content', async () => {
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            (0, vitest_1.expect)(templatePath).not.toBeNull();
            const candidatePath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `candidate_attach_${Date.now()}.db`);
            fs_1.default.copyFileSync(templatePath, candidatePath);
            createdTestFiles.push(candidatePath);
            const beforeHash = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(candidatePath)).digest('hex');
            // Associate a user first so attachment can link user
            const user = await auth_service_1.authService.createUser(`attach_user_${Date.now()}`, 'Password123456!', 'Attach User', 'ADMIN');
            await installation_service_1.installationService.associateUser(installId, user.id);
            const attachResult = await onboarding_service_1.onboardingService.attachExistingDatabase({
                path: candidatePath,
                displayName: 'Test Company DB',
                confirmAttachment: true,
            });
            (0, vitest_1.expect)(attachResult.success).toBe(true);
            (0, vitest_1.expect)(attachResult.registry.status).toBe('ACTIVE');
            // Physical file must remain intact and identical
            const afterHash = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(candidatePath)).digest('hex');
            (0, vitest_1.expect)(afterHash).toBe(beforeHash);
        });
        (0, vitest_1.it)('provisions a brand new profile database from template.db', async () => {
            const user = await auth_service_1.authService.createUser(`prov_user_${Date.now()}`, 'Password123456!', 'Prov User', 'ADMIN');
            await installation_service_1.installationService.associateUser(installId, user.id);
            const dbName = `New_Office_${Date.now()}`;
            const result = await onboarding_service_1.onboardingService.createNewDatabase({
                userId: user.id,
                displayName: dbName,
            });
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.registry.status).toBe('ACTIVE');
            createdTestFiles.push(result.registry.canonicalPath);
            (0, vitest_1.expect)(fs_1.default.existsSync(result.registry.canonicalPath)).toBe(true);
        });
        (0, vitest_1.it)('fails safely when template.db is missing and does NOT create empty database', async () => {
            const user = await auth_service_1.authService.createUser(`miss_user_${Date.now()}`, 'Password123456!', 'Miss User', 'ADMIN');
            await installation_service_1.installationService.associateUser(installId, user.id);
            // Simulate missing template by overriding environment variable to a non-existent path
            const originalEnv = process.env.DIAMOND_TEMPLATE_DB;
            process.env.DIAMOND_TEMPLATE_DB = path_1.default.resolve((0, paths_1.getDatabasesDir)(), 'non_existent_template.db');
            const nonExistentTarget = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `should_not_exist_${Date.now()}.db`);
            createdTestFiles.push(nonExistentTarget);
            const dbName = `Missing_Template_${Date.now()}`;
            try {
                await (0, vitest_1.expect)(onboarding_service_1.onboardingService.createNewDatabase({
                    userId: user.id,
                    displayName: dbName,
                })).rejects.toThrow(/template\.db/i);
                // Invariant: empty 0-byte file must NOT be left behind
                (0, vitest_1.expect)(fs_1.default.existsSync(nonExistentTarget)).toBe(false);
            }
            finally {
                if (originalEnv) {
                    process.env.DIAMOND_TEMPLATE_DB = originalEnv;
                }
                else {
                    delete process.env.DIAMOND_TEMPLATE_DB;
                }
            }
        });
        (0, vitest_1.it)('rejects attaching system.db or template.db even if confirmAttachment is true', async () => {
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.attachExistingDatabase({
                path: (0, paths_1.getControlDbPath)(),
                confirmAttachment: true,
            })).rejects.toThrow(errors_1.ConflictError);
            const templateDb = (0, paths_1.getDatabaseTemplatePath)();
            if (templateDb) {
                await (0, vitest_1.expect)(onboarding_service_1.onboardingService.attachExistingDatabase({
                    path: templateDb,
                    confirmAttachment: true,
                })).rejects.toThrow(errors_1.ConflictError);
            }
        });
    });
    // ── Test Group 13 & 14: Concurrency & Failure Compensation ─────────────
    (0, vitest_1.describe)('Group 13 & 14: Concurrency & Failure Compensation', () => {
        (0, vitest_1.it)('handles concurrent duplicate user creation deterministically with exactly one winner', async () => {
            const username = `race_user_${Date.now()}`;
            const [r1, r2] = await Promise.allSettled([
                onboarding_service_1.onboardingService.createBusinessUser({
                    username,
                    password: 'Password123456!',
                    displayName: 'Race User',
                }),
                onboarding_service_1.onboardingService.createBusinessUser({
                    username,
                    password: 'Password123456!',
                    displayName: 'Race User',
                }),
            ]);
            const successes = [r1, r2].filter((r) => r.status === 'fulfilled');
            const failures = [r1, r2].filter((r) => r.status === 'rejected');
            (0, vitest_1.expect)(successes.length).toBe(1);
            (0, vitest_1.expect)(failures.length).toBe(1);
        });
        (0, vitest_1.it)('handles concurrent new database creation with identical profile name deterministically', async () => {
            const user = await auth_service_1.authService.createUser(`race_prov_${Date.now()}`, 'Password123456!', 'Race Prov User', 'ADMIN');
            await installation_service_1.installationService.associateUser(installId, user.id);
            const dbName = `Race_DB_${Date.now()}`;
            const [r1, r2] = await Promise.allSettled([
                onboarding_service_1.onboardingService.createNewDatabase({ userId: user.id, displayName: dbName }),
                onboarding_service_1.onboardingService.createNewDatabase({ userId: user.id, displayName: dbName }),
            ]);
            const successes = [r1, r2].filter((r) => r.status === 'fulfilled');
            const failures = [r1, r2].filter((r) => r.status === 'rejected');
            (0, vitest_1.expect)(successes.length).toBe(1);
            (0, vitest_1.expect)(failures.length).toBe(1);
            if (successes[0].status === 'fulfilled') {
                createdTestFiles.push(successes[0].value.registry.canonicalPath);
            }
        });
    });
    // ── Test Group 15, 16, 17, 18, 19: Security, Recovery & READY Gate ────
    (0, vitest_1.describe)('Group 15, 16, 17, 18, 19: Security, Recovery & READY Gate', () => {
        (0, vitest_1.it)('never exposes passwordHash, pinHash, or JWT in onboarding status', async () => {
            // Configure PIN
            await device_security_service_1.deviceSecurityService.setupPin(deviceId, '982341');
            const status = await onboarding_service_1.onboardingService.getOnboardingState();
            (0, vitest_1.expect)(status.pinHash).toBeUndefined();
            (0, vitest_1.expect)(status.passwordHash).toBeUndefined();
            (0, vitest_1.expect)(status.token).toBeUndefined();
            (0, vitest_1.expect)(status.pinConfigured).toBe(true);
            (0, vitest_1.expect)(status.deviceConfigured).toBe(true);
        });
        (0, vitest_1.it)('allows recovering from database validation/setup back to discovery without resetting identity', async () => {
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DATABASE_VALIDATION' },
            });
            const recovered = await onboarding_service_1.onboardingService.resetRecoverableOnboardingState();
            (0, vitest_1.expect)(recovered.lifecycleState).toBe('DATABASE_DISCOVERY');
            (0, vitest_1.expect)(recovered.installationInitialized).toBe(true);
        });
        (0, vitest_1.it)('blocks transition to READY if mandatory prerequisites are missing', async () => {
            // 1. Missing PIN -> Cannot complete onboarding
            await prisma_1.systemPrisma.deviceSecurity.deleteMany({ where: { deviceId } });
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.completeOnboarding()).rejects.toThrow(errors_1.ConflictError);
            // 2. Setup PIN but no associated user
            await device_security_service_1.deviceSecurityService.setupPin(deviceId, '123987');
            await prisma_1.systemPrisma.installationUser.deleteMany({ where: { installationId: installId } });
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.completeOnboarding()).rejects.toThrow(errors_1.ConflictError);
            // 3. Associate user but no active database
            const user = await auth_service_1.authService.createUser(`ready_gate_user_${Date.now()}`, 'Password123456!', 'Gate User', 'ADMIN');
            await installation_service_1.installationService.associateUser(installId, user.id);
            await prisma_1.systemPrisma.databaseRegistry.deleteMany({ where: { installationId: installId } });
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.completeOnboarding()).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('successfully completes onboarding and transitions to READY when all prerequisites are met', async () => {
            // 1. Move to PIN_SETUP & setup PIN
            await installation_service_1.installationService.updateLifecycleState('PIN_SETUP');
            await device_security_service_1.deviceSecurityService.setupPin(deviceId, '849201');
            // 2. Move to DEVICE_SETUP
            await installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP');
            // 3. Move to USER_DISCOVERY & associate user
            await installation_service_1.installationService.updateLifecycleState('USER_DISCOVERY');
            const user = await auth_service_1.authService.createUser(`ready_success_user_${Date.now()}`, 'Password123456!', 'Success User', 'ADMIN');
            await installation_service_1.installationService.associateUser(installId, user.id);
            // 4. Move to DATABASE_DISCOVERY -> DATABASE_VALIDATION
            await installation_service_1.installationService.updateLifecycleState('DATABASE_DISCOVERY');
            await installation_service_1.installationService.updateLifecycleState('DATABASE_VALIDATION');
            // 5. Create database (which advances to DATABASE_SETUP)
            const db = await onboarding_service_1.onboardingService.createNewDatabase({
                userId: user.id,
                displayName: `Final_Ready_DB_${Date.now()}`,
            });
            createdTestFiles.push(db.registry.canonicalPath);
            // 6. Complete onboarding to reach READY
            const finalStatus = await onboarding_service_1.onboardingService.completeOnboarding();
            (0, vitest_1.expect)(finalStatus.ready).toBe(true);
            (0, vitest_1.expect)(finalStatus.lifecycleState).toBe('READY');
            // Verify audit event emitted
            const audit = await prisma_1.systemPrisma.auditEvent.findFirst({
                where: { eventType: 'ONBOARDING_COMPLETED', entityId: installId },
            });
            (0, vitest_1.expect)(audit).not.toBeNull();
        });
    });
});
//# sourceMappingURL=phase4-onboarding.test.js.map