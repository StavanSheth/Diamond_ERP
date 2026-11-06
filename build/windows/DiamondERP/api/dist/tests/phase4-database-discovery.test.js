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
const installation_service_1 = require("../modules/system/installation.service");
const onboarding_service_1 = require("../modules/system/onboarding/onboarding.service");
const database_path_util_1 = require("../modules/system/database/database-path.util");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Diamond ERP V3 — Phase 4: Database Discovery, Path Security & Ownership Hardening', () => {
    let installId;
    const createdTestFiles = [];
    (0, vitest_1.beforeEach)(async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        installId = install.id;
        await prisma_1.systemPrisma.installation.update({
            where: { id: installId },
            data: { lifecycleState: 'DATABASE_DISCOVERY', status: 'ACTIVE' },
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
    // ── 1. Robust Windows Path Security ──────────────────────────────────────
    (0, vitest_1.describe)('1. Robust Windows Path Validation & Security', () => {
        (0, vitest_1.it)('rejects empty or whitespace paths', () => {
            const empty = (0, database_path_util_1.canonicalizeDatabasePath)('');
            (0, vitest_1.expect)(empty.valid).toBe(false);
            (0, vitest_1.expect)(empty.error).toContain('cannot be empty');
            const spaces = (0, database_path_util_1.canonicalizeDatabasePath)('   ');
            (0, vitest_1.expect)(spaces.valid).toBe(false);
            (0, vitest_1.expect)(spaces.error).toContain('cannot be empty');
        });
        (0, vitest_1.it)('rejects null byte injection in paths', () => {
            const res = (0, database_path_util_1.canonicalizeDatabasePath)('valid.db\0malicious.exe');
            (0, vitest_1.expect)(res.valid).toBe(false);
            (0, vitest_1.expect)(res.error).toContain('null bytes');
        });
        (0, vitest_1.it)('rejects UNC network share paths explicitly', () => {
            const unc1 = (0, database_path_util_1.canonicalizeDatabasePath)('\\\\server\\share\\company.db');
            (0, vitest_1.expect)(unc1.valid).toBe(false);
            (0, vitest_1.expect)(unc1.error).toContain('UNC and network share paths are not supported');
            const unc2 = (0, database_path_util_1.canonicalizeDatabasePath)('//server/share/company.db');
            (0, vitest_1.expect)(unc2.valid).toBe(false);
            (0, vitest_1.expect)(unc2.error).toContain('UNC and network share paths are not supported');
        });
        (0, vitest_1.it)('rejects invalid Windows filesystem characters', () => {
            const res1 = (0, database_path_util_1.canonicalizeDatabasePath)('C:\\databases\\<company>.db');
            (0, vitest_1.expect)(res1.valid).toBe(false);
            (0, vitest_1.expect)(res1.error).toContain('invalid filesystem characters');
            const res2 = (0, database_path_util_1.canonicalizeDatabasePath)('test|database.db');
            (0, vitest_1.expect)(res2.valid).toBe(false);
            (0, vitest_1.expect)(res2.error).toContain('invalid filesystem characters');
            const res3 = (0, database_path_util_1.canonicalizeDatabasePath)('data"base.db');
            (0, vitest_1.expect)(res3.valid).toBe(false);
            (0, vitest_1.expect)(res3.error).toContain('invalid filesystem characters');
        });
        (0, vitest_1.it)('rejects reserved Windows DOS device names', () => {
            const conRes = (0, database_path_util_1.canonicalizeDatabasePath)('CON.db');
            (0, vitest_1.expect)(conRes.valid).toBe(false);
            (0, vitest_1.expect)(conRes.error).toContain('reserved Windows device name (CON)');
            const nulRes = (0, database_path_util_1.canonicalizeDatabasePath)('C:\\test\\NUL.sqlite');
            (0, vitest_1.expect)(nulRes.valid).toBe(false);
            (0, vitest_1.expect)(nulRes.error).toContain('reserved Windows device name (NUL)');
            const comRes = (0, database_path_util_1.canonicalizeDatabasePath)('COM1.db');
            (0, vitest_1.expect)(comRes.valid).toBe(false);
            (0, vitest_1.expect)(comRes.error).toContain('reserved Windows device name (COM1)');
        });
        (0, vitest_1.it)('rejects directory paths when path points to an existing directory', () => {
            const dbDir = (0, paths_1.getDatabasesDir)();
            const res = (0, database_path_util_1.canonicalizeDatabasePath)(dbDir);
            (0, vitest_1.expect)(res.valid).toBe(false);
            (0, vitest_1.expect)(res.error).toContain('points to a directory');
        });
        (0, vitest_1.it)('resolves valid relative and absolute paths cleanly', () => {
            const res = (0, database_path_util_1.canonicalizeDatabasePath)('test_valid.db');
            (0, vitest_1.expect)(res.valid).toBe(true);
            (0, vitest_1.expect)(path_1.default.isAbsolute(res.canonicalPath)).toBe(true);
        });
    });
    // ── 2. Boundary Invariants: Control DB & Template DB ────────────────────
    (0, vitest_1.describe)('2. Control DB & Template DB Attachment Boundaries', () => {
        (0, vitest_1.it)('rejects system.db from candidate inspection and attachment', async () => {
            const controlDbPath = (0, paths_1.getControlDbPath)();
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(controlDbPath);
            (0, vitest_1.expect)(preview.suitability).toBe('CONFLICT');
            (0, vitest_1.expect)(preview.conflictReason).toBe('DATABASE_IS_CONTROL_DB');
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.attachExistingDatabase({
                path: controlDbPath,
                confirmAttachment: true,
            })).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('rejects template.db from candidate inspection and attachment', async () => {
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            if (!templatePath)
                return;
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(templatePath);
            (0, vitest_1.expect)(preview.suitability).toBe('CONFLICT');
            (0, vitest_1.expect)(preview.conflictReason).toBe('DATABASE_IS_TEMPLATE');
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.attachExistingDatabase({
                path: templatePath,
                confirmAttachment: true,
            })).rejects.toThrow(errors_1.ConflictError);
        });
    });
    // ── 3. Cross-Installation Ownership Conflict ─────────────────────────────
    (0, vitest_1.describe)('3. Cross-Installation Ownership Conflict Protection', () => {
        (0, vitest_1.it)('strictly forbids attaching a database registered under another installation', async () => {
            // Create foreign installation
            const foreignInstall = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: `foreign-inst-${Date.now()}`,
                    appVersion: '3.0.0',
                    status: 'ACTIVE',
                },
            });
            // Create a test DB file
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            const testDbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `foreign_owned_${Date.now()}.db`);
            fs_1.default.copyFileSync(templatePath, testDbPath);
            createdTestFiles.push(testDbPath);
            // Register test DB under foreign installation
            await prisma_1.systemPrisma.databaseRegistry.create({
                data: {
                    databaseId: crypto_1.default.randomUUID(),
                    displayName: 'Foreign Office DB',
                    canonicalPath: testDbPath,
                    schemaVersion: 1,
                    status: 'ACTIVE',
                    databaseType: 'EXTERNAL',
                    installationId: foreignInstall.id,
                },
            });
            // Current installation inspects it
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(testDbPath);
            (0, vitest_1.expect)(preview.suitability).toBe('CONFLICT');
            (0, vitest_1.expect)(preview.conflictReason).toBe('DATABASE_INSTALLATION_CONFLICT');
            // Attempt attachment -> throws ConflictError and does not claim ownership
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.attachExistingDatabase({
                path: testDbPath,
                confirmAttachment: true,
            })).rejects.toThrow(errors_1.ConflictError);
            // Verify registry record still belongs to foreign installation
            const regAfter = await prisma_1.systemPrisma.databaseRegistry.findUnique({
                where: { canonicalPath: testDbPath },
            });
            (0, vitest_1.expect)(regAfter?.installationId).toBe(foreignInstall.id);
        });
    });
    // ── 4. Re-attachment Idempotency ─────────────────────────────────────────
    (0, vitest_1.describe)('4. Re-attachment Idempotency', () => {
        (0, vitest_1.it)('is strictly idempotent when attaching the same database twice to the current installation', async () => {
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            const testDbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `idem_db_${Date.now()}.db`);
            fs_1.default.copyFileSync(templatePath, testDbPath);
            createdTestFiles.push(testDbPath);
            // 1. First attachment
            const first = await onboarding_service_1.onboardingService.attachExistingDatabase({
                path: testDbPath,
                displayName: 'First Attach Name',
                confirmAttachment: true,
            });
            (0, vitest_1.expect)(first.success).toBe(true);
            const count1 = await prisma_1.systemPrisma.databaseRegistry.count({
                where: { canonicalPath: testDbPath },
            });
            (0, vitest_1.expect)(count1).toBe(1);
            // 2. Second attachment of the same database
            const second = await onboarding_service_1.onboardingService.attachExistingDatabase({
                path: testDbPath,
                displayName: 'Second Attach Name',
                confirmAttachment: true,
            });
            (0, vitest_1.expect)(second.success).toBe(true);
            (0, vitest_1.expect)(second.registry.id).toBe(first.registry.id);
            const count2 = await prisma_1.systemPrisma.databaseRegistry.count({
                where: { canonicalPath: testDbPath },
            });
            (0, vitest_1.expect)(count2).toBe(1); // Zero duplicate rows!
        });
    });
    // ── 5. Explicit Confirmation Requirement ─────────────────────────────────
    (0, vitest_1.describe)('5. Mandatory Explicit Confirmation', () => {
        (0, vitest_1.it)('rejects attachment when confirmAttachment is false', async () => {
            const templatePath = (0, paths_1.getDatabaseTemplatePath)();
            const testDbPath = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `unconfirmed_${Date.now()}.db`);
            fs_1.default.copyFileSync(templatePath, testDbPath);
            createdTestFiles.push(testDbPath);
            await (0, vitest_1.expect)(onboarding_service_1.onboardingService.attachExistingDatabase({
                path: testDbPath,
                confirmAttachment: false, // Not confirmed
            })).rejects.toThrow(errors_1.ValidationError);
        });
    });
    // ── 6. Deterministic Suitability Classification ──────────────────────────
    (0, vitest_1.describe)('6. Deterministic Suitability Classification', () => {
        (0, vitest_1.it)('classifies corrupted SQLite file as CORRUPTED', async () => {
            const corruptFile = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `corrupt_${Date.now()}.db`);
            // Write valid 16-byte SQLite header followed by garbage
            const buf = Buffer.alloc(1024);
            Buffer.from('SQLite format 3\0').copy(buf, 0);
            fs_1.default.writeFileSync(corruptFile, buf);
            createdTestFiles.push(corruptFile);
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(corruptFile);
            (0, vitest_1.expect)(preview.suitability).toBe('CORRUPTED');
        });
        (0, vitest_1.it)('classifies plain text file as INVALID', async () => {
            const textFile = path_1.default.resolve((0, paths_1.getDatabasesDir)(), `not_sqlite_${Date.now()}.db`);
            fs_1.default.writeFileSync(textFile, 'This is just a plain text file, not SQLite.');
            createdTestFiles.push(textFile);
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate(textFile);
            (0, vitest_1.expect)(preview.suitability).toBe('INVALID');
        });
        (0, vitest_1.it)('classifies non-existent file as INVALID with missing status', async () => {
            const preview = await onboarding_service_1.onboardingService.inspectDatabaseCandidate('C:\\does_not_exist_123.db');
            (0, vitest_1.expect)(preview.suitability).toBe('INVALID');
        });
    });
});
//# sourceMappingURL=phase4-database-discovery.test.js.map