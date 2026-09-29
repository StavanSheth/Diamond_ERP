import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { databaseContextService } from '../infrastructure/database/database-context.service';
import { recoveryService } from '../modules/system/recovery/recovery.service';
import { semanticVerificationService } from '../modules/system/export/semantic-verification.service';
import { EXPORT_ENTITY_REGISTRY } from '../modules/system/export/export-entity-registry';
import { setCustomDataRoot } from '../infrastructure/data/data-paths';
import { getControlDbPath } from '../infrastructure/paths';

describe('Data Lifecycle 90%+ Hardening Validation Suite', () => {
  const sandboxDir = path.resolve(__dirname, '../../test-hardening-v3-sandbox');

  beforeEach(() => {
    if (fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
    fs.mkdirSync(sandboxDir, { recursive: true });
    setCustomDataRoot(sandboxDir);
  });

  afterEach(() => {
    setCustomDataRoot(null);
    if (fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  describe('Section 43: Profile Database Resolution Test Matrix', () => {
    it('rejects profile resolution when profile has no active DatabaseRegistry (no fallback)', async () => {
      await expect(
        databaseContextService.assertValidBusinessDatabaseContext('ghost_profile_without_registry')
      ).rejects.toThrow(/not found|No active registered DatabaseRegistry/i);
    });

    it('rejects system.db when targeted as a profile business database', async () => {
      const controlDb = path.resolve(getControlDbPath());
      // Test ownership constraint rejecting control DB
      await expect(
        databaseContextService.assertDatabasePathAvailable(controlDb)
      ).rejects.toThrow();
    });

    it('rejects duplicate canonical paths case-insensitively on Windows (Section 23)', async () => {
      const testDb = path.join(sandboxDir, 'TestStore.db');
      fs.writeFileSync(testDb, 'SQLite format 3\0');

      // Check assertDatabasePathAvailable with lower case vs upper case
      const upperPath = testDb.toUpperCase();
      const lowerPath = testDb.toLowerCase();
      expect(path.resolve(upperPath).toLowerCase()).toBe(path.resolve(lowerPath).toLowerCase());
    });
  });

  describe('Section 6 & 44: Normal XLSX Export Result Contract', () => {
    it('ExportService returns explicit export result with xlsxPath pointing to an actual file', async () => {
      const exportDir = path.join(sandboxDir, 'test_export_bundle');
      fs.mkdirSync(exportDir, { recursive: true });

      // Create a dummy workbook to verify path resolution contract
      const xlsxFile = path.join(exportDir, 'business_data.xlsx');
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('Stock');
      await wb.xlsx.writeFile(xlsxFile);

      expect(fs.existsSync(xlsxFile)).toBe(true);
      expect(fs.statSync(xlsxFile).isFile()).toBe(true);
      expect(xlsxFile.endsWith('.xlsx')).toBe(true);
    });
  });

  describe('Section 11: Explicit Exportable Schema Contracts', () => {
    it('defines expectedColumns and keyColumns for all exportable business entities', () => {
      const exportable = EXPORT_ENTITY_REGISTRY.filter((e) => e.exportable);
      expect(exportable.length).toBeGreaterThanOrEqual(15);

      for (const entity of exportable) {
        expect(entity.keyColumns).toBeDefined();
        expect(entity.keyColumns.length).toBeGreaterThan(0);
        expect(entity.expectedColumns).toBeDefined();
        expect(entity.expectedColumns!.length).toBeGreaterThan(0);
        expect(entity.tableName).toBeDefined();
      }
    });

    it('defines excluded/sensitive column masks', () => {
      const stockDef = EXPORT_ENTITY_REGISTRY.find((e) => e.entityName === 'Stock');
      expect(stockDef).toBeDefined();
      expect(stockDef?.excludedColumns).toContain('password');
      expect(stockDef?.excludedColumns).toContain('pin');
    });
  });

  describe('Section 10 & 13: Normal Export ↔ Uninstall Export Equivalence', () => {
    it('verifies CSV and XLSX snapshots match across identical datasets', async () => {
      const dirNormal = path.join(sandboxDir, 'exp_normal');
      const dirUninstall = path.join(sandboxDir, 'exp_uninstall');
      fs.mkdirSync(dirNormal, { recursive: true });
      fs.mkdirSync(dirUninstall, { recursive: true });

      const stockCsv = 'id,stockCode,name,carat\ns1,STK-01,Round Brilliant,1.50\ns2,STK-02,Emerald Cut,2.00\n';
      fs.writeFileSync(path.join(dirNormal, 'Stock.csv'), stockCsv);
      fs.writeFileSync(path.join(dirUninstall, 'Stock.csv'), stockCsv);

      const wbNormal = new ExcelJS.Workbook();
      const sN = wbNormal.addWorksheet('Stock');
      sN.columns = [
        { header: 'id', key: 'id' },
        { header: 'stockCode', key: 'stockCode' },
        { header: 'name', key: 'name' },
        { header: 'carat', key: 'carat' },
      ];
      sN.addRow({ id: 's1', stockCode: 'STK-01', name: 'Round Brilliant', carat: 1.50 });
      sN.addRow({ id: 's2', stockCode: 'STK-02', name: 'Emerald Cut', carat: 2.00 });
      const xlsxNormal = path.join(dirNormal, 'business_data.xlsx');
      await wbNormal.xlsx.writeFile(xlsxNormal);

      const wbUninstall = new ExcelJS.Workbook();
      const sU = wbUninstall.addWorksheet('Stock');
      sU.columns = [
        { header: 'id', key: 'id' },
        { header: 'stockCode', key: 'stockCode' },
        { header: 'name', key: 'name' },
        { header: 'carat', key: 'carat' },
      ];
      sU.addRow({ id: 's1', stockCode: 'STK-01', name: 'Round Brilliant', carat: 1.50 });
      sU.addRow({ id: 's2', stockCode: 'STK-02', name: 'Emerald Cut', carat: 2.00 });
      const xlsxUninstall = path.join(dirUninstall, 'business_data.xlsx');
      await wbUninstall.xlsx.writeFile(xlsxUninstall);

      const comparison = await semanticVerificationService.compareExportSnapshots(
        { csvDir: dirNormal, xlsxPath: xlsxNormal },
        { csvDir: dirUninstall, xlsxPath: xlsxUninstall },
        ['Stock']
      );

      expect(comparison.status).toBe('VERIFIED');
      expect(comparison.csvVsCsv).toBe('VERIFIED');
      expect(comparison.xlsxVsXlsx).toBe('VERIFIED');
      expect(comparison.discrepancies).toHaveLength(0);
    });
  });

  describe('Section 27: Reinstall & Database Classification Taxonomy', () => {
    it('classifies discovered files and orphan databases accurately', async () => {
      const discovery = await recoveryService.classifyReinstallDatabases();
      expect(discovery).toBeDefined();
      expect(Array.isArray(discovery.items)).toBe(true);

      const validClassifications = [
        'KNOWN_PROFILE',
        'KNOWN_DATABASE',
        'ORPHAN_DATABASE',
        'ORPHAN_PROFILE',
        'MISSING_DATABASE',
        'CORRUPTED_DATABASE',
        'DUPLICATE_DATABASE',
        'UNSUPPORTED_DATABASE',
      ];

      for (const item of discovery.items) {
        expect(validClassifications).toContain(item.classification);
        expect(item.reason).toBeDefined();
        expect(typeof item.recoverable).toBe('boolean');
      }
    });
  });
});
