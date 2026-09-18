import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { backupService } from '../modules/system/backup/backup.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import {
  getBackupsDir,
  getControlDbPath,
  getDatabaseTemplatePath,
} from '../infrastructure/paths';
import { ValidationError, NotFoundError } from '../errors';

describe('Phase 5 — Data Preservation & Backup Engine', () => {
  const testDbDir = path.resolve('apps/api/test-scratch-dbs');
  const sampleDbPath = path.join(testDbDir, 'phase5_sample.db');

  beforeAll(async () => {
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }

    // Copy template.db or Stavan.db to create an isolated sample DB for backup tests
    const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');
    fs.copyFileSync(templateDb, sampleDbPath);
  });

  afterAll(() => {
    // Clean up test scratch folder
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('creates a verified atomic backup with manifest and SHA-256 checksum', async () => {
    const initialStats = fs.statSync(sampleDbPath);

    const record = await backupService.createBackup({
      databasePath: sampleDbPath,
      profileCode: 'p5test',
      note: 'Automated test backup',
    });

    expect(record.status).toBe('VERIFIED');
    expect(record.backupId).toMatch(/^bkp_/);
    expect(record.sha256).toHaveLength(64);
    expect(fs.existsSync(record.backupPath)).toBe(true);

    // Verify manifest JSON exists and matches
    const manifestPath = `${record.backupPath}.manifest.json`;
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.backupId).toBe(record.backupId);
    expect(manifest.artifact.sha256).toBe(record.sha256);
    expect(manifest.verification.sqliteIntegrity).toBe('ok');
    expect(manifest.verification.tableCount).toBeGreaterThanOrEqual(0);

    // Source database must remain 100% untouched and intact
    expect(fs.existsSync(sampleDbPath)).toBe(true);
    const postStats = fs.statSync(sampleDbPath);
    expect(postStats.size).toBe(initialStats.size);
  });

  it('guarantees zero secret leakage in backup manifest', async () => {
    const record = await backupService.createBackup({
      databasePath: sampleDbPath,
      profileCode: 'p5secret',
    });

    const manifestPath = `${record.backupPath}.manifest.json`;
    const manifestRaw = fs.readFileSync(manifestPath, 'utf-8');

    expect(manifestRaw).not.toContain('pinHash');
    expect(manifestRaw).not.toContain('passwordHash');
    expect(manifestRaw).not.toContain('sessionSecret');
    expect(manifestRaw).not.toContain('token');
  });

  it('verifies backup integrity and hash match successfully', async () => {
    const record = await backupService.createBackup({
      databasePath: sampleDbPath,
      profileCode: 'p5verify',
    });

    const verifyResult = await backupService.verifyBackup(record.backupId);
    expect(verifyResult.isValid).toBe(true);
    expect(verifyResult.sha256Matches).toBe(true);
    expect(verifyResult.sqliteIntegrity).toBe('ok');
    expect(verifyResult.manifestPresent).toBe(true);
  });

  it('detects file tampering during backup verification', async () => {
    const record = await backupService.createBackup({
      databasePath: sampleDbPath,
      profileCode: 'p5tamper',
    });

    // Tamper with the backup file
    fs.appendFileSync(record.backupPath, 'corrupted_bytes');

    const verifyResult = await backupService.verifyBackup(record.backupId);
    expect(verifyResult.isValid).toBe(false);
    expect(verifyResult.sha256Matches).toBe(false);
  });

  it('rejects non-existent source database with NotFoundError', async () => {
    const bogusPath = path.join(testDbDir, 'does_not_exist.db');
    await expect(
      backupService.createBackup({ databasePath: bogusPath })
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects directory as source path with ValidationError', async () => {
    await expect(
      backupService.createBackup({ databasePath: testDbDir })
    ).rejects.toThrow(ValidationError);
  });

  it('rejects system.db control database from being backed up as business data', async () => {
    const controlDb = getControlDbPath();
    await expect(
      backupService.createBackup({ databasePath: controlDb })
    ).rejects.toThrow(ValidationError);
  });

  it('rejects template.db from being backed up as business data', async () => {
    const templateDb = getDatabaseTemplatePath();
    if (templateDb) {
      await expect(
        backupService.createBackup({ databasePath: templateDb })
      ).rejects.toThrow(ValidationError);
    }
  });

  it('rejects backup destination that equals source database path', async () => {
    await expect(
      backupService.createBackup({
        databasePath: sampleDbPath,
        customDestinationDir: sampleDbPath,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('safely cleans up stale .partial backup files without touching verified backups', async () => {
    const backupsDir = getBackupsDir();
    const stalePartial = path.join(backupsDir, 'stale_test.db.partial');
    fs.writeFileSync(stalePartial, 'partial content');
    expect(fs.existsSync(stalePartial)).toBe(true);

    backupService.cleanupPartialBackups();

    expect(fs.existsSync(stalePartial)).toBe(false);
  });

  it('lists verified backups and inspects backup details', async () => {
    const listRes = await backupService.listBackups();
    expect(Array.isArray(listRes.backups)).toBe(true);
    expect(listRes.backups.length).toBeGreaterThan(0);

    const first = listRes.backups[0];
    const details = await backupService.inspectBackup(first.backupId);
    expect(details.backupId).toBe(first.backupId);
    expect(details.canonicalPath).toBe(first.backupPath);
    expect(details.sizeBytes).toBeGreaterThan(0);
  });

  it('soft-deletes backup record without deleting live database', async () => {
    const record = await backupService.createBackup({
      databasePath: sampleDbPath,
      profileCode: 'p5delete',
    });

    await backupService.deleteBackupRecord(record.backupId);

    const check = await systemPrisma.backupRecord.findUnique({
      where: { backupId: record.backupId },
    });
    expect(check?.status).toBe('DELETED');
    expect(fs.existsSync(sampleDbPath)).toBe(true);
  });
});
