"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const recovery_service_1 = require("../modules/system/recovery/recovery.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 5 — Restore Atomicity, Rollback Protection & Crash Reconciliation', () => {
    const testDir = path_1.default.resolve('apps/api/test-scratch-atomicity');
    const validCandidatePath = path_1.default.join(testDir, 'valid_candidate.db');
    const corruptCandidatePath = path_1.default.join(testDir, 'corrupt_candidate.db');
    const activeDbPath = path_1.default.join((0, paths_1.getDatabasesDir)(), 'atomicity_target.db');
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(testDir)) {
            fs_1.default.mkdirSync(testDir, { recursive: true });
        }
        const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
        fs_1.default.copyFileSync(templateDb, validCandidatePath);
        fs_1.default.copyFileSync(templateDb, activeDbPath);
        // Create corrupt candidate (non-SQLite content)
        fs_1.default.writeFileSync(corruptCandidatePath, 'CORRUPT_INVALID_SQLITE_PAYLOAD');
    });
    (0, vitest_1.afterAll)(async () => {
        if (fs_1.default.existsSync(testDir)) {
            try {
                fs_1.default.rmSync(testDir, { recursive: true, force: true });
            }
            catch { }
        }
        if (fs_1.default.existsSync(activeDbPath)) {
            try {
                fs_1.default.unlinkSync(activeDbPath);
            }
            catch { }
        }
        try {
            await prisma_1.systemPrisma.databaseRegistry.deleteMany({
                where: { databaseId: 'db_atomicity_target' },
            });
        }
        catch { }
    });
    (0, vitest_1.it)('rejects corrupt candidate during prepareRestore', async () => {
        await (0, vitest_1.expect)(recovery_service_1.recoveryService.prepareRestore({
            candidatePath: corruptCandidatePath,
            targetProfileCode: 'atomicity_target',
        })).rejects.toThrow();
    });
    (0, vitest_1.it)('prevents restoring candidate with newer unsupported schema version', async () => {
        // Create candidate with schemaVersion = 99 in manifest
        const manifestCandidatePath = path_1.default.join(testDir, 'future_candidate.db');
        const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
        fs_1.default.copyFileSync(templateDb, manifestCandidatePath);
        const manifestPath = `${manifestCandidatePath}.manifest.json`;
        fs_1.default.writeFileSync(manifestPath, JSON.stringify({
            formatVersion: 1,
            backupId: 'bkp_future',
            database: { schemaVersion: 99 },
            artifact: { sha256: 'dummy' },
            verification: { sqliteIntegrity: 'ok' },
        }));
        const inspection = await recovery_service_1.recoveryService.inspectCandidate(manifestCandidatePath);
        (0, vitest_1.expect)(inspection.suitability).toBe('UNSUPPORTED');
        (0, vitest_1.expect)(inspection.conflictReason).toBe('UNSUPPORTED_SCHEMA_VERSION_NEWER');
        await (0, vitest_1.expect)(recovery_service_1.recoveryService.prepareRestore({
            candidatePath: manifestCandidatePath,
            targetProfileCode: 'atomicity_target',
        })).rejects.toThrow(errors_1.ValidationError);
    });
    (0, vitest_1.it)('atomically swaps and verifies restore, cleaning up swap file', async () => {
        const preview = await recovery_service_1.recoveryService.prepareRestore({
            candidatePath: validCandidatePath,
            targetProfileCode: 'atomicity_target',
        });
        const result = await recovery_service_1.recoveryService.confirmRestore({
            restoreId: preview.restoreId,
            confirmDestructiveOverwrite: true,
            targetProfileCode: 'atomicity_target',
        }, 'admin');
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.status).toBe('VERIFIED');
        (0, vitest_1.expect)(result.rollbackBackupCreated).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(activeDbPath)).toBe(true);
        // Swap old files should be cleaned up
        const databasesDir = (0, paths_1.getDatabasesDir)();
        const swapFiles = fs_1.default
            .readdirSync(databasesDir)
            .filter((f) => f.includes('atomicity_target.db.swap_old_'));
        (0, vitest_1.expect)(swapFiles.length).toBe(0);
    });
    (0, vitest_1.it)('reconciles interrupted swap files on startup without data loss', async () => {
        const databasesDir = (0, paths_1.getDatabasesDir)();
        const testSwapFile = path_1.default.join(databasesDir, `reconcile_test.db.swap_old_${Date.now()}`);
        const activeTestDb = path_1.default.join(databasesDir, 'reconcile_test.db');
        // Simulate situation where activeTestDb was removed mid-activation and only swap exists
        fs_1.default.writeFileSync(testSwapFile, 'SIMULATED_SWAP_DATABASE_PAYLOAD');
        if (fs_1.default.existsSync(activeTestDb))
            fs_1.default.unlinkSync(activeTestDb);
        const reconciliation = await recovery_service_1.recoveryService.reconcileInterruptedRestores();
        (0, vitest_1.expect)(reconciliation.reconciledCount).toBeGreaterThanOrEqual(1);
        // Active DB must have been recovered from swap!
        (0, vitest_1.expect)(fs_1.default.existsSync(activeTestDb)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(testSwapFile)).toBe(false);
        // Clean up
        fs_1.default.unlinkSync(activeTestDb);
    });
    (0, vitest_1.it)('reconciles interrupted RestoreRecord rows on startup', async () => {
        const install = await prisma_1.systemPrisma.installation.findFirst({ where: { status: 'ACTIVE' } });
        const interruptedRestoreId = `rst_interrupted_${Date.now()}`;
        // Create an interrupted restore record in ACTIVATING state
        await prisma_1.systemPrisma.restoreRecord.create({
            data: {
                restoreId: interruptedRestoreId,
                installationId: install.id,
                targetDatabaseId: 'db_atomicity_target',
                candidatePath: validCandidatePath,
                status: 'ACTIVATING',
                schemaVersion: 1,
            },
        });
        const reconciliation = await recovery_service_1.recoveryService.reconcileInterruptedRestores();
        (0, vitest_1.expect)(reconciliation.reconciledCount).toBeGreaterThanOrEqual(1);
        const updated = await prisma_1.systemPrisma.restoreRecord.findUnique({
            where: { restoreId: interruptedRestoreId },
        });
        (0, vitest_1.expect)(['FAILED', 'ROLLED_BACK']).toContain(updated?.status);
    });
});
//# sourceMappingURL=phase5-restore-atomicity.test.js.map