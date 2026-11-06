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
const database_validation_service_1 = require("../modules/system/database/database-validation.service");
const auth_service_1 = require("../modules/auth/auth.service");
const device_security_service_1 = require("../modules/security/device-security.service");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Diamond ERP V3 — Phase 5: Existing User + Database Discovery & Validation', () => {
    let installId;
    let deviceId;
    const createdTestFiles = [];
    const createdRegistryIds = [];
    (0, vitest_1.beforeEach)(async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        installId = install.id;
        deviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        // Ensure active device and pin for full lifecycle flow
        await installation_service_1.installationService.registerDevice({
            deviceName: 'Phase5-Validation-Terminal',
            platform: 'WINDOWS',
        });
        await device_security_service_1.deviceSecurityService.setupPin(deviceId, '849201').catch(() => { });
        await prisma_1.systemPrisma.installation.update({
            where: { id: installId },
            data: { lifecycleState: 'USER_DISCOVERY', status: 'ACTIVE' },
        });
    });
    (0, vitest_1.afterEach)(async () => {
        if (createdRegistryIds.length > 0) {
            await prisma_1.systemPrisma.databaseRegistry.deleteMany({
                where: { id: { in: createdRegistryIds } },
            }).catch(() => { });
            createdRegistryIds.length = 0;
        }
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
    // 50.1 EXISTING USER TESTS
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('50.1 Existing User Discovery, Validation & Selection', () => {
        (0, vitest_1.it)('discovers existing users without exposing password hashes, PIN hashes, or tokens', async () => {
            const uname = `p5_user_${Date.now()}`;
            const created = await auth_service_1.authService.createUser(uname, 'SecretPass12345!', 'P5 User', 'ADMIN', []);
            const discovery = await onboarding_service_1.onboardingService.discoverUsers();
            (0, vitest_1.expect)(discovery.candidates.length).toBeGreaterThan(0);
            const found = discovery.candidates.find((u) => u.id === created.id);
            (0, vitest_1.expect)(found).toBeDefined();
            (0, vitest_1.expect)(found?.username).toBe(uname);
            (0, vitest_1.expect)(found?.displayName).toBe('P5 User');
            (0, vitest_1.expect)(found?.role).toBe('ADMIN');
            (0, vitest_1.expect)(found?.isActive).toBe(true);
            // Verify strict security boundary: no secrets or credentials exposed
            (0, vitest_1.expect)(found.passwordHash).toBeUndefined();
            (0, vitest_1.expect)(found.pinHash).toBeUndefined();
            (0, vitest_1.expect)(found.refreshToken).toBeUndefined();
            (0, vitest_1.expect)(found.sessionToken).toBeUndefined();
        });
        (0, vitest_1.it)('excludes soft-deleted users from user discovery candidates', async () => {
            const uname = `p5_del_${Date.now()}`;
            const created = await auth_service_1.authService.createUser(uname, 'SecretPass12345!', 'P5 Deleted', 'VIEWER', []);
            // Soft delete the user
            await prisma_1.systemPrisma.user.update({
                where: { id: created.id },
                data: { deletedAt: new Date() },
            });
            const discovery = await onboarding_service_1.onboardingService.discoverUsers();
            const found = discovery.candidates.find((u) => u.id === created.id);
            (0, vitest_1.expect)(found).toBeUndefined();
        });
        (0, vitest_1.it)('rejects selection of non-existent or soft-deleted user with NotFoundError', async () => {
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.selectExistingUser('non-existent-user-uuid')).rejects.toThrow(errors_1.NotFoundError);
            const uname = `p5_del2_${Date.now()}`;
            const created = await auth_service_1.authService.createUser(uname, 'SecretPass12345!', 'P5 Deleted 2', 'VIEWER', []);
            await prisma_1.systemPrisma.user.update({
                where: { id: created.id },
                data: { deletedAt: new Date() },
            });
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.selectExistingUser(created.id)).rejects.toThrow(errors_1.NotFoundError);
        });
        (0, vitest_1.it)('rejects selection of inactive user with ConflictError', async () => {
            const uname = `p5_inact_${Date.now()}`;
            const created = await auth_service_1.authService.createUser(uname, 'SecretPass12345!', 'P5 Inactive', 'VIEWER', []);
            await prisma_1.systemPrisma.user.update({
                where: { id: created.id },
                data: { isActive: false },
            });
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.selectExistingUser(created.id)).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('successfully associates valid user, records USER_ASSOCIATED audit event, and advances lifecycle to DATABASE_DISCOVERY', async () => {
            const uname = `p5_valid_${Date.now()}`;
            const created = await auth_service_1.authService.createUser(uname, 'SecretPass12345!', 'P5 Valid', 'ADMIN', []);
            const res = await onboarding_service_1.onboardingService.selectExistingUser(created.id);
            (0, vitest_1.expect)(res.success).toBe(true);
            (0, vitest_1.expect)(res.user.id).toBe(created.id);
            // Verify InstallationUser relation
            const installUser = await prisma_1.systemPrisma.installationUser.findUnique({
                where: {
                    installationId_userId: {
                        installationId: installId,
                        userId: created.id,
                    },
                },
            });
            (0, vitest_1.expect)(installUser).toBeDefined();
            // Verify USER_ASSOCIATED audit event
            const audit = await prisma_1.systemPrisma.auditEvent.findFirst({
                where: {
                    entityType: 'User',
                    entityId: created.id,
                    eventType: 'USER_ASSOCIATED',
                },
            });
            (0, vitest_1.expect)(audit).toBeDefined();
            (0, vitest_1.expect)(audit?.performedBy).toBe(created.id);
            // Verify lifecycle advanced to DATABASE_DISCOVERY
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            (0, vitest_1.expect)(install.lifecycleState).toBe('DATABASE_DISCOVERY');
        });
        (0, vitest_1.it)('is strictly idempotent when selecting the same user multiple times', async () => {
            const uname = `p5_idem_${Date.now()}`;
            const created = await auth_service_1.authService.createUser(uname, 'SecretPass12345!', 'P5 Idem', 'ADMIN', []);
            await onboarding_service_1.onboardingService.selectExistingUser(created.id);
            await onboarding_service_1.onboardingService.selectExistingUser(created.id);
            const records = await prisma_1.systemPrisma.installationUser.findMany({
                where: { installationId: installId, userId: created.id },
            });
            (0, vitest_1.expect)(records.length).toBe(1);
        });
    });
    // ═════════════════════════════════════════════════════════════════════════
    // 50.2 DATABASE DISCOVERY TESTS
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('50.2 Bounded Database Discovery', () => {
        (0, vitest_1.it)('discovers databases from DatabaseRegistry and local databases directory', async () => {
            const testDb = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `disc_test_${Date.now()}.db`);
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            fs_1.default.copyFileSync(templatePath, testDb);
            createdTestFiles.push(testDb);
            const discovery = await onboarding_service_1.onboardingService.discoverDatabases();
            (0, vitest_1.expect)(discovery.candidates.length).toBeGreaterThan(0);
            const found = discovery.candidates.find((c) => c.canonicalPath.toLowerCase() === testDb.toLowerCase());
            (0, vitest_1.expect)(found).toBeDefined();
            (0, vitest_1.expect)(found?.status).toBe('ACTIVE');
        });
        (0, vitest_1.it)('excludes Control DB (system.db) and Template DB (template.db) from discovery', async () => {
            const controlDb = path_1.default.resolve((0, paths_1.getControlDbPath)()).toLowerCase();
            const templateDb = (0, paths_1.getDatabaseTemplatePath)() ? path_1.default.resolve((0, paths_1.getDatabaseTemplatePath)()).toLowerCase() : null;
            const discovery = await onboarding_service_1.onboardingService.discoverDatabases();
            for (const candidate of discovery.candidates) {
                const p = candidate.canonicalPath.toLowerCase();
                (0, vitest_1.expect)(p).not.toBe(controlDb);
                if (templateDb) {
                    (0, vitest_1.expect)(p).not.toBe(templateDb);
                }
            }
        });
        (0, vitest_1.it)('deduplicates database candidates case-insensitively on Windows', async () => {
            const baseName = `cased_${Date.now()}.db`;
            const testDb = path_1.default.resolve((0, paths_1.getDatabasesDir)(), baseName);
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            fs_1.default.copyFileSync(templatePath, testDb);
            createdTestFiles.push(testDb);
            // Register with mixed case
            const upperPath = testDb.toUpperCase();
            const reg1 = await prisma_1.systemPrisma.databaseRegistry.create({
                data: {
                    databaseId: crypto_1.default.randomUUID(),
                    displayName: 'Cased DB',
                    canonicalPath: upperPath,
                    schemaVersion: 1,
                    status: 'ACTIVE',
                    databaseType: 'EXTERNAL',
                    installationId: installId,
                },
            });
            createdRegistryIds.push(reg1.id);
            const discovery = await onboarding_service_1.onboardingService.discoverDatabases();
            const matches = discovery.candidates.filter((c) => c.canonicalPath.toLowerCase() === testDb.toLowerCase());
            (0, vitest_1.expect)(matches.length).toBe(1);
        });
        (0, vitest_1.it)('classifies missing database file as MISSING status in discovery', async () => {
            const missingPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `non_existent_${Date.now()}.db`);
            const reg2 = await prisma_1.systemPrisma.databaseRegistry.create({
                data: {
                    databaseId: crypto_1.default.randomUUID(),
                    displayName: 'Missing DB',
                    canonicalPath: missingPath,
                    schemaVersion: 1,
                    status: 'ACTIVE',
                    databaseType: 'EXTERNAL',
                    installationId: installId,
                },
            });
            createdRegistryIds.push(reg2.id);
            const discovery = await onboarding_service_1.onboardingService.discoverDatabases();
            const found = discovery.candidates.find((c) => c.canonicalPath.toLowerCase() === missingPath.toLowerCase());
            (0, vitest_1.expect)(found).toBeDefined();
            (0, vitest_1.expect)(found?.status).toBe('MISSING');
        });
    });
    // ═════════════════════════════════════════════════════════════════════════
    // 50.3 DATABASE VALIDATION & SUITABILITY CLASSIFICATION
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('50.3 Database Structural Validation & Compatibility Classification', () => {
        (0, vitest_1.it)('validates a valid production Diamond ERP database file', async () => {
            const testDb = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `valid_erp_${Date.now()}.db`);
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            fs_1.default.copyFileSync(templatePath, testDb);
            createdTestFiles.push(testDb);
            const validation = await database_validation_service_1.databaseValidationService.validateDatabase(testDb);
            (0, vitest_1.expect)(validation.isValid).toBe(true);
            (0, vitest_1.expect)(validation.status).toBe('ACTIVE');
            (0, vitest_1.expect)(validation.tableCount).toBeGreaterThanOrEqual(7);
            (0, vitest_1.expect)(validation.integrityCheck).toBe('ok');
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(testDb);
            (0, vitest_1.expect)(preview.suitability).toBe('REQUIRES_CONFIRMATION');
            (0, vitest_1.expect)(preview.status).toBe('ACTIVE');
        });
        (0, vitest_1.it)('classifies non-existent database as MISSING status with INVALID suitability', async () => {
            const nonExistent = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `ghost_${Date.now()}.db`);
            const validation = await database_validation_service_1.databaseValidationService.validateDatabase(nonExistent);
            (0, vitest_1.expect)(validation.isValid).toBe(false);
            (0, vitest_1.expect)(validation.status).toBe('MISSING');
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(nonExistent);
            (0, vitest_1.expect)(preview.status).toBe('MISSING');
            (0, vitest_1.expect)(preview.suitability).toBe('INVALID');
        });
        (0, vitest_1.it)('classifies plain text or invalid file as INVALID', async () => {
            const plainText = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `text_${Date.now()}.db`);
            fs_1.default.writeFileSync(plainText, 'This is not a sqlite database file at all.');
            createdTestFiles.push(plainText);
            const validation = await database_validation_service_1.databaseValidationService.validateDatabase(plainText);
            (0, vitest_1.expect)(validation.isValid).toBe(false);
            (0, vitest_1.expect)(validation.status).toBe('INVALID');
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(plainText);
            (0, vitest_1.expect)(preview.suitability).toBe('INVALID');
        });
        (0, vitest_1.it)('classifies corrupted SQLite file as CORRUPTED', async () => {
            const corruptFile = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `corrupt_${Date.now()}.db`);
            // SQLite header followed by garbage
            const buf = Buffer.alloc(1024);
            Buffer.from('SQLite format 3\0').copy(buf, 0);
            fs_1.default.writeFileSync(corruptFile, buf);
            createdTestFiles.push(corruptFile);
            const validation = await database_validation_service_1.databaseValidationService.validateDatabase(corruptFile);
            (0, vitest_1.expect)(validation.isValid).toBe(false);
            (0, vitest_1.expect)(validation.status).toBe('CORRUPTED');
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(corruptFile);
            (0, vitest_1.expect)(preview.suitability).toBe('CORRUPTED');
        });
        (0, vitest_1.it)('classifies SQLite database missing required ERP tables as UNSUPPORTED', async () => {
            const unsupportedDb = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `unsupported_${Date.now()}.db`);
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            fs_1.default.copyFileSync(templatePath, unsupportedDb);
            createdTestFiles.push(unsupportedDb);
            const tempClient = new client_1.PrismaClient({
                datasources: { db: { url: `file:${unsupportedDb.replace(/\\/g, '/')}` } },
            });
            await tempClient.$connect();
            await tempClient.$executeRawUnsafe('DROP TABLE "Stock";');
            await tempClient.$disconnect();
            const validation = await database_validation_service_1.databaseValidationService.validateDatabase(unsupportedDb);
            (0, vitest_1.expect)(validation.isValid).toBe(false);
            (0, vitest_1.expect)(validation.status).toBe('UNSUPPORTED');
            (0, vitest_1.expect)(validation.missingRequiredTables).toContain('Stock');
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(unsupportedDb);
            (0, vitest_1.expect)(preview.suitability).toBe('UNSUPPORTED');
        });
        (0, vitest_1.it)('classifies database with future schema version as UNSUPPORTED', async () => {
            const futureDb = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `future_ver_${Date.now()}.db`);
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            fs_1.default.copyFileSync(templatePath, futureDb);
            createdTestFiles.push(futureDb);
            const tempClient = new client_1.PrismaClient({
                datasources: { db: { url: `file:${futureDb.replace(/\\/g, '/')}` } },
            });
            await tempClient.$connect();
            await tempClient.$executeRawUnsafe('INSERT OR REPLACE INTO "Profile" ("id", "code", "name", "schemaVersion", "status", "isActive", "createdAt", "updatedAt") ' +
                "VALUES ('p1', 'main', 'Main Profile', 99, 'ACTIVE', 1, datetime('now'), datetime('now'));");
            await tempClient.$disconnect();
            const validation = await database_validation_service_1.databaseValidationService.validateDatabase(futureDb);
            (0, vitest_1.expect)(validation.isValid).toBe(false);
            (0, vitest_1.expect)(validation.status).toBe('UNSUPPORTED');
            (0, vitest_1.expect)(validation.error).toContain('Future schema version');
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(futureDb);
            (0, vitest_1.expect)(preview.suitability).toBe('UNSUPPORTED');
        });
        (0, vitest_1.it)('rejects Control DB (system.db) candidate inspection with CONFLICT and DATABASE_IS_CONTROL_DB', async () => {
            const controlDb = (0, paths_1.getControlDbPath)();
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(controlDb);
            (0, vitest_1.expect)(preview.suitability).toBe('CONFLICT');
            (0, vitest_1.expect)(preview.conflictReason).toBe('DATABASE_IS_CONTROL_DB');
        });
        (0, vitest_1.it)('rejects Template DB (template.db) candidate inspection with CONFLICT and DATABASE_IS_TEMPLATE', async () => {
            const templateDb = (0, paths_1.getDatabaseTemplatePath)();
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(templateDb);
            (0, vitest_1.expect)(preview.suitability).toBe('CONFLICT');
            (0, vitest_1.expect)(preview.conflictReason).toBe('DATABASE_IS_TEMPLATE');
        });
        (0, vitest_1.it)('detects cross-installation ownership conflict with CONFLICT and DATABASE_INSTALLATION_CONFLICT', async () => {
            const foreignInstall = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: 'foreign-install-uuid-999',
                    status: 'ACTIVE',
                    lifecycleState: 'READY',
                },
            });
            const conflictDb = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `foreign_owned_${Date.now()}.db`);
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            fs_1.default.copyFileSync(templatePath, conflictDb);
            createdTestFiles.push(conflictDb);
            await prisma_1.systemPrisma.databaseRegistry.create({
                data: {
                    databaseId: crypto_1.default.randomUUID(),
                    displayName: 'Foreign Owned DB',
                    canonicalPath: conflictDb,
                    schemaVersion: 1,
                    status: 'ACTIVE',
                    databaseType: 'EXTERNAL',
                    installationId: foreignInstall.id,
                },
            });
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(conflictDb);
            (0, vitest_1.expect)(preview.suitability).toBe('CONFLICT');
            (0, vitest_1.expect)(preview.conflictReason).toBe('DATABASE_INSTALLATION_CONFLICT');
            // Attempting to attach must throw ConflictError
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.attachExistingDatabase({
                path: conflictDb,
                confirmAttachment: true,
            })).rejects.toThrow(errors_1.ConflictError);
        });
    });
    // ═════════════════════════════════════════════════════════════════════════
    // 50.4 EXPLICIT ATTACHMENT & TRANSACTION SAFETY
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('50.4 Explicit Attachment, Audit Events & Transaction Safety', () => {
        (0, vitest_1.it)('rejects attachment without explicit confirmation (confirmAttachment = false)', async () => {
            const testDb = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `unconfirmed_${Date.now()}.db`);
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            fs_1.default.copyFileSync(templatePath, testDb);
            createdTestFiles.push(testDb);
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.attachExistingDatabase({
                path: testDb,
                confirmAttachment: false,
            })).rejects.toThrow(errors_1.ValidationError);
        });
        (0, vitest_1.it)('revalidates database before attachment and rejects if file became invalid', async () => {
            const corruptedBeforeAttach = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `swap_corrupt_${Date.now()}.db`);
            fs_1.default.writeFileSync(corruptedBeforeAttach, 'plain text non-database file');
            createdTestFiles.push(corruptedBeforeAttach);
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.attachExistingDatabase({
                path: corruptedBeforeAttach,
                confirmAttachment: true,
            })).rejects.toThrow(errors_1.ValidationError);
        });
        (0, vitest_1.it)('successfully attaches valid database upon explicit confirmation: creates Profile, DatabaseRegistry, UserProfile & AuditEvents', async () => {
            // 1. Associate a user first
            const uname = `p5_att_user_${Date.now()}`;
            const user = await auth_service_1.authService.createUser(uname, 'SecretPass12345!', 'Attach User', 'ADMIN', []);
            await onboarding_service_1.onboardingService.selectExistingUser(user.id);
            // 2. Prepare valid candidate DB
            const testDb = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `company_attach_${Date.now()}.db`);
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            fs_1.default.copyFileSync(templatePath, testDb);
            createdTestFiles.push(testDb);
            const beforeStat = fs_1.default.statSync(testDb);
            // 3. Attach
            const attachRes = await onboarding_service_1.onboardingService.attachExistingDatabase({
                path: testDb,
                displayName: 'Attached Business DB',
                confirmAttachment: true,
            });
            (0, vitest_1.expect)(attachRes.success).toBe(true);
            (0, vitest_1.expect)(attachRes.registry).toBeDefined();
            (0, vitest_1.expect)(attachRes.registry.displayName).toBe('Attached Business DB');
            // 4. Invariant: physical external DB file was NOT modified or deleted
            (0, vitest_1.expect)(fs_1.default.existsSync(testDb)).toBe(true);
            const afterStat = fs_1.default.statSync(testDb);
            (0, vitest_1.expect)(afterStat.size).toBe(beforeStat.size);
            // 5. Verify DatabaseRegistry record in Control DB
            const reg = await prisma_1.systemPrisma.databaseRegistry.findUnique({
                where: { canonicalPath: testDb },
                include: { profile: true },
            });
            (0, vitest_1.expect)(reg).toBeDefined();
            (0, vitest_1.expect)(reg?.installationId).toBe(installId);
            (0, vitest_1.expect)(reg?.status).toBe('ACTIVE');
            (0, vitest_1.expect)(reg?.profileId).toBeDefined();
            // 6. Verify Profile record in Control DB
            const prof = await prisma_1.systemPrisma.profile.findUnique({
                where: { id: reg.profileId },
            });
            (0, vitest_1.expect)(prof).toBeDefined();
            (0, vitest_1.expect)(prof?.status).toBe('ACTIVE');
            // 7. Verify UserProfile link
            const userProfile = await prisma_1.systemPrisma.userProfile.findUnique({
                where: {
                    userId_profileId: {
                        userId: user.id,
                        profileId: prof.id,
                    },
                },
            });
            (0, vitest_1.expect)(userProfile).toBeDefined();
            (0, vitest_1.expect)(userProfile?.isActive).toBe(true);
            // 8. Verify AuditEvents
            const confirmAudit = await prisma_1.systemPrisma.auditEvent.findFirst({
                where: {
                    entityType: 'DatabaseRegistry',
                    entityId: reg.databaseId,
                    eventType: 'DATABASE_ATTACHMENT_CONFIRMED',
                },
            });
            (0, vitest_1.expect)(confirmAudit).toBeDefined();
            const attachAudit = await prisma_1.systemPrisma.auditEvent.findFirst({
                where: {
                    entityType: 'DatabaseRegistry',
                    entityId: reg.databaseId,
                    eventType: 'DATABASE_ATTACHED',
                },
            });
            (0, vitest_1.expect)(attachAudit).toBeDefined();
            // 9. Verify state machine advanced to DATABASE_SETUP
            const currentInstall = await installation_service_1.installationService.getOrCreateInstallation();
            (0, vitest_1.expect)(currentInstall.lifecycleState).toBe('DATABASE_SETUP');
        });
    });
    // ═════════════════════════════════════════════════════════════════════════
    // 50.5 IDEMPOTENCY & 50.6 CONCURRENCY TESTS
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('50.5 Idempotency & 50.6 Concurrency Protection', () => {
        (0, vitest_1.it)('attaching the same database twice yields identical logical databaseId without duplicates', async () => {
            const testDb = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `idem_attach_${Date.now()}.db`);
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            fs_1.default.copyFileSync(templatePath, testDb);
            createdTestFiles.push(testDb);
            const res1 = await onboarding_service_1.onboardingService.attachExistingDatabase({
                path: testDb,
                displayName: 'Idem DB 1',
                confirmAttachment: true,
            });
            const res2 = await onboarding_service_1.onboardingService.attachExistingDatabase({
                path: testDb,
                displayName: 'Idem DB 1',
                confirmAttachment: true,
            });
            (0, vitest_1.expect)(res1.registry.databaseId).toBe(res2.registry.databaseId);
            const allRegistries = await prisma_1.systemPrisma.databaseRegistry.findMany({
                where: { canonicalPath: testDb },
            });
            (0, vitest_1.expect)(allRegistries.length).toBe(1);
        });
        (0, vitest_1.it)('handles concurrent attachment requests of the same database safely', async () => {
            const testDb = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `concurrent_att_${Date.now()}.db`);
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            fs_1.default.copyFileSync(templatePath, testDb);
            createdTestFiles.push(testDb);
            const [resA, resB] = await Promise.all([
                onboarding_service_1.onboardingService.attachExistingDatabase({
                    path: testDb,
                    displayName: 'Concurrent DB',
                    confirmAttachment: true,
                }),
                onboarding_service_1.onboardingService.attachExistingDatabase({
                    path: testDb,
                    displayName: 'Concurrent DB',
                    confirmAttachment: true,
                }),
            ]);
            (0, vitest_1.expect)(resA.registry.databaseId).toBe(resB.registry.databaseId);
            const records = await prisma_1.systemPrisma.databaseRegistry.findMany({
                where: { canonicalPath: testDb },
            });
            (0, vitest_1.expect)(records.length).toBe(1);
        });
        (0, vitest_1.it)('handles concurrent user selection requests idempotently', async () => {
            const uname = `p5_conc_user_${Date.now()}`;
            const user = await auth_service_1.authService.createUser(uname, 'SecretPass12345!', 'Concurrent User', 'ADMIN', []);
            await Promise.all([
                onboarding_service_1.onboardingService.selectExistingUser(user.id),
                onboarding_service_1.onboardingService.selectExistingUser(user.id),
            ]);
            const records = await prisma_1.systemPrisma.installationUser.findMany({
                where: { installationId: installId, userId: user.id },
            });
            (0, vitest_1.expect)(records.length).toBe(1);
        });
    });
    // ═════════════════════════════════════════════════════════════════════════
    // 50.7 AUTHORITATIVE LIFECYCLE INTEGRATION & BYPASS PREVENTION
    // ═════════════════════════════════════════════════════════════════════════
    (0, vitest_1.describe)('50.7 Authoritative Lifecycle Transitions & Bypass Prevention', () => {
        (0, vitest_1.it)('prevents illegal transitions directly to READY from USER_DISCOVERY, DATABASE_DISCOVERY, or DATABASE_VALIDATION', async () => {
            // From USER_DISCOVERY -> READY
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'USER_DISCOVERY' },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY', { enforceInvariants: true })).rejects.toThrow(errors_1.ConflictError);
            // From DATABASE_DISCOVERY -> READY
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DATABASE_DISCOVERY' },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY', { enforceInvariants: true })).rejects.toThrow(errors_1.ConflictError);
            // From DATABASE_VALIDATION -> READY
            await prisma_1.systemPrisma.installation.update({
                where: { id: installId },
                data: { lifecycleState: 'DATABASE_VALIDATION' },
            });
            await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY', { enforceInvariants: true })).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('executes complete authoritative path: USER_DISCOVERY -> DATABASE_DISCOVERY -> DATABASE_VALIDATION -> DATABASE_SETUP -> READY', async () => {
            // 1. Associate User
            const uname = `p5_full_${Date.now()}`;
            const user = await auth_service_1.authService.createUser(uname, 'SecretPass12345!', 'Full Path User', 'ADMIN', []);
            await onboarding_service_1.onboardingService.selectExistingUser(user.id);
            const s1 = await onboarding_service_1.onboardingService.getOnboardingState();
            (0, vitest_1.expect)(s1.lifecycleState).toBe('DATABASE_DISCOVERY');
            // 2. Discover & Attach DB
            const testDb = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `full_path_${Date.now()}.db`);
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            fs_1.default.copyFileSync(templatePath, testDb);
            createdTestFiles.push(testDb);
            await onboarding_service_1.onboardingService.attachExistingDatabase({
                path: testDb,
                displayName: 'Full Path DB',
                confirmAttachment: true,
            });
            const s2 = await onboarding_service_1.onboardingService.getOnboardingState();
            (0, vitest_1.expect)(s2.lifecycleState).toBe('DATABASE_SETUP');
            // 3. Complete Onboarding
            const finalStatus = await onboarding_service_1.onboardingService.completeOnboarding();
            (0, vitest_1.expect)(finalStatus.lifecycleState).toBe('READY');
            (0, vitest_1.expect)(finalStatus.ready).toBe(true);
            // 4. Verify ONBOARDING_COMPLETED audit event
            const completeAudit = await prisma_1.systemPrisma.auditEvent.findFirst({
                where: {
                    entityType: 'Installation',
                    entityId: installId,
                    eventType: 'ONBOARDING_COMPLETED',
                },
            });
            (0, vitest_1.expect)(completeAudit).toBeDefined();
        });
    });
});
//# sourceMappingURL=phase5-user-database-discovery.test.js.map