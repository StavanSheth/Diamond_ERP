"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const preservation_service_1 = require("../modules/system/preservation/preservation.service");
const database_path_util_1 = require("../modules/system/database/database-path.util");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 7 — Windows Specific Paths & Canonicalization', () => {
    const baseScratch = path_1.default.resolve(__dirname, '../../test-win');
    const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve(__dirname, '../../Stavan.db');
    // Specific Windows test paths
    const spacesDir = path_1.default.join(baseScratch, 'Folder With Spaces');
    const unicodeDir = path_1.default.join(baseScratch, 'Diamond_测试_ダイヤモンド', 'Data');
    const nestedDir = path_1.default.join(baseScratch, 'Nest', 'L1', 'L2');
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(baseScratch)) {
            fs_1.default.mkdirSync(baseScratch, { recursive: true });
        }
        fs_1.default.mkdirSync(spacesDir, { recursive: true });
        fs_1.default.mkdirSync(unicodeDir, { recursive: true });
        fs_1.default.mkdirSync(nestedDir, { recursive: true });
        let inst = await prisma_1.systemPrisma.installation.findFirst();
        if (!inst) {
            inst = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: 'inst_winpaths_test_p7',
                    appVersion: '3.0.0',
                    status: 'ACTIVE',
                    lifecycleState: 'READY',
                    initializedAt: new Date(),
                },
            });
        }
    });
    (0, vitest_1.afterAll)(async () => {
        if (fs_1.default.existsSync(baseScratch)) {
            try {
                fs_1.default.rmSync(baseScratch, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('Section 55: canonicalizeDatabasePath handles mixed case and relative paths consistently', () => {
        const p1 = 'c:\\projects\\erp\\test\\sample.db';
        const p2 = 'C:\\PROJECTS\\ERP\\TEST\\SAMPLE.DB';
        const p3 = 'C:/Projects/ERP/Test/sample.db';
        const c1 = (0, database_path_util_1.canonicalizeDatabasePath)(p1);
        const c2 = (0, database_path_util_1.canonicalizeDatabasePath)(p2);
        const c3 = (0, database_path_util_1.canonicalizeDatabasePath)(p3);
        (0, vitest_1.expect)(c1.valid).toBe(true);
        (0, vitest_1.expect)(c2.valid).toBe(true);
        (0, vitest_1.expect)(c3.valid).toBe(true);
        (0, vitest_1.expect)(c1.canonicalPath.toLowerCase()).toBe(c2.canonicalPath.toLowerCase());
        (0, vitest_1.expect)(c1.canonicalPath.toLowerCase()).toBe(c3.canonicalPath.toLowerCase());
        (0, vitest_1.expect)(c1.canonicalPath).not.toContain('/'); // Windows standard separator
    });
    (0, vitest_1.it)('Section 55: handles export and preservation in directories with spaces', async () => {
        const dbWithSpaces = path_1.default.join(spacesDir, 'Customer Database With Spaces.db');
        fs_1.default.copyFileSync(templateDb, dbWithSpaces);
        const exportDest = path_1.default.join(spacesDir, 'Export Target Folder');
        const pkg = await preservation_service_1.preservationService.createPreservationPackage({
            databasePath: dbWithSpaces,
            destinationDir: exportDest,
            confirmPreservation: true,
        });
        (0, vitest_1.expect)(pkg.status).toBe('VERIFIED');
        (0, vitest_1.expect)(fs_1.default.existsSync(pkg.destinationPath)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(pkg.databaseBackupPath)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(pkg.csvExportPath)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(pkg.xlsxExportPath)).toBe(true);
        const verifyRes = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.packageId);
        (0, vitest_1.expect)(verifyRes.verified).toBe(true);
    });
    (0, vitest_1.it)('Section 55: handles export and preservation in Unicode paths', async () => {
        const unicodeDb = path_1.default.join(unicodeDir, '宝石_diamond_商事.db');
        fs_1.default.copyFileSync(templateDb, unicodeDb);
        const unicodeExportDest = path_1.default.join(unicodeDir, '保存先_Destination');
        const pkg = await preservation_service_1.preservationService.createPreservationPackage({
            databasePath: unicodeDb,
            destinationDir: unicodeExportDest,
            confirmPreservation: true,
        });
        (0, vitest_1.expect)(pkg.status).toBe('VERIFIED');
        (0, vitest_1.expect)(fs_1.default.existsSync(pkg.destinationPath)).toBe(true);
        const verifyRes = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.packageId);
        (0, vitest_1.expect)(verifyRes.verified).toBe(true);
    });
    (0, vitest_1.it)('Section 55: handles deeply nested long folder paths', async () => {
        const deepDb = path_1.default.join(nestedDir, 'deep_customer.db');
        fs_1.default.copyFileSync(templateDb, deepDb);
        const deepExportDest = path_1.default.join(nestedDir, 'Preservation_Output');
        const pkg = await preservation_service_1.preservationService.createPreservationPackage({
            databasePath: deepDb,
            destinationDir: deepExportDest,
            confirmPreservation: true,
        });
        (0, vitest_1.expect)(pkg.status).toBe('VERIFIED');
        (0, vitest_1.expect)(fs_1.default.existsSync(pkg.destinationPath)).toBe(true);
        const verifyRes = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.packageId);
        (0, vitest_1.expect)(verifyRes.verified).toBe(true);
    });
});
//# sourceMappingURL=phase7-windows-paths.test.js.map