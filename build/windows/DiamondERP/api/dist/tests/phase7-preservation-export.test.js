"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const exceljs_1 = __importDefault(require("exceljs"));
const client_1 = require("@prisma/client");
const preservation_service_1 = require("../modules/system/preservation/preservation.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 7 — Preservation Package & Export Engine', () => {
    const testDir = path_1.default.resolve('apps/api/test-scratch-phase7-preservation');
    const sourceDbPath = path_1.default.join(testDir, 'sample_customer.db');
    const customExportDir = path_1.default.join(testDir, 'custom_preservation_export');
    const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(testDir)) {
            fs_1.default.mkdirSync(testDir, { recursive: true });
        }
        fs_1.default.copyFileSync(templateDb, sourceDbPath);
        // Seed customer business records into source DB
        const client = new client_1.PrismaClient({ datasourceUrl: `file:${path_1.default.resolve(sourceDbPath)}` });
        await client.$executeRawUnsafe(`
      INSERT OR REPLACE INTO Stock (id, stockCode, name, description, currency, isActive, createdAt, updatedAt)
      VALUES 
        ('stk_01', 'STK-PRESERVE-1', '=SUM(1,2) Injected Name', '+Special Formula Description', 'USD', 1, datetime('now'), datetime('now')),
        ('stk_02', 'STK-PRESERVE-2', '@Danger Leading At', '-Negative Value Diamond', 'INR', 1, datetime('now'), datetime('now'));
    `);
        await client.$executeRawUnsafe(`
      INSERT OR REPLACE INTO Party (id, partyCode, name, partyType, phone, email, createdAt, updatedAt)
      VALUES 
        ('pty_01', 'P-001', 'Acme Diamond Merchants', 'CUSTOMER', '+919876543210', 'acme@example.com', datetime('now'), datetime('now'));
    `);
        await client.$disconnect();
        // Ensure installation exists in control DB
        let inst = await prisma_1.systemPrisma.installation.findFirst();
        if (!inst) {
            inst = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: 'inst_test_preservation_p7',
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
    let createdPkg;
    (0, vitest_1.it)('P0-3, P0-4, P0-5: creates unified preservation package with CSV, XLSX, SQLite DB, and manifests', async () => {
        createdPkg = await preservation_service_1.preservationService.createPreservationPackage({
            databasePath: sourceDbPath,
            destinationDir: customExportDir,
            confirmPreservation: true,
        });
        (0, vitest_1.expect)(createdPkg.status).toBe('VERIFIED');
        (0, vitest_1.expect)(createdPkg.packageId).toMatch(/^pkg_/);
        (0, vitest_1.expect)(fs_1.default.existsSync(createdPkg.destinationPath)).toBe(true);
        (0, vitest_1.expect)(createdPkg.sizeBytes).toBeGreaterThan(0);
        // Verify artifacts exist on disk
        (0, vitest_1.expect)(fs_1.default.existsSync(createdPkg.databaseBackupPath)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(createdPkg.csvExportPath)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(createdPkg.xlsxExportPath)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(createdPkg.manifestPath)).toBe(true);
        // Verify backup manifest
        (0, vitest_1.expect)(fs_1.default.existsSync(`${createdPkg.databaseBackupPath}.manifest.json`)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(path_1.default.join(createdPkg.destinationPath, 'export-manifest.json'))).toBe(true);
    });
    (0, vitest_1.it)('P0-3: exports CSV files with formula injection prevention', async () => {
        const stockCsvPath = path_1.default.join(createdPkg.destinationPath, 'csv', 'Stock.csv');
        (0, vitest_1.expect)(fs_1.default.existsSync(stockCsvPath)).toBe(true);
        const content = fs_1.default.readFileSync(stockCsvPath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        (0, vitest_1.expect)(lines.length).toBeGreaterThan(1); // Header + records
        // Formula injection escaping: leading '=', '+', '-', '@' must be single-quote prefixed
        (0, vitest_1.expect)(content).toContain("'=SUM(1,2) Injected Name");
        (0, vitest_1.expect)(content).toContain("'+Special Formula Description");
        (0, vitest_1.expect)(content).toContain("'@Danger Leading At");
        (0, vitest_1.expect)(content).toContain("'-Negative Value Diamond");
    });
    (0, vitest_1.it)('P0-4: exports valid multi-worksheet XLSX workbook matching entity data', async () => {
        const xlsxPath = path_1.default.join(createdPkg.destinationPath, 'xlsx', 'business_data.xlsx');
        (0, vitest_1.expect)(fs_1.default.existsSync(xlsxPath)).toBe(true);
        const workbook = new exceljs_1.default.Workbook();
        await workbook.xlsx.readFile(xlsxPath);
        // Required entity worksheets must exist
        (0, vitest_1.expect)(workbook.getWorksheet('Stock')).toBeDefined();
        (0, vitest_1.expect)(workbook.getWorksheet('Party')).toBeDefined();
        (0, vitest_1.expect)(workbook.getWorksheet('Ledger')).toBeDefined();
        const stockSheet = workbook.getWorksheet('Stock');
        (0, vitest_1.expect)(stockSheet.rowCount).toBeGreaterThanOrEqual(3); // 1 header + at least 2 rows
    });
    (0, vitest_1.it)('P0-7: verification engine verifies database, CSV, XLSX, and checksums idempotently', async () => {
        const pkgId = createdPkg.packageId;
        // Run verification multiple times to ensure repeatability and zero side effects
        const v1 = await preservation_service_1.preservationService.verifyPreservationPackage(pkgId);
        (0, vitest_1.expect)(v1.verified).toBe(true);
        (0, vitest_1.expect)(v1.databaseBackupVerified).toBe(true);
        (0, vitest_1.expect)(v1.csvVerified).toBe(true);
        (0, vitest_1.expect)(v1.xlsxVerified).toBe(true);
        (0, vitest_1.expect)(v1.manifestVerified).toBe(true);
        const v2 = await preservation_service_1.preservationService.verifyPreservationPackage(pkgId);
        (0, vitest_1.expect)(v2.verified).toBe(true);
    });
    (0, vitest_1.it)('P0-8: verification fails if any preservation artifact is tampered or corrupted', async () => {
        // Create a temporary package to tamper with
        const tamperDir = path_1.default.join(testDir, 'tamper_package_test');
        const pkg = await preservation_service_1.preservationService.createPreservationPackage({
            databasePath: sourceDbPath,
            destinationDir: tamperDir,
            confirmPreservation: true,
        });
        // Tamper with one of the CSV files
        const csvFile = path_1.default.join(pkg.destinationPath, 'csv', 'Stock.csv');
        fs_1.default.appendFileSync(csvFile, '\ntampered_malicious_row');
        const result = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.packageId);
        (0, vitest_1.expect)(result.verified).toBe(false);
        (0, vitest_1.expect)(result.csvVerified).toBe(false);
    });
    (0, vitest_1.it)('P0-5: source database remains untouched throughout preservation', async () => {
        (0, vitest_1.expect)(fs_1.default.existsSync(sourceDbPath)).toBe(true);
        const client = new client_1.PrismaClient({ datasourceUrl: `file:${path_1.default.resolve(sourceDbPath)}` });
        const stockCount = await client.$queryRawUnsafe("SELECT count(*) as cnt FROM Stock");
        await client.$disconnect();
        (0, vitest_1.expect)(Number(stockCount[0].cnt)).toBeGreaterThanOrEqual(2);
    });
});
//# sourceMappingURL=phase7-preservation-export.test.js.map