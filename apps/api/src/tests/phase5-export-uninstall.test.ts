import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { exportService } from '../modules/system/export/export.service';
import { uninstallPreflightService } from '../modules/system/uninstall/uninstall-preflight.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import { getDatabaseTemplatePath } from '../infrastructure/paths';
import { installationService } from '../modules/system/installation.service';
import { ValidationError } from '../errors';

describe('Phase 5 — Export & Uninstall Data Preservation Engine', () => {
  let createdExportPath: string | null = null;
  let createdUninstallPath: string | null = null;
  const testScratchDir = path.resolve('apps/api/test-scratch-export');
  const testDbPath = path.join(testScratchDir, 'export_test.db');

  beforeAll(async () => {
    if (!fs.existsSync(testScratchDir)) {
      fs.mkdirSync(testScratchDir, { recursive: true });
    }
    const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');
    fs.copyFileSync(templateDb, testDbPath);

    const install = await installationService.getOrCreateInstallation();
    await systemPrisma.databaseRegistry.upsert({
      where: { databaseId: 'db_test_export' },
      create: {
        databaseId: 'db_test_export',
        installationId: install.id,
        displayName: 'Test Export Company',
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
        where: { databaseId: 'db_test_export' },
      });
    } catch {}
    if (fs.existsSync(testScratchDir)) {
      try {
        fs.rmSync(testScratchDir, { recursive: true, force: true });
      } catch {}
    }
    if (createdExportPath && fs.existsSync(createdExportPath)) {
      try {
        fs.rmSync(createdExportPath, { recursive: true, force: true });
      } catch {}
    }
    if (createdUninstallPath && fs.existsSync(createdUninstallPath)) {
      try {
        fs.rmSync(createdUninstallPath, { recursive: true, force: true });
      } catch {}
    }
  });

  it('exports business data with manifest, checksums, and zero secret leakage', async () => {
    const result = await exportService.exportBusinessData(
      { format: 'CSV' },
      'tester'
    );

    createdExportPath = result.filePath;
    expect(result.success).toBe(true);
    expect(result.exportId).toMatch(/^exp_/);
    expect(fs.existsSync(result.filePath)).toBe(true);

    // Verify manifest JSON exists and matches
    const manifestPath = path.join(result.filePath, 'export-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.tables.length).toBeGreaterThan(0);

    // Assert zero secret leakage in all exported CSVs and manifest
    const manifestRaw = fs.readFileSync(manifestPath, 'utf-8');
    expect(manifestRaw).not.toContain('pinHash');
    expect(manifestRaw).not.toContain('passwordHash');
    expect(manifestRaw).not.toContain('token');

    for (const table of manifest.tables) {
      const csvPath = path.join(result.filePath, table.fileName);
      expect(fs.existsSync(csvPath)).toBe(true);
      const csvRaw = fs.readFileSync(csvPath, 'utf-8');
      expect(csvRaw).not.toContain('passwordHash');
      expect(csvRaw).not.toContain('pinHash');
    }

    // Verify export bundle verification check
    const verify = await exportService.verifyExport(result.filePath);
    expect(verify.isValid).toBe(true);
    expect(verify.manifestMatches).toBe(true);
    expect(verify.fileCount).toBe(manifest.tables.length);
  });

  it('returns uninstall preflight status confirming data preservation guarantee', async () => {
    const preflight = await uninstallPreflightService.getPreflightStatus();

    expect(preflight.canSafelyUninstall).toBe(true);
    expect(preflight.userAppDataPreservedByDefault).toBe(true);
    expect(preflight.userAppDataDir).toBeDefined();
    expect(preflight.warningMessage).toContain('preserves all customer databases');
  });

  it('requires explicit confirmation to trigger pre-uninstall backup', async () => {
    await expect(
      uninstallPreflightService.createUninstallBackup({
        confirmPreUninstallBackup: false,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('creates and verifies pre-uninstall backup bundle', async () => {
    const res = await uninstallPreflightService.createUninstallBackup(
      {
        confirmPreUninstallBackup: true,
      },
      'uninstall_tester'
    );

    createdUninstallPath = res.exportBundlePath;
    expect(res.success).toBe(true);
    expect(res.databasesBackedUp).toBeGreaterThanOrEqual(1);
    expect(res.sizeBytes).toBeGreaterThan(0);
    expect(fs.existsSync(res.manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(res.manifestPath, 'utf-8'));
    expect(manifest.status).toBe('VERIFIED');
    expect(manifest.dataDirectoryPreserved).toBeDefined();
  });
});
