import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import {
  getBackupsDir,
  getDatabasesDir,
  getExportDir,
  getControlDbPath,
  getDatabaseTemplatePath,
  getRestoreStagingDir,
  getConfigDir,
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
   * Resolves ownership status and previous owner metadata for recovery candidates.
   */
  private async resolveOwnership(
    canonical: string,
    manifest: any,
    currentInstall: any
  ): Promise<{
    ownershipStatus: 'CURRENT_INSTALLATION' | 'PREVIOUS_INSTALLATION' | 'DELETED_USER' | 'EXTERNAL_SOURCE' | 'UNKNOWN_SOURCE';
    previousOwnerUsername?: string | null;
    previousOwnerDisplayName?: string | null;
  }> {
    let ownershipStatus: 'CURRENT_INSTALLATION' | 'PREVIOUS_INSTALLATION' | 'DELETED_USER' | 'EXTERNAL_SOURCE' | 'UNKNOWN_SOURCE' = 'UNKNOWN_SOURCE';
    let previousOwnerUsername: string | null = null;
    let previousOwnerDisplayName: string | null = null;

    // 1. Check database registry and profiles
    const reg = await systemPrisma.databaseRegistry.findFirst({
      where: { canonicalPath: canonical },
      include: {
        profile: {
          include: {
            userProfiles: {
              include: { user: true },
            },
          },
        },
      },
    });

    if (reg?.profile) {
      const activeUsers = reg.profile.userProfiles.filter((up) => up.isActive && up.user.isActive && !up.user.deletedAt);
      const deletedUsers = reg.profile.userProfiles.filter((up) => !up.isActive || !up.user.isActive || up.user.deletedAt);

      if (activeUsers.length === 0 && deletedUsers.length > 0) {
        ownershipStatus = 'DELETED_USER';
        previousOwnerUsername = deletedUsers[0].user.username;
        previousOwnerDisplayName = deletedUsers[0].user.displayName;
        return { ownershipStatus, previousOwnerUsername, previousOwnerDisplayName };
      }
    }

    // 2. Check if candidate filename or manifest matches a profile with deleted users
    const candidateBase = path.basename(canonical, path.extname(canonical));
    const profile = await systemPrisma.profile.findFirst({
      where: {
        OR: [
          { code: candidateBase },
          { dbPath: { contains: candidateBase } },
        ],
      },
      include: {
        userProfiles: {
          include: { user: true },
        },
      },
    });

    if (profile) {
      const activeUsers = profile.userProfiles.filter((up) => up.isActive && up.user.isActive && !up.user.deletedAt);
      const deletedUsers = profile.userProfiles.filter((up) => !up.isActive || !up.user.isActive || up.user.deletedAt);

      if (activeUsers.length === 0 && deletedUsers.length > 0) {
        ownershipStatus = 'DELETED_USER';
        previousOwnerUsername = deletedUsers[0].user.username;
        previousOwnerDisplayName = deletedUsers[0].user.displayName;
        return { ownershipStatus, previousOwnerUsername, previousOwnerDisplayName };
      }
    }

    // 3. Installation match
    if (manifest?.installationId) {
      if (manifest.installationId === currentInstall.installationId) {
        ownershipStatus = 'CURRENT_INSTALLATION';
      } else {
        ownershipStatus = 'PREVIOUS_INSTALLATION';
      }
    } else if (reg) {
      if (reg.installationId === currentInstall.id) {
        ownershipStatus = 'CURRENT_INSTALLATION';
      } else {
        ownershipStatus = 'PREVIOUS_INSTALLATION';
      }
    } else {
      const databasesDir = getDatabasesDir().toLowerCase();
      const backupsDir = getBackupsDir().toLowerCase();
      const candidateDir = path.dirname(canonical).toLowerCase();
      if (candidateDir === databasesDir || candidateDir === backupsDir) {
        ownershipStatus = 'UNKNOWN_SOURCE';
      } else {
        ownershipStatus = 'EXTERNAL_SOURCE';
      }
    }

    return { ownershipStatus, previousOwnerUsername, previousOwnerDisplayName };
  }

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
      { dir: getExportDir(), source: 'BACKUPS_DIR' },
    ];

    if (additionalDirectory && fs.existsSync(additionalDirectory)) {
      const canonicalAdditional = path.resolve(additionalDirectory);
      if (fs.statSync(canonicalAdditional).isDirectory()) {
        roots.push({ dir: canonicalAdditional, source: 'EXTERNAL' });
      }
    }

    const currentInstall = await installationService.getOrCreateInstallation();

    // 1. Scan bounded directories (top-level only, no recursive drive walking)
    for (const root of roots) {
      if (!fs.existsSync(root.dir)) continue;

      try {
        const files = fs.readdirSync(root.dir);
        for (const file of files) {
          const fullPath = path.join(root.dir, file);
          let targetPath = fullPath;

          // Check if directory is a preservation bundle
          try {
            if (fs.statSync(fullPath).isDirectory()) {
              const nestedDb = path.join(fullPath, 'database_backup.db');
              if (fs.existsSync(nestedDb)) {
                targetPath = nestedDb;
              } else {
                continue;
              }
            } else {
              if (file.endsWith('.partial')) continue;
              if (!file.endsWith('.db') && !file.endsWith('.sqlite')) continue;
            }
          } catch {
            continue;
          }

          let canonical: string;
          try {
            const pathRes = canonicalizeDatabasePath(targetPath);
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

          const ownershipInfo = await this.resolveOwnership(canonical, manifest, currentInstall);
          if (ownershipInfo.ownershipStatus === 'DELETED_USER' && suitability === 'VALID') {
            suitability = 'REQUIRES_CONFIRMATION';
            details = `Belonged to deactivated/deleted user "${ownershipInfo.previousOwnerUsername}". Explicit reconnection required.`;
          }

          candidates.push({
            candidateId: manifest?.backupId || `cand_${crypto.randomUUID()}`,
            displayName: manifest?.database?.displayName || path.basename(canonical),
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
            ownershipStatus: ownershipInfo.ownershipStatus,
            previousOwnerUsername: ownershipInfo.previousOwnerUsername,
            previousOwnerDisplayName: ownershipInfo.previousOwnerDisplayName,
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
    let suitability = this.computeSuitability(validation);
    const supportedSchemaVersion = 1;
    const candidateSchemaVersion = manifest?.database?.schemaVersion ?? validation.schemaVersion ?? 1;
    let conflictReason: string | null = null;

    if (candidateSchemaVersion > supportedSchemaVersion) {
      suitability = 'UNSUPPORTED';
      conflictReason = 'UNSUPPORTED_SCHEMA_VERSION_NEWER';
    } else if (candidateSchemaVersion < supportedSchemaVersion) {
      conflictReason = 'MIGRATABLE_SCHEMA_VERSION_OLDER';
    }

    // Ownership classification
    const currentInstall = await installationService.getOrCreateInstallation();
    const ownershipInfo = await this.resolveOwnership(canonical, manifest, currentInstall);
    let ownershipStatus = ownershipInfo.ownershipStatus;

    if (
      (ownershipStatus === 'PREVIOUS_INSTALLATION' ||
        ownershipStatus === 'DELETED_USER' ||
        ownershipStatus === 'EXTERNAL_SOURCE' ||
        ownershipStatus === 'UNKNOWN_SOURCE') &&
      suitability === 'VALID'
    ) {
      suitability = 'REQUIRES_CONFIRMATION';
    }

    return {
      canonicalPath: canonical,
      displayName: manifest?.database?.displayName || path.basename(canonical),
      sizeBytes: stat.size,
      tableCount: validation.tableCount,
      schemaVersion: candidateSchemaVersion,
      supportedSchemaVersion,
      profileCode: manifest?.database?.profileCode || null,
      profileName: manifest?.database?.displayName || null,
      status: validation.status,
      suitability,
      ownershipStatus,
      previousOwnerUsername: ownershipInfo.previousOwnerUsername,
      previousOwnerDisplayName: ownershipInfo.previousOwnerDisplayName,
      hasManifest,
      manifest,
      sqliteIntegrity: validation.integrityCheck,
      details: validation.details,
      conflictReason,
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

    // Validate candidate integrity and schema compatibility before staging
    const manifestPath = `${canonicalCandidate}.manifest.json`;
    let manifestSchemaVersion: number | null = null;
    if (fs.existsSync(manifestPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        manifestSchemaVersion = m.database?.schemaVersion;
      } catch {}
    }

    const validation = await databaseValidationService.validateDatabase(canonicalCandidate);
    if (!validation.isValid && validation.status === 'CORRUPTED') {
      throw new ValidationError(`Candidate database is corrupted and cannot be restored: ${validation.integrityCheck}`);
    }
    const candidateSchemaVersion = manifestSchemaVersion ?? validation.schemaVersion ?? 1;
    if (candidateSchemaVersion > 1) {
      throw new ValidationError(`Candidate schema version (${candidateSchemaVersion}) is newer than supported (1).`);
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

    // 3. Create RestoreRecord with status VALIDATED
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
        schemaVersion: candidateSchemaVersion,
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
      schemaVersion: candidateSchemaVersion,
      tableCount,
      status: 'VALIDATED',
      requiresRollbackBackup: targetDbExists,
    };
  }

  /**
   * Confirms and executes a staged restore with mandatory rollback backup and atomic activation.
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
    let swapOldPath: string | null = null;

    try {
      // 1. Mandatory Rollback Backup of current active database
      if (fs.existsSync(canonicalTarget)) {
        logger.info(`[RecoveryService] Creating mandatory rollback backup of ${canonicalTarget}...`);
        try {
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
        } catch (bkpErr: any) {
          logger.error(`[RecoveryService] Pre-restore rollback backup creation failed!`, bkpErr);
          throw new ConflictError(`Cannot proceed with restore: Mandatory rollback backup failed: ${bkpErr?.message}`);
        }

        await systemPrisma.restoreRecord.update({
          where: { id: restoreRecord.id },
          data: { rollbackBackupPath, status: 'ROLLBACK_READY' },
        });
      }

      // 2. Mark RestoreRecord ACTIVATING
      await systemPrisma.restoreRecord.update({
        where: { id: restoreRecord.id },
        data: { status: 'ACTIVATING' },
      });

      // 3. Windows-safe atomic replacement strategy
      if (fs.existsSync(canonicalTarget)) {
        swapOldPath = `${canonicalTarget}.swap_old_${Date.now()}`;
        fs.renameSync(canonicalTarget, swapOldPath);
      }

      // Copy staged candidate to live target DB
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
        if (swapOldPath && fs.existsSync(swapOldPath)) {
          if (fs.existsSync(canonicalTarget)) {
            try { fs.unlinkSync(canonicalTarget); } catch {}
          }
          fs.renameSync(swapOldPath, canonicalTarget);
          swapOldPath = null;
        } else if (rollbackBackupPath && fs.existsSync(rollbackBackupPath)) {
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

      // Unlink swapOldPath upon verified activation
      if (swapOldPath && fs.existsSync(swapOldPath)) {
        try { fs.unlinkSync(swapOldPath); } catch {}
        swapOldPath = null;
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
      // Clean up swap file if somehow still existing on error
      if (swapOldPath && fs.existsSync(swapOldPath)) {
        try {
          if (!fs.existsSync(canonicalTarget)) {
            fs.renameSync(swapOldPath, canonicalTarget);
          }
        } catch {}
      }
      this.activeRestoreLocks.delete(canonicalTarget);
    }
  }

  /**
   * Startup reconciliation of interrupted restores or crashed replacement operations.
   */
  async reconcileInterruptedRestores(): Promise<{ reconciledCount: number; cleanedStagingCount: number }> {
    ensureAllDataDirs();
    let reconciledCount = 0;
    let cleanedStagingCount = 0;

    const databasesDir = getDatabasesDir();
    if (fs.existsSync(databasesDir)) {
      try {
        const files = fs.readdirSync(databasesDir);
        for (const file of files) {
          if (file.includes('.swap_old_')) {
            const swapFullPath = path.join(databasesDir, file);
            const activeDbPath = swapFullPath.replace(/\.swap_old_\d+$/, '');
            if (fs.existsSync(activeDbPath)) {
              const validation = await databaseValidationService.validateDatabase(activeDbPath);
              if (validation.isValid) {
                fs.unlinkSync(swapFullPath);
                logger.info(`[RecoveryService] Interrupted swap cleaned up for: ${activeDbPath}`);
              } else {
                fs.unlinkSync(activeDbPath);
                fs.renameSync(swapFullPath, activeDbPath);
                logger.warn(`[RecoveryService] Interrupted swap recovered to: ${activeDbPath}`);
                reconciledCount++;
              }
            } else {
              fs.renameSync(swapFullPath, activeDbPath);
              logger.warn(`[RecoveryService] Interrupted swap restored missing DB: ${activeDbPath}`);
              reconciledCount++;
            }
          }
        }
      } catch (err) {
        logger.error(`[RecoveryService] Error scanning for swap files: ${String(err)}`);
      }
    }

    try {
      const interruptedRecords = await systemPrisma.restoreRecord.findMany({
        where: {
          status: { in: ['PENDING', 'STAGING', 'ROLLBACK_READY', 'ACTIVATING'] },
        },
      });

      for (const rec of interruptedRecords) {
        const stagingDir = path.join(getRestoreStagingDir(), rec.restoreId);
        if (rec.status === 'ACTIVATING') {
          if (rec.rollbackBackupPath && fs.existsSync(rec.rollbackBackupPath)) {
            await systemPrisma.restoreRecord.update({
              where: { id: rec.id },
              data: {
                status: 'ROLLED_BACK',
                errorMessage: 'Interrupted during activation; reconciled on startup.',
              },
            });
          } else {
            await systemPrisma.restoreRecord.update({
              where: { id: rec.id },
              data: {
                status: 'FAILED',
                errorMessage: 'Interrupted during activation; candidate discarded.',
              },
            });
          }
        } else {
          await systemPrisma.restoreRecord.update({
            where: { id: rec.id },
            data: {
              status: 'FAILED',
              errorMessage: 'Interrupted prior to activation; staging discarded.',
            },
          });
        }

        if (fs.existsSync(stagingDir)) {
          try {
            fs.rmSync(stagingDir, { recursive: true, force: true });
            cleanedStagingCount++;
          } catch {}
        }
        reconciledCount++;
      }
    } catch (err) {
      logger.error(`[RecoveryService] Error reconciling interrupted restore records: ${String(err)}`);
    }

    backupService.cleanupPartialBackups();

    return { reconciledCount, cleanedStagingCount };
  }

  /**
   * Reinstall & previous installation data detection.
   */
  async detectReinstallState(): Promise<ReinstallDetectionDto> {
    ensureAllDataDirs();
    const install = await installationService.getOrCreateInstallation();
    const databasesDir = getDatabasesDir();
    const backupsDir = getBackupsDir();

    let previousDatabasesCount = 0;
    if (fs.existsSync(databasesDir)) {
      try {
        const dbFiles = fs
          .readdirSync(databasesDir)
          .filter((f) => (f.endsWith('.db') || f.endsWith('.sqlite')) && !f.endsWith('.partial') && !f.includes('.swap_old_'));
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

    // Check existing users and database registries in Control DB
    const existingUsersCount = await systemPrisma.user.count({ where: { deletedAt: null } });
    const existingRegistriesCount = await systemPrisma.databaseRegistry.count();
    const totalInstallationsCount = await systemPrisma.installation.count();

    const hasPreviousData =
      previousDatabasesCount > 0 ||
      previousBackupsCount > 0 ||
      existingUsersCount > 0 ||
      existingRegistriesCount > 0;

    let classification: any = 'FIRST_INSTALL';
    if (!hasPreviousData) {
      classification = 'FIRST_INSTALL';
    } else if (install.lifecycleState === 'READY') {
      classification = 'CURRENT_INSTALLATION';
    } else if (totalInstallationsCount > 1 || (existingUsersCount > 0 && previousDatabasesCount > 0)) {
      classification = 'PREVIOUS_INSTALLATION_DATA';
    } else if (previousDatabasesCount > 0 && existingRegistriesCount === 0) {
      classification = 'ORPHANED_DATA';
    } else if (previousBackupsCount > 0) {
      classification = 'RECOVERY_CANDIDATE';
    } else {
      classification = 'NO_RECOVERABLE_DATA';
    }

    return {
      hasPreviousData,
      previousInstallationId: install.installationId,
      previousAppVersion: install.appVersion,
      previousDatabasesCount,
      previousBackupsCount,
      canContinue: hasPreviousData && (existingUsersCount > 0 || existingRegistriesCount > 0 || previousDatabasesCount > 0),
      canRestore: previousBackupsCount > 0 || previousDatabasesCount > 0,
      canStartFresh: true,
      classification,
      details: hasPreviousData
        ? `Detected ${previousDatabasesCount} existing database(s), ${previousBackupsCount} backup(s), and ${existingUsersCount} registered user(s). Classification: ${classification}.`
        : 'Clean first-time installation.',
    };
  }

  /**
   * Start fresh installation:
   * Retires previous active installation(s); old database files, backups, and historical records remain 100% untouched on disk!
   */
  async startFreshInstallation(): Promise<any> {
    ensureAllDataDirs();
    // 1. Mark existing active installations as ARCHIVED
    await systemPrisma.installation.updateMany({
      where: { status: 'ACTIVE' },
      data: { status: 'ARCHIVED' },
    });

    // 2. Generate brand new installation ID and persist to config
    const newInstallId = crypto.randomUUID();
    const installFilePath = path.join(getConfigDir(), '.installation-id');
    try {
      fs.writeFileSync(installFilePath, newInstallId, { encoding: 'utf-8', mode: 0o600 });
    } catch (e) {
      logger.warn(`Could not update .installation-id file: ${String(e)}`);
    }

    // 3. Create fresh active installation
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

  /**
   * Continue existing installation:
   * Reconnects and verifies an existing installation state.
   */
  async continueExistingInstallation(targetInstallationId?: string): Promise<any> {
    ensureAllDataDirs();
    let targetInstall = null;
    if (targetInstallationId) {
      targetInstall = await systemPrisma.installation.findUnique({
        where: { installationId: targetInstallationId },
      });
    } else {
      // Find most recent installation with users or registries
      targetInstall = await systemPrisma.installation.findFirst({
        where: {
          OR: [
            { databaseRegistries: { some: {} } },
            { installationUsers: { some: {} } },
            { status: 'ACTIVE' },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!targetInstall) {
      throw new NotFoundError('No existing installation found to continue.');
    }

    // Archive any other active installations
    await systemPrisma.installation.updateMany({
      where: {
        id: { not: targetInstall.id },
        status: 'ACTIVE',
      },
      data: { status: 'ARCHIVED' },
    });

    // Reactivate target installation
    const updated = await systemPrisma.installation.update({
      where: { id: targetInstall.id },
      data: { status: 'ACTIVE' },
    });

    // Persist to .installation-id file
    const installFilePath = path.join(getConfigDir(), '.installation-id');
    try {
      fs.writeFileSync(installFilePath, updated.installationId, { encoding: 'utf-8', mode: 0o600 });
    } catch {}

    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'INSTALLATION',
        entityId: updated.id,
        eventType: 'REINSTALL_CONTINUED',
        description: `Continued existing installation ${updated.installationId}.`,
        performedBy: 'user',
      },
    });

    return {
      success: true,
      installation: updated,
      message: 'Existing installation continued successfully.',
    };
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

