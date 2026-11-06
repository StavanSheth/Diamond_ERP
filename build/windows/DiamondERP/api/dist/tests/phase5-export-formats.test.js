"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const export_service_1 = require("../modules/system/export/export.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
const installation_service_1 = require("../modules/system/installation.service");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 5 — Export Formats (CSV, XLSX, SQLITE), Integrity & Security Engine', () => {
    const testScratchDir = path_1.default.resolve('apps/api/test-scratch-formats');
    const testDbPath = path_1.default.join(testScratchDir, 'formats_test.db');
    let createdExportPaths = [];
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(testScratchDir)) {
            fs_1.default.mkdirSync(testScratchDir, { recursive: true });
        }
        const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
        fs_1.default.copyFileSync(templateDb, testDbPath);
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        await prisma_1.systemPrisma.databaseRegistry.upsert({
            where: { databaseId: 'db_test_formats' },
            create: {
                databaseId: 'db_test_formats',
                installationId: install.id,
                displayName: 'Formats Company',
                canonicalPath: path_1.default.resolve(testDbPath),
                status: 'ACTIVE',
                schemaVersion: 1,
            },
            update: {
                canonicalPath: path_1.default.resolve(testDbPath),
                status: 'ACTIVE',
            },
        });
    });
    (0, vitest_1.afterAll)(async () => {
        try {
            await prisma_1.systemPrisma.databaseRegistry.deleteMany({
                where: { databaseId: 'db_test_formats' },
            });
        }
        catch { }
        for (const expPath of createdExportPaths) {
            if (fs_1.default.existsSync(expPath)) {
                try {
                    fs_1.default.rmSync(expPath, { recursive: true, force: true });
                }
                catch { }
            }
        }
        if (fs_1.default.existsSync(testScratchDir)) {
            try {
                fs_1.default.rmSync(testScratchDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('strictly rejects template.db and system.db from export', async () => {
        const controlDb = (0, paths_1.getControlDbPath)();
        await (0, vitest_1.expect)(export_service_1.exportService.exportBusinessData({ format: 'CSV', databasePath: controlDb })).rejects.toThrow(errors_1.ValidationError);
        const templateDb = (0, paths_1.getDatabaseTemplatePath)();
        if (templateDb) {
            await (0, vitest_1.expect)(export_service_1.exportService.exportBusinessData({ format: 'CSV', databasePath: templateDb })).rejects.toThrow(errors_1.ValidationError);
        }
    });
    (0, vitest_1.it)('exports business data as Excel (XLSX) workbook with manifest and checksums', async () => {
        const result = await export_service_1.exportService.exportBusinessData({ format: 'XLSX', databasePath: testDbPath }, 'tester');
        createdExportPaths.push(result.filePath);
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.exportId).toMatch(/^exp_/);
        (0, vitest_1.expect)(fs_1.default.existsSync(result.filePath)).toBe(true);
        const xlsxFile = path_1.default.join(result.filePath, 'business_data.xlsx');
        (0, vitest_1.expect)(fs_1.default.existsSync(xlsxFile)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.statSync(xlsxFile).size).toBeGreaterThan(0);
        const manifestPath = path_1.default.join(result.filePath, 'export-manifest.json');
        (0, vitest_1.expect)(fs_1.default.existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
        (0, vitest_1.expect)(manifest.format).toBe('XLSX');
        (0, vitest_1.expect)(manifest.tableCount).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(manifest.failedTableCount).toBe(0);
        // Verify verification check on XLSX export
        const verify = await export_service_1.exportService.verifyExport(result.filePath);
        (0, vitest_1.expect)(verify.isValid).toBe(true);
        (0, vitest_1.expect)(verify.manifestMatches).toBe(true);
    });
    (0, vitest_1.it)('exports business data as clean standalone SQLite snapshot', async () => {
        const result = await export_service_1.exportService.exportBusinessData({ format: 'SQLITE', databasePath: testDbPath }, 'tester');
        createdExportPaths.push(result.filePath);
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.exportId).toMatch(/^exp_/);
        const sqliteFile = path_1.default.join(result.filePath, 'business_data.db');
        (0, vitest_1.expect)(fs_1.default.existsSync(sqliteFile)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.statSync(sqliteFile).size).toBeGreaterThan(0);
        const manifestPath = path_1.default.join(result.filePath, 'export-manifest.json');
        const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
        (0, vitest_1.expect)(manifest.format).toBe('SQLITE');
        const verify = await export_service_1.exportService.verifyExport(result.filePath);
        (0, vitest_1.expect)(verify.isValid).toBe(true);
    });
    (0, vitest_1.it)('detects missing files or checksum tampering during verifyExport', async () => {
        const result = await export_service_1.exportService.exportBusinessData({ format: 'CSV', databasePath: testDbPath }, 'tester');
        createdExportPaths.push(result.filePath);
        // Tamper with one of the CSV files
        const manifestPath = path_1.default.join(result.filePath, 'export-manifest.json');
        const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
        const firstTable = manifest.tables[0];
        const targetFile = path_1.default.join(result.filePath, firstTable.fileName);
        fs_1.default.appendFileSync(targetFile, '\nTAMPERED_CONTENT_ROW');
        const verify = await export_service_1.exportService.verifyExport(result.filePath);
        (0, vitest_1.expect)(verify.isValid).toBe(false);
        (0, vitest_1.expect)(verify.manifestMatches).toBe(false);
    });
});
//# sourceMappingURL=phase5-export-formats.test.js.map