import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import {
  getDataDir,
  getDatabasesDir,
  getBackupsDir,
  ensureAllDataDirs,
} from '../../../infrastructure/paths';
import { backupService } from '../backup/backup.service';
import { installationService } from '../installation.service';
import { ValidationError, ConflictError } from '../../../errors';
import { logger } from '../../../infrastructure/logging';
import type {
  UninstallPreflightDto,
  UninstallExportRequest,
  UninstallExportResponseDto,
} from '@diamond-erp/contracts';

export class UninstallPreflightService {
  /**
   * Preflight inspection answering what data exists, what remains, and whether backups exist.
   */
  async getPreflightStatus(): Promise<UninstallPreflightDto> {
    ensureAllDataDirs();
    const install = await installationService.getOrCreateInstallation();
    const databasesDir = getDatabasesDir();
    const userAppDataDir = getDataDir();

    const databases: Array<{
      databaseId: string;
      displayName: string;
      canonicalPath: string;
      sizeBytes: number;
      hasRecentBackup: boolean;
      latestBackupAt?: string | null;
    }> = [];

    // Find all active registered or physical profile databases
    const registries = await systemPrisma.databaseRegistry.findMany({
      where: { installationId: install.id, status: 'ACTIVE' },
    });

    for (const reg of registries) {
      if (!fs.existsSync(reg.canonicalPath)) continue;
      const sizeBytes = fs.statSync(reg.canonicalPath).size;

      // Find latest backup for this DB
      const latestBackup = await systemPrisma.backupRecord.findFirst({
        where: { databaseId: reg.databaseId, status: 'VERIFIED' },
        orderBy: { createdAt: 'desc' },
      });

      databases.push({
        databaseId: reg.databaseId,
        displayName: reg.displayName,
        canonicalPath: reg.canonicalPath,
        sizeBytes,
        hasRecentBackup: !!latestBackup,
        latestBackupAt: latestBackup?.verifiedAt ? latestBackup.verifiedAt.toISOString() : null,
      });
    }

    // Also check Stavan.db or template if databases empty
    if (databases.length === 0) {
      const defaultDb = path.join(databasesDir, 'Stavan.db');
      const candidateDb = fs.existsSync(defaultDb) ? defaultDb : null;
      if (candidateDb && fs.existsSync(candidateDb)) {
        const stat = fs.statSync(candidateDb);
        const latestBackup = await systemPrisma.backupRecord.findFirst({
          where: { status: 'VERIFIED' },
          orderBy: { createdAt: 'desc' },
        });

        databases.push({
          databaseId: 'db_default',
          displayName: 'Default Company Database',
          canonicalPath: candidateDb,
          sizeBytes: stat.size,
          hasRecentBackup: !!latestBackup,
          latestBackupAt: latestBackup?.verifiedAt ? latestBackup.verifiedAt.toISOString() : null,
        });
      }
    }

    const totalBackupsCount = await systemPrisma.backupRecord.count({
      where: { status: 'VERIFIED' },
    });

    const latestVerified = await systemPrisma.backupRecord.findFirst({
      where: { status: 'VERIFIED' },
      orderBy: { createdAt: 'desc' },
    });

    const pendingRestores = await systemPrisma.restoreRecord.count({
      where: { status: { in: ['PENDING', 'STAGING', 'ROLLBACK_READY', 'ACTIVATING'] } },
    });
    const pendingBackups = await systemPrisma.backupRecord.count({
      where: { status: { in: ['PENDING', 'CREATING', 'VERIFYING'] } },
    });
    const pendingOperationsCount = pendingRestores + pendingBackups;
    const canSafelyUninstall = pendingOperationsCount === 0;

    return {
      canSafelyUninstall,
      userAppDataDir,
      userAppDataPreservedByDefault: true,
      activeDatabasesCount: databases.length,
      databases,
      totalBackupsCount,
      latestVerifiedBackupAt: latestVerified?.verifiedAt
        ? latestVerified.verifiedAt.toISOString()
        : null,
      applicationVersion: install.appVersion,
      installationId: install.installationId,
      pendingOperationsCount,
      warningMessage: !canSafelyUninstall
        ? `There are ${pendingOperationsCount} active/pending operations in progress. Finish or cancel them before uninstalling.`
        : 'Diamond ERP preserves all customer databases and configurations in AppData by default during uninstall. Application binaries in Program Files are removed without touching your ERP data.',
    };
  }

  /**
   * Pre-uninstall full backup bundle. Must be 100% verified.
   */
  async createUninstallBackup(
    req: UninstallExportRequest,
    performedBy: string = 'system'
  ): Promise<UninstallExportResponseDto> {
    if (!req.confirmPreUninstallBackup) {
      throw new ValidationError('Explicit confirmation required to trigger pre-uninstall backup.');
    }

    ensureAllDataDirs();
    const install = await installationService.getOrCreateInstallation();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bundleId = `uninstall_${crypto.randomUUID()}`;
    const destinationRoot = req.destinationDir ? path.resolve(req.destinationDir) : getBackupsDir();
    const bundleDir = path.join(destinationRoot, `DiamondERP_Uninstall_Backup_${timestamp}_${bundleId}`);
    fs.mkdirSync(bundleDir, { recursive: true });

    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'UNINSTALL',
        entityId: bundleId,
        eventType: 'UNINSTALL_BACKUP_STARTED',
        description: `Pre-uninstall backup initiated into: ${bundleDir}`,
        performedBy,
      },
    });

    const preflight = await this.getPreflightStatus();
    if (!preflight.canSafelyUninstall) {
      throw new ConflictError(
        `Cannot create pre-uninstall backup: Unsafe state detected (${preflight.warningMessage})`
      );
    }

    // Invariant: Enforce all active registered databases exist on disk
    const activeRegistries = await systemPrisma.databaseRegistry.findMany({
      where: { installationId: install.id, status: 'ACTIVE' },
    });
    for (const reg of activeRegistries) {
      if (!fs.existsSync(reg.canonicalPath)) {
        throw new ConflictError(
          `Pre-uninstall backup failed: Required registered database "${reg.displayName}" at ${reg.canonicalPath} does not exist on disk. All-or-nothing backup aborted.`
        );
      }
    }

    let totalBytes = 0;
    let databasesBackedUp = 0;

    for (const db of preflight.databases) {
      if (!fs.existsSync(db.canonicalPath)) {
        throw new ConflictError(
          `Pre-uninstall backup failed: Required database "${db.displayName}" at ${db.canonicalPath} does not exist on disk. All-or-nothing backup aborted.`
        );
      }

      try {
        const backupResult = await backupService.createBackup(
          {
            databasePath: db.canonicalPath,
            customDestinationDir: bundleDir,
            backupType: 'UNINSTALL',
            note: 'Full pre-uninstall standalone database snapshot',
          },
          performedBy
        );

        totalBytes += backupResult.sizeBytes;
        databasesBackedUp++;
      } catch (err: any) {
        logger.error(`[UninstallPreflightService] Failed to back up ${db.canonicalPath}:`, err);
        throw new ConflictError(
          `Pre-uninstall backup failed for database ${db.displayName}: ${err?.message}. Destructive action aborted.`
        );
      }
    }

    if (databasesBackedUp !== preflight.databases.length) {
      throw new ConflictError(
        `Pre-uninstall backup incomplete: Only ${databasesBackedUp} of ${preflight.databases.length} databases backed up. All-or-nothing backup aborted.`
      );
    }

    // Write top-level uninstall bundle manifest
    const manifestPath = path.join(bundleDir, 'uninstall-manifest.json');
    const manifest = {
      bundleId,
      createdAt: new Date().toISOString(),
      installationId: install.installationId,
      appVersion: install.appVersion,
      databasesBackedUp,
      totalSizeBytes: totalBytes,
      dataDirectoryPreserved: preflight.userAppDataDir,
      status: 'VERIFIED',
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'UNINSTALL',
        entityId: bundleId,
        eventType: 'UNINSTALL_BACKUP_VERIFIED',
        description: `Pre-uninstall backup verified (${databasesBackedUp} databases, ${totalBytes} bytes)`,
        metadata: JSON.stringify(manifest),
        performedBy,
      },
    });

    return {
      success: true,
      exportBundlePath: bundleDir,
      manifestPath,
      sizeBytes: totalBytes,
      databasesBackedUp,
      verifiedAt: new Date().toISOString(),
    };
  }
}

export const uninstallPreflightService = new UninstallPreflightService();
