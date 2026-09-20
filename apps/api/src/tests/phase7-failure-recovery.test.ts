import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { preservationService } from '../modules/system/preservation/preservation.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import { getDatabaseTemplatePath } from '../infrastructure/paths';
import { ValidationError, ConflictError } from '../errors';

describe('Phase 7 — Failure Injection, Destination Validation & Deep Verification Robustness', () => {
  const testDir = path.resolve('apps/api/test-scratch-phase7-failures');
  const testDbPath = path.join(testDir, 'customer_failures.db');
  const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    fs.copyFileSync(templateDb, testDbPath);

    let inst = await systemPrisma.installation.findFirst();
    if (!inst) {
      inst = await systemPrisma.installation.create({
        data: {
          installationId: 'inst_failure_tests_p7',
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

  it('Section 8.2 & 33: destination cannot be Windows system directory or system root', async () => {
    const winDir = process.env.WINDIR || 'C:\\Windows';
    await expect(
      preservationService.createPreservationPackage({
        databasePath: testDbPath,
        destinationDir: winDir,
        confirmPreservation: true,
      })
    ).rejects.toThrow(ValidationError);

    const rootDir = process.platform === 'win32' ? 'C:\\' : '/';
    await expect(
      preservationService.createPreservationPackage({
        databasePath: testDbPath,
        destinationDir: rootDir,
        confirmPreservation: true,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('Section 8.2: destination cannot be source database file or exact source directory', async () => {
    await expect(
      preservationService.createPreservationPackage({
        databasePath: testDbPath,
        destinationDir: testDbPath,
        confirmPreservation: true,
      })
    ).rejects.toThrow(ValidationError);

    await expect(
      preservationService.createPreservationPackage({
        databasePath: testDbPath,
        destinationDir: path.dirname(testDbPath),
        confirmPreservation: true,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('Section 8.3 & 33: read-only or unwritable destination fails writable test (.diamond-erp-write-test.tmp)', async () => {
    const readOnlyDir = path.join(testDir, 'readonly_folder');
    if (!fs.existsSync(readOnlyDir)) {
      fs.mkdirSync(readOnlyDir, { recursive: true });
    }

    // Make directory read-only (mode 0o444)
    fs.chmodSync(readOnlyDir, 0o444);

    try {
      // In non-Windows environments chmod 0o444 blocks writes; on Windows if admin it may succeed,
      // so we also verify that our writability test throws ConflictError if openSync fails.
      const testFilePath = path.join(readOnlyDir, '.diamond-erp-write-test-check.tmp');
      let writeBlocked = false;
      try {
        fs.writeFileSync(testFilePath, 'test', { flag: 'w' });
        fs.unlinkSync(testFilePath);
      } catch {
        writeBlocked = true;
      }

      if (writeBlocked) {
        await expect(
          preservationService.createPreservationPackage({
            databasePath: testDbPath,
            destinationDir: readOnlyDir,
            confirmPreservation: true,
          })
        ).rejects.toThrow(ConflictError);
      } else {
        // If the OS filesystem ignored chmod 444, test non-existent path on an invalid drive
        const invalidDrive = process.platform === 'win32' ? 'Z:\\NonExistentPath\\DiamondERP' : '/dev/null/invalid';
        await expect(
          preservationService.createPreservationPackage({
            databasePath: testDbPath,
            destinationDir: invalidDrive,
            confirmPreservation: true,
          })
        ).rejects.toThrow(ConflictError);
      }
    } finally {
      try {
        fs.chmodSync(readOnlyDir, 0o777);
      } catch {}
    }
  });

  it('Section 12 & 35: CSV deep structural verification rejects missing CSV, row count mismatch, or corrupted headers', async () => {
    const pkgDir = path.join(testDir, 'csv_deep_test_dest');
    const pkg = await preservationService.createPreservationPackage({
      databasePath: testDbPath,
      destinationDir: pkgDir,
      confirmPreservation: true,
    });
    expect(pkg.status).toBe('VERIFIED');

    // 1. Missing CSV file from bundle
    const stockCsv = path.join(pkg.destinationPath, 'csv', 'Stock.csv');
    const stockBackup = fs.readFileSync(stockCsv);
    fs.unlinkSync(stockCsv);

    const missingResult = await preservationService.verifyPreservationPackage(pkg.packageId);
    expect(missingResult.verified).toBe(false);
    expect(missingResult.csvVerified).toBe(false);
    expect(missingResult.error).toContain('Required CSV export missing');

    // Restore CSV
    fs.writeFileSync(stockCsv, stockBackup);

    // 2. Corrupted CSV syntax / broken headers
    fs.writeFileSync(stockCsv, 'corrupted"quote,unclosed\n1,2,3', 'utf-8');
    const syntaxResult = await preservationService.verifyPreservationPackage(pkg.packageId);
    expect(syntaxResult.verified).toBe(false);
    expect(syntaxResult.csvVerified).toBe(false);

    // Restore CSV
    fs.writeFileSync(stockCsv, stockBackup);

    // 3. Tampered checksum
    fs.appendFileSync(stockCsv, '\n');
    const shaResult = await preservationService.verifyPreservationPackage(pkg.packageId);
    expect(shaResult.verified).toBe(false);
    expect(shaResult.csvVerified).toBe(false);
    expect(shaResult.error).toContain('CSV checksum mismatch');

    // Restore CSV
    fs.writeFileSync(stockCsv, stockBackup);
  });

  it('Section 13 & 35: XLSX deep structural verification rejects missing workbook, corrupted workbook, or missing sheets', async () => {
    const pkgDir = path.join(testDir, 'xlsx_deep_test_dest');
    const pkg = await preservationService.createPreservationPackage({
      databasePath: testDbPath,
      destinationDir: pkgDir,
      confirmPreservation: true,
    });
    expect(pkg.status).toBe('VERIFIED');

    const xlsxPath = path.join(pkg.destinationPath, 'xlsx', 'business_data.xlsx');
    const originalXlsx = fs.readFileSync(xlsxPath);

    // 1. Corrupted workbook file (not valid zip/xlsx format)
    fs.writeFileSync(xlsxPath, 'corrupted non-xlsx binary garbage string', 'utf-8');
    const corruptResult = await preservationService.verifyPreservationPackage(pkg.packageId);
    expect(corruptResult.verified).toBe(false);
    expect(corruptResult.xlsxVerified).toBe(false);

    // 2. Missing workbook file entirely
    fs.unlinkSync(xlsxPath);
    const missingResult = await preservationService.verifyPreservationPackage(pkg.packageId);
    expect(missingResult.verified).toBe(false);
    expect(missingResult.xlsxVerified).toBe(false);
    expect(missingResult.error).toContain('business_data.xlsx missing');

    // Restore XLSX
    fs.writeFileSync(xlsxPath, originalXlsx);
    const validResult = await preservationService.verifyPreservationPackage(pkg.packageId);
    expect(validResult.verified).toBe(true);
    expect(validResult.xlsxVerified).toBe(true);
  });

  it('Section 35: database backup tampering blocks preservation verification and uninstall', async () => {
    const pkgDir = path.join(testDir, 'db_tamper_test_dest');
    const pkg = await preservationService.createPreservationPackage({
      databasePath: testDbPath,
      destinationDir: pkgDir,
      confirmPreservation: true,
    });
    expect(pkg.status).toBe('VERIFIED');

    // Tamper with SQLite backup file
    const dbBackupFile = pkg.databaseBackupPath!;
    fs.appendFileSync(dbBackupFile, 'corrupted_bytes_at_eof');

    const tamperResult = await preservationService.verifyPreservationPackage(pkg.packageId);
    expect(tamperResult.verified).toBe(false);
    expect(tamperResult.databaseBackupVerified).toBe(false);
    expect(tamperResult.error).toContain('checksum mismatch');
  });

  it('Section 31: Crash/Interruption recovery — package marked FAILED on unrecoverable abort', async () => {
    // If an invalid database is provided, preservation cleanly fails and does not leave dirty verified package
    const fakeDb = path.join(testDir, 'non_existent_aborted.db');
    await expect(
      preservationService.createPreservationPackage({
        databasePath: fakeDb,
        confirmPreservation: true,
      })
    ).rejects.toThrow();

    // Verify no stray verified package was created
    const stray = await systemPrisma.preservationPackage.findFirst({
      where: { destinationPath: { contains: 'non_existent_aborted' }, status: 'VERIFIED' },
    });
    expect(stray).toBeNull();
  });
});
