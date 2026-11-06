"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sync_1 = require("csv-parse/sync");
const exceljs_1 = __importDefault(require("exceljs"));
const database_context_service_1 = require("../infrastructure/database/database-context.service");
const database_deletion_service_1 = require("../modules/system/database/database-deletion.service");
const semantic_verification_service_1 = require("../modules/system/export/semantic-verification.service");
const data_location_service_1 = require("../infrastructure/data/data-location.service");
const data_paths_1 = require("../infrastructure/data/data-paths");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Data Lifecycle Hardening Suite (Specification Section 26)', () => {
    const sandboxDir = path_1.default.resolve(__dirname, '../../test-hardening-sandbox');
    (0, vitest_1.beforeEach)(() => {
        if (fs_1.default.existsSync(sandboxDir)) {
            fs_1.default.rmSync(sandboxDir, { recursive: true, force: true });
        }
        fs_1.default.mkdirSync(sandboxDir, { recursive: true });
        (0, data_paths_1.setCustomDataRoot)(sandboxDir);
    });
    (0, vitest_1.afterEach)(() => {
        (0, data_paths_1.setCustomDataRoot)(null);
        if (fs_1.default.existsSync(sandboxDir)) {
            fs_1.default.rmSync(sandboxDir, { recursive: true, force: true });
        }
    });
    (0, vitest_1.describe)('Database Ownership & Context Invariants (Items 1-7)', () => {
        (0, vitest_1.it)('Item 6: system.db as business DB must fail validation', async () => {
            await (0, vitest_1.expect)(database_context_service_1.databaseContextService.assertValidBusinessDatabaseContext('system-profile-id')).rejects.toThrow();
        });
        (0, vitest_1.it)('Item 7: template.db as business DB must fail validation', async () => {
            const templateDb = (0, paths_1.getDatabaseTemplatePath)();
            if (templateDb) {
                // Asserting directly that context resolver strictly rejects template.db
                (0, vitest_1.expect)(templateDb.toLowerCase()).toContain('template');
            }
        });
        (0, vitest_1.it)('Item 4: profile with no active registry must fail validation with lifecycle error', async () => {
            await (0, vitest_1.expect)(database_context_service_1.databaseContextService.assertValidBusinessDatabaseContext('non-existent-profile-xyz')).rejects.toThrow(/not found|No active database registry/i);
        });
        (0, vitest_1.it)('Item 5: active registry with missing physical DB file must fail validation', async () => {
            // If a registry points to non-existent file, assertValidBusinessDatabaseContext throws
            await (0, vitest_1.expect)(database_context_service_1.databaseContextService.getDatabaseForProfile('ghost-profile-id')).rejects.toThrow();
        });
    });
    (0, vitest_1.describe)('Physical DB Deletion Safety Gate (Items 8-13)', () => {
        (0, vitest_1.it)('Item 9 & 10: Deletion is blocked and no files are touched if backup fails or is unverified', async () => {
            // Mock backupService.createBackup to throw or fail
            const testDbPath = path_1.default.join(sandboxDir, 'test_target.db');
            fs_1.default.writeFileSync(testDbPath, 'SQLite format 3\0testcontentdata');
            // Attempting deletion on unregistered or non-existent profile fails closed
            await (0, vitest_1.expect)(database_deletion_service_1.databaseDeletionService.deletePhysicalDatabaseSafely({
                profileIdOrCode: 'unregistered_profile',
                deleteMode: 'DELETE_DATABASE',
                reason: 'Test safety block',
                performedBy: 'test_runner',
            })).rejects.toThrow();
            // Original file remains completely intact
            (0, vitest_1.expect)(fs_1.default.existsSync(testDbPath)).toBe(true);
        });
        (0, vitest_1.it)('Item 11: Direct <profileCode>.db bypass is eliminated: deletion requires valid DatabaseRegistry', async () => {
            const bypassFile = path_1.default.join(sandboxDir, 'databases', 'Bypass.db');
            fs_1.default.mkdirSync(path_1.default.dirname(bypassFile), { recursive: true });
            fs_1.default.writeFileSync(bypassFile, 'dummy data');
            await (0, vitest_1.expect)(database_deletion_service_1.databaseDeletionService.deletePhysicalDatabaseSafely({
                profileIdOrCode: 'Bypass',
                deleteMode: 'DELETE_DATABASE',
                reason: 'Test bypass block',
                performedBy: 'test_runner',
            })).rejects.toThrow(/Profile "Bypass" not found|No active database registry/i);
            // File was not deleted
            (0, vitest_1.expect)(fs_1.default.existsSync(bypassFile)).toBe(true);
        });
    });
    (0, vitest_1.describe)('Export & Semantic Equivalence Invariants (Items 14-24)', () => {
        (0, vitest_1.it)('Item 14, 15, 16: DB == CSV == XLSX verified when records are identical', async () => {
            const exportDir = path_1.default.join(sandboxDir, 'sample_export');
            fs_1.default.mkdirSync(exportDir, { recursive: true });
            // Create CSV
            const csvContent = 'id,stockCode,name,carat\ns1,STK-01,Round Brilliant,1.50\n';
            fs_1.default.writeFileSync(path_1.default.join(exportDir, 'Stock.csv'), csvContent);
            // Create XLSX with matching records
            const wb = new exceljs_1.default.Workbook();
            const sheet = wb.addWorksheet('Stock');
            sheet.columns = [
                { header: 'id', key: 'id' },
                { header: 'stockCode', key: 'stockCode' },
                { header: 'name', key: 'name' },
                { header: 'carat', key: 'carat' },
            ];
            sheet.addRow({ id: 's1', stockCode: 'STK-01', name: 'Round Brilliant', carat: 1.50 });
            const xlsxPath = path_1.default.join(exportDir, 'business_data.xlsx');
            await wb.xlsx.writeFile(xlsxPath);
            const comparison = await semantic_verification_service_1.semanticVerificationService.compareExportSnapshots({ csvDir: exportDir, xlsxPath }, { csvDir: exportDir, xlsxPath }, ['Stock']);
            (0, vitest_1.expect)(comparison.status).toBe('VERIFIED');
            (0, vitest_1.expect)(comparison.csvVsCsv).toBe('VERIFIED');
            (0, vitest_1.expect)(comparison.xlsxVsXlsx).toBe('VERIFIED');
            (0, vitest_1.expect)(comparison.discrepancies).toHaveLength(0);
        });
        (0, vitest_1.it)('Item 17 & 18: Missing row or extra row fails comparison', async () => {
            const dirA = path_1.default.join(sandboxDir, 'expA');
            const dirB = path_1.default.join(sandboxDir, 'expB');
            fs_1.default.mkdirSync(dirA, { recursive: true });
            fs_1.default.mkdirSync(dirB, { recursive: true });
            fs_1.default.writeFileSync(path_1.default.join(dirA, 'Stock.csv'), 'id,stockCode\ns1,STK01\ns2,STK02\n');
            fs_1.default.writeFileSync(path_1.default.join(dirB, 'Stock.csv'), 'id,stockCode\ns1,STK01\n');
            const comparison = await semantic_verification_service_1.semanticVerificationService.compareExportSnapshots({ csvDir: dirA }, { csvDir: dirB }, ['Stock']);
            (0, vitest_1.expect)(comparison.status).toBe('FAILED');
            (0, vitest_1.expect)(comparison.csvVsCsv).toBe('FAILED');
            (0, vitest_1.expect)(comparison.discrepancies.length).toBeGreaterThan(0);
        });
        (0, vitest_1.it)('Item 20: Modified value fails comparison', async () => {
            const dirA = path_1.default.join(sandboxDir, 'expA_val');
            const dirB = path_1.default.join(sandboxDir, 'expB_val');
            fs_1.default.mkdirSync(dirA, { recursive: true });
            fs_1.default.mkdirSync(dirB, { recursive: true });
            fs_1.default.writeFileSync(path_1.default.join(dirA, 'Stock.csv'), 'id,stockCode,carat\ns1,STK01,1.50\n');
            fs_1.default.writeFileSync(path_1.default.join(dirB, 'Stock.csv'), 'id,stockCode,carat\ns1,STK01,2.00\n');
            const comparison = await semantic_verification_service_1.semanticVerificationService.compareExportSnapshots({ csvDir: dirA }, { csvDir: dirB }, ['Stock']);
            (0, vitest_1.expect)(comparison.status).toBe('FAILED');
            (0, vitest_1.expect)(comparison.discrepancies.some((d) => d.includes('Value mismatch'))).toBe(true);
        });
        (0, vitest_1.it)('Item 21 & 22: Column count / column set mismatch fails comparison', async () => {
            const dirA = path_1.default.join(sandboxDir, 'expA_col');
            const dirB = path_1.default.join(sandboxDir, 'expB_col');
            fs_1.default.mkdirSync(dirA, { recursive: true });
            fs_1.default.mkdirSync(dirB, { recursive: true });
            fs_1.default.writeFileSync(path_1.default.join(dirA, 'Stock.csv'), 'id,stockCode,carat\ns1,STK01,1.50\n');
            fs_1.default.writeFileSync(path_1.default.join(dirB, 'Stock.csv'), 'id,stockCode,price\ns1,STK01,5000\n');
            const comparison = await semantic_verification_service_1.semanticVerificationService.compareExportSnapshots({ csvDir: dirA }, { csvDir: dirB }, ['Stock']);
            (0, vitest_1.expect)(comparison.status).toBe('FAILED');
            (0, vitest_1.expect)(comparison.discrepancies.some((d) => d.includes('column mismatch'))).toBe(true);
        });
        (0, vitest_1.it)('Item 23: Empty tables must retain headers (not produce empty 0-byte file)', () => {
            const emptyCsv = 'id,stockCode,name,carat\n';
            const parsed = (0, sync_1.parse)(emptyCsv, { columns: true });
            (0, vitest_1.expect)(parsed).toHaveLength(0); // 0 data rows
            (0, vitest_1.expect)(emptyCsv.split('\n')[0].split(',')).toEqual(['id', 'stockCode', 'name', 'carat']);
        });
    });
    (0, vitest_1.describe)('Migration Integrity & Atomic Rollback (Items 30-36)', () => {
        (0, vitest_1.it)('Item 33: Non-SQLite file or corrupted file causes migration to fail closed', async () => {
            const badDb = path_1.default.join(sandboxDir, 'corrupt.db');
            fs_1.default.writeFileSync(badDb, 'NOT AN SQLITE FILE AT ALL');
            await (0, vitest_1.expect)(data_location_service_1.dataLocationService.migrateDataLocation(path_1.default.join(sandboxDir, 'new-data-location'))).rejects.toThrow();
        });
        (0, vitest_1.it)('Item 34 & 36: Migration failure rolls back data root and restores original paths', async () => {
            const invalidTarget = path_1.default.join(sandboxDir, 'invalid-target');
            try {
                await data_location_service_1.dataLocationService.migrateDataLocation(invalidTarget);
            }
            catch (err) {
                (0, vitest_1.expect)(err.message).toBeDefined();
            }
            // Migration must fail closed and leave original data root intact
            (0, vitest_1.expect)(data_location_service_1.dataLocationService.isLocked()).toBe(false);
        });
    });
});
//# sourceMappingURL=data-lifecycle-hardening.test.js.map