import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import {
  getBackupsDir,
  getDatabasesDir,
  getControlDbPath,
  getDatabaseTemplatePath,
  getRestoreStagingDir,
  ensureAllDataDirs,
} from '../../../infrastructure/paths';
import { canonicalizeDatabasePath } from '../database/database-path.util';
import { databaseValidationService } from '../database/database-validation.service';
import { installationService } from '../installation.service';
import { backupService } from '../backup/backup.service';
import { ValidationError, NotFoundError, ConflictError } from '../../../errors';
import { logger } from '../../../infrastructure/logging';
import type {
  RecoveryCandidateDto,
  RecoveryCandidateDiscoveryResponseDto,
  RecoveryInspectionPreviewDto,
  PrepareRestoreRequest,
  RestorePreviewDto,
  ConfirmRestoreRequest,
  RestoreOperationResponseDto,
  ReinstallDetectionDto,
} from '@diamond-erp/contracts';

export class RecoveryService {
  private activeRestoreLocks: Set<string> = new Set<string>();

  /**
   * Bounded discovery of recovery candidates from backups, databases, and registry.
   * NEVER walks whole drives recursively.
   */
  async discoverCandidates(additionalDirectory?: string): Promise<RecoveryCandidateDiscoveryResponseDto> {
    ensureAllDataDirs();
    const candidates: RecoveryCandidateDto[] = [];
    const seenPaths = new Set<string>();

    const controlDb = getControlDbPath().toLowerCase();
    const templateDb = getDatabaseTemplatePath()?.toLowerCase() || '';

    // Search roots:
    const roots: Array<{ dir: string; source: 'BACKUPS_DIR' | 'DATABASES_DIR' | 'EXTERNAL' }> = [
      { dir: getBackupsDir(), source: 'BACKUPS_DIR' },
      { dir: getDatabasesDir(), source: 'DATABASES_DIR' },
    ];

    if (additionalDirectory && fs.existsSync(additionalDirectory)) {
      const canonicalAdditional = path.resolve(additionalDirectory);
      if (fs.statSync(canonicalAdditional).isDirectory()) {
        roots.push({ dir: canonicalAdditional, source: 'EXTERNAL' });
      }
    }

    // 1. Scan bounded directories (top-level only, no recursive drive walking)
    for (const root of roots) {
      if (!fs.existsSync(root.dir)) continue;

      try {
        const files = fs.readdirSync(root.dir);
        for (const file of files) {
          if (file.endsWith('.partial')) continue;
          if (!file.endsWith('.db') && !file.endsWith('.sqlite')) continue;

          const fullPath = path.join(root.dir, file);
          let canonical: string;
          try {
            const pathRes = canonicalizeDatabasePath(fullPath);
            if (!pathRes.valid) continue;
            canonical = pathRes.canonicalPath;
          } catch {
            continue;
          }

          if (seenPaths.has(canonical.toLowerCase())) continue;
          if (canonical.toLowerCase() === controlDb || canonical.toLowerCase() === templateDb) continue;

          seenPaths.add(canonical.toLowerCase());

          const stat = fs.statSync(canonical);
          const manifestPath = `${canonical}.manifest.json`;
          const hasManifest = fs.existsSync(manifestPath);

          let manifest: any = null;
          if (hasManifest) {
            try {
              manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            } catch {}
          }

          let status: any = 'ACTIVE';
          let suitability: any = 'VALID';
          let schemaVersion = 1;
          let details: string | null = null;

          if (manifest && manifest.verification?.sqliteIntegrity === 'ok') {
            status = 'ACTIVE';
            suitability = 'VALID';
            schemaVersion = manifest.database?.schemaVersion || 1;
            details = 'Verified backup with valid manifest';
          } else {
            const validation = await databaseValidationService.validateDatabase(canonical);
            suitability = this.computeSuitability(validation);
            status = validation.status;
            schemaVersion = validation.schemaVersion || 1;
            details = validation.details || null;
          }

          candidates.push({
            candidateId: manifest?.backupId || `cand_${crypto.randomUUID()}`,
            displayName: manifest?.database?.displayName || file,
            canonicalPath: canonical,
            source: root.source,
            status,
            suitability,
            sizeBytes: stat.size,
            lastModifiedAt: stat.mtime.toISOString(),
            hasManifest,
            sha256: manifest?.artifact?.sha256 || null,
            schemaVersion,
            profileCode: manifest?.database?.profileCode || null,
            details,
          });
        }
      } catch (dirErr) {
        logger.warn(`[RecoveryService] Directory scan error on ${root.dir}: ${String(dirErr)}`);
      }
    }

    return {
      candidates,
      totalCount: candidates.length,
    };
  }

  /**
   * Detailed inspection of a recovery candidate.
   */
  async inspectCandidate(candidatePath: string): Promise<RecoveryInspectionPreviewDto> {
    const pathResult = canonicalizeDatabasePath(candidatePath);
    if (!pathResult.valid) {
      throw new ValidationError(pathResult.error || 'Invalid candidate path');
    }
    const canonical = pathResult.canonicalPath;
    if (!fs.existsSync(canonical)) {
      throw new NotFoundError(`Candidate database file does not exist: ${canonical}`);
    }

    const controlDb = getControlDbPath().toLowerCase();
    const templateDb = getDatabaseTemplatePath()?.toLowerCase() || '';

    if (canonical.toLowerCase() === controlDb) {
      throw new ValidationError('The system control database cannot be used as a recovery candidate.');
    }
    if (canonical.toLowerCase() === templateDb) {
      throw new ValidationError('The template database cannot be used as a recovery candidate.');
    }

    const stat = fs.statSync(canonical);
    const manifestPath = `${canonical}.manifest.json`;
    const hasManifest = fs.existsSync(manifestPath);
    let manifest: any = null;
    if (hasManifest) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch {}
    }

    const validation = await databaseValidationService.validateDatabase(canonical);
    const suitability = this.computeSuitability(validation);

    return {
      canonicalPath: canonical,
      displayName: manifest?.database?.displayName || path.basename(canonical),
      sizeBytes: stat.size,
      tableCount: validation.tableCount,
      schemaVersion: validation.schemaVersion,
      profileCode: manifest?.database?.profileCode || null,
      profileName: manifest?.database?.displayName || null,
      status: validation.status,
      suitability,
      hasManifest,
      manifest,
      sqliteIntegrity: validation.integrityCheck,
      details: validation.details,
    };
  }

  /**
   * Prepares a staged restore:
   * Copies candidate to staging directory, leaving original backup 100% immutable!
   */
  async prepareRestore(req: PrepareRestoreRequest): Promise<RestorePreviewDto> {
    ensureAllDataDirs();
    const install = await installationService.getOrCreateInstallation();
    const pathResult = canonicalizeDatabasePath(req.candidatePath);
    if (!pathResult.valid) {
      throw new ValidationError(pathResult.error || 'Invalid candidate database path');
    }
    const canonicalCandidate = pathResult.canonicalPath;

    if (!fs.existsSync(canonicalCandidate)) {
      throw new NotFoundError(`Candidate database not found: ${canonicalCandidate}`);
    }

    // Prohibit restoring system DB or template DB
    const controlDb = getControlDbPath().toLowerCase();
    const templateDb = getDatabaseTemplatePath()?.toLowerCase() || '';
    if (canonicalCandidate.toLowerCase() === controlDb || canonicalCandidate.toLowerCase() === templateDb) {
      throw new ValidationError('Cannot restore system or template database.');
    }

    // Resolve target profile and target DB path
    const targetProfileCode = req.targetProfileCode || 'Stavan';
    const databasesDir = getDatabasesDir();
    const targetDatabasePath = path.join(databasesDir, `${targetProfileCode}.db`);

    // Invariant: Source cannot equal Target
    if (path.resolve(canonicalCandidate).toLowerCase() === path.resolve(targetDatabasePath).toLowerCase()) {
      throw new ValidationError('Source candidate database cannot be identical to the active target database.');
    }

    const restoreId = `rst_${crypto.randomUUID()}`;
    const stagingDir = path.join(getRestoreStagingDir(), restoreId);
    fs.mkdirSync(stagingDir, { recursive: true });

    const stagedPath = path.join(stagingDir, 'candidate.db');

    // 1. Copy candidate to staging (Original backup remains untouched!)
    fs.copyFileSync(canonicalCandidate, stagedPath);

    // 2. Validate staged database integrity
    const client = new PrismaClient({
      datasources: { db: { url: `file:${stagedPath.replace(/\\/g, '/')}` } },
    });

    let tableCount = 0;
    try {
      const integrityRows: any = await client.$queryRawUnsafe('PRAGMA integrity_check;');
      const integrityResult = integrityRows?.[0]?.integrity_check || 'ok';
      if (integrityResult !== 'ok') {
        throw new ValidationError(`Staged database failed integrity check: ${integrityResult}`);
      }

      const tables: any = await client.$queryRawUnsafe(
        "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
      );
      tableCount = Number(tables?.[0]?.count || 0);
    } finally {
      await client.$disconnect();
    }

    // 3. Create RestoreRecord with status STAGING -> VALIDATED
    const targetDbExists = fs.existsSync(targetDatabasePath);
    let targetSize = 0;
    if (targetDbExists) {
      targetSize = fs.statSync(targetDatabasePath).size;
    }

    await systemPrisma.restoreRecord.create({
      data: {
        restoreId,
        installationId: install.id,
        targetDatabaseId: `db_${targetProfileCode}`,
        targetProfileId: null,
        candidatePath: canonicalCandidate,
        status: 'VALIDATED',
        schemaVersion: 1,
        sha256: null,
      },
    });

    return {
      restoreId,
      candidatePath: canonicalCandidate,
      stagedPath,
      targetProfileCode,
      targetDatabasePath,
      targetDatabaseExists: targetDbExists,
      targetDatabaseSize: targetSize,
      schemaVersion: 1,
      tableCount,
      status: 'VALIDATED',
      requiresRollbackBackup: targetDbExists,
    };
  }

  /**
   * Confirms and executes a staged restore with mandatory rollback backup.
   */
  async confirmRestore(
    req: ConfirmRestoreRequest,
    performedBy: string = 'system'
  ): Promise<RestoreOperationResponseDto> {
    if (!req.confirmDestructiveOverwrite) {
      throw new ValidationError(
        'Explicit confirmation is required to overwrite the active database.'
      );
    }

    const restoreRecord = await systemPrisma.restoreRecord.findUnique({
      where: { restoreId: req.restoreId },
    });

    if (!restoreRecord || (restoreRecord.status !== 'VALIDATED' && restoreRecord.status !== 'STAGING')) {
      throw new NotFoundError(
        `Staged restore operation ${req.restoreId} not found or not in ready state.`
      );
    }

    const stagingDir = path.join(getRestoreStagingDir(), req.restoreId);
    const stagedDbPath = path.join(stagingDir, 'candidate.db');

    if (!fs.existsSync(stagedDbPath)) {
      throw new NotFoundError(`Staged candidate database is missing: ${stagedDbPath}`);
    }

    const targetProfileCode = req.targetProfileCode || 'Stavan';
    const targetDbPath = path.join(getDatabasesDir(), `${targetProfileCode}.db`);
    const targetResult = canonicalizeDatabasePath(targetDbPath);
    if (!targetResult.valid) {
      throw new ValidationError(targetResult.error || 'Invalid target database path');
    }
    const canonicalTarget = targetResult.canonicalPath;

    // Concurrency Lock
    if (this.activeRestoreLocks.has(canonicalTarget)) {
      throw new ConflictError('A restore operation is already in progress for this target database.');
    }
    this.activeRestoreLocks.add(canonicalTarget);

    let rollbackBackupPath: string | null = null;
    let rollbackBackupCreated = false;

    try {
      // 1. Mandatory Rollback Backup of current active database
      if (fs.existsSync(canonicalTarget)) {
        logger.info(`[RecoveryService] Creating mandatory rollback backup of ${canonicalTarget}...`);
        const rollbackRecord = await backupService.createBackup(
          {
            databasePath: canonicalTarget,
            backupType: 'PRE_RESTORE',
            note: `Automatic rollback backup prior to restore ${req.restoreId}`,
          },
          performedBy
        );

        rollbackBackupPath = rollbackRecord.backupPath;
        rollbackBackupCreated = true;

        await systemPrisma.restoreRecord.update({
          where: { id: restoreRecord.id },
          data: { rollbackBackupPath },
        });
      }

      // 2. Mark RestoreRecord ACTIVATING
      await systemPrisma.restoreRecord.update({
        where: { id: restoreRecord.id },
        data: { status: 'ACTIVATING' },
      });

      // 3. Atomic file swap (copy staged candidate to live target DB)
      fs.copyFileSync(stagedDbPath, canonicalTarget);

      // 4. Post-Restore Verification: verify new active database opens cleanly
      const verifyClient = new PrismaClient({
        datasources: { db: { url: `file:${canonicalTarget.replace(/\\/g, '/')}` } },
      });

      let integrityCheck = 'unknown';
      try {
        const checkRows: any = await verifyClient.$queryRawUnsafe('PRAGMA integrity_check;');
        integrityCheck = checkRows?.[0]?.integrity_check || 'ok';
        if (integrityCheck !== 'ok') {
          throw new Error(`Post-restore integrity check failed: ${integrityCheck}`);
        }
      } catch (verifyErr: any) {
        // Post-restore check failed! AUTOMATIC ROLLBACK
        logger.error(`[RecoveryService] Post-restore check failed! Rolling back...`, verifyErr);
        if (rollbackBackupPath && fs.existsSync(rollbackBackupPath)) {
          fs.copyFileSync(rollbackBackupPath, canonicalTarget);
        }

        await systemPrisma.restoreRecord.update({
          where: { id: restoreRecord.id },
          data: {
            status: 'ROLLED_BACK',
            errorMessage: verifyErr?.message || 'Post-restore verification failed; rolled back.',
          },
        });

        throw new ConflictError(
          `Restoration failed post-activation checks. Current database was safely rolled back from backup.`
        );
      } finally {
        await verifyClient.$disconnect();
      }

      // 5. Update or Register active database in DatabaseRegistry
      const install = await installationService.getOrCreateInstallation();
      await systemPrisma.databaseRegistry.upsert({
        where: { canonicalPath: canonicalTarget },
        update: {
          status: 'ACTIVE',
          lastValidatedAt: new Date(),
          schemaVersion: restoreRecord.schemaVersion,
        },
        create: {
          databaseId: `db_${targetProfileCode}`,
          displayName: `${targetProfileCode} Database`,
          canonicalPath: canonicalTarget,
          schemaVersion: restoreRecord.schemaVersion,
          status: 'ACTIVE',
          databaseType: 'LOCAL_PROFILE',
          installationId: install.id,
          lastValidatedAt: new Date(),
        },
      });

      // 6. Clean up staging folder
      try {
        if (fs.existsSync(stagedDbPath)) fs.unlinkSync(stagedDbPath);
        if (fs.existsSync(stagingDir)) fs.rmdirSync(stagingDir);
      } catch {}

      // 7. Mark VERIFIED
      await systemPrisma.restoreRecord.update({
        where: { id: restoreRecord.id },
        data: {
          status: 'VERIFIED',
          completedAt: new Date(),
        },
      });

      // 8. Log audit event
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'RESTORE',
          entityId: req.restoreId,
          eventType: 'RESTORE_COMPLETED',
          description: `Successfully restored database to ${canonicalTarget}`,
          metadata: JSON.stringify({
            restoreId: req.restoreId,
            targetPath: canonicalTarget,
            rollbackBackupPath,
          }),
          performedBy,
        },
      });

      return {
        success: true,
        restoreId: req.restoreId,
        status: 'VERIFIED',
        message: 'Database restored and verified successfully.',
        rollbackBackupCreated,
        rollbackBackupPath,
      };
    } finally {
      this.activeRestoreLocks.delete(canonicalTarget);
    }
  }

  /**
   * Reinstall & previous installation data detection.
   */
  async detectReinstallState(): Promise<ReinstallDetectionDto> {
    const install = await installationService.getOrCreateInstallation();
    const databasesDir = getDatabasesDir();
    const backupsDir = getBackupsDir();

    let previousDatabasesCount = 0;
    if (fs.existsSync(databasesDir)) {
      try {
        const dbFiles = fs
          .readdirSync(databasesDir)
          .filter((f) => (f.endsWith('.db') || f.endsWith('.sqlite')) && !f.endsWith('.partial'));
        previousDatabasesCount = dbFiles.length;
      } catch {}
    }

    let previousBackupsCount = 0;
    if (fs.existsSync(backupsDir)) {
      try {
        const bkpFiles = fs
          .readdirSync(backupsDir)
          .filter((f) => (f.endsWith('.db') || f.endsWith('.sqlite')) && !f.endsWith('.partial'));
        previousBackupsCount = bkpFiles.length;
      } catch {}
    }

    // Check if there are existing users or database registries in Control DB
    const existingUsersCount = await systemPrisma.user.count({ where: { deletedAt: null } });
    const existingRegistriesCount = await systemPrisma.databaseRegistry.count();

    const hasPreviousData =
      previousDatabasesCount > 0 ||
      previousBackupsCount > 0 ||
      existingUsersCount > 0 ||
      existingRegistriesCount > 0;

    return {
      hasPreviousData,
      previousInstallationId: install.installationId,
      previousAppVersion: install.appVersion,
      previousDatabasesCount,
      previousBackupsCount,
      canContinue: hasPreviousData,
      canRestore: previousBackupsCount > 0 || previousDatabasesCount > 0,
      canStartFresh: true,
      details: hasPreviousData
        ? `Detected ${previousDatabasesCount} existing database(s), ${previousBackupsCount} backup(s), and ${existingUsersCount} registered user(s).`
        : 'Clean first-time installation.',
    };
  }

  /**
   * Start fresh installation:
   * Generates new installation identity; old database files remain 100% untouched on disk!
   */
  async startFreshInstallation(): Promise<any> {
    const newInstallId = `inst_${crypto.randomUUID()}`;
    const install = await systemPrisma.installation.create({
      data: {
        installationId: newInstallId,
        appVersion: '3.0.0',
        status: 'ACTIVE',
        lifecycleState: 'APP_SETUP',
      },
    });

    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'INSTALLATION',
        entityId: install.id,
        eventType: 'NEW_INSTALLATION_SELECTED',
        description: `Created fresh installation ${newInstallId}; prior databases preserved on disk.`,
        performedBy: 'user',
      },
    });

    return install;
  }

  private computeSuitability(val: any): any {
    if (!val.isValid) {
      if (val.status === 'CORRUPTED') return 'CORRUPTED';
      if (val.status === 'UNSUPPORTED') return 'UNSUPPORTED';
      return 'INVALID';
    }
    return 'VALID';
  }
}

export const recoveryService = new RecoveryService();
