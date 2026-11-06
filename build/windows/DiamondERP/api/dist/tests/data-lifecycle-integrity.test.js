"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const data_paths_1 = require("../infrastructure/data/data-paths");
const data_location_service_1 = require("../infrastructure/data/data-location.service");
const semantic_verification_service_1 = require("../modules/system/export/semantic-verification.service");
(0, vitest_1.describe)('Data Lifecycle & Location Integrity', () => {
    const testRoot = path_1.default.resolve(__dirname, '../../test-lifecycle-sandbox');
    (0, vitest_1.beforeEach)(() => {
        if (fs_1.default.existsSync(testRoot)) {
            fs_1.default.rmSync(testRoot, { recursive: true, force: true });
        }
        fs_1.default.mkdirSync(testRoot, { recursive: true });
        (0, data_paths_1.setCustomDataRoot)(testRoot);
    });
    (0, vitest_1.afterEach)(() => {
        (0, data_paths_1.setCustomDataRoot)(null);
        if (fs_1.default.existsSync(testRoot)) {
            fs_1.default.rmSync(testRoot, { recursive: true, force: true });
        }
    });
    (0, vitest_1.describe)('Centralized Data Paths Authority (Sections 4, 5, 6)', () => {
        (0, vitest_1.it)('resolves all customer data directories relative to authoritative root', () => {
            (0, vitest_1.expect)((0, data_paths_1.getDataRoot)()).toBe(testRoot);
            (0, vitest_1.expect)((0, data_paths_1.getDatabaseRoot)()).toBe(path_1.default.join(testRoot, 'databases'));
            (0, vitest_1.expect)((0, data_paths_1.getBackupRoot)()).toBe(path_1.default.join(testRoot, 'backups'));
            (0, vitest_1.expect)((0, data_paths_1.getExportRoot)()).toBe(path_1.default.join(testRoot, 'exports'));
            (0, vitest_1.expect)((0, data_paths_1.getUploadRoot)()).toBe(path_1.default.join(testRoot, 'uploads', 'certs'));
            (0, vitest_1.expect)((0, data_paths_1.getLogRoot)()).toBe(path_1.default.join(testRoot, 'logs'));
            (0, vitest_1.expect)((0, data_paths_1.getRecoveryRoot)()).toBe(path_1.default.join(testRoot, 'recovery'));
            (0, vitest_1.expect)((0, data_paths_1.getSystemDatabasePath)()).toBe(path_1.default.join(testRoot, 'system.db'));
        });
    });
    (0, vitest_1.describe)('Disk Space Safety Checks (Section 25)', () => {
        (0, vitest_1.it)('assesses local disk space and produces valid threshold status', () => {
            const space = data_location_service_1.dataLocationService.checkDiskSpace(testRoot);
            (0, vitest_1.expect)(space.totalBytes).toBeGreaterThan(0);
            (0, vitest_1.expect)(space.freeBytes).toBeGreaterThan(0);
            (0, vitest_1.expect)(space.freeGb).toBeGreaterThan(0);
            (0, vitest_1.expect)(['HEALTHY', 'LOW', 'CRITICAL', 'INSUFFICIENT']).toContain(space.status);
        });
        (0, vitest_1.it)('asserts disk space available when free space exceeds requirement', () => {
            (0, vitest_1.expect)(() => {
                data_location_service_1.dataLocationService.assertDiskSpaceAvailable(1024 * 1024, testRoot);
            }).not.toThrow();
        });
        (0, vitest_1.it)('rejects operation when required space exceeds available capacity', () => {
            (0, vitest_1.expect)(() => {
                data_location_service_1.dataLocationService.assertDiskSpaceAvailable(Number.MAX_SAFE_INTEGER, testRoot);
            }).toThrow(/Insufficient disk space/);
        });
    });
    (0, vitest_1.describe)('Safe Data Location Migration Workflow (Sections 7 & 8)', () => {
        (0, vitest_1.it)('rejects invalid or non-absolute target migration paths', async () => {
            await (0, vitest_1.expect)(data_location_service_1.dataLocationService.migrateDataLocation('')).rejects.toThrow(/non-empty string/);
            await (0, vitest_1.expect)(data_location_service_1.dataLocationService.migrateDataLocation('relative/path')).rejects.toThrow(/absolute path/);
        });
        (0, vitest_1.it)('rejects destination path collision with source directory', async () => {
            // Identical path
            await (0, vitest_1.expect)(data_location_service_1.dataLocationService.migrateDataLocation(testRoot)).rejects.toThrow(/cannot be identical/);
            // Subdirectory of source
            const nestedSubdir = path_1.default.join(testRoot, 'nested-target');
            await (0, vitest_1.expect)(data_location_service_1.dataLocationService.migrateDataLocation(nestedSubdir)).rejects.toThrow(/cannot be a subdirectory/);
        });
    });
    (0, vitest_1.describe)('Export Semantic Equivalence (Section 31 & 54)', () => {
        (0, vitest_1.it)('verifies CSV and XLSX snapshots match across identical records', async () => {
            const csvDirA = path_1.default.join(testRoot, 'exportA_csv');
            const csvDirB = path_1.default.join(testRoot, 'exportB_csv');
            fs_1.default.mkdirSync(csvDirA, { recursive: true });
            fs_1.default.mkdirSync(csvDirB, { recursive: true });
            const sampleStockCsv = 'id,stockCode,carat,costPrice\nitem1,STK001,2.50,50000\n';
            fs_1.default.writeFileSync(path_1.default.join(csvDirA, 'Stock.csv'), sampleStockCsv);
            fs_1.default.writeFileSync(path_1.default.join(csvDirB, 'Stock.csv'), sampleStockCsv);
            const comparison = await semantic_verification_service_1.semanticVerificationService.compareExports(csvDirA, path_1.default.join(testRoot, 'nonexistentA.xlsx'), csvDirB, path_1.default.join(testRoot, 'nonexistentB.xlsx'), ['Stock']);
            (0, vitest_1.expect)(comparison.csvVsCsv).toBe('VERIFIED');
            (0, vitest_1.expect)(comparison.discrepancies.length).toBe(0);
        });
        (0, vitest_1.it)('detects discrepancies if one export has missing or different records', async () => {
            const csvDirA = path_1.default.join(testRoot, 'exportA_csv');
            const csvDirB = path_1.default.join(testRoot, 'exportB_csv');
            fs_1.default.mkdirSync(csvDirA, { recursive: true });
            fs_1.default.mkdirSync(csvDirB, { recursive: true });
            fs_1.default.writeFileSync(path_1.default.join(csvDirA, 'Stock.csv'), 'id,stockCode,carat\nitem1,STK001,2.50\nitem2,STK002,1.20\n');
            fs_1.default.writeFileSync(path_1.default.join(csvDirB, 'Stock.csv'), 'id,stockCode,carat\nitem1,STK001,2.50\n');
            const comparison = await semantic_verification_service_1.semanticVerificationService.compareExports(csvDirA, path_1.default.join(testRoot, 'nonexistentA.xlsx'), csvDirB, path_1.default.join(testRoot, 'nonexistentB.xlsx'), ['Stock']);
            (0, vitest_1.expect)(comparison.csvVsCsv).toBe('FAILED');
            (0, vitest_1.expect)(comparison.discrepancies.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(comparison.discrepancies[0]).toContain('Stock');
        });
    });
});
//# sourceMappingURL=data-lifecycle-integrity.test.js.map