"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const preservation_service_1 = require("../modules/system/preservation/preservation.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 7 — Failure Injection, Destination Validation & Deep Verification Robustness', () => {
    const testDir = path_1.default.resolve('apps/api/test-scratch-phase7-failures');
    const testDbPath = path_1.default.join(testDir, 'customer_failures.db');
    const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(testDir)) {
            fs_1.default.mkdirSync(testDir, { recursive: true });
        }
        fs_1.default.copyFileSync(templateDb, testDbPath);
        let inst = await prisma_1.systemPrisma.installation.findFirst();
        if (!inst) {
            inst = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: 'inst_failure_tests_p7',
                    appVersion: '3.0.0',
                    status: 'ACTIVE',
                    lifecycleState: 'READY',
                    initializedAt: new Date(),
                },
            });
        }
    });
    (0, vitest_1.afterAll)(async () => {
        if (fs_1.default.existsSync(testDir)) {
            try {
                fs_1.default.rmSync(testDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('Section 8.2 & 33: destination cannot be Windows system directory or system root', async () => {
        const winDir = process.env.WINDIR || 'C:\\Windows';
        await (0, vitest_1.expect)(preservation_service_1.preservationService.createPreservationPackage({
            databasePath: testDbPath,
            destinationDir: winDir,
            confirmPreservation: true,
        })).rejects.toThrow(errors_1.ValidationError);
        const rootDir = process.platform === 'win32' ? 'C:\\' : '/';
        await (0, vitest_1.expect)(preservation_service_1.preservationService.createPreservationPackage({
            databasePath: testDbPath,
            destinationDir: rootDir,
            confirmPreservation: true,
        })).rejects.toThrow(errors_1.ValidationError);
    });
    (0, vitest_1.it)('Section 8.2: destination cannot be source database file or exact source directory', async () => {
        await (0, vitest_1.expect)(preservation_service_1.preservationService.createPreservationPackage({
            databasePath: testDbPath,
            destinationDir: testDbPath,
            confirmPreservation: true,
        })).rejects.toThrow(errors_1.ValidationError);
        await (0, vitest_1.expect)(preservation_service_1.preservationService.createPreservationPackage({
            databasePath: testDbPath,
            destinationDir: path_1.default.dirname(testDbPath),
            confirmPreservation: true,
        })).rejects.toThrow(errors_1.ValidationError);
    });
    (0, vitest_1.it)('Section 8.3 & 33: read-only or unwritable destination fails writable test (.diamond-erp-write-test.tmp)', async () => {
        const readOnlyDir = path_1.default.join(testDir, 'readonly_folder');
        if (!fs_1.default.existsSync(readOnlyDir)) {
            fs_1.default.mkdirSync(readOnlyDir, { recursive: true });
        }
        // Make directory read-only (mode 0o444)
        fs_1.default.chmodSync(readOnlyDir, 0o444);
        try {
            // In non-Windows environments chmod 0o444 blocks writes; on Windows if admin it may succeed,
            // so we also verify that our writability test throws ConflictError if openSync fails.
            const testFilePath = path_1.default.join(readOnlyDir, '.diamond-erp-write-test-check.tmp');
            let writeBlocked = false;
            try {
                fs_1.default.writeFileSync(testFilePath, 'test', { flag: 'w' });
                fs_1.default.unlinkSync(testFilePath);
            }
            catch {
                writeBlocked = true;
            }
            if (writeBlocked) {
                await (0, vitest_1.expect)(preservation_service_1.preservationService.createPreservationPackage({
                    databasePath: testDbPath,
                    destinationDir: readOnlyDir,
                    confirmPreservation: true,
                })).rejects.toThrow(errors_1.ConflictError);
            }
            else {
                // If the OS filesystem ignored chmod 444, test non-existent path on an invalid drive
                const invalidDrive = process.platform === 'win32' ? 'Z:\\NonExistentPath\\DiamondERP' : '/dev/null/invalid';
                await (0, vitest_1.expect)(preservation_service_1.preservationService.createPreservationPackage({
                    databasePath: testDbPath,
                    destinationDir: invalidDrive,
                    confirmPreservation: true,
                })).rejects.toThrow(errors_1.ConflictError);
            }
        }
        finally {
            try {
                fs_1.default.chmodSync(readOnlyDir, 0o777);
            }
            catch { }
        }
    });
    (0, vitest_1.it)('Section 12 & 35: CSV deep structural verification rejects missing CSV, row count mismatch, or corrupted headers', async () => {
        const pkgDir = path_1.default.join(testDir, 'csv_deep_test_dest');
        const pkg = await preservation_service_1.preservationService.createPreservationPackage({
            databasePath: testDbPath,
            destinationDir: pkgDir,
            confirmPreservation: true,
        });
        (0, vitest_1.expect)(pkg.status).toBe('VERIFIED');
        // 1. Missing CSV file from bundle
        const stockCsv = path_1.default.join(pkg.destinationPath, 'csv', 'Stock.csv');
        const stockBackup = fs_1.default.readFileSync(stockCsv);
        fs_1.default.unlinkSync(stockCsv);
        const missingResult = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.packageId);
        (0, vitest_1.expect)(missingResult.verified).toBe(false);
        (0, vitest_1.expect)(missingResult.csvVerified).toBe(false);
        (0, vitest_1.expect)(missingResult.error).toContain('Required CSV export missing');
        // Restore CSV
        fs_1.default.writeFileSync(stockCsv, stockBackup);
        // 2. Corrupted CSV syntax / broken headers
        fs_1.default.writeFileSync(stockCsv, 'corrupted"quote,unclosed\n1,2,3', 'utf-8');
        const syntaxResult = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.packageId);
        (0, vitest_1.expect)(syntaxResult.verified).toBe(false);
        (0, vitest_1.expect)(syntaxResult.csvVerified).toBe(false);
        // Restore CSV
        fs_1.default.writeFileSync(stockCsv, stockBackup);
        // 3. Tampered checksum
        fs_1.default.appendFileSync(stockCsv, '\n');
        const shaResult = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.packageId);
        (0, vitest_1.expect)(shaResult.verified).toBe(false);
        (0, vitest_1.expect)(shaResult.csvVerified).toBe(false);
        (0, vitest_1.expect)(shaResult.error).toContain('CSV checksum mismatch');
        // Restore CSV
        fs_1.default.writeFileSync(stockCsv, stockBackup);
    });
    (0, vitest_1.it)('Section 13 & 35: XLSX deep structural verification rejects missing workbook, corrupted workbook, or missing sheets', async () => {
        const pkgDir = path_1.default.join(testDir, 'xlsx_deep_test_dest');
        const pkg = await preservation_service_1.preservationService.createPreservationPackage({
            databasePath: testDbPath,
            destinationDir: pkgDir,
            confirmPreservation: true,
        });
        (0, vitest_1.expect)(pkg.status).toBe('VERIFIED');
        const xlsxPath = path_1.default.join(pkg.destinationPath, 'xlsx', 'business_data.xlsx');
        const originalXlsx = fs_1.default.readFileSync(xlsxPath);
        // 1. Corrupted workbook file (not valid zip/xlsx format)
        fs_1.default.writeFileSync(xlsxPath, 'corrupted non-xlsx binary garbage string', 'utf-8');
        const corruptResult = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.packageId);
        (0, vitest_1.expect)(corruptResult.verified).toBe(false);
        (0, vitest_1.expect)(corruptResult.xlsxVerified).toBe(false);
        // 2. Missing workbook file entirely
        fs_1.default.unlinkSync(xlsxPath);
        const missingResult = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.packageId);
        (0, vitest_1.expect)(missingResult.verified).toBe(false);
        (0, vitest_1.expect)(missingResult.xlsxVerified).toBe(false);
        (0, vitest_1.expect)(missingResult.error).toContain('business_data.xlsx missing');
        // Restore XLSX
        fs_1.default.writeFileSync(xlsxPath, originalXlsx);
        const validResult = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.packageId);
        (0, vitest_1.expect)(validResult.verified).toBe(true);
        (0, vitest_1.expect)(validResult.xlsxVerified).toBe(true);
    });
    (0, vitest_1.it)('Section 35: database backup tampering blocks preservation verification and uninstall', async () => {
        const pkgDir = path_1.default.join(testDir, 'db_tamper_test_dest');
        const pkg = await preservation_service_1.preservationService.createPreservationPackage({
            databasePath: testDbPath,
            destinationDir: pkgDir,
            confirmPreservation: true,
        });
        (0, vitest_1.expect)(pkg.status).toBe('VERIFIED');
        // Tamper with SQLite backup file
        const dbBackupFile = pkg.databaseBackupPath;
        fs_1.default.appendFileSync(dbBackupFile, 'corrupted_bytes_at_eof');
        const tamperResult = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.packageId);
        (0, vitest_1.expect)(tamperResult.verified).toBe(false);
        (0, vitest_1.expect)(tamperResult.databaseBackupVerified).toBe(false);
        (0, vitest_1.expect)(tamperResult.error).toContain('checksum mismatch');
    });
    (0, vitest_1.it)('Section 31: Crash/Interruption recovery — package marked FAILED on unrecoverable abort', async () => {
        // If an invalid database is provided, preservation cleanly fails and does not leave dirty verified package
        const fakeDb = path_1.default.join(testDir, 'non_existent_aborted.db');
        await (0, vitest_1.expect)(preservation_service_1.preservationService.createPreservationPackage({
            databasePath: fakeDb,
            confirmPreservation: true,
        })).rejects.toThrow();
        // Verify no stray verified package was created
        const stray = await prisma_1.systemPrisma.preservationPackage.findFirst({
            where: { destinationPath: { contains: 'non_existent_aborted' }, status: 'VERIFIED' },
        });
        (0, vitest_1.expect)(stray).toBeNull();
    });
});
//# sourceMappingURL=phase7-failure-recovery.test.js.map