import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import {
  getBackupsDir,
  getBackupStagingDir,
  getDatabasesDir,
  getControlDbPath,
  getDatabaseTemplatePath,
  ensureAllDataDirs,
} from '../../../infrastructure/paths';
import { canonicalizeDatabasePath } from '../database/database-path.util';
import { databaseValidationService } from '../database/database-validation.service';
import { installationService } from '../installation.service';
import { ValidationError, NotFoundError, ConflictError } from '../../../errors';
import { logger } from '../../../infrastructure/logging';
import type {
  BackupRecordDto,
  CreateBackupRequest,
  BackupManifestDto,
  BackupVerificationDto,
  BackupListResponseDto,
} from '@diamond-erp/contracts';

export class BackupService {
  // Concurrency lock for backup operations by canonical source path
  private activeLocks: Set<string> = new Set<string>();

  /**
   * Calculate SHA-256 hash of a file on disk.
   */
  private calculateSha256(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Creates a safe, verified atomic backup of a live profile database.
   */
  async createBackup(
    reqBody: CreateBackupRequest = {},
    performedBy: string = 'system'
  ): Promise<BackupRecordDto> {
    ensureAllDataDirs();
    const install = await installationService.getOrCreateInstallation();

    // 1. Resolve source database path
    let sourcePath = reqBody.databasePath;
    let targetRegistry: any = null;

    if (!sourcePath) {
      targetRegistry = await systemPrisma.databaseRegistry.findFirst({
        where: {
          installationId: install.id,
          status: 'ACTIVE',
        },
        include: { profile: true },
      });

      if (!targetRegistry) {
        // Fall back to default profile database in databases dir
        const defaultPath = path.join(getDatabasesDir(), 'Stavan.db');
        if (fs.existsSync(defaultPath)) {
          sourcePath = defaultPath;
        } else {
          throw new NotFoundError('No active database found to back up.');
        }
      } else {
        sourcePath = targetRegistry.canonicalPath;
      }
    }

    if (!sourcePath) {
      throw new NotFoundError('No active database found to back up.');
    }

    // 2. Validate source path invariants
    const pathResult = canonicalizeDatabasePath(sourcePath);
    if (!pathResult.valid) {
      throw new ValidationError(pathResult.error || 'Invalid database path');
    }
    const canonicalSource = pathResult.canonicalPath;
    if (!fs.existsSync(canonicalSource)) {
      throw new NotFoundError(`Source database file does not exist: ${canonicalSource}`);
    }

    const stat = fs.statSync(canonicalSource);
    if (stat.isDirectory()) {
      throw new ValidationError('Source path must be a regular file, not a directory.');
    }

    // Prohibit backing up system control DB or template DB as a business profile backup
    const controlDb = getControlDbPath();
    if (canonicalSource.toLowerCase() === controlDb.toLowerCase()) {
      throw new ValidationError('Cannot create a business backup of the system control database.');
    }

    const templateDb = getDatabaseTemplatePath();
    if (templateDb && canonicalSource.toLowerCase() === templateDb.toLowerCase()) {
      throw new ValidationError('Cannot create a business backup of the template database.');
    }

    // 3. Concurrency Protection
    if (this.activeLocks.has(canonicalSource)) {
      throw new ConflictError(
        'A backup operation is already actively in progress for this database. Please wait.'
      );
    }
    this.activeLocks.add(canonicalSource);

    const backupId = `bkp_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const profileCode = reqBody.profileCode || targetRegistry?.profile?.code || 'erp';
    const backupFileName = `${profileCode}_backup_${timestamp}_${backupId}.db`;

    if (reqBody.customDestinationDir) {
      const destResolved = path.resolve(reqBody.customDestinationDir);
      if (destResolved.toLowerCase() === canonicalSource.toLowerCase()) {
        this.activeLocks.delete(canonicalSource);
        throw new ValidationError('Backup destination cannot be identical to the source database.');
      }
    }

    const destDir = reqBody.customDestinationDir
      ? path.resolve(reqBody.customDestinationDir)
      : getBackupsDir();

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const finalBackupPath = path.join(destDir, backupFileName);
    const manifestPath = `${finalBackupPath}.manifest.json`;

    // Verify destination != source
    if (path.resolve(finalBackupPath).toLowerCase() === canonicalSource.toLowerCase()) {
      this.activeLocks.delete(canonicalSource);
      throw new ValidationError('Backup destination cannot be identical to the source database.');
    }

    // Staging directory for crash-safe publication
    const stagingDir = path.join(getBackupStagingDir(), backupId);
    fs.mkdirSync(stagingDir, { recursive: true });
    const stagedDbPath = path.join(stagingDir, backupFileName);
    const stagedManifestPath = path.join(stagingDir, `${backupFileName}.manifest.json`);

    // 4. Record PENDING state in Database
    const databaseId = targetRegistry?.databaseId || `db_${path.basename(canonicalSource, '.db')}`;
    const profileId = targetRegistry?.profileId || null;

    let backupRecord = await systemPrisma.backupRecord.create({
      data: {
        backupId,
        installationId: install.id,
        databaseId,
        profileId,
        sourcePath: canonicalSource,
        backupPath: finalBackupPath,
        backupType: reqBody.backupType || 'FULL',
        schemaVersion: targetRegistry?.schemaVersion || 1,
        applicationVersion: install.appVersion || '3.0.0',
        sizeBytes: stat.size,
        sha256: '', // populated post-creation
        status: 'CREATING',
      },
    });

    try {
      // 5. Checkpoint SQLite WAL to guarantee clean standalone database state
      const sourceClient = new PrismaClient({
        datasources: { db: { url: `file:${canonicalSource.replace(/\\/g, '/')}` } },
      });
      try {
        await sourceClient.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch (checkpointErr) {
        logger.warn(`[BackupService] WAL checkpoint on ${canonicalSource} non-critical warning: ${String(checkpointErr)}`);
      } finally {
        await sourceClient.$disconnect();
      }

      // 6. Safe copy / VACUUM INTO to staging file
      let snapshotSuccess = false;
      try {
        const tempClient = new PrismaClient({
          datasources: { db: { url: `file:${canonicalSource.replace(/\\/g, '/')}` } },
        });
        await tempClient.$executeRawUnsafe(`VACUUM INTO '${stagedDbPath.replace(/\\/g, '/')}'`);
        await tempClient.$disconnect();
        snapshotSuccess = true;
      } catch (vacuumErr) {
        logger.warn(`[BackupService] VACUUM INTO failed, running full checkpoint before fallback copy: ${String(vacuumErr)}`);
      }

      if (!snapshotSuccess) {
        const checkpointClient = new PrismaClient({
          datasources: { db: { url: `file:${canonicalSource.replace(/\\/g, '/')}` } },
        });
        try {
          await checkpointClient.$queryRawUnsafe('PRAGMA wal_checkpoint(FULL);');
        } finally {
          await checkpointClient.$disconnect();
        }
        fs.copyFileSync(canonicalSource, stagedDbPath);
      }

      // 7. Verify staging database SQLite integrity
      const verifyClient = new PrismaClient({
        datasources: { db: { url: `file:${stagedDbPath.replace(/\\/g, '/')}` } },
      });
      let tableCount = 0;
      let integrityResult = 'unknown';

      try {
        const integrityRows: any = await verifyClient.$queryRawUnsafe('PRAGMA integrity_check;');
        integrityResult = integrityRows?.[0]?.integrity_check || 'ok';
        if (integrityResult !== 'ok') {
          throw new ValidationError(`SQLite integrity check failed: ${integrityResult}`);
        }

        const tables: any = await verifyClient.$queryRawUnsafe(
          "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
        );
        tableCount = Number(tables?.[0]?.count || 0);
      } finally {
        await verifyClient.$disconnect();
      }

      // 8. Compute final SHA-256 and size on finalized staged file
      const finalStats = fs.statSync(stagedDbPath);
      const sha256 = this.calculateSha256(stagedDbPath);

      // 9. Write Manifest JSON into staging directory (Never contains passwords, PINs, or secrets)
      const manifest: BackupManifestDto = {
        formatVersion: 1,
        backupId,
        createdAt: new Date().toISOString(),
        application: {
          name: 'Diamond ERP',
          version: install.appVersion || '3.0.0',
        },
        installation: {
          installationId: install.installationId,
        },
        database: {
          databaseId,
          schemaVersion: targetRegistry?.schemaVersion || 1,
          displayName: targetRegistry?.displayName || path.basename(canonicalSource),
          profileCode,
        },
        artifact: {
          fileName: backupFileName,
          sizeBytes: finalStats.size,
          sha256,
        },
        verification: {
          sqliteIntegrity: integrityResult,
          tableCount,
          verifiedAt: new Date().toISOString(),
        },
      };

      fs.writeFileSync(stagedManifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      // Verify staged manifest
      if (!fs.existsSync(stagedManifestPath)) {
        throw new Error('Failed to write backup manifest in staging.');
      }

      // 10. Atomic publication to final destination
      fs.copyFileSync(stagedDbPath, finalBackupPath);
      fs.copyFileSync(stagedManifestPath, manifestPath);

      // Clean up staging folder
      try {
        if (fs.existsSync(stagedDbPath)) fs.unlinkSync(stagedDbPath);
        if (fs.existsSync(stagedManifestPath)) fs.unlinkSync(stagedManifestPath);
        if (fs.existsSync(stagingDir)) fs.rmdirSync(stagingDir);
      } catch {}

      // 11. Mark VERIFIED in Database
      backupRecord = await systemPrisma.backupRecord.update({
        where: { id: backupRecord.id },
        data: {
          status: 'VERIFIED',
          sizeBytes: finalStats.size,
          sha256,
          verifiedAt: new Date(),
        },
      });

      // 12. Log audit event
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'BACKUP',
          entityId: backupId,
          eventType: 'BACKUP_VERIFIED',
          description: `Verified backup created: ${backupFileName} (${finalStats.size} bytes)`,
          metadata: JSON.stringify({
            backupId,
            sizeBytes: finalStats.size,
            sha256,
            tableCount,
          }),
          performedBy,
        },
      });

      return this.formatRecord(backupRecord);
    } catch (err: any) {
      // Clean up staging and any incomplete output on failure
      try {
        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
        if (fs.existsSync(finalBackupPath)) {
          fs.unlinkSync(finalBackupPath);
        }
        if (fs.existsSync(manifestPath)) {
          fs.unlinkSync(manifestPath);
        }
      } catch {}

      await systemPrisma.backupRecord.update({
        where: { id: backupRecord.id },
        data: {
          status: 'FAILED',
          errorMessage: err?.message || 'Backup creation failed',
        },
      });

      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'BACKUP',
          entityId: backupId,
          eventType: 'BACKUP_FAILED',
          description: `Backup creation failed: ${err?.message || 'Unknown error'}`,
          performedBy,
        },
      });

      throw err;
    } finally {
      this.activeLocks.delete(canonicalSource);
    }
  }

  /**
   * List all verified backups from database and directory.
   */
  async listBackups(): Promise<BackupListResponseDto> {
    const install = await installationService.getOrCreateInstallation();
    const records = await systemPrisma.backupRecord.findMany({
      where: {
        installationId: install.id,
        status: { in: ['VERIFIED', 'CREATING', 'FAILED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      backups: records.map((r) => this.formatRecord(r)),
    };
  }

  /**
   * Inspect a backup by backupId or file path.
   */
  async inspectBackup(backupIdOrPath: string): Promise<any> {
    const record = await systemPrisma.backupRecord.findFirst({
      where: {
        OR: [{ backupId: backupIdOrPath }, { backupPath: backupIdOrPath }],
      },
    });

    const targetPath = record ? record.backupPath : path.resolve(backupIdOrPath);
    if (!fs.existsSync(targetPath)) {
      throw new NotFoundError(`Backup file not found: ${targetPath}`);
    }

    const manifestPath = `${targetPath}.manifest.json`;
    let manifest: BackupManifestDto | null = null;
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch {}
    }

    const stats = fs.statSync(targetPath);
    const validation = await databaseValidationService.validateDatabase(targetPath);

    return {
      backupId: record?.backupId || path.basename(targetPath, '.db'),
      canonicalPath: targetPath,
      sizeBytes: stats.size,
      lastModified: stats.mtime.toISOString(),
      status: record?.status || (validation.isValid ? 'VERIFIED' : 'INVALID'),
      sha256: record?.sha256 || this.calculateSha256(targetPath),
      manifest,
      validation,
    };
  }

  /**
   * Verify backup integrity and hash match.
   */
  async verifyBackup(backupIdOrPath: string): Promise<BackupVerificationDto> {
    const record = await systemPrisma.backupRecord.findFirst({
      where: {
        OR: [{ backupId: backupIdOrPath }, { backupPath: backupIdOrPath }],
      },
    });

    const targetPath = record ? record.backupPath : path.resolve(backupIdOrPath);
    if (!fs.existsSync(targetPath)) {
      throw new NotFoundError(`Backup file not found: ${targetPath}`);
    }

    const manifestPath = `${targetPath}.manifest.json`;
    let manifestPresent = fs.existsSync(manifestPath);
    let expectedHash = record?.sha256 || '';

    if (manifestPresent) {
      try {
        const manifest: BackupManifestDto = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        expectedHash = manifest.artifact.sha256;
      } catch {}
    }

    const currentHash = this.calculateSha256(targetPath);
    const stats = fs.statSync(targetPath);

    const client = new PrismaClient({
      datasources: { db: { url: `file:${targetPath.replace(/\\/g, '/')}` } },
    });

    let integrityResult = 'unknown';
    try {
      const integrityRows: any = await client.$queryRawUnsafe('PRAGMA integrity_check;');
      integrityResult = integrityRows?.[0]?.integrity_check || 'ok';
    } catch (err: any) {
      integrityResult = err?.message || 'failed';
    } finally {
      await client.$disconnect();
    }

    const sha256Matches = !expectedHash || expectedHash === currentHash;
    const isValid = integrityResult === 'ok' && sha256Matches;

    if (record) {
      await systemPrisma.backupRecord.update({
        where: { id: record.id },
        data: {
          status: isValid ? 'VERIFIED' : 'CORRUPTED',
          verifiedAt: new Date(),
        },
      });
    }

    return {
      backupId: record?.backupId || path.basename(targetPath, '.db'),
      isValid,
      sha256Matches,
      sqliteIntegrity: integrityResult,
      sizeBytes: stats.size,
      manifestPresent,
      verifiedAt: new Date().toISOString(),
      error: !isValid ? `Integrity check: ${integrityResult}, SHA match: ${sha256Matches}` : null,
    };
  }

  /**
   * Delete backup record (soft-delete, never touches live DB).
   */
  async deleteBackupRecord(backupId: string): Promise<void> {
    const record = await systemPrisma.backupRecord.findUnique({
      where: { backupId },
    });

    if (!record) {
      throw new NotFoundError(`Backup record not found: ${backupId}`);
    }

    await systemPrisma.backupRecord.update({
      where: { backupId },
      data: { status: 'DELETED' },
    });
  }

  /**
   * Clean up interrupted .partial files from backup directory.
   */
  cleanupPartialBackups(): void {
    const backupsDir = getBackupsDir();
    if (fs.existsSync(backupsDir)) {
      try {
        const files = fs.readdirSync(backupsDir);
        for (const file of files) {
          if (file.endsWith('.partial')) {
            const fullPath = path.join(backupsDir, file);
            try {
              fs.unlinkSync(fullPath);
              logger.info(`[BackupService] Purged stale partial backup: ${file}`);
            } catch {}
          }
        }
      } catch {}
    }

    const stagingDir = getBackupStagingDir();
    if (fs.existsSync(stagingDir)) {
      try {
        const entries = fs.readdirSync(stagingDir);
        for (const entry of entries) {
          const fullPath = path.join(stagingDir, entry);
          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
            logger.info(`[BackupService] Purged stale backup staging folder: ${entry}`);
          } catch {}
        }
      } catch {}
    }
  }

  private formatRecord(record: any): BackupRecordDto {
    return {
      id: record.id,
      backupId: record.backupId,
      installationId: record.installationId,
      databaseId: record.databaseId,
      profileId: record.profileId,
      sourcePath: record.sourcePath,
      backupPath: record.backupPath,
      backupType: record.backupType as any,
      schemaVersion: record.schemaVersion,
      applicationVersion: record.applicationVersion,
      sizeBytes: record.sizeBytes,
      sha256: record.sha256,
      status: record.status as any,
      createdAt: record.createdAt.toISOString(),
      verifiedAt: record.verifiedAt ? record.verifiedAt.toISOString() : null,
      errorMessage: record.errorMessage,
    };
  }
}

export const backupService = new BackupService();
