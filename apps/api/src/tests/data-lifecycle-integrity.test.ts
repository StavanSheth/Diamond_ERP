import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  getDataRoot,
  getDatabaseRoot,
  getBackupRoot,
  getExportRoot,
  getUploadRoot,
  getLogRoot,
  getRecoveryRoot,
  getSystemDatabasePath,
  setCustomDataRoot,
} from '../infrastructure/data/data-paths';
import { dataLocationService } from '../infrastructure/data/data-location.service';
import { semanticVerificationService } from '../modules/system/export/semantic-verification.service';

describe('Data Lifecycle & Location Integrity', () => {
  const testRoot = path.resolve(__dirname, '../../test-lifecycle-sandbox');

  beforeEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(testRoot, { recursive: true });
    setCustomDataRoot(testRoot);
  });

  afterEach(() => {
    setCustomDataRoot(null);
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  describe('Centralized Data Paths Authority (Sections 4, 5, 6)', () => {
    it('resolves all customer data directories relative to authoritative root', () => {
      expect(getDataRoot()).toBe(testRoot);
      expect(getDatabaseRoot()).toBe(path.join(testRoot, 'databases'));
      expect(getBackupRoot()).toBe(path.join(testRoot, 'backups'));
      expect(getExportRoot()).toBe(path.join(testRoot, 'exports'));
      expect(getUploadRoot()).toBe(path.join(testRoot, 'uploads', 'certs'));
      expect(getLogRoot()).toBe(path.join(testRoot, 'logs'));
      expect(getRecoveryRoot()).toBe(path.join(testRoot, 'recovery'));
      expect(getSystemDatabasePath()).toBe(path.join(testRoot, 'system.db'));
    });
  });

  describe('Disk Space Safety Checks (Section 25)', () => {
    it('assesses local disk space and produces valid threshold status', () => {
      const space = dataLocationService.checkDiskSpace(testRoot);
      expect(space.totalBytes).toBeGreaterThan(0);
      expect(space.freeBytes).toBeGreaterThan(0);
      expect(space.freeGb).toBeGreaterThan(0);
      expect(['HEALTHY', 'LOW', 'CRITICAL', 'INSUFFICIENT']).toContain(space.status);
    });

    it('asserts disk space available when free space exceeds requirement', () => {
      expect(() => {
        dataLocationService.assertDiskSpaceAvailable(1024 * 1024, testRoot);
      }).not.toThrow();
    });

    it('rejects operation when required space exceeds available capacity', () => {
      expect(() => {
        dataLocationService.assertDiskSpaceAvailable(Number.MAX_SAFE_INTEGER, testRoot);
      }).toThrow(/Insufficient disk space/);
    });
  });

  describe('Safe Data Location Migration Workflow (Sections 7 & 8)', () => {
    it('rejects invalid or non-absolute target migration paths', async () => {
      await expect(dataLocationService.migrateDataLocation('')).rejects.toThrow(/non-empty string/);
      await expect(dataLocationService.migrateDataLocation('relative/path')).rejects.toThrow(/absolute path/);
    });

    it('rejects destination path collision with source directory', async () => {
      // Identical path
      await expect(dataLocationService.migrateDataLocation(testRoot)).rejects.toThrow(/cannot be identical/);

      // Subdirectory of source
      const nestedSubdir = path.join(testRoot, 'nested-target');
      await expect(dataLocationService.migrateDataLocation(nestedSubdir)).rejects.toThrow(/cannot be a subdirectory/);
    });
  });

  describe('Export Semantic Equivalence (Section 31 & 54)', () => {
    it('verifies CSV and XLSX snapshots match across identical records', async () => {
      const csvDirA = path.join(testRoot, 'exportA_csv');
      const csvDirB = path.join(testRoot, 'exportB_csv');
      fs.mkdirSync(csvDirA, { recursive: true });
      fs.mkdirSync(csvDirB, { recursive: true });

      const sampleStockCsv = 'id,stockCode,carat,costPrice\nitem1,STK001,2.50,50000\n';
      fs.writeFileSync(path.join(csvDirA, 'Stock.csv'), sampleStockCsv);
      fs.writeFileSync(path.join(csvDirB, 'Stock.csv'), sampleStockCsv);

      const comparison = await semanticVerificationService.compareExports(
        csvDirA,
        path.join(testRoot, 'nonexistentA.xlsx'),
        csvDirB,
        path.join(testRoot, 'nonexistentB.xlsx'),
        ['Stock']
      );

      expect(comparison.csvVsCsv).toBe('VERIFIED');
      expect(comparison.discrepancies.length).toBe(0);
    });

    it('detects discrepancies if one export has missing or different records', async () => {
      const csvDirA = path.join(testRoot, 'exportA_csv');
      const csvDirB = path.join(testRoot, 'exportB_csv');
      fs.mkdirSync(csvDirA, { recursive: true });
      fs.mkdirSync(csvDirB, { recursive: true });

      fs.writeFileSync(path.join(csvDirA, 'Stock.csv'), 'id,stockCode,carat\nitem1,STK001,2.50\nitem2,STK002,1.20\n');
      fs.writeFileSync(path.join(csvDirB, 'Stock.csv'), 'id,stockCode,carat\nitem1,STK001,2.50\n');

      const comparison = await semanticVerificationService.compareExports(
        csvDirA,
        path.join(testRoot, 'nonexistentA.xlsx'),
        csvDirB,
        path.join(testRoot, 'nonexistentB.xlsx'),
        ['Stock']
      );

      expect(comparison.csvVsCsv).toBe('FAILED');
      expect(comparison.discrepancies.length).toBeGreaterThan(0);
      expect(comparison.discrepancies[0]).toContain('Stock');
    });
  });
});
