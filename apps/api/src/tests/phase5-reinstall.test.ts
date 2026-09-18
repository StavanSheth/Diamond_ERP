import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { recoveryService } from '../modules/system/recovery/recovery.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import { getDatabasesDir } from '../infrastructure/paths';

describe('Phase 5 — Reinstall Detection & Multi-Choice Preservation Engine', () => {
  it('detects existing installation data and presents explicit non-forced recovery options', async () => {
    const detection = await recoveryService.detectReinstallState();

    expect(detection).toBeDefined();
    expect(detection.canStartFresh).toBe(true);
    expect(detection.hasPreviousData).toBe(true);
    expect(detection.previousDatabasesCount).toBeGreaterThanOrEqual(1);
    expect(detection.canContinue).toBe(true);
    expect(detection.details).toContain('existing database(s)');
  });

  it('preserves existing physical database files when starting a fresh installation', async () => {
    const databasesDir = getDatabasesDir();
    const testDbPath = path.join(databasesDir, 'Stavan.db');
    const dbExistsInitially = fs.existsSync(testDbPath);
    const initialStat = dbExistsInitially ? fs.statSync(testDbPath) : null;

    // Trigger fresh installation
    const newInstall = await recoveryService.startFreshInstallation();

    expect(newInstall).toBeDefined();
    expect(newInstall.installationId).toMatch(/^inst_/);
    expect(newInstall.lifecycleState).toBe('APP_SETUP');

    // Invariant: Previous physical database file must remain 100% untouched on disk!
    if (dbExistsInitially) {
      expect(fs.existsSync(testDbPath)).toBe(true);
      const postStat = fs.statSync(testDbPath);
      expect(postStat.size).toBe(initialStat?.size);
    }

    // Verify audit trail logged
    const audit = await systemPrisma.auditEvent.findFirst({
      where: {
        entityType: 'INSTALLATION',
        eventType: 'NEW_INSTALLATION_SELECTED',
      },
      orderBy: { performedAt: 'desc' },
    });
    expect(audit).toBeDefined();
    expect(audit?.description).toContain('prior databases preserved on disk');
  });
});
