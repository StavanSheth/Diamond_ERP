import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { preservationService } from '../modules/system/preservation/preservation.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import { getDatabaseTemplatePath } from '../infrastructure/paths';

describe('Phase 7 — Preservation Package & Export Engine', () => {
  const testDir = path.resolve('apps/api/test-scratch-phase7-preservation');
  const sourceDbPath = path.join(testDir, 'sample_customer.db');
  const customExportDir = path.join(testDir, 'custom_preservation_export');
  const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    fs.copyFileSync(templateDb, sourceDbPath);

    // Seed customer business records into source DB
    const client = new PrismaClient({ datasourceUrl: `file:${path.resolve(sourceDbPath)}` });
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
    let inst = await systemPrisma.installation.findFirst();
    if (!inst) {
      inst = await systemPrisma.installation.create({
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

  afterAll(async () => {
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  let createdPkg: any;

  it('P0-3, P0-4, P0-5: creates unified preservation package with CSV, XLSX, SQLite DB, and manifests', async () => {
    createdPkg = await preservationService.createPreservationPackage({
      databasePath: sourceDbPath,
      destinationDir: customExportDir,
      confirmPreservation: true,
    });

    expect(createdPkg.status).toBe('VERIFIED');
    expect(createdPkg.packageId).toMatch(/^pkg_/);
    expect(fs.existsSync(createdPkg.destinationPath)).toBe(true);
    expect(createdPkg.sizeBytes).toBeGreaterThan(0);

    // Verify artifacts exist on disk
    expect(fs.existsSync(createdPkg.databaseBackupPath!)).toBe(true);
    expect(fs.existsSync(createdPkg.csvExportPath!)).toBe(true);
    expect(fs.existsSync(createdPkg.xlsxExportPath!)).toBe(true);
    expect(fs.existsSync(createdPkg.manifestPath!)).toBe(true);

    // Verify backup manifest
    expect(fs.existsSync(`${createdPkg.databaseBackupPath}.manifest.json`)).toBe(true);
    expect(fs.existsSync(path.join(createdPkg.destinationPath, 'export-manifest.json'))).toBe(true);
  });

  it('P0-3: exports CSV files with formula injection prevention', async () => {
    const stockCsvPath = path.join(createdPkg.destinationPath, 'csv', 'Stock.csv');
    expect(fs.existsSync(stockCsvPath)).toBe(true);

    const content = fs.readFileSync(stockCsvPath, 'utf-8');
    const lines = content.split('\n').filter((l: string) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(1); // Header + records

    // Formula injection escaping: leading '=', '+', '-', '@' must be single-quote prefixed
    expect(content).toContain("'=SUM(1,2) Injected Name");
    expect(content).toContain("'+Special Formula Description");
    expect(content).toContain("'@Danger Leading At");
    expect(content).toContain("'-Negative Value Diamond");
  });

  it('P0-4: exports valid multi-worksheet XLSX workbook matching entity data', async () => {
    const xlsxPath = path.join(createdPkg.destinationPath, 'xlsx', 'business_data.xlsx');
    expect(fs.existsSync(xlsxPath)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsxPath);

    // Required entity worksheets must exist
    expect(workbook.getWorksheet('Stock')).toBeDefined();
    expect(workbook.getWorksheet('Party')).toBeDefined();
    expect(workbook.getWorksheet('Ledger')).toBeDefined();

    const stockSheet = workbook.getWorksheet('Stock');
    expect(stockSheet!.rowCount).toBeGreaterThanOrEqual(3); // 1 header + at least 2 rows
  });

  it('P0-7: verification engine verifies database, CSV, XLSX, and checksums idempotently', async () => {
    const pkgId = createdPkg.packageId;

    // Run verification multiple times to ensure repeatability and zero side effects
    const v1 = await preservationService.verifyPreservationPackage(pkgId);
    expect(v1.verified).toBe(true);
    expect(v1.databaseBackupVerified).toBe(true);
    expect(v1.csvVerified).toBe(true);
    expect(v1.xlsxVerified).toBe(true);
    expect(v1.manifestVerified).toBe(true);

    const v2 = await preservationService.verifyPreservationPackage(pkgId);
    expect(v2.verified).toBe(true);
  });

  it('P0-8: verification fails if any preservation artifact is tampered or corrupted', async () => {
    // Create a temporary package to tamper with
    const tamperDir = path.join(testDir, 'tamper_package_test');
    const pkg = await preservationService.createPreservationPackage({
      databasePath: sourceDbPath,
      destinationDir: tamperDir,
      confirmPreservation: true,
    });

    // Tamper with one of the CSV files
    const csvFile = path.join(pkg.destinationPath, 'csv', 'Stock.csv');
    fs.appendFileSync(csvFile, '\ntampered_malicious_row');

    const result = await preservationService.verifyPreservationPackage(pkg.packageId);
    expect(result.verified).toBe(false);
    expect(result.csvVerified).toBe(false);
  });

  it('P0-5: source database remains untouched throughout preservation', async () => {
    expect(fs.existsSync(sourceDbPath)).toBe(true);
    const client = new PrismaClient({ datasourceUrl: `file:${path.resolve(sourceDbPath)}` });
    const stockCount = await client.$queryRawUnsafe<any[]>("SELECT count(*) as cnt FROM Stock");
    await client.$disconnect();
    expect(Number(stockCount[0].cnt)).toBeGreaterThanOrEqual(2);
  });
});
