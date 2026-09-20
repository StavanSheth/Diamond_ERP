import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { preservationService } from '../modules/system/preservation/preservation.service';
import { canonicalizeDatabasePath } from '../modules/system/database/database-path.util';
import { systemPrisma } from '../infrastructure/database/prisma';
import { getDatabaseTemplatePath } from '../infrastructure/paths';

describe('Phase 7 — Windows Specific Paths & Canonicalization', () => {
  const baseScratch = path.resolve('apps/api/test-scratch-phase7-winpaths');
  const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');

  // Specific Windows test paths
  const spacesDir = path.join(baseScratch, 'Test User Folder With Spaces', 'Sub Dir');
  const unicodeDir = path.join(baseScratch, 'Diamond_测试_ダイヤモンド', 'Data');
  const nestedDir = path.join(baseScratch, 'Nested', 'Level1', 'Level2', 'Target');

  beforeAll(async () => {
    if (!fs.existsSync(baseScratch)) {
      fs.mkdirSync(baseScratch, { recursive: true });
    }
    fs.mkdirSync(spacesDir, { recursive: true });
    fs.mkdirSync(unicodeDir, { recursive: true });
    fs.mkdirSync(nestedDir, { recursive: true });

    let inst = await systemPrisma.installation.findFirst();
    if (!inst) {
      inst = await systemPrisma.installation.create({
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

  afterAll(async () => {
    if (fs.existsSync(baseScratch)) {
      try {
        fs.rmSync(baseScratch, { recursive: true, force: true });
      } catch {}
    }
  });

  it('Section 55: canonicalizeDatabasePath handles mixed case and relative paths consistently', () => {
    const p1 = 'c:\\projects\\erp\\test\\sample.db';
    const p2 = 'C:\\PROJECTS\\ERP\\TEST\\SAMPLE.DB';
    const p3 = 'C:/Projects/ERP/Test/sample.db';

    const c1 = canonicalizeDatabasePath(p1);
    const c2 = canonicalizeDatabasePath(p2);
    const c3 = canonicalizeDatabasePath(p3);

    expect(c1.valid).toBe(true);
    expect(c2.valid).toBe(true);
    expect(c3.valid).toBe(true);
    expect(c1.canonicalPath.toLowerCase()).toBe(c2.canonicalPath.toLowerCase());
    expect(c1.canonicalPath.toLowerCase()).toBe(c3.canonicalPath.toLowerCase());
    expect(c1.canonicalPath).not.toContain('/'); // Windows standard separator
  });

  it('Section 55: handles export and preservation in directories with spaces', async () => {
    const dbWithSpaces = path.join(spacesDir, 'Customer Database With Spaces.db');
    fs.copyFileSync(templateDb, dbWithSpaces);

    const exportDest = path.join(spacesDir, 'Export Target Folder');
    const pkg = await preservationService.createPreservationPackage({
      databasePath: dbWithSpaces,
      destinationDir: exportDest,
      confirmPreservation: true,
    });

    expect(pkg.status).toBe('VERIFIED');
    expect(fs.existsSync(pkg.destinationPath)).toBe(true);
    expect(fs.existsSync(pkg.databaseBackupPath!)).toBe(true);
    expect(fs.existsSync(pkg.csvExportPath!)).toBe(true);
    expect(fs.existsSync(pkg.xlsxExportPath!)).toBe(true);

    const verifyRes = await preservationService.verifyPreservationPackage(pkg.packageId);
    expect(verifyRes.verified).toBe(true);
  });

  it('Section 55: handles export and preservation in Unicode paths', async () => {
    const unicodeDb = path.join(unicodeDir, '宝石_diamond_商事.db');
    fs.copyFileSync(templateDb, unicodeDb);

    const unicodeExportDest = path.join(unicodeDir, '保存先_Destination');
    const pkg = await preservationService.createPreservationPackage({
      databasePath: unicodeDb,
      destinationDir: unicodeExportDest,
      confirmPreservation: true,
    });

    expect(pkg.status).toBe('VERIFIED');
    expect(fs.existsSync(pkg.destinationPath)).toBe(true);

    const verifyRes = await preservationService.verifyPreservationPackage(pkg.packageId);
    expect(verifyRes.verified).toBe(true);
  });

  it('Section 55: handles deeply nested long folder paths', async () => {
    const deepDb = path.join(nestedDir, 'deep_customer.db');
    fs.copyFileSync(templateDb, deepDb);

    const deepExportDest = path.join(nestedDir, 'Preservation_Output');
    const pkg = await preservationService.createPreservationPackage({
      databasePath: deepDb,
      destinationDir: deepExportDest,
      confirmPreservation: true,
    });

    expect(pkg.status).toBe('VERIFIED');
    expect(fs.existsSync(pkg.destinationPath)).toBe(true);

    const verifyRes = await preservationService.verifyPreservationPackage(pkg.packageId);
    expect(verifyRes.verified).toBe(true);
  });
});
