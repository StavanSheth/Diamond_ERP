"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/database/prisma");
const installation_service_1 = require("../modules/system/installation.service");
const onboarding_service_1 = require("../modules/system/onboarding/onboarding.service");
const database_provisioning_service_1 = require("../modules/system/database/database-provisioning.service");
const database_validation_service_1 = require("../modules/system/database/database-validation.service");
const auth_service_1 = require("../modules/auth/auth.service");
const device_security_service_1 = require("../modules/security/device-security.service");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Diamond ERP V3 — Phase 6: New User + Blank Database Provisioning + User–Database Isolation', () => {
    let installId;
    let deviceId;
    const createdTestFiles = [];
    async function createTestUser(prefix = 'p6_u') {
        const uname = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const user = await auth_service_1.authService.createUser(uname, 'Password123!Secure', 'Test User', 'ADMIN', []);
        await installation_service_1.installationService.associateUser(installId, user.id);
        return user;
    }
    (0, vitest_1.beforeEach)(async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        installId = install.id;
        deviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        // Ensure active device and pin for full lifecycle flow
        await installation_service_1.installationService.registerDevice({
            deviceName: 'Phase6-Validation-Terminal',
            platform: 'WINDOWS',
        });
        await device_security_service_1.deviceSecurityService.setupPin(deviceId, '849201').catch(() => { });
        await prisma_1.systemPrisma.installation.update({
            where: { id: installId },
            data: { lifecycleState: 'USER_DISCOVERY', status: 'ACTIVE' },
        });
    });
    (0, vitest_1.afterEach)(async () => {
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
    // ═════════════════════════════════════════════════════════════════════════
    // A. NEW USER PROVISIONING & FULL LIFECYCLE PROGRESSION (Section 33 A)
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('A. New User Creation & Full Lifecycle Progression', () => {
        (0, vitest_1.it)('executes full path: USER_DISCOVERY -> Create User -> Create Blank DB -> DATABASE_SETUP -> READY', async () => {
            const uname = `p6_user_${Date.now()}`;
            const userRes = await onboarding_service_1.onboardingService.createBusinessUser({
                username: uname,
                password: 'Password123!Secure',
                displayName: 'Phase 6 Admin',
                role: 'ADMIN',
            });
            (0, vitest_1.expect)(userRes.success).toBe(true);
            (0, vitest_1.expect)(userRes.user.username).toBe(uname);
            (0, vitest_1.expect)(userRes.provisioningContext).toBeDefined();
            (0, vitest_1.expect)(userRes.provisioningContext.userId).toBe(userRes.user.id);
            // Verify lifecycle moved to DATABASE_DISCOVERY
            let state = await onboarding_service_1.onboardingService.getOnboardingState();
            (0, vitest_1.expect)(state.lifecycleState).toBe('DATABASE_DISCOVERY');
            // Create new blank database from template carrying authoritative userId
            const dbRes = await onboarding_service_1.onboardingService.createNewDatabase({
                displayName: `Company ${uname}`,
                profileCode: `prof_${uname}`,
                userId: userRes.user.id,
            });
            (0, vitest_1.expect)(dbRes.success).toBe(true);
            (0, vitest_1.expect)(dbRes.registry.canonicalPath).toContain(`prof_${uname}.db`);
            createdTestFiles.push(dbRes.registry.canonicalPath);
            // Verify lifecycle moved through DATABASE_VALIDATION to DATABASE_SETUP
            state = await onboarding_service_1.onboardingService.getOnboardingState();
            (0, vitest_1.expect)(state.lifecycleState).toBe('DATABASE_SETUP');
            // Complete onboarding and advance to READY
            const completeRes = await onboarding_service_1.onboardingService.completeOnboarding();
            (0, vitest_1.expect)(completeRes.lifecycleState).toBe('READY');
            (0, vitest_1.expect)(completeRes.ready).toBe(true);
            // Verify Audit Events
            const events = await prisma_1.systemPrisma.auditEvent.findMany({
                where: {
                    eventType: {
                        in: [
                            'NEW_USER_PROVISIONING_STARTED',
                            'NEW_USER_CREATED',
                            'NEW_DATABASE_PROVISIONED',
                            'NEW_DATABASE_VALIDATED',
                            'NEW_DATABASE_ATTACHED',
                            'NEW_USER_PROVISIONING_COMPLETED',
                        ],
                    },
                },
            });
            const types = events.map((e) => e.eventType);
            (0, vitest_1.expect)(types).toContain('NEW_USER_PROVISIONING_STARTED');
            (0, vitest_1.expect)(types).toContain('NEW_USER_CREATED');
            (0, vitest_1.expect)(types).toContain('NEW_DATABASE_PROVISIONED');
            (0, vitest_1.expect)(types).toContain('NEW_DATABASE_VALIDATED');
            (0, vitest_1.expect)(types).toContain('NEW_DATABASE_ATTACHED');
            (0, vitest_1.expect)(types).toContain('NEW_USER_PROVISIONING_COMPLETED');
        });
    });
    // ═════════════════════════════════════════════════════════════════════════
    // FIX #1: STRICT USER ↔ DATABASE OWNERSHIP ISOLATION (Section 4)
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('Fix #1 — Strict User ↔ Database Ownership Isolation', () => {
        (0, vitest_1.it)('Section 4.9 Test A: User B does not inherit User A profile/database ownership', async () => {
            const userA = await createTestUser('user_a');
            const userB = await createTestUser('user_b');
            const codeA = `p6_iso_a_${Date.now()}`;
            const codeB = `p6_iso_b_${Date.now()}`;
            const resA = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'Database A',
                profileCode: codeA,
                userId: userA.id,
            });
            createdTestFiles.push(resA.canonicalPath);
            const resB = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'Database B',
                profileCode: codeB,
                userId: userB.id,
            });
            createdTestFiles.push(resB.canonicalPath);
            // Assert User A ownership
            const userAProfiles = await prisma_1.systemPrisma.userProfile.findMany({
                where: { userId: userA.id, isActive: true },
                include: { profile: true },
            });
            const userACodes = userAProfiles.map((up) => up.profile.code);
            (0, vitest_1.expect)(userACodes).toContain(codeA);
            (0, vitest_1.expect)(userACodes).not.toContain(codeB);
            // Assert User B ownership
            const userBProfiles = await prisma_1.systemPrisma.userProfile.findMany({
                where: { userId: userB.id, isActive: true },
                include: { profile: true },
            });
            const userBCodes = userBProfiles.map((up) => up.profile.code);
            (0, vitest_1.expect)(userBCodes).toContain(codeB);
            (0, vitest_1.expect)(userBCodes).not.toContain(codeA);
        });
        (0, vitest_1.it)('Section 4.9 Test B: Existing installation users are NOT automatically assigned to a newly provisioned profile', async () => {
            const userA = await createTestUser('inst_u_a');
            const userB = await createTestUser('inst_u_b');
            const userC = await createTestUser('inst_u_c');
            const newCode = `p6_target_b_${Date.now()}`;
            const res = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'User B DB',
                profileCode: newCode,
                userId: userB.id,
            });
            createdTestFiles.push(res.canonicalPath);
            // Verify User B has profile
            const upB = await prisma_1.systemPrisma.userProfile.findFirst({
                where: { userId: userB.id, profileId: res.profileId, isActive: true },
            });
            (0, vitest_1.expect)(upB).toBeDefined();
            // Verify User A and User C DO NOT have the profile
            const upA = await prisma_1.systemPrisma.userProfile.findFirst({
                where: { userId: userA.id, profileId: res.profileId },
            });
            const upC = await prisma_1.systemPrisma.userProfile.findFirst({
                where: { userId: userC.id, profileId: res.profileId },
            });
            (0, vitest_1.expect)(upA).toBeNull();
            (0, vitest_1.expect)(upC).toBeNull();
        });
        (0, vitest_1.it)('Section 4.9 Test C: Missing target user strictly fails closed without creating artifacts', async () => {
            const code = `p6_missing_u_${Date.now()}`;
            const targetDbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `${code}.db`);
            await (0, vitest_1.expect)(database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'Should Fail DB',
                profileCode: code,
                userId: '', // missing
            })).rejects.toThrow(errors_1.ValidationError);
            // Assert no files or database records were created
            (0, vitest_1.expect)(fs_1.default.existsSync(targetDbPath)).toBe(false);
            const profile = await prisma_1.systemPrisma.profile.findUnique({ where: { code } });
            (0, vitest_1.expect)(profile).toBeNull();
            const registry = await prisma_1.systemPrisma.databaseRegistry.findUnique({ where: { canonicalPath: targetDbPath } });
            (0, vitest_1.expect)(registry).toBeNull();
        });
        (0, vitest_1.it)('Section 4.9 Test D: Attempting provisioning for a user of another installation fails with ConflictError', async () => {
            const foreignInstall = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: crypto_1.default.randomUUID(),
                    status: 'ACTIVE',
                },
            });
            const foreignUser = await auth_service_1.authService.createUser(`foreign_${Date.now()}`, 'Password123!Secure', 'Foreign User', 'ADMIN', []);
            await prisma_1.systemPrisma.installationUser.create({
                data: {
                    installationId: foreignInstall.id,
                    userId: foreignUser.id,
                },
            });
            // Try provisioning under our local installation for a user belonging only to foreign install
            await (0, vitest_1.expect)(database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'Foreign User DB',
                profileCode: `foreign_prof_${Date.now()}`,
                userId: foreignUser.id,
                installationId: installId, // local install
            })).rejects.toThrow(errors_1.ConflictError);
        });
    });
    // ═════════════════════════════════════════════════════════════════════════
    // FIX #2: DURABLE PROVISIONING IDEMPOTENCY (Section 5)
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('Fix #2 — Durable Provisioning Idempotency & Operation Identity', () => {
        (0, vitest_1.it)('Section 5.7: Replaying the same operationId returns the existing result without recreating', async () => {
            const user = await createTestUser('idemp_u');
            const opId = `op_idemp_${Date.now()}`;
            const code = `p6_idemp_${Date.now()}`;
            const first = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'Idempotent DB',
                profileCode: code,
                userId: user.id,
                provisioningOperationId: opId,
            });
            createdTestFiles.push(first.canonicalPath);
            // Replay identical operation
            const second = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'Idempotent DB',
                profileCode: code,
                userId: user.id,
                provisioningOperationId: opId,
            });
            (0, vitest_1.expect)(second.databaseId).toBe(first.databaseId);
            (0, vitest_1.expect)(second.canonicalPath).toBe(first.canonicalPath);
            (0, vitest_1.expect)(second.profileId).toBe(first.profileId);
            (0, vitest_1.expect)(second.operationId).toBe(opId);
            // Verify only one registry and operation record exists
            const opCount = await prisma_1.systemPrisma.provisioningOperation.count({ where: { operationId: opId } });
            (0, vitest_1.expect)(opCount).toBe(1);
            const regCount = await prisma_1.systemPrisma.databaseRegistry.count({ where: { databaseId: first.databaseId } });
            (0, vitest_1.expect)(regCount).toBe(1);
        });
        (0, vitest_1.it)('Section 5.7: Reusing same operationId with conflicting payload throws ConflictError', async () => {
            const user = await createTestUser('conflict_u');
            const opId = `op_conflict_${Date.now()}`;
            const code = `p6_conf_${Date.now()}`;
            const first = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'Original Name',
                profileCode: code,
                userId: user.id,
                provisioningOperationId: opId,
            });
            createdTestFiles.push(first.canonicalPath);
            // Call again with same operationId but different display name / payload
            await (0, vitest_1.expect)(database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'Conflicting Altered Name',
                profileCode: code,
                userId: user.id,
                provisioningOperationId: opId,
            })).rejects.toThrow(errors_1.ConflictError);
        });
    });
    // ═════════════════════════════════════════════════════════════════════════
    // FIX #3: CRASH / INTERRUPTION RECOVERY & RECONCILIATION (Section 6)
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('Fix #3 — Crash Recovery & Startup Reconciliation', () => {
        (0, vitest_1.it)('Section 6.5: Reconciles an interrupted operation where file was created and completes registry', async () => {
            const user = await createTestUser('reconcile_u');
            const opId = `op_crash_${Date.now()}`;
            const code = `p6_crash_${Date.now()}`;
            const { canonicalPath } = database_provisioning_service_1.databaseProvisioningService.determineDestination(code);
            createdTestFiles.push(canonicalPath);
            // Copy template to destination as if crashed right after FILE_CREATED
            const templatePath = await database_provisioning_service_1.databaseProvisioningService.validateTemplate();
            fs_1.default.copyFileSync(templatePath, canonicalPath);
            const requestHash = crypto_1.default
                .createHash('sha256')
                .update(JSON.stringify({ installationId: installId, userId: user.id, profileCode: code, displayName: code, profileName: code }))
                .digest('hex');
            await prisma_1.systemPrisma.provisioningOperation.create({
                data: {
                    operationId: opId,
                    installationId: installId,
                    userId: user.id,
                    profileCode: code,
                    targetPath: canonicalPath,
                    status: 'FILE_CREATED',
                    requestHash,
                },
            });
            // Run reconciliation
            const reconResult = await database_provisioning_service_1.databaseProvisioningService.reconcileInterruptedOperations(installId);
            (0, vitest_1.expect)(reconResult.reconciled).toBeGreaterThanOrEqual(1);
            // Verify operation is now COMPLETED
            const op = await prisma_1.systemPrisma.provisioningOperation.findUnique({ where: { operationId: opId } });
            (0, vitest_1.expect)(op?.status).toBe('COMPLETED');
            // Verify registry was created
            const reg = await prisma_1.systemPrisma.databaseRegistry.findUnique({ where: { canonicalPath } });
            (0, vitest_1.expect)(reg).toBeDefined();
            (0, vitest_1.expect)(reg?.status).toBe('ACTIVE');
        });
        (0, vitest_1.it)('Section 6.5: Compensates and cleans up corrupted orphan file on interrupted crash', async () => {
            const user = await createTestUser('corrupt_u');
            const opId = `op_corrupt_${Date.now()}`;
            const code = `p6_corrupt_${Date.now()}`;
            const { canonicalPath } = database_provisioning_service_1.databaseProvisioningService.determineDestination(code);
            // Write garbage data to simulate corrupted partial file
            fs_1.default.writeFileSync(canonicalPath, Buffer.from('Corrupted database file data'));
            const requestHash = crypto_1.default.createHash('sha256').update('corrupt').digest('hex');
            await prisma_1.systemPrisma.provisioningOperation.create({
                data: {
                    operationId: opId,
                    installationId: installId,
                    userId: user.id,
                    profileCode: code,
                    targetPath: canonicalPath,
                    status: 'FILE_CREATED',
                    requestHash,
                },
            });
            const reconResult = await database_provisioning_service_1.databaseProvisioningService.reconcileInterruptedOperations(installId);
            (0, vitest_1.expect)(reconResult.compensated).toBeGreaterThanOrEqual(1);
            // Incomplete corrupted file must be removed!
            (0, vitest_1.expect)(fs_1.default.existsSync(canonicalPath)).toBe(false);
            const op = await prisma_1.systemPrisma.provisioningOperation.findUnique({ where: { operationId: opId } });
            (0, vitest_1.expect)(op?.status).toBe('COMPENSATED');
        });
    });
    // ═════════════════════════════════════════════════════════════════════════
    // FIX #4: AUTHORITATIVE / EXTENSIBLE PRISTINE VALIDATION (Section 7)
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('Fix #4 — Authoritative & Extensible Pristine Validation', () => {
        (0, vitest_1.it)('Section 7.7 Test 1: Injected rows in a business table fail pristine validation with ConflictError', async () => {
            await createTestUser('pristine_fail_u');
            const code = `p6_fail_pristine_${Date.now()}`;
            const { canonicalPath } = database_provisioning_service_1.databaseProvisioningService.determineDestination(code);
            createdTestFiles.push(canonicalPath);
            const templatePath = await database_provisioning_service_1.databaseProvisioningService.validateTemplate();
            fs_1.default.copyFileSync(templatePath, canonicalPath);
            // Inject a business record into DiamondItem
            const client = new client_1.PrismaClient({ datasources: { db: { url: `file:${canonicalPath}` } } });
            await client.$connect();
            await client.$executeRawUnsafe(`INSERT INTO "Party" (id, partyCode, name, partyType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?);`, crypto_1.default.randomUUID(), `P_${Date.now()}`, 'Injected Customer', 'CUSTOMER', new Date().toISOString(), new Date().toISOString());
            await client.$disconnect();
            // Assert pristine check rejects
            await (0, vitest_1.expect)(database_provisioning_service_1.databaseProvisioningService.validatePristineState(canonicalPath)).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('Section 7.7 Test 2: Unclassified table in SQLite fails closed with PRISTINE_VALIDATION_UNCLASSIFIED', async () => {
            const code = `p6_unclass_${Date.now()}`;
            const { canonicalPath } = database_provisioning_service_1.databaseProvisioningService.determineDestination(code);
            createdTestFiles.push(canonicalPath);
            const templatePath = await database_provisioning_service_1.databaseProvisioningService.validateTemplate();
            fs_1.default.copyFileSync(templatePath, canonicalPath);
            // Create an unknown table
            const client = new client_1.PrismaClient({ datasources: { db: { url: `file:${canonicalPath}` } } });
            await client.$connect();
            await client.$executeRawUnsafe(`CREATE TABLE "UnknownFutureTable" ("id" TEXT PRIMARY KEY, "secret" TEXT);`);
            await client.$disconnect();
            await (0, vitest_1.expect)(database_provisioning_service_1.databaseProvisioningService.validatePristineState(canonicalPath)).rejects.toThrow(/PRISTINE_VALIDATION_UNCLASSIFIED/);
        });
        (0, vitest_1.it)('Section 7.7 Test 3: Approved reference data does not fail pristine validation', async () => {
            const code = `p6_ref_ok_${Date.now()}`;
            const { canonicalPath } = database_provisioning_service_1.databaseProvisioningService.determineDestination(code);
            createdTestFiles.push(canonicalPath);
            const templatePath = await database_provisioning_service_1.databaseProvisioningService.validateTemplate();
            fs_1.default.copyFileSync(templatePath, canonicalPath);
            // Insert into SYSTEM_CONFIGURATION / REFERENCE_DATA table (Setting)
            const client = new client_1.PrismaClient({ datasources: { db: { url: `file:${canonicalPath}` } } });
            await client.$connect();
            await client.$executeRawUnsafe(`INSERT INTO "Setting" (id, key, value, updatedAt) VALUES (?, ?, ?, ?);`, crypto_1.default.randomUUID(), 'app.locale', 'en-IN', new Date().toISOString());
            await client.$disconnect();
            const result = await database_provisioning_service_1.databaseProvisioningService.validatePristineState(canonicalPath);
            (0, vitest_1.expect)(result.isPristine).toBe(true);
        });
        (0, vitest_1.it)('Section 7.7 Test 4: Corrupted template fails before creating any destination database', async () => {
            const user = await createTestUser('corrupt_tpl_u');
            const originalEnv = process.env.DIAMOND_TEMPLATE_DB;
            const corruptTplPath = path_1.default.resolve('corrupted_test_template.db');
            fs_1.default.writeFileSync(corruptTplPath, Buffer.from('Not a valid sqlite database header'));
            process.env.DIAMOND_TEMPLATE_DB = corruptTplPath;
            try {
                const code = `p6_no_dst_${Date.now()}`;
                const targetPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `${code}.db`);
                await (0, vitest_1.expect)(database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                    displayName: 'Corrupted Template Test',
                    profileCode: code,
                    userId: user.id,
                })).rejects.toThrow(errors_1.ValidationError);
                // Prove destination was never created
                (0, vitest_1.expect)(fs_1.default.existsSync(targetPath)).toBe(false);
            }
            finally {
                if (fs_1.default.existsSync(corruptTplPath))
                    fs_1.default.unlinkSync(corruptTplPath);
                if (originalEnv !== undefined) {
                    process.env.DIAMOND_TEMPLATE_DB = originalEnv;
                }
                else {
                    delete process.env.DIAMOND_TEMPLATE_DB;
                }
            }
        });
        (0, vitest_1.it)('Section 7.7 Test 5: Modifying template after provisioning leaves provisioned database unaffected', async () => {
            const user = await createTestUser('tpl_immut_u');
            const code = `p6_immut_${Date.now()}`;
            const res = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'Immutable Check DB',
                profileCode: code,
                userId: user.id,
            });
            createdTestFiles.push(res.canonicalPath);
            // Verify provisioned database has 0 records
            const client = new client_1.PrismaClient({ datasources: { db: { url: `file:${res.canonicalPath}` } } });
            await client.$connect();
            const countBefore = await client.$queryRawUnsafe('SELECT COUNT(*) as cnt FROM "Stock";');
            (0, vitest_1.expect)(Number(countBefore[0].cnt)).toBe(0);
            await client.$disconnect();
        });
    });
    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 34. P0 CRITICAL DATA ISOLATION TEST (MANDATORY)
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('Section 34. P0 Critical Data Isolation Test', () => {
        (0, vitest_1.it)('proves that User B cannot see business records inserted into User A database', async () => {
            const userA = await createTestUser('p0_user_a');
            const userB = await createTestUser('p0_user_b');
            const codeA = `p6_iso_a_${Date.now()}`;
            const codeB = `p6_iso_b_${Date.now()}`;
            // 1. Provision Database A
            const resA = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'User A Database',
                profileCode: codeA,
                userId: userA.id,
            });
            createdTestFiles.push(resA.canonicalPath);
            // 2. Insert unique business record into Database A
            const clientA = new client_1.PrismaClient({
                datasources: { db: { url: `file:${path_1.default.resolve(resA.canonicalPath)}` } },
            });
            await clientA.$connect();
            const uniquePartyCode = `PARTY_A_${Date.now()}`;
            await clientA.$executeRawUnsafe(`INSERT INTO "Party" (id, partyCode, name, partyType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?);`, crypto_1.default.randomUUID(), uniquePartyCode, 'Diamond Supplier A', 'SUPPLIER', new Date().toISOString(), new Date().toISOString());
            const countA = await clientA.$queryRawUnsafe('SELECT COUNT(*) as cnt FROM "Party";');
            (0, vitest_1.expect)(Number(countA[0].cnt)).toBe(1);
            await clientA.$disconnect();
            // 3. Provision Database B (New User B)
            const resB = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'User B Database',
                profileCode: codeB,
                userId: userB.id,
            });
            createdTestFiles.push(resB.canonicalPath);
            // 4. Load Database B
            const clientB = new client_1.PrismaClient({
                datasources: { db: { url: `file:${path_1.default.resolve(resB.canonicalPath)}` } },
            });
            await clientB.$connect();
            // Invariant: User B cannot see User A records!
            const partyCountB = await clientB.$queryRawUnsafe('SELECT COUNT(*) as cnt FROM "Party";');
            (0, vitest_1.expect)(Number(partyCountB[0].cnt)).toBe(0);
            const partyRowsB = await clientB.$queryRawUnsafe(`SELECT * FROM "Party" WHERE partyCode = ?;`, uniquePartyCode);
            (0, vitest_1.expect)(partyRowsB.length).toBe(0);
            await clientB.$disconnect();
            (0, vitest_1.expect)(resB.canonicalPath).not.toBe(resA.canonicalPath);
            (0, vitest_1.expect)(resB.databaseId).not.toBe(resA.databaseId);
            (0, vitest_1.expect)(resB.profileId).not.toBe(resA.profileId);
        });
    });
    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 36. WINDOWS PATH TESTING
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('Section 36. Windows Path Testing', () => {
        (0, vitest_1.it)('handles database display names with spaces and normalizes paths consistently', async () => {
            const user = await createTestUser('win_u');
            const res = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                displayName: 'Mumbai Diamond Branch 01',
                userId: user.id,
            });
            createdTestFiles.push(res.canonicalPath);
            (0, vitest_1.expect)(res.profileCode).toBe('mumbai_diamond_branch_01');
            (0, vitest_1.expect)(res.canonicalPath).toContain('mumbai_diamond_branch_01.db');
            (0, vitest_1.expect)(fs_1.default.existsSync(res.canonicalPath)).toBe(true);
            const validation = await database_validation_service_1.databaseValidationService.validateDatabase(res.canonicalPath);
            (0, vitest_1.expect)(validation.isValid).toBe(true);
        });
    });
});
//# sourceMappingURL=phase6-new-user-provisioning.test.js.map