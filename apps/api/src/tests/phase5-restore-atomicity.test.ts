import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { recoveryService } from '../modules/system/recovery/recovery.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import {
  getDatabasesDir,
  getDatabaseTemplatePath,
} from '../infrastructure/paths';
import { ValidationError } from '../errors';

describe('Phase 5 — Restore Atomicity, Rollback Protection & Crash Reconciliation', () => {
  const testDir = path.resolve('apps/api/test-scratch-atomicity');
  const validCandidatePath = path.join(testDir, 'valid_candidate.db');
  const corruptCandidatePath = path.join(testDir, 'corrupt_candidate.db');
  const activeDbPath = path.join(getDatabasesDir(), 'atomicity_target.db');

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');
    fs.copyFileSync(templateDb, validCandidatePath);
    fs.copyFileSync(templateDb, activeDbPath);

    // Create corrupt candidate (non-SQLite content)
    fs.writeFileSync(corruptCandidatePath, 'CORRUPT_INVALID_SQLITE_PAYLOAD');
  });

  afterAll(async () => {
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
    if (fs.existsSync(activeDbPath)) {
      try {
        fs.unlinkSync(activeDbPath);
      } catch {}
    }
    try {
      await systemPrisma.databaseRegistry.deleteMany({
        where: { databaseId: 'db_atomicity_target' },
      });
    } catch {}
  });

  it('rejects corrupt candidate during prepareRestore', async () => {
    await expect(
      recoveryService.prepareRestore({
        candidatePath: corruptCandidatePath,
        targetProfileCode: 'atomicity_target',
      })
    ).rejects.toThrow();
  });

  it('prevents restoring candidate with newer unsupported schema version', async () => {
    // Create candidate with schemaVersion = 99 in manifest
    const manifestCandidatePath = path.join(testDir, 'future_candidate.db');
    const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');
    fs.copyFileSync(templateDb, manifestCandidatePath);

    const manifestPath = `${manifestCandidatePath}.manifest.json`;
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        formatVersion: 1,
        backupId: 'bkp_future',
        database: { schemaVersion: 99 },
        artifact: { sha256: 'dummy' },
        verification: { sqliteIntegrity: 'ok' },
      })
    );

    const inspection = await recoveryService.inspectCandidate(manifestCandidatePath);
    expect(inspection.suitability).toBe('UNSUPPORTED');
    expect(inspection.conflictReason).toBe('UNSUPPORTED_SCHEMA_VERSION_NEWER');

    await expect(
      recoveryService.prepareRestore({
        candidatePath: manifestCandidatePath,
        targetProfileCode: 'atomicity_target',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('atomically swaps and verifies restore, cleaning up swap file', async () => {
    const preview = await recoveryService.prepareRestore({
      candidatePath: validCandidatePath,
      targetProfileCode: 'atomicity_target',
    });

    const result = await recoveryService.confirmRestore(
      {
        restoreId: preview.restoreId,
        confirmDestructiveOverwrite: true,
        targetProfileCode: 'atomicity_target',
      },
      'admin'
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('VERIFIED');
    expect(result.rollbackBackupCreated).toBe(true);
    expect(fs.existsSync(activeDbPath)).toBe(true);

    // Swap old files should be cleaned up
    const databasesDir = getDatabasesDir();
    const swapFiles = fs
      .readdirSync(databasesDir)
      .filter((f) => f.includes('atomicity_target.db.swap_old_'));
    expect(swapFiles.length).toBe(0);
  });

  it('reconciles interrupted swap files on startup without data loss', async () => {
    const databasesDir = getDatabasesDir();
    const testSwapFile = path.join(databasesDir, `reconcile_test.db.swap_old_${Date.now()}`);
    const activeTestDb = path.join(databasesDir, 'reconcile_test.db');

    // Simulate situation where activeTestDb was removed mid-activation and only swap exists
    fs.writeFileSync(testSwapFile, 'SIMULATED_SWAP_DATABASE_PAYLOAD');
    if (fs.existsSync(activeTestDb)) fs.unlinkSync(activeTestDb);

    const reconciliation = await recoveryService.reconcileInterruptedRestores();
    expect(reconciliation.reconciledCount).toBeGreaterThanOrEqual(1);

    // Active DB must have been recovered from swap!
    expect(fs.existsSync(activeTestDb)).toBe(true);
    expect(fs.existsSync(testSwapFile)).toBe(false);

    // Clean up
    fs.unlinkSync(activeTestDb);
  });

  it('reconciles interrupted RestoreRecord rows on startup', async () => {
    const install = await systemPrisma.installation.findFirst({ where: { status: 'ACTIVE' } });
    const interruptedRestoreId = `rst_interrupted_${Date.now()}`;

    // Create an interrupted restore record in ACTIVATING state
    await systemPrisma.restoreRecord.create({
      data: {
        restoreId: interruptedRestoreId,
        installationId: install!.id,
        targetDatabaseId: 'db_atomicity_target',
        candidatePath: validCandidatePath,
        status: 'ACTIVATING',
        schemaVersion: 1,
      },
    });

    const reconciliation = await recoveryService.reconcileInterruptedRestores();
    expect(reconciliation.reconciledCount).toBeGreaterThanOrEqual(1);

    const updated = await systemPrisma.restoreRecord.findUnique({
      where: { restoreId: interruptedRestoreId },
    });
    expect(['FAILED', 'ROLLED_BACK']).toContain(updated?.status);
  });
});
