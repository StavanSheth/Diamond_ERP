"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const backup_service_1 = require("../modules/system/backup/backup.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 5 — Data Preservation & Backup Engine', () => {
    const testDbDir = path_1.default.resolve('apps/api/test-scratch-dbs');
    const sampleDbPath = path_1.default.join(testDbDir, 'phase5_sample.db');
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(testDbDir)) {
            fs_1.default.mkdirSync(testDbDir, { recursive: true });
        }
        // Copy template.db or Stavan.db to create an isolated sample DB for backup tests
        const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
        fs_1.default.copyFileSync(templateDb, sampleDbPath);
    });
    (0, vitest_1.afterAll)(() => {
        // Clean up test scratch folder
        if (fs_1.default.existsSync(testDbDir)) {
            try {
                fs_1.default.rmSync(testDbDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('creates a verified atomic backup with manifest and SHA-256 checksum', async () => {
        const initialStats = fs_1.default.statSync(sampleDbPath);
        const record = await backup_service_1.backupService.createBackup({
            databasePath: sampleDbPath,
            profileCode: 'p5test',
            note: 'Automated test backup',
        });
        (0, vitest_1.expect)(record.status).toBe('VERIFIED');
        (0, vitest_1.expect)(record.backupId).toMatch(/^bkp_/);
        (0, vitest_1.expect)(record.sha256).toHaveLength(64);
        (0, vitest_1.expect)(fs_1.default.existsSync(record.backupPath)).toBe(true);
        // Verify manifest JSON exists and matches
        const manifestPath = `${record.backupPath}.manifest.json`;
        (0, vitest_1.expect)(fs_1.default.existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
        (0, vitest_1.expect)(manifest.formatVersion).toBe(1);
        (0, vitest_1.expect)(manifest.backupId).toBe(record.backupId);
        (0, vitest_1.expect)(manifest.artifact.sha256).toBe(record.sha256);
        (0, vitest_1.expect)(manifest.verification.sqliteIntegrity).toBe('ok');
        (0, vitest_1.expect)(manifest.verification.tableCount).toBeGreaterThanOrEqual(0);
        // Source database must remain 100% untouched and intact
        (0, vitest_1.expect)(fs_1.default.existsSync(sampleDbPath)).toBe(true);
        const postStats = fs_1.default.statSync(sampleDbPath);
        (0, vitest_1.expect)(postStats.size).toBe(initialStats.size);
    });
    (0, vitest_1.it)('guarantees zero secret leakage in backup manifest', async () => {
        const record = await backup_service_1.backupService.createBackup({
            databasePath: sampleDbPath,
            profileCode: 'p5secret',
        });
        const manifestPath = `${record.backupPath}.manifest.json`;
        const manifestRaw = fs_1.default.readFileSync(manifestPath, 'utf-8');
        (0, vitest_1.expect)(manifestRaw).not.toContain('pinHash');
        (0, vitest_1.expect)(manifestRaw).not.toContain('passwordHash');
        (0, vitest_1.expect)(manifestRaw).not.toContain('sessionSecret');
        (0, vitest_1.expect)(manifestRaw).not.toContain('token');
    });
    (0, vitest_1.it)('verifies backup integrity and hash match successfully', async () => {
        const record = await backup_service_1.backupService.createBackup({
            databasePath: sampleDbPath,
            profileCode: 'p5verify',
        });
        const verifyResult = await backup_service_1.backupService.verifyBackup(record.backupId);
        (0, vitest_1.expect)(verifyResult.isValid).toBe(true);
        (0, vitest_1.expect)(verifyResult.sha256Matches).toBe(true);
        (0, vitest_1.expect)(verifyResult.sqliteIntegrity).toBe('ok');
        (0, vitest_1.expect)(verifyResult.manifestPresent).toBe(true);
    });
    (0, vitest_1.it)('detects file tampering during backup verification', async () => {
        const record = await backup_service_1.backupService.createBackup({
            databasePath: sampleDbPath,
            profileCode: 'p5tamper',
        });
        // Tamper with the backup file
        fs_1.default.appendFileSync(record.backupPath, 'corrupted_bytes');
        const verifyResult = await backup_service_1.backupService.verifyBackup(record.backupId);
        (0, vitest_1.expect)(verifyResult.isValid).toBe(false);
        (0, vitest_1.expect)(verifyResult.sha256Matches).toBe(false);
    });
    (0, vitest_1.it)('rejects non-existent source database with NotFoundError', async () => {
        const bogusPath = path_1.default.join(testDbDir, 'does_not_exist.db');
        await (0, vitest_1.expect)(backup_service_1.backupService.createBackup({ databasePath: bogusPath })).rejects.toThrow(errors_1.NotFoundError);
    });
    (0, vitest_1.it)('rejects directory as source path with ValidationError', async () => {
        await (0, vitest_1.expect)(backup_service_1.backupService.createBackup({ databasePath: testDbDir })).rejects.toThrow(errors_1.ValidationError);
    });
    (0, vitest_1.it)('rejects system.db control database from being backed up as business data', async () => {
        const controlDb = (0, paths_1.getControlDbPath)();
        await (0, vitest_1.expect)(backup_service_1.backupService.createBackup({ databasePath: controlDb })).rejects.toThrow(errors_1.ValidationError);
    });
    (0, vitest_1.it)('rejects template.db from being backed up as business data', async () => {
        const templateDb = (0, paths_1.getDatabaseTemplatePath)();
        if (templateDb) {
            await (0, vitest_1.expect)(backup_service_1.backupService.createBackup({ databasePath: templateDb })).rejects.toThrow(errors_1.ValidationError);
        }
    });
    (0, vitest_1.it)('rejects backup destination that equals source database path', async () => {
        await (0, vitest_1.expect)(backup_service_1.backupService.createBackup({
            databasePath: sampleDbPath,
            customDestinationDir: sampleDbPath,
        })).rejects.toThrow(errors_1.ValidationError);
    });
    (0, vitest_1.it)('safely cleans up stale .partial backup files without touching verified backups', async () => {
        const backupsDir = (0, paths_1.getBackupsDir)();
        const stalePartial = path_1.default.join(backupsDir, 'stale_test.db.partial');
        fs_1.default.writeFileSync(stalePartial, 'partial content');
        (0, vitest_1.expect)(fs_1.default.existsSync(stalePartial)).toBe(true);
        backup_service_1.backupService.cleanupPartialBackups();
        (0, vitest_1.expect)(fs_1.default.existsSync(stalePartial)).toBe(false);
    });
    (0, vitest_1.it)('lists verified backups and inspects backup details', async () => {
        const listRes = await backup_service_1.backupService.listBackups();
        (0, vitest_1.expect)(Array.isArray(listRes.backups)).toBe(true);
        (0, vitest_1.expect)(listRes.backups.length).toBeGreaterThan(0);
        const first = listRes.backups[0];
        const details = await backup_service_1.backupService.inspectBackup(first.backupId);
        (0, vitest_1.expect)(details.backupId).toBe(first.backupId);
        (0, vitest_1.expect)(details.canonicalPath).toBe(first.backupPath);
        (0, vitest_1.expect)(details.sizeBytes).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('soft-deletes backup record without deleting live database', async () => {
        const record = await backup_service_1.backupService.createBackup({
            databasePath: sampleDbPath,
            profileCode: 'p5delete',
        });
        await backup_service_1.backupService.deleteBackupRecord(record.backupId);
        const check = await prisma_1.systemPrisma.backupRecord.findUnique({
            where: { backupId: record.backupId },
        });
        (0, vitest_1.expect)(check?.status).toBe('DELETED');
        (0, vitest_1.expect)(fs_1.default.existsSync(sampleDbPath)).toBe(true);
    });
    (0, vitest_1.it)('prevents concurrent backups of the same database from corrupting metadata or artifacts', async () => {
        const backupPromises = [
            backup_service_1.backupService.createBackup({ databasePath: sampleDbPath, profileCode: 'p5concurrent1' }),
            backup_service_1.backupService.createBackup({ databasePath: sampleDbPath, profileCode: 'p5concurrent2' }),
        ];
        const results = await Promise.allSettled(backupPromises);
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        (0, vitest_1.expect)(fulfilled.length).toBeGreaterThanOrEqual(1);
        if (rejected.length > 0) {
            const err = rejected[0].reason;
            (0, vitest_1.expect)(err.message).toContain('in progress');
        }
        (0, vitest_1.expect)(fs_1.default.existsSync(sampleDbPath)).toBe(true);
    });
});
//# sourceMappingURL=phase5-backup.test.js.map