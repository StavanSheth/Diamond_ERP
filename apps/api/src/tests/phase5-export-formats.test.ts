import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { exportService } from '../modules/system/export/export.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import {
  getControlDbPath,
  getDatabaseTemplatePath,
} from '../infrastructure/paths';
import { installationService } from '../modules/system/installation.service';
import { ValidationError } from '../errors';

describe('Phase 5 — Export Formats (CSV, XLSX, SQLITE), Integrity & Security Engine', () => {
  const testScratchDir = path.resolve('apps/api/test-scratch-formats');
  const testDbPath = path.join(testScratchDir, 'formats_test.db');
  let createdExportPaths: string[] = [];

  beforeAll(async () => {
    if (!fs.existsSync(testScratchDir)) {
      fs.mkdirSync(testScratchDir, { recursive: true });
    }
    const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');
    fs.copyFileSync(templateDb, testDbPath);

    const install = await installationService.getOrCreateInstallation();
    await systemPrisma.databaseRegistry.upsert({
      where: { databaseId: 'db_test_formats' },
      create: {
        databaseId: 'db_test_formats',
        installationId: install.id,
        displayName: 'Formats Company',
        canonicalPath: path.resolve(testDbPath),
        status: 'ACTIVE',
        schemaVersion: 1,
      },
      update: {
        canonicalPath: path.resolve(testDbPath),
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    try {
      await systemPrisma.databaseRegistry.deleteMany({
        where: { databaseId: 'db_test_formats' },
      });
    } catch {}

    for (const expPath of createdExportPaths) {
      if (fs.existsSync(expPath)) {
        try {
          fs.rmSync(expPath, { recursive: true, force: true });
        } catch {}
      }
    }

    if (fs.existsSync(testScratchDir)) {
      try {
        fs.rmSync(testScratchDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('strictly rejects template.db and system.db from export', async () => {
    const controlDb = getControlDbPath();
    await expect(
      exportService.exportBusinessData({ format: 'CSV', databasePath: controlDb })
    ).rejects.toThrow(ValidationError);

    const templateDb = getDatabaseTemplatePath();
    if (templateDb) {
      await expect(
        exportService.exportBusinessData({ format: 'CSV', databasePath: templateDb })
      ).rejects.toThrow(ValidationError);
    }
  });

  it('exports business data as Excel (XLSX) workbook with manifest and checksums', async () => {
    const result = await exportService.exportBusinessData(
      { format: 'XLSX', databasePath: testDbPath },
      'tester'
    );
    createdExportPaths.push(result.filePath);

    expect(result.success).toBe(true);
    expect(result.exportId).toMatch(/^exp_/);
    expect(fs.existsSync(result.filePath)).toBe(true);

    const xlsxFile = path.join(result.filePath, 'business_data.xlsx');
    expect(fs.existsSync(xlsxFile)).toBe(true);
    expect(fs.statSync(xlsxFile).size).toBeGreaterThan(0);

    const manifestPath = path.join(result.filePath, 'export-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.format).toBe('XLSX');
    expect(manifest.tableCount).toBeGreaterThanOrEqual(1);
    expect(manifest.failedTableCount).toBe(0);

    // Verify verification check on XLSX export
    const verify = await exportService.verifyExport(result.filePath);
    expect(verify.isValid).toBe(true);
    expect(verify.manifestMatches).toBe(true);
  });

  it('exports business data as clean standalone SQLite snapshot', async () => {
    const result = await exportService.exportBusinessData(
      { format: 'SQLITE', databasePath: testDbPath },
      'tester'
    );
    createdExportPaths.push(result.filePath);

    expect(result.success).toBe(true);
    expect(result.exportId).toMatch(/^exp_/);

    const sqliteFile = path.join(result.filePath, 'business_data.db');
    expect(fs.existsSync(sqliteFile)).toBe(true);
    expect(fs.statSync(sqliteFile).size).toBeGreaterThan(0);

    const manifestPath = path.join(result.filePath, 'export-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.format).toBe('SQLITE');

    const verify = await exportService.verifyExport(result.filePath);
    expect(verify.isValid).toBe(true);
  });

  it('detects missing files or checksum tampering during verifyExport', async () => {
    const result = await exportService.exportBusinessData(
      { format: 'CSV', databasePath: testDbPath },
      'tester'
    );
    createdExportPaths.push(result.filePath);

    // Tamper with one of the CSV files
    const manifestPath = path.join(result.filePath, 'export-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const firstTable = manifest.tables[0];
    const targetFile = path.join(result.filePath, firstTable.fileName);

    fs.appendFileSync(targetFile, '\nTAMPERED_CONTENT_ROW');

    const verify = await exportService.verifyExport(result.filePath);
    expect(verify.isValid).toBe(false);
    expect(verify.manifestMatches).toBe(false);
  });
});
