import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { recoveryService } from '../modules/system/recovery/recovery.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import {
  getDatabasesDir,
  getControlDbPath,
  getDatabaseTemplatePath,
} from '../infrastructure/paths';
import { ValidationError } from '../errors';

describe('Phase 5 — Recovery & Staged Restore Engine', () => {
  const testDir = path.resolve('apps/api/test-scratch-recovery');
  const candidateDbPath = path.join(testDir, 'recovery_candidate.db');
  const targetDbPath = path.join(getDatabasesDir(), 'test_target_restore.db');

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');
    fs.copyFileSync(templateDb, candidateDbPath);
    fs.copyFileSync(templateDb, targetDbPath);
  });

  afterAll(async () => {
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
    if (fs.existsSync(targetDbPath)) {
      try {
        fs.unlinkSync(targetDbPath);
      } catch {}
    }
    try {
      await systemPrisma.databaseRegistry.deleteMany({
        where: { databaseId: 'db_test_target_restore' },
      });
    } catch {}
  });

  it('discovers candidates bounded to backups and databases without scanning arbitrary drives', async () => {
    const res = await recoveryService.discoverCandidates(testDir);
    expect(res.candidates.length).toBeGreaterThan(0);

    // Invariant: Never contains system.db or template.db or .partial files
    const controlDb = getControlDbPath().toLowerCase();
    const templateDb = getDatabaseTemplatePath()?.toLowerCase() || '';

    for (const c of res.candidates) {
      expect(c.canonicalPath.toLowerCase()).not.toBe(controlDb);
      expect(c.canonicalPath.toLowerCase()).not.toBe(templateDb);
      expect(c.canonicalPath).not.toContain('.partial');
    }
  }, 15000);

  it('inspects recovery candidate and calculates suitability', async () => {
    const inspection = await recoveryService.inspectCandidate(candidateDbPath);
    expect(inspection.canonicalPath).toBe(path.resolve(candidateDbPath));
    expect(inspection.status).toBe('ACTIVE');
    expect(inspection.ownershipStatus).toBe('EXTERNAL_SOURCE');
    expect(inspection.suitability).toBe('REQUIRES_CONFIRMATION');
    expect(inspection.sqliteIntegrity).toBe('ok');
    expect(inspection.tableCount).toBeGreaterThanOrEqual(0);
  });

  it('rejects system.db and template.db from inspection', async () => {
    const controlDb = getControlDbPath();
    await expect(recoveryService.inspectCandidate(controlDb)).rejects.toThrow(ValidationError);

    const templateDb = getDatabaseTemplatePath();
    if (templateDb) {
      await expect(recoveryService.inspectCandidate(templateDb)).rejects.toThrow(ValidationError);
    }
  });

  it('prepares staged restore without modifying the original backup artifact', async () => {
    const originalStats = fs.statSync(candidateDbPath);

    const preview = await recoveryService.prepareRestore({
      candidatePath: candidateDbPath,
      targetProfileCode: 'test_target_restore',
    });

    expect(preview.restoreId).toMatch(/^rst_/);
    expect(preview.status).toBe('VALIDATED');
    expect(preview.requiresRollbackBackup).toBe(true);
    expect(fs.existsSync(preview.stagedPath)).toBe(true);

    // Original backup must remain 100% immutable and untouched
    expect(fs.existsSync(candidateDbPath)).toBe(true);
    const postStats = fs.statSync(candidateDbPath);
    expect(postStats.size).toBe(originalStats.size);
  });

  it('requires explicit confirmation checkbox before executing restore', async () => {
    const preview = await recoveryService.prepareRestore({
      candidatePath: candidateDbPath,
      targetProfileCode: 'test_target_restore',
    });

    await expect(
      recoveryService.confirmRestore({
        restoreId: preview.restoreId,
        confirmDestructiveOverwrite: false,
        targetProfileCode: 'test_target_restore',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('executes staged restore with mandatory verified rollback backup creation', async () => {
    const preview = await recoveryService.prepareRestore({
      candidatePath: candidateDbPath,
      targetProfileCode: 'test_target_restore',
    });

    const result = await recoveryService.confirmRestore(
      {
        restoreId: preview.restoreId,
        confirmDestructiveOverwrite: true,
        targetProfileCode: 'test_target_restore',
      },
      'admin_tester'
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('VERIFIED');
    expect(result.rollbackBackupCreated).toBe(true);
    expect(result.rollbackBackupPath).toBeDefined();
    expect(fs.existsSync(result.rollbackBackupPath!)).toBe(true);

    // Verify rollback backup record exists in DB
    const rollbackRecord = await systemPrisma.backupRecord.findFirst({
      where: { backupPath: result.rollbackBackupPath! },
    });
    expect(rollbackRecord?.status).toBe('VERIFIED');
    expect(rollbackRecord?.backupType).toBe('PRE_RESTORE');

    // Staged folder must be cleaned up
    expect(fs.existsSync(preview.stagedPath)).toBe(false);
  });

  it('rejects candidate database when source equals target database path', async () => {
    await expect(
      recoveryService.prepareRestore({
        candidatePath: targetDbPath,
        targetProfileCode: 'test_target_restore',
      })
    ).rejects.toThrow(ValidationError);
  });
});
