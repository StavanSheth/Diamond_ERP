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
(0, vitest_1.describe)('Phase 5 — Recovery & Staged Restore Engine', () => {
    const testDir = path_1.default.resolve('apps/api/test-scratch-recovery');
    const candidateDbPath = path_1.default.join(testDir, 'recovery_candidate.db');
    const targetDbPath = path_1.default.join((0, paths_1.getDatabasesDir)(), 'test_target_restore.db');
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(testDir)) {
            fs_1.default.mkdirSync(testDir, { recursive: true });
        }
        const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
        fs_1.default.copyFileSync(templateDb, candidateDbPath);
        fs_1.default.copyFileSync(templateDb, targetDbPath);
    });
    (0, vitest_1.afterAll)(async () => {
        if (fs_1.default.existsSync(testDir)) {
            try {
                fs_1.default.rmSync(testDir, { recursive: true, force: true });
            }
            catch { }
        }
        if (fs_1.default.existsSync(targetDbPath)) {
            try {
                fs_1.default.unlinkSync(targetDbPath);
            }
            catch { }
        }
        try {
            await prisma_1.systemPrisma.databaseRegistry.deleteMany({
                where: { databaseId: 'db_test_target_restore' },
            });
        }
        catch { }
    });
    (0, vitest_1.it)('discovers candidates bounded to backups and databases without scanning arbitrary drives', async () => {
        const res = await recovery_service_1.recoveryService.discoverCandidates(testDir);
        (0, vitest_1.expect)(res.candidates.length).toBeGreaterThan(0);
        // Invariant: Never contains system.db or template.db or .partial files
        const controlDb = (0, paths_1.getControlDbPath)().toLowerCase();
        const templateDb = (0, paths_1.getDatabaseTemplatePath)()?.toLowerCase() || '';
        for (const c of res.candidates) {
            (0, vitest_1.expect)(c.canonicalPath.toLowerCase()).not.toBe(controlDb);
            (0, vitest_1.expect)(c.canonicalPath.toLowerCase()).not.toBe(templateDb);
            (0, vitest_1.expect)(c.canonicalPath).not.toContain('.partial');
        }
    }, 15000);
    (0, vitest_1.it)('inspects recovery candidate and calculates suitability', async () => {
        const inspection = await recovery_service_1.recoveryService.inspectCandidate(candidateDbPath);
        (0, vitest_1.expect)(inspection.canonicalPath).toBe(path_1.default.resolve(candidateDbPath));
        (0, vitest_1.expect)(inspection.status).toBe('ACTIVE');
        (0, vitest_1.expect)(inspection.ownershipStatus).toBe('EXTERNAL_SOURCE');
        (0, vitest_1.expect)(inspection.suitability).toBe('REQUIRES_CONFIRMATION');
        (0, vitest_1.expect)(inspection.sqliteIntegrity).toBe('ok');
        (0, vitest_1.expect)(inspection.tableCount).toBeGreaterThanOrEqual(0);
    });
    (0, vitest_1.it)('rejects system.db and template.db from inspection', async () => {
        const controlDb = (0, paths_1.getControlDbPath)();
        await (0, vitest_1.expect)(recovery_service_1.recoveryService.inspectCandidate(controlDb)).rejects.toThrow(errors_1.ValidationError);
        const templateDb = (0, paths_1.getDatabaseTemplatePath)();
        if (templateDb) {
            await (0, vitest_1.expect)(recovery_service_1.recoveryService.inspectCandidate(templateDb)).rejects.toThrow(errors_1.ValidationError);
        }
    });
    (0, vitest_1.it)('prepares staged restore without modifying the original backup artifact', async () => {
        const originalStats = fs_1.default.statSync(candidateDbPath);
        const preview = await recovery_service_1.recoveryService.prepareRestore({
            candidatePath: candidateDbPath,
            targetProfileCode: 'test_target_restore',
        });
        (0, vitest_1.expect)(preview.restoreId).toMatch(/^rst_/);
        (0, vitest_1.expect)(preview.status).toBe('VALIDATED');
        (0, vitest_1.expect)(preview.requiresRollbackBackup).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(preview.stagedPath)).toBe(true);
        // Original backup must remain 100% immutable and untouched
        (0, vitest_1.expect)(fs_1.default.existsSync(candidateDbPath)).toBe(true);
        const postStats = fs_1.default.statSync(candidateDbPath);
        (0, vitest_1.expect)(postStats.size).toBe(originalStats.size);
    });
    (0, vitest_1.it)('requires explicit confirmation checkbox before executing restore', async () => {
        const preview = await recovery_service_1.recoveryService.prepareRestore({
            candidatePath: candidateDbPath,
            targetProfileCode: 'test_target_restore',
        });
        await (0, vitest_1.expect)(recovery_service_1.recoveryService.confirmRestore({
            restoreId: preview.restoreId,
            confirmDestructiveOverwrite: false,
            targetProfileCode: 'test_target_restore',
        })).rejects.toThrow(errors_1.ValidationError);
    });
    (0, vitest_1.it)('executes staged restore with mandatory verified rollback backup creation', async () => {
        const preview = await recovery_service_1.recoveryService.prepareRestore({
            candidatePath: candidateDbPath,
            targetProfileCode: 'test_target_restore',
        });
        const result = await recovery_service_1.recoveryService.confirmRestore({
            restoreId: preview.restoreId,
            confirmDestructiveOverwrite: true,
            targetProfileCode: 'test_target_restore',
        }, 'admin_tester');
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.status).toBe('VERIFIED');
        (0, vitest_1.expect)(result.rollbackBackupCreated).toBe(true);
        (0, vitest_1.expect)(result.rollbackBackupPath).toBeDefined();
        (0, vitest_1.expect)(fs_1.default.existsSync(result.rollbackBackupPath)).toBe(true);
        // Verify rollback backup record exists in DB
        const rollbackRecord = await prisma_1.systemPrisma.backupRecord.findFirst({
            where: { backupPath: result.rollbackBackupPath },
        });
        (0, vitest_1.expect)(rollbackRecord?.status).toBe('VERIFIED');
        (0, vitest_1.expect)(rollbackRecord?.backupType).toBe('PRE_RESTORE');
        // Staged folder must be cleaned up
        (0, vitest_1.expect)(fs_1.default.existsSync(preview.stagedPath)).toBe(false);
    });
    (0, vitest_1.it)('rejects candidate database when source equals target database path', async () => {
        await (0, vitest_1.expect)(recovery_service_1.recoveryService.prepareRestore({
            candidatePath: targetDbPath,
            targetProfileCode: 'test_target_restore',
        })).rejects.toThrow(errors_1.ValidationError);
    });
});
//# sourceMappingURL=phase5-recovery.test.js.map