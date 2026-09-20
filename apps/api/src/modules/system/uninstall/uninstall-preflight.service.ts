import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import {
  getDataDir,
  ensureAllDataDirs,
} from '../../../infrastructure/paths';
import { installationService } from '../installation.service';
import { preservationService } from '../preservation/preservation.service';
import { customerDataDetectionService } from './customer-data-detection.service';
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
    const userAppDataDir = getDataDir();

    const detection = await customerDataDetectionService.detectCustomerData();
    const databases = detection.databases;

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

    // Classification State Machine (per Section 16 of specification)
    let classification: UninstallPreflightClassification = 'NO_CUSTOMER_DATA';
    let canSafelyUninstall = false;
    let warningMessage: string | null = null;

    const activeAuth = await systemPrisma.uninstallAuthorization.findFirst({
      where: {
        installationId: install.id,
        status: 'ISSUED',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (databases.length === 0) {
      classification = 'NO_CUSTOMER_DATA';
      canSafelyUninstall = true;
      warningMessage = 'No customer databases found on this machine. Ready for uninstallation.';
    } else if (pendingOperationsCount > 0) {
      classification = 'BLOCKED';
      canSafelyUninstall = false;
      warningMessage = `Uninstall blocked: ${pendingOperationsCount} operations currently in progress. Complete or cancel them before proceeding.`;
    } else if (activeAuth) {
      classification = 'READY_FOR_UNINSTALL';
      canSafelyUninstall = true;
      warningMessage = 'Uninstall authorization is active and verified. You may proceed with Windows uninstallation.';
    } else if (latestPreservation && fs.existsSync(latestPreservation.destinationPath)) {
      classification = 'PRESERVATION_VERIFIED';
      canSafelyUninstall = false;
      warningMessage = 'Customer data verified and preserved. Authorization is required before uninstallation can proceed.';
    } else {
      classification = 'CUSTOMER_DATA_PRESENT';
      canSafelyUninstall = false;
      warningMessage = 'Customer databases detected. Diamond ERP uninstaller strictly preserves all customer databases in AppData by default. A verified preservation package (export & backup) is required before uninstallation can proceed.';
    }

    const lastDestSetting = await systemPrisma.setting.findUnique({
      where: { key: 'lastPreservationDestination' },
    }).catch(() => null);
    const lastPreservationDestination = lastDestSetting?.value || null;

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
      lastPreservationDestination,
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
    const nonce = crypto.randomBytes(16).toString('hex');
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

    // 4. Write machine-readable uninstall-authorization.json into AppData for the Windows installer atomically
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
      nonce,
      consumedAt: null,
      status: 'ISSUED',
    };

    const tmpTokenFilePath = `${tokenFilePath}.tmp_${crypto.randomUUID()}`;
    const fd = fs.openSync(tmpTokenFilePath, 'w');
    fs.writeSync(fd, JSON.stringify(tokenPayload, null, 2), 0, 'utf-8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmpTokenFilePath, tokenFilePath);

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
      preservationDestinationPath: pkg.destinationPath,
      preservationManifestHash: pkg.manifestSha256 || '',
      nonce,
      status: 'ISSUED',
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      consumedAt: null,
      tokenFilePath,
    };
  }

  /**
   * Validates the machine-readable authorization token.
   * Performs deep independent verification:
   * - Token exists and valid JSON
   * - Not consumed, not expired, status == 'ISSUED'
   * - installationId matches current installation
   * - Destination directory exists
   * - preservation-manifest.json exists and SHA256 checksum matches
   * - PackageId in manifest matches authorization
   * - Control DB authorization record (if present) is not CONSUMED/REVOKED
   */
  async checkAuthorizationToken(): Promise<{ valid: boolean; token?: any; reason?: string; error?: string }> {
    const tokenFilePath = path.join(getDataDir(), 'uninstall-authorization.json');
    if (!fs.existsSync(tokenFilePath)) {
      const msg = 'uninstall-authorization.json file does not exist in AppData.';
      return { valid: false, reason: msg, error: msg };
    }

    let token: any;
    try {
      token = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));
    } catch {
      const msg = 'Corrupted uninstall-authorization.json file.';
      return { valid: false, reason: msg, error: msg };
    }

    if (!token.authorizationId) {
      const msg = 'Authorization token is missing authorizationId.';
      return { valid: false, reason: msg, error: msg };
    }

    if (token.status !== 'ISSUED') {
      const msg = `Authorization token status is "${token.status}", must be "ISSUED".`;
      return { valid: false, reason: msg, error: msg };
    }

    if (token.consumedAt) {
      const msg = 'Uninstall authorization has already been consumed (single-use).';
      return { valid: false, reason: msg, error: msg };
    }

    if (new Date(token.expiresAt).getTime() < Date.now()) {
      const msg = 'Uninstall authorization has expired.';
      return { valid: false, reason: msg, error: msg };
    }

    const install = await installationService.getOrCreateInstallation();
    if (token.installationId && token.installationId !== install.installationId) {
      const msg = 'Authorization installation ID does not match current machine installation.';
      return { valid: false, reason: msg, error: msg };
    }

    if (!token.preservationDestinationPath || !fs.existsSync(token.preservationDestinationPath)) {
      const msg = 'Referenced preservation package destination directory does not exist.';
      return { valid: false, reason: msg, error: msg };
    }

    const manifestPath = path.join(token.preservationDestinationPath, 'preservation-manifest.json');
    if (!fs.existsSync(manifestPath)) {
      const msg = 'Preservation manifest file missing from destination directory.';
      return { valid: false, reason: msg, error: msg };
    }

    const actualManifestSha = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
    const expectedManifestSha = token.preservationManifestHash || token.manifestSha256;
    if (expectedManifestSha && expectedManifestSha !== actualManifestSha) {
      const msg = 'Preservation manifest SHA-256 mismatch (manifest tampered with or modified).';
      return { valid: false, reason: msg, error: msg };
    }

    try {
      const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (token.preservationPackageId && manifestJson.packageId !== token.preservationPackageId) {
        const msg = 'Preservation package ID does not match manifest.';
        return { valid: false, reason: msg, error: msg };
      }
    } catch {
      const msg = 'Corrupt preservation manifest in package.';
      return { valid: false, reason: msg, error: msg };
    }

    // Also verify database status if accessible
    const dbAuth = await systemPrisma.uninstallAuthorization.findUnique({
      where: { authorizationId: token.authorizationId },
    }).catch(() => null);

    if (dbAuth) {
      if (dbAuth.status === 'CONSUMED' || dbAuth.consumedAt) {
        const msg = 'Authorization has already been marked CONSUMED in control plane.';
        return { valid: false, reason: msg, error: msg };
      }
      if (dbAuth.status === 'REVOKED') {
        const msg = 'Authorization has been REVOKED.';
        return { valid: false, reason: msg, error: msg };
      }
    }

    return { valid: true, token };
  }

  /**
   * Consumes the authorization token atomically so it can never be re-used.
   */
  async consumeAuthorizationToken(authorizationId?: string): Promise<boolean> {
    const tokenFilePath = path.join(getDataDir(), 'uninstall-authorization.json');
    if (fs.existsSync(tokenFilePath)) {
      try {
        const token = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));
        if (token.consumedAt || token.status === 'CONSUMED') {
          return false;
        }
        token.consumedAt = new Date().toISOString();
        token.status = 'CONSUMED';

        const tmpFilePath = `${tokenFilePath}.tmp_${crypto.randomUUID()}`;
        const fd = fs.openSync(tmpFilePath, 'w');
        fs.writeSync(fd, JSON.stringify(token, null, 2), 0, 'utf-8');
        fs.fsyncSync(fd);
        fs.closeSync(fd);

        fs.renameSync(tmpFilePath, tokenFilePath);

        if (!authorizationId && token.authorizationId) {
          authorizationId = token.authorizationId;
        }
      } catch (err) {
        logger.warn(`[UninstallPreflightService] Error atomically updating authorization file: ${err}`);
      }
    }

    if (authorizationId) {
      await systemPrisma.uninstallAuthorization.updateMany({
        where: { authorizationId },
        data: {
          consumedAt: new Date(),
          status: 'CONSUMED',
        },
      }).catch(() => {});

      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'UNINSTALL',
          entityId: authorizationId,
          eventType: 'UNINSTALL_AUTHORIZATION_CONSUMED',
          description: `Uninstall authorization ${authorizationId} consumed.`,
          performedBy: 'system',
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
