import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import {
  getDataDir,
  getDatabasesDir,
  getControlDbPath,
  getDatabaseTemplatePath,
  ensureAllDataDirs,
} from '../../../infrastructure/paths';
import { installationService } from '../installation.service';
import { preservationService } from '../preservation/preservation.service';
import { ConflictError, NotFoundError } from '../../../errors';
import { logger } from '../../../infrastructure/logging';
import type {
  UninstallPreflightDto,
  UninstallPreflightClassification,
  UninstallExportRequest,
  UninstallExportResponseDto,
  UninstallAuthorizationDto,
} from '@diamond-erp/contracts';

export class UninstallPreflightService {
  /**
   * Authoritative preflight inspection scanning active and deleted users, registered databases,
   * un-registered physical customer DBs, and verification state.
   */
  async getPreflightStatus(): Promise<UninstallPreflightDto> {
    ensureAllDataDirs();
    const install = await installationService.getOrCreateInstallation();
    const databasesDir = getDatabasesDir();
    const userAppDataDir = getDataDir();
    const controlDb = getControlDbPath().toLowerCase();
    const templateDb = getDatabaseTemplatePath()?.toLowerCase() || '';

    const databases: Array<{
      databaseId: string;
      displayName: string;
      canonicalPath: string;
      sizeBytes: number;
      hasRecentBackup: boolean;
      latestBackupAt?: string | null;
    }> = [];

    const seenPaths = new Set<string>();

    // 1. Registered databases
    const registries = await systemPrisma.databaseRegistry.findMany({
      where: { installationId: install.id, status: 'ACTIVE' },
    });

    for (const reg of registries) {
      if (!fs.existsSync(reg.canonicalPath)) continue;
      const lower = reg.canonicalPath.toLowerCase();
      if (lower === controlDb || lower === templateDb) continue;
      if (seenPaths.has(lower)) continue;
      seenPaths.add(lower);

      const sizeBytes = fs.statSync(reg.canonicalPath).size;

      // Find latest backup
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

    // 2. Scan databases directory for any unregistered physical customer databases
    if (fs.existsSync(databasesDir)) {
      try {
        const files = fs.readdirSync(databasesDir);
        for (const file of files) {
          if (!file.endsWith('.db') && !file.endsWith('.sqlite')) continue;
          const fullPath = path.resolve(databasesDir, file);
          const lower = fullPath.toLowerCase();
          if (lower === controlDb || lower === templateDb) continue;
          if (seenPaths.has(lower)) continue;
          seenPaths.add(lower);

          const stat = fs.statSync(fullPath);
          const latestBackup = await systemPrisma.backupRecord.findFirst({
            where: { status: 'VERIFIED' },
            orderBy: { createdAt: 'desc' },
          });

          databases.push({
            databaseId: `db_${path.basename(fullPath, path.extname(fullPath))}`,
            displayName: path.basename(fullPath),
            canonicalPath: fullPath,
            sizeBytes: stat.size,
            hasRecentBackup: !!latestBackup,
            latestBackupAt: latestBackup?.verifiedAt ? latestBackup.verifiedAt.toISOString() : null,
          });
        }
      } catch (err) {
        logger.warn(`[UninstallPreflightService] Error scanning databases dir: ${String(err)}`);
      }
    }

    const totalBackupsCount = await systemPrisma.backupRecord.count({
      where: { status: 'VERIFIED' },
    });

    const latestVerified = await systemPrisma.backupRecord.findFirst({
      where: { status: 'VERIFIED' },
      orderBy: { createdAt: 'desc' },
    });

    // Check preservation packages
    const preservationPackageCount = await systemPrisma.preservationPackage.count({
      where: { installationId: install.id, status: 'VERIFIED' },
    });

    const latestPreservation = await systemPrisma.preservationPackage.findFirst({
      where: { installationId: install.id, status: 'VERIFIED' },
      orderBy: { createdAt: 'desc' },
    });

    const pendingRestores = await systemPrisma.restoreRecord.count({
      where: { status: { in: ['PENDING', 'STAGING', 'ROLLBACK_READY', 'ACTIVATING'] } },
    });
    const pendingBackups = await systemPrisma.backupRecord.count({
      where: { status: { in: ['PENDING', 'CREATING', 'VERIFYING'] } },
    });
    const pendingPreservations = await systemPrisma.preservationPackage.count({
      where: { status: { in: ['PENDING', 'EXPORTING', 'BACKING_UP', 'VERIFYING'] } },
    });

    const pendingOperationsCount = pendingRestores + pendingBackups + pendingPreservations;

    // Classification State Machine
    let classification: UninstallPreflightClassification = 'NO_CUSTOMER_DATA';
    let canSafelyUninstall = false;
    let warningMessage: string | null = null;

    if (databases.length === 0) {
      classification = 'NO_CUSTOMER_DATA';
      canSafelyUninstall = true;
      warningMessage = 'No customer databases found on this machine. Ready for uninstallation.';
    } else if (pendingOperationsCount > 0) {
      classification = 'BLOCKED';
      canSafelyUninstall = false;
      warningMessage = `Uninstall blocked: ${pendingOperationsCount} operations currently in progress. Complete or cancel them before proceeding.`;
    } else if (latestPreservation && fs.existsSync(latestPreservation.destinationPath)) {
      classification = 'READY_FOR_UNINSTALL';
      canSafelyUninstall = true;
      warningMessage = 'Customer data verified and preserved. Diamond ERP uninstaller strictly preserves all customer databases in AppData by default.';
    } else {
      classification = 'CUSTOMER_DATA_PRESENT';
      canSafelyUninstall = false;
      warningMessage = 'Customer databases detected. Diamond ERP uninstaller strictly preserves all customer databases in AppData by default. A verified preservation package (export & backup) is required before uninstallation can proceed.';
    }

    return {
      canSafelyUninstall,
      classification,
      userAppDataDir,
      userAppDataPreservedByDefault: true,
      activeDatabasesCount: databases.length,
      databases,
      totalBackupsCount,
      latestVerifiedBackupAt: latestVerified?.verifiedAt
        ? latestVerified.verifiedAt.toISOString()
        : null,
      preservationPackageCount,
      latestPreservationPackageId: latestPreservation?.packageId || null,
      latestPreservationVerifiedAt: latestPreservation?.verifiedAt
        ? latestPreservation.verifiedAt.toISOString()
        : null,
      applicationVersion: install.appVersion,
      installationId: install.installationId,
      pendingOperationsCount,
      warningMessage,
    };
  }

  /**
   * Issues a short-lived, one-time cryptographic uninstall authorization token.
   * Can ONLY be issued if the preservation package is 100% verified.
   */
  async issueUninstallAuthorization(packageId: string): Promise<UninstallAuthorizationDto> {
    const install = await installationService.getOrCreateInstallation();

    // 1. Locate package in DB
    const pkg = await systemPrisma.preservationPackage.findUnique({
      where: { packageId },
    });

    if (!pkg) {
      throw new NotFoundError(`Preservation package "${packageId}" not found.`);
    }

    if (pkg.status !== 'VERIFIED') {
      throw new ConflictError(
        `Cannot authorize uninstall: Preservation package status is "${pkg.status}", must be "VERIFIED".`
      );
    }

    // 2. Re-verify package artifacts on disk
    const verification = await preservationService.verifyPreservationPackage(pkg.destinationPath);
    if (!verification.verified) {
      throw new ConflictError(`Uninstall authorization rejected: Package verification failed: ${verification.error}`);
    }

    // 3. Generate one-time cryptographic token
    const authorizationId = crypto.randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity window

    // Invalidate any previous unused authorizations
    await systemPrisma.uninstallAuthorization.updateMany({
      where: { installationId: install.id, status: 'ISSUED' },
      data: { status: 'REVOKED' },
    });

    await systemPrisma.uninstallAuthorization.create({
      data: {
        authorizationId,
        installationId: install.id,
        preservationPackageId: pkg.id,
        manifestSha256: pkg.manifestSha256 || '',
        status: 'ISSUED',
        createdAt,
        expiresAt,
      },
    });

    // 4. Write machine-readable uninstall-authorization.json into AppData for the Windows installer
    const tokenFilePath = path.join(getDataDir(), 'uninstall-authorization.json');
    const tokenPayload = {
      authorizationId,
      installationId: install.installationId,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      preservationPackageId: pkg.packageId,
      preservationDestinationPath: pkg.destinationPath,
      preservationManifestHash: pkg.manifestSha256,
      verifiedAt: pkg.verifiedAt ? pkg.verifiedAt.toISOString() : createdAt.toISOString(),
      consumedAt: null,
      status: 'ISSUED',
    };

    fs.writeFileSync(tokenFilePath, JSON.stringify(tokenPayload, null, 2), 'utf-8');

    await systemPrisma.auditEvent.create({
      data: {
        entityType: 'UNINSTALL',
        entityId: authorizationId,
        eventType: 'UNINSTALL_AUTHORIZATION_ISSUED',
        description: `One-time uninstall authorization issued for package ${packageId}`,
        metadata: JSON.stringify(tokenPayload),
        performedBy: 'system',
      },
    });

    logger.info(`[UninstallPreflightService] One-time uninstall authorization issued: ${authorizationId}`);

    return {
      authorizationId,
      installationId: install.installationId,
      preservationPackageId: pkg.packageId,
      manifestSha256: pkg.manifestSha256 || '',
      status: 'ISSUED',
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      consumedAt: null,
      tokenFilePath,
    };
  }

  /**
   * Validates the machine-readable authorization token.
   */
  async checkAuthorizationToken(): Promise<{ valid: boolean; token?: any; reason?: string }> {
    const tokenFilePath = path.join(getDataDir(), 'uninstall-authorization.json');
    if (!fs.existsSync(tokenFilePath)) {
      return { valid: false, reason: 'uninstall-authorization.json file does not exist in AppData.' };
    }

    let token: any;
    try {
      token = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));
    } catch {
      return { valid: false, reason: 'Corrupted uninstall-authorization.json file.' };
    }

    if (token.consumedAt) {
      return { valid: false, reason: 'Uninstall authorization has already been consumed (single-use).' };
    }

    if (new Date(token.expiresAt).getTime() < Date.now()) {
      return { valid: false, reason: 'Uninstall authorization has expired.' };
    }

    if (!token.preservationDestinationPath || !fs.existsSync(token.preservationDestinationPath)) {
      return { valid: false, reason: 'Referenced preservation package destination directory does not exist.' };
    }

    return { valid: true, token };
  }

  /**
   * Consumes the authorization token so it can never be re-used.
   */
  async consumeAuthorizationToken(authorizationId?: string): Promise<boolean> {
    const tokenFilePath = path.join(getDataDir(), 'uninstall-authorization.json');
    if (fs.existsSync(tokenFilePath)) {
      try {
        const token = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));
        token.consumedAt = new Date().toISOString();
        token.status = 'CONSUMED';
        fs.writeFileSync(tokenFilePath, JSON.stringify(token, null, 2), 'utf-8');
      } catch {}
    }

    if (authorizationId) {
      await systemPrisma.uninstallAuthorization.updateMany({
        where: { authorizationId },
        data: {
          consumedAt: new Date(),
          status: 'CONSUMED',
        },
      }).catch(() => {});
    }

    return true;
  }

  /**
   * Legacy pre-uninstall backup bundle backward compatibility.
   */
  async createUninstallBackup(
    req: UninstallExportRequest,
    performedBy: string = 'system'
  ): Promise<UninstallExportResponseDto> {
    const res = await preservationService.createPreservationPackage(
      {
        destinationDir: req.destinationDir,
        confirmPreservation: req.confirmPreUninstallBackup,
      },
      performedBy
    );

    return {
      success: true,
      exportBundlePath: res.destinationPath,
      manifestPath: res.manifestPath || '',
      sizeBytes: res.sizeBytes,
      databasesBackedUp: 1,
      verifiedAt: res.verifiedAt || new Date().toISOString(),
    };
  }
}

export const uninstallPreflightService = new UninstallPreflightService();
