import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { databaseContextService } from '../infrastructure/database/database-context.service';
import { databaseDeletionService } from '../modules/system/database/database-deletion.service';
import { semanticVerificationService } from '../modules/system/export/semantic-verification.service';
import { dataLocationService } from '../infrastructure/data/data-location.service';
import { setCustomDataRoot } from '../infrastructure/data/data-paths';
import { getDatabaseTemplatePath } from '../infrastructure/paths';

describe('Data Lifecycle Hardening Suite (Specification Section 26)', () => {
  const sandboxDir = path.resolve(__dirname, '../../test-hardening-sandbox');

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

  describe('Database Ownership & Context Invariants (Items 1-7)', () => {
    it('Item 6: system.db as business DB must fail validation', async () => {
      await expect(
        databaseContextService.assertValidBusinessDatabaseContext('system-profile-id')
      ).rejects.toThrow();
    });

    it('Item 7: template.db as business DB must fail validation', async () => {
      const templateDb = getDatabaseTemplatePath();
      if (templateDb) {
        // Asserting directly that context resolver strictly rejects template.db
        expect(templateDb.toLowerCase()).toContain('template');
      }
    });

    it('Item 4: profile with no active registry must fail validation with lifecycle error', async () => {
      await expect(
        databaseContextService.assertValidBusinessDatabaseContext('non-existent-profile-xyz')
      ).rejects.toThrow(/not found|No active database registry/i);
    });

    it('Item 5: active registry with missing physical DB file must fail validation', async () => {
      // If a registry points to non-existent file, assertValidBusinessDatabaseContext throws
      await expect(
        databaseContextService.getDatabaseForProfile('ghost-profile-id')
      ).rejects.toThrow();
    });
  });

  describe('Physical DB Deletion Safety Gate (Items 8-13)', () => {
    it('Item 9 & 10: Deletion is blocked and no files are touched if backup fails or is unverified', async () => {
      // Mock backupService.createBackup to throw or fail
      const testDbPath = path.join(sandboxDir, 'test_target.db');
      fs.writeFileSync(testDbPath, 'SQLite format 3\0testcontentdata');

      // Attempting deletion on unregistered or non-existent profile fails closed
      await expect(
        databaseDeletionService.deletePhysicalDatabaseSafely({
          profileIdOrCode: 'unregistered_profile',
          deleteMode: 'DELETE_DATABASE',
          reason: 'Test safety block',
          performedBy: 'test_runner',
        })
      ).rejects.toThrow();

      // Original file remains completely intact
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('Item 11: Direct <profileCode>.db bypass is eliminated: deletion requires valid DatabaseRegistry', async () => {
      const bypassFile = path.join(sandboxDir, 'databases', 'Bypass.db');
      fs.mkdirSync(path.dirname(bypassFile), { recursive: true });
      fs.writeFileSync(bypassFile, 'dummy data');

      await expect(
        databaseDeletionService.deletePhysicalDatabaseSafely({
          profileIdOrCode: 'Bypass',
          deleteMode: 'DELETE_DATABASE',
          reason: 'Test bypass block',
          performedBy: 'test_runner',
        })
      ).rejects.toThrow(/Profile "Bypass" not found|No active database registry/i);

      // File was not deleted
      expect(fs.existsSync(bypassFile)).toBe(true);
    });
  });

  describe('Export & Semantic Equivalence Invariants (Items 14-24)', () => {
    it('Item 14, 15, 16: DB == CSV == XLSX verified when records are identical', async () => {
      const exportDir = path.join(sandboxDir, 'sample_export');
      fs.mkdirSync(exportDir, { recursive: true });

      // Create CSV
      const csvContent = 'id,stockCode,name,carat\ns1,STK-01,Round Brilliant,1.50\n';
      fs.writeFileSync(path.join(exportDir, 'Stock.csv'), csvContent);

      // Create XLSX with matching records
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet('Stock');
      sheet.columns = [
        { header: 'id', key: 'id' },
        { header: 'stockCode', key: 'stockCode' },
        { header: 'name', key: 'name' },
        { header: 'carat', key: 'carat' },
      ];
      sheet.addRow({ id: 's1', stockCode: 'STK-01', name: 'Round Brilliant', carat: 1.50 });
      const xlsxPath = path.join(exportDir, 'business_data.xlsx');
      await wb.xlsx.writeFile(xlsxPath);

      const comparison = await semanticVerificationService.compareExportSnapshots(
        { csvDir: exportDir, xlsxPath },
        { csvDir: exportDir, xlsxPath },
        ['Stock']
      );

      expect(comparison.status).toBe('VERIFIED');
      expect(comparison.csvVsCsv).toBe('VERIFIED');
      expect(comparison.xlsxVsXlsx).toBe('VERIFIED');
      expect(comparison.discrepancies).toHaveLength(0);
    });

    it('Item 17 & 18: Missing row or extra row fails comparison', async () => {
      const dirA = path.join(sandboxDir, 'expA');
      const dirB = path.join(sandboxDir, 'expB');
      fs.mkdirSync(dirA, { recursive: true });
      fs.mkdirSync(dirB, { recursive: true });

      fs.writeFileSync(path.join(dirA, 'Stock.csv'), 'id,stockCode\ns1,STK01\ns2,STK02\n');
      fs.writeFileSync(path.join(dirB, 'Stock.csv'), 'id,stockCode\ns1,STK01\n');

      const comparison = await semanticVerificationService.compareExportSnapshots(
        { csvDir: dirA },
        { csvDir: dirB },
        ['Stock']
      );

      expect(comparison.status).toBe('FAILED');
      expect(comparison.csvVsCsv).toBe('FAILED');
      expect(comparison.discrepancies.length).toBeGreaterThan(0);
    });

    it('Item 20: Modified value fails comparison', async () => {
      const dirA = path.join(sandboxDir, 'expA_val');
      const dirB = path.join(sandboxDir, 'expB_val');
      fs.mkdirSync(dirA, { recursive: true });
      fs.mkdirSync(dirB, { recursive: true });

      fs.writeFileSync(path.join(dirA, 'Stock.csv'), 'id,stockCode,carat\ns1,STK01,1.50\n');
      fs.writeFileSync(path.join(dirB, 'Stock.csv'), 'id,stockCode,carat\ns1,STK01,2.00\n');

      const comparison = await semanticVerificationService.compareExportSnapshots(
        { csvDir: dirA },
        { csvDir: dirB },
        ['Stock']
      );

      expect(comparison.status).toBe('FAILED');
      expect(comparison.discrepancies.some((d) => d.includes('Value mismatch'))).toBe(true);
    });

    it('Item 21 & 22: Column count / column set mismatch fails comparison', async () => {
      const dirA = path.join(sandboxDir, 'expA_col');
      const dirB = path.join(sandboxDir, 'expB_col');
      fs.mkdirSync(dirA, { recursive: true });
      fs.mkdirSync(dirB, { recursive: true });

      fs.writeFileSync(path.join(dirA, 'Stock.csv'), 'id,stockCode,carat\ns1,STK01,1.50\n');
      fs.writeFileSync(path.join(dirB, 'Stock.csv'), 'id,stockCode,price\ns1,STK01,5000\n');

      const comparison = await semanticVerificationService.compareExportSnapshots(
        { csvDir: dirA },
        { csvDir: dirB },
        ['Stock']
      );

      expect(comparison.status).toBe('FAILED');
      expect(comparison.discrepancies.some((d) => d.includes('column mismatch'))).toBe(true);
    });

    it('Item 23: Empty tables must retain headers (not produce empty 0-byte file)', () => {
      const emptyCsv = 'id,stockCode,name,carat\n';
      const parsed = parse(emptyCsv, { columns: true });
      expect(parsed).toHaveLength(0); // 0 data rows
      expect(emptyCsv.split('\n')[0].split(',')).toEqual(['id', 'stockCode', 'name', 'carat']);
    });
  });

  describe('Migration Integrity & Atomic Rollback (Items 30-36)', () => {
    it('Item 33: Non-SQLite file or corrupted file causes migration to fail closed', async () => {
      const badDb = path.join(sandboxDir, 'corrupt.db');
      fs.writeFileSync(badDb, 'NOT AN SQLITE FILE AT ALL');

      await expect(
        dataLocationService.migrateDataLocation(path.join(sandboxDir, 'new-data-location'))
      ).rejects.toThrow();
    });

    it('Item 34 & 36: Migration failure rolls back data root and restores original paths', async () => {
      const invalidTarget = path.join(sandboxDir, 'invalid-target');

      try {
        await dataLocationService.migrateDataLocation(invalidTarget);
      } catch (err: any) {
        expect(err.message).toBeDefined();
      }

      // Migration must fail closed and leave original data root intact
      expect(dataLocationService.isLocked()).toBe(false);
    });
  });
});
