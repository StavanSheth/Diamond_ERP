import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import {
  getDataDir,
  getDatabasesDir,
  getExportDir,
  getControlDbPath,
  getDatabaseTemplatePath,
  ensureAllDataDirs,
} from '../../../infrastructure/paths';
import { canonicalizeDatabasePath } from '../database/database-path.util';
import { databaseValidationService } from '../database/database-validation.service';
import { installationService } from '../installation.service';
import { backupService } from '../backup/backup.service';
import { ValidationError, NotFoundError, ConflictError } from '../../../errors';
import { logger } from '../../../infrastructure/logging';
import type {
  CreatePreservationPackageRequest,
  PreservationPackageDto,
  PreservationVerificationDto,
} from '@diamond-erp/contracts';
import { buildExportQueries } from '../export/export-entity-registry';
import { customerDataDetectionService } from '../uninstall/customer-data-detection.service';

export class PreservationService {
  /**
   * Authoritative validation of preservation destination directory according to Windows ERP safety rules:
   * 1. Not system root (e.g. C:\ or \)
   * 2. Not Windows system directory (e.g. C:\Windows or %WINDIR%)
   * 3. Not active database file or databases directory
   * 4. Not control database or template database
   * 5. Real writability test using .diamond-erp-write-test-<uuid>.tmp with fsync & delete
   */
  public validateDestinationDirectory(destinationRoot: string, canonicalSource: string): void {
    const controlDb = getControlDbPath().toLowerCase();
    const templateDb = getDatabaseTemplatePath()?.toLowerCase() || '';
    const normDest = path.resolve(destinationRoot);
    const lowerDest = normDest.toLowerCase();

    // 1. Root directory check (e.g. C:\ or \)
    const parsed = path.parse(normDest);
    if (parsed.root.toLowerCase() === lowerDest || lowerDest === '\\' || lowerDest === '/') {
      throw new ValidationError('Preservation destination cannot be the system root directory.');
    }

    // 2. Windows system directory check
    const winDir = (process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows').toLowerCase();
    if (lowerDest.startsWith(winDir)) {
      throw new ValidationError('Preservation destination cannot be inside the Windows system directory.');
    }

    // 3. Source DB file & database source directory
    if (lowerDest === canonicalSource.toLowerCase()) {
      throw new ValidationError('Preservation destination cannot be the source database file.');
    }
    const sourceDir = path.dirname(canonicalSource).toLowerCase();
    if (lowerDest === sourceDir) {
      throw new ValidationError('Preservation destination cannot be the database source directory.');
    }

    // 4. Control DB & template DB
    if (lowerDest === controlDb || lowerDest === templateDb) {
      throw new ValidationError('Preservation destination cannot be system or template databases.');
    }

    // 5. Customer databases directory
    const dedicatedDbsDir = path.join(getDataDir(), 'databases').toLowerCase();
    if (lowerDest === dedicatedDbsDir || lowerDest.startsWith(dedicatedDbsDir + path.sep)) {
      throw new ValidationError('Preservation destination cannot be inside the customer database directory.');
    }
    if (path.basename(getDatabasesDir().toLowerCase()) === 'databases') {
      const dbsDir = getDatabasesDir().toLowerCase();
      if (lowerDest === dbsDir || lowerDest.startsWith(dbsDir + path.sep)) {
        throw new ValidationError('Preservation destination cannot be inside the customer database directory.');
      }
    }

    // 6. Test writability with actual write, flush (fsync), close, delete (.diamond-erp-write-test-<uuid>.tmp)
    try {
      if (!fs.existsSync(normDest)) {
        fs.mkdirSync(normDest, { recursive: true });
      }
      const testFile = path.join(normDest, `.diamond-erp-write-test-${crypto.randomUUID()}.tmp`);
      const fd = fs.openSync(testFile, 'w');
      fs.writeSync(fd, 'diamond_erp_preservation_write_test\n');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fs.unlinkSync(testFile);
    } catch (permErr: any) {
      throw new ConflictError(
        `Preservation destination directory "${normDest}" is not writable: ${permErr.message}`
      );
    }
  }
  private calculateSha256(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  private sanitizeCellValue(value: any): any {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^[=+\-@\t\r]/.test(trimmed)) {
        return `'${value}`;
      }
    }
    return value;
  }

  /**
   * Creates a complete, verified uninstall preservation package:
   * 1. Verified SQLite database backup (database_backup.db + manifest)
   * 2. CSV exports for all authoritative business entities
   * 3. XLSX workbook (business_data.xlsx) with entity sheets
   * 4. export-manifest.json and preservation-manifest.json
   * All-or-nothing: aborts and cleans up temp bundle on any error.
   */
  /**
   * Creates a complete, verified uninstall preservation package:
   * 1. Verified SQLite database backups for ALL active customer databases (User A -> DB A, User B -> DB B...)
   * 2. CSV exports for all authoritative business entities per database with formula injection protection
   * 3. XLSX workbooks per database with entity sheets
   * 4. Comprehensive multi-database export-manifest.json and preservation-manifest.json
   * 5. All-or-nothing verification: aborts and cleans up staging on any failure.
   */
  async createPreservationPackage(
    req: CreatePreservationPackageRequest,
    performedBy: string = 'system'
  ): Promise<PreservationPackageDto> {
    if (!req.confirmPreservation) {
      throw new ValidationError('Explicit confirmation required to create pre-uninstall preservation package.');
    }

    ensureAllDataDirs();
    const install = await installationService.getOrCreateInstallation();

    const controlDb = getControlDbPath().toLowerCase();
    const templateDb = getDatabaseTemplatePath()?.toLowerCase() || '';

    interface DbPreserveItem {
      canonicalPath: string;
      databaseId: string;
      profileId: string | null;
      profileCode: string;
      userId: string | null;
      username: string | null;
      schemaVersion: number;
    }

    const databasesToPreserve: DbPreserveItem[] = [];
    const seenPaths = new Set<string>();

    // If explicit databasePath is provided
    if (req.databasePath) {
      const pathRes = canonicalizeDatabasePath(req.databasePath);
      if (!pathRes.valid) throw new ValidationError(pathRes.error || 'Invalid database path');
      const canonical = pathRes.canonicalPath;
      if (canonical.toLowerCase() === controlDb || canonical.toLowerCase() === templateDb) {
        throw new ValidationError('Cannot preserve control or template database as customer data.');
      }
      if (!fs.existsSync(canonical)) {
        throw new NotFoundError(`Source database file does not exist: ${canonical}`);
      }

      const reg = await systemPrisma.databaseRegistry.findFirst({
        where: { canonicalPath: canonical },
        include: { profile: { include: { userProfiles: { include: { user: true } } } } },
      });
      const activeUser = reg?.profile?.userProfiles?.find((up) => up.isActive && up.user && !up.user.deletedAt)?.user;
      databasesToPreserve.push({
        canonicalPath: canonical,
        databaseId: reg?.databaseId || `db_${path.basename(canonical, '.db')}`,
        profileId: reg?.profileId || null,
        profileCode: reg?.profile?.code || path.basename(canonical, '.db'),
        userId: activeUser?.id || null,
        username: activeUser?.username || null,
        schemaVersion: reg?.schemaVersion || 1,
      });
      seenPaths.add(canonical.toLowerCase());
    }

    // Preserve all active customer databases when no single DB is requested, or if preserveAll is true
    if (!req.databasePath || req.preserveAll) {
      const activeRegistries = await systemPrisma.databaseRegistry.findMany({
        where: { installationId: install.id, status: 'ACTIVE' },
        include: { profile: { include: { userProfiles: { include: { user: true } } } } },
      });

      for (const reg of activeRegistries) {
        if (!fs.existsSync(reg.canonicalPath)) {
          logger.warn(`Registered database missing on disk: ${reg.canonicalPath}, skipping from preservation`);
          continue;
        }
        const lower = reg.canonicalPath.toLowerCase();
        if (lower === controlDb || lower === templateDb) continue;
        if (seenPaths.has(lower)) continue;
        seenPaths.add(lower);

        const activeUser = reg.profile?.userProfiles?.find((up) => up.isActive && up.user && !up.user.deletedAt)?.user;
        databasesToPreserve.push({
          canonicalPath: reg.canonicalPath,
          databaseId: reg.databaseId,
          profileId: reg.profileId,
          profileCode: reg.profile?.code || path.basename(reg.canonicalPath, '.db'),
          userId: activeUser?.id || null,
          username: activeUser?.username || null,
          schemaVersion: reg.schemaVersion || 1,
        });
      }

      // Check customerDataDetectionService for any physical customer DBs
      try {
        const detected = await customerDataDetectionService.detectCustomerData();
        for (const detDb of detected.databases) {
          const lower = detDb.canonicalPath.toLowerCase();
          if (lower === controlDb || lower === templateDb) continue;
          if (seenPaths.has(lower)) continue;
          seenPaths.add(lower);

          const reg = await systemPrisma.databaseRegistry.findFirst({
            where: { canonicalPath: detDb.canonicalPath },
            include: { profile: { include: { userProfiles: { include: { user: true } } } } },
          });
          const activeUser = reg?.profile?.userProfiles?.find((up) => up.isActive && up.user && !up.user.deletedAt)?.user;
          databasesToPreserve.push({
            canonicalPath: detDb.canonicalPath,
            databaseId: detDb.databaseId,
            profileId: reg?.profileId || null,
            profileCode: reg?.profile?.code || path.basename(detDb.canonicalPath, '.db'),
            userId: activeUser?.id || null,
            username: activeUser?.username || null,
            schemaVersion: reg?.schemaVersion || 1,
          });
        }
      } catch (err) {
        logger.warn(`[PreservationService] Customer data detection lookup error: ${String(err)}`);
      }
    }

    if (databasesToPreserve.length === 0) {
      const defaultDb = path.join(getDatabasesDir(), 'Stavan.db');
      if (fs.existsSync(defaultDb)) {
        databasesToPreserve.push({
          canonicalPath: defaultDb,
          databaseId: 'db_Stavan',
          profileId: null,
          profileCode: 'Stavan',
          userId: null,
          username: null,
          schemaVersion: 1,
        });
      } else {
        throw new NotFoundError('No active customer database found to preserve.');
      }
    }

    const primaryDb = databasesToPreserve[0];
    const canonicalSource = primaryDb.canonicalPath;

    // 2. Validate destination directory against source databases
    let destinationRoot = req.destinationDir ? path.resolve(req.destinationDir) : getExportDir();
    this.validateDestinationDirectory(destinationRoot, canonicalSource);

    const packageId = `pkg_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bundleDirName = `DiamondERP_Uninstall_${timestamp}_${packageId}`;
    const bundleDir = path.join(destinationRoot, bundleDirName);
    fs.mkdirSync(bundleDir, { recursive: true });

    const databasesBundleDir = path.join(bundleDir, 'databases');
    const csvBundleDir = path.join(bundleDir, 'csv');
    const xlsxBundleDir = path.join(bundleDir, 'xlsx');
    fs.mkdirSync(databasesBundleDir, { recursive: true });
    fs.mkdirSync(csvBundleDir, { recursive: true });
    fs.mkdirSync(xlsxBundleDir, { recursive: true });

    // Record PENDING state in control database
    await systemPrisma.preservationPackage.create({
      data: {
        packageId,
        installationId: install.id,
        databaseId: primaryDb.databaseId,
        profileId: primaryDb.profileId,
        destinationPath: bundleDir,
        status: 'PENDING',
        sizeBytes: 0,
      },
    });

    let totalBytes = 0;
    let totalAllRows = 0;
    const manifestDatabases: any[] = [];
    let primaryDbBackupPath = '';
    let primaryDbBackupSha = '';
    let primaryDbBackupSize = 0;
    let primaryCsvFiles: any[] = [];
    let primaryXlsxSha = '';
    let primaryXlsxSize = 0;

    try {
      for (let idx = 0; idx < databasesToPreserve.length; idx++) {
        const dbItem = databasesToPreserve[idx];
        const isPrimary = idx === 0;
        const dbFolderName = dbItem.profileCode;

        // ── Step A: Create Verified SQLite Backup for this database ──────
        await systemPrisma.preservationPackage.update({
          where: { packageId },
          data: { status: 'BACKING_UP' },
        });

        const backupResult = await backupService.createBackup(
          {
            databasePath: dbItem.canonicalPath,
            customDestinationDir: bundleDir,
            backupType: 'UNINSTALL',
            note: `Pre-uninstall preservation snapshot for ${dbFolderName}`,
          },
          performedBy
        );

        const dbTargetFolder = path.join(databasesBundleDir, dbFolderName);
        fs.mkdirSync(dbTargetFolder, { recursive: true });
        const targetDbBackupPath = path.join(dbTargetFolder, 'database_backup.db');
        const targetDbBackupManifestPath = path.join(dbTargetFolder, 'database_backup.db.manifest.json');
        fs.copyFileSync(backupResult.backupPath, targetDbBackupPath);

        const dbBackupSha256 = this.calculateSha256(targetDbBackupPath);
        const dbBackupStat = fs.statSync(targetDbBackupPath);

        const dbBackupManifest = {
          packageId,
          backupId: backupResult.backupId,
          databaseId: dbItem.databaseId,
          profileCode: dbFolderName,
          userId: dbItem.userId,
          username: dbItem.username,
          fileName: 'database_backup.db',
          sha256: dbBackupSha256,
          sizeBytes: dbBackupStat.size,
          schemaVersion: backupResult.schemaVersion,
          applicationVersion: install.appVersion,
          createdAt: new Date().toISOString(),
        };
        fs.writeFileSync(targetDbBackupManifestPath, JSON.stringify(dbBackupManifest, null, 2), 'utf-8');

        // Backwards compatibility for primary DB
        if (isPrimary) {
          primaryDbBackupPath = path.join(bundleDir, 'database_backup.db');
          const primaryManifestPath = path.join(bundleDir, 'database_backup.db.manifest.json');
          fs.copyFileSync(targetDbBackupPath, primaryDbBackupPath);
          fs.copyFileSync(targetDbBackupManifestPath, primaryManifestPath);
          primaryDbBackupSha = dbBackupSha256;
          primaryDbBackupSize = dbBackupStat.size;
        }

        totalBytes += dbBackupStat.size;

        // ── Step B: Export CSV & XLSX Data for this database ────────────
        await systemPrisma.preservationPackage.update({
          where: { packageId },
          data: { status: 'EXPORTING' },
        });

        const dbCsvDir = path.join(csvBundleDir, dbFolderName);
        fs.mkdirSync(dbCsvDir, { recursive: true });

        const client = new PrismaClient({
          datasources: { db: { url: `file:${dbItem.canonicalPath.replace(/\\/g, '/')}` } },
        });

        let dbTotalRows = 0;
        const dbCsvFiles: Array<{ fileName: string; tableName: string; rowCount: number; sha256: string; sizeBytes: number }> = [];

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Diamond ERP V3';
        workbook.created = new Date();

        try {
          const tableEntities = buildExportQueries(client);

          for (const entity of tableEntities) {
            let rows: any[] = [];
            try {
              rows = await entity.query();
            } catch {
              throw new ConflictError(
                `Preservation export failed: could not read table "${entity.name}" for database "${dbFolderName}". All-or-nothing preservation aborted.`
              );
            }

            let columnNames: string[] = [];
            try {
              const colInfo = await client.$queryRawUnsafe<Array<{ name: string }>>(
                `PRAGMA table_info("${entity.name}")`
              );
              columnNames = colInfo
                .map((c) => c.name)
                .filter((k) => !/password|pin|hash|secret|token/i.test(k));
            } catch {}

            const sanitizedRows = rows.map((row) => {
              const clean: Record<string, any> = {};
              for (const [k, v] of Object.entries(row)) {
                if (/password|pin|hash|secret|token/i.test(k)) continue;
                clean[k] = this.sanitizeCellValue(v);
              }
              return clean;
            });

            if (columnNames.length === 0) {
              columnNames = sanitizedRows.length > 0 ? Object.keys(sanitizedRows[0]) : ['id'];
            }

            const csvFileName = `${entity.name}.csv`;
            const csvPath = path.join(dbCsvDir, csvFileName);
            const csvOutput = stringify(sanitizedRows, {
              header: true,
              columns: columnNames,
            });
            fs.writeFileSync(csvPath, csvOutput, 'utf-8');

            const csvStat = fs.statSync(csvPath);
            const csvSha = this.calculateSha256(csvPath);
            dbCsvFiles.push({
              fileName: csvFileName,
              tableName: entity.name,
              rowCount: sanitizedRows.length,
              sha256: csvSha,
              sizeBytes: csvStat.size,
            });

            if (isPrimary) {
              const topCsvPath = path.join(csvBundleDir, csvFileName);
              fs.writeFileSync(topCsvPath, csvOutput, 'utf-8');
              primaryCsvFiles.push({
                fileName: csvFileName,
                tableName: entity.name,
                rowCount: sanitizedRows.length,
                sha256: csvSha,
                sizeBytes: csvStat.size,
              });
            }

            const sheet = workbook.addWorksheet(entity.name);
            sheet.columns = columnNames.map((key) => ({
              header: key,
              key,
              width: Math.max(key.length + 4, 12),
            }));
            if (sanitizedRows.length > 0) {
              sheet.addRows(sanitizedRows);
            }

            dbTotalRows += sanitizedRows.length;
            totalBytes += csvStat.size;
          }

          const dbXlsxFileName = `${dbFolderName}_business_data.xlsx`;
          const dbXlsxPath = path.join(xlsxBundleDir, dbXlsxFileName);
          await workbook.xlsx.writeFile(dbXlsxPath);

          const xlsxStat = fs.statSync(dbXlsxPath);
          const xlsxSha = this.calculateSha256(dbXlsxPath);
          totalBytes += xlsxStat.size;

          if (isPrimary) {
            const topXlsxPath = path.join(xlsxBundleDir, 'business_data.xlsx');
            fs.copyFileSync(dbXlsxPath, topXlsxPath);
            primaryXlsxSha = xlsxSha;
            primaryXlsxSize = xlsxStat.size;
          }

          totalAllRows += dbTotalRows;

          manifestDatabases.push({
            databaseId: dbItem.databaseId,
            profileId: dbItem.profileId,
            profileCode: dbFolderName,
            userId: dbItem.userId,
            username: dbItem.username,
            canonicalPath: dbItem.canonicalPath,
            backupPath: path.posix.join('databases', dbFolderName, 'database_backup.db'),
            backupManifest: path.posix.join('databases', dbFolderName, 'database_backup.db.manifest.json'),
            csvDir: path.posix.join('csv', dbFolderName),
            xlsxFile: path.posix.join('xlsx', dbXlsxFileName),
            sha256: dbBackupSha256,
            schemaVersion: dbItem.schemaVersion,
            sizeBytes: dbBackupStat.size,
            tablesCount: dbCsvFiles.length,
            totalRows: dbTotalRows,
            csvFiles: dbCsvFiles,
          });
        } finally {
          await client.$disconnect();
        }
      }

      // ── Step C: Write Unified Manifests ─────────────────────────────────
      const exportManifestPath = path.join(bundleDir, 'export-manifest.json');
      const exportManifest = {
        formatVersion: 2,
        packageId,
        createdAt: new Date().toISOString(),
        application: { name: 'Diamond ERP', version: install.appVersion },
        installationId: install.installationId,
        databaseId: primaryDb.databaseId,
        databasesCount: manifestDatabases.length,
        databases: manifestDatabases,
        totalRows: totalAllRows,
        csv: {
          directory: 'csv',
          files: primaryCsvFiles,
        },
        xlsx: {
          file: 'xlsx/business_data.xlsx',
          sha256: primaryXlsxSha,
          sizeBytes: primaryXlsxSize,
        },
      };
      fs.writeFileSync(exportManifestPath, JSON.stringify(exportManifest, null, 2), 'utf-8');

      const preservationManifestPath = path.join(bundleDir, 'preservation-manifest.json');
      const preservationManifest = {
        formatVersion: 2,
        packageId,
        createdAt: new Date().toISOString(),
        installation: {
          installationId: install.installationId,
          appVersion: install.appVersion,
        },
        database: {
          databaseId: primaryDb.databaseId,
          sourcePath: primaryDb.canonicalPath,
          schemaVersion: primaryDb.schemaVersion,
          profileCode: primaryDb.profileCode,
        },
        databases: manifestDatabases,
        artifacts: {
          databaseBackup: {
            file: 'database_backup.db',
            manifest: 'database_backup.db.manifest.json',
            sha256: primaryDbBackupSha,
            sizeBytes: primaryDbBackupSize,
          },
          csv: {
            directory: 'csv',
            filesCount: primaryCsvFiles.length,
          },
          xlsx: {
            file: 'xlsx/business_data.xlsx',
            sha256: primaryXlsxSha,
            sizeBytes: primaryXlsxSize,
          },
          exportManifest: 'export-manifest.json',
        },
        totalSizeBytes: totalBytes,
        status: 'VERIFIED',
        dataDirectoryPreserved: true,
      };
      fs.writeFileSync(preservationManifestPath, JSON.stringify(preservationManifest, null, 2), 'utf-8');

      const manifestSha256 = this.calculateSha256(preservationManifestPath);

      // ── Step D: Verification ──────────────────────────────────────────
      await systemPrisma.preservationPackage.update({
        where: { packageId },
        data: { status: 'VERIFYING' },
      });

      const verification = await this.verifyPreservationPackage(bundleDir);
      if (!verification.verified) {
        throw new ConflictError(`Preservation package verification failed: ${verification.error}`);
      }

      const verifiedAt = new Date();
      await systemPrisma.preservationPackage.update({
        where: { packageId },
        data: {
          status: 'VERIFIED',
          databaseBackupPath: primaryDbBackupPath,
          csvExportPath: csvBundleDir,
          xlsxExportPath: path.join(xlsxBundleDir, 'business_data.xlsx'),
          manifestPath: preservationManifestPath,
          manifestSha256,
          sizeBytes: totalBytes,
          verifiedAt,
        },
      });

      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'PRESERVATION',
          entityId: packageId,
          eventType: 'PRESERVATION_VERIFIED',
          description: `Pre-uninstall preservation package verified (${bundleDirName}, ${totalBytes} bytes, ${manifestDatabases.length} databases)`,
          metadata: JSON.stringify(preservationManifest),
          performedBy,
        },
      });

      // Persist last valid destination in Setting
      try {
        await systemPrisma.setting.upsert({
          where: { key: 'lastPreservationDestination' },
          update: { value: destinationRoot },
          create: { key: 'lastPreservationDestination', value: destinationRoot },
        });
      } catch {}

      logger.info(`[PreservationService] Multi-database preservation package ${packageId} created and verified for ${manifestDatabases.length} databases at ${bundleDir}`);

      return {
        packageId,
        installationId: install.installationId,
        databaseId: primaryDb.databaseId,
        destinationPath: bundleDir,
        status: 'VERIFIED',
        databaseBackupPath: primaryDbBackupPath,
        csvExportPath: csvBundleDir,
        xlsxExportPath: path.join(xlsxBundleDir, 'business_data.xlsx'),
        manifestPath: preservationManifestPath,
        manifestSha256,
        sizeBytes: totalBytes,
        preservedDatabasesCount: manifestDatabases.length,
        createdAt: preservationManifest.createdAt,
        verifiedAt: verifiedAt.toISOString(),
      };
    } catch (err: any) {
      logger.error(`[PreservationService] Preservation failed for ${packageId}:`, err);
      if (fs.existsSync(bundleDir)) {
        try {
          fs.rmSync(bundleDir, { recursive: true, force: true });
        } catch {}
      }

      await systemPrisma.preservationPackage.update({
        where: { packageId },
        data: {
          status: 'FAILED',
          errorMessage: err?.message || 'Unknown preservation error',
        },
      }).catch(() => {});

      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'PRESERVATION',
          entityId: packageId,
          eventType: 'PRESERVATION_FAILED',
          description: `Preservation package creation failed: ${err?.message}`,
          performedBy,
        },
      });

      throw err;
    }
  }

  /**
   * Repeatable, read-only verification of a preservation package supporting multi-database packages.
   */
  async verifyPreservationPackage(packagePathOrId: string): Promise<PreservationVerificationDto> {
    let bundleDir = path.resolve(packagePathOrId);
    if (!fs.existsSync(bundleDir)) {
      const pkgRecord = await systemPrisma.preservationPackage.findUnique({
        where: { packageId: packagePathOrId },
      });
      if (pkgRecord && fs.existsSync(pkgRecord.destinationPath)) {
        bundleDir = pkgRecord.destinationPath;
      } else {
        const inExports = path.join(getExportDir(), packagePathOrId);
        if (fs.existsSync(inExports)) {
          bundleDir = inExports;
        } else {
          return {
            packageId: packagePathOrId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: false,
            csvVerified: false,
            xlsxVerified: false,
            manifestVerified: false,
            error: `Preservation bundle directory not found: ${packagePathOrId}`,
          };
        }
      }
    }

    const manifestPath = path.join(bundleDir, 'preservation-manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return {
        packageId: path.basename(bundleDir),
        verified: false,
        status: 'FAILED',
        databaseBackupVerified: false,
        csvVerified: false,
        xlsxVerified: false,
        manifestVerified: false,
        error: 'preservation-manifest.json missing from bundle',
      };
    }

    let manifest: any;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch (err: any) {
      return {
        packageId: path.basename(bundleDir),
        verified: false,
        status: 'FAILED',
        databaseBackupVerified: false,
        csvVerified: false,
        xlsxVerified: false,
        manifestVerified: false,
        error: `Corrupt preservation manifest: ${err.message}`,
      };
    }

    const entityRowCounts: Record<string, number> = {};
    const details: string[] = [];

    // ── Multi-Database Verification Path ─────────────────────────────────
    if (manifest.databases && Array.isArray(manifest.databases) && manifest.databases.length > 0) {
      for (const dbItem of manifest.databases) {
        // 1. Verify Database Backup
        const dbBackupFile = path.join(bundleDir, dbItem.backupPath || `databases/${dbItem.profileCode}/database_backup.db`);
        if (!fs.existsSync(dbBackupFile)) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: false,
            csvVerified: false,
            xlsxVerified: false,
            manifestVerified: true,
            error: `Database backup file missing for ${dbItem.databaseId || dbItem.profileCode}: ${dbBackupFile}`,
          };
        }

        const dbValidation = await databaseValidationService.validateDatabase(dbBackupFile);
        if (dbValidation.status !== 'ACTIVE') {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: false,
            csvVerified: false,
            xlsxVerified: false,
            manifestVerified: true,
            error: `Database backup failed validation for ${dbItem.databaseId || dbItem.profileCode}: ${dbValidation.details}`,
          };
        }

        const actualDbSha = this.calculateSha256(dbBackupFile);
        if (dbItem.sha256 && dbItem.sha256 !== actualDbSha) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: false,
            csvVerified: false,
            xlsxVerified: false,
            manifestVerified: true,
            error: `Database backup SHA-256 checksum mismatch for ${dbItem.databaseId || dbItem.profileCode}`,
          };
        }

        // 2. Verify CSV directory and files
        const dbCsvDir = path.join(bundleDir, dbItem.csvDir || `csv/${dbItem.profileCode}`);
        if (!fs.existsSync(dbCsvDir)) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: false,
            xlsxVerified: false,
            manifestVerified: true,
            error: `CSV export directory missing for ${dbItem.databaseId || dbItem.profileCode}: ${dbCsvDir}`,
          };
        }

        for (const fileItem of dbItem.csvFiles || []) {
          const csvFilePath = path.join(dbCsvDir, fileItem.fileName);
          if (!fs.existsSync(csvFilePath)) {
            return {
              packageId: manifest.packageId,
              verified: false,
              status: 'FAILED',
              databaseBackupVerified: true,
              csvVerified: false,
              xlsxVerified: false,
              manifestVerified: true,
              error: `Required CSV export missing (${dbItem.profileCode}): ${fileItem.fileName}`,
            };
          }

          const stat = fs.statSync(csvFilePath);
          if (stat.size <= 0) {
            return {
              packageId: manifest.packageId,
              verified: false,
              status: 'FAILED',
              databaseBackupVerified: true,
              csvVerified: false,
              xlsxVerified: false,
              manifestVerified: true,
              error: `CSV export file is empty (${dbItem.profileCode}): ${fileItem.fileName}`,
            };
          }

          let content: string;
          try {
            content = fs.readFileSync(csvFilePath, 'utf-8');
          } catch (readErr: any) {
            return {
              packageId: manifest.packageId,
              verified: false,
              status: 'FAILED',
              databaseBackupVerified: true,
              csvVerified: false,
              xlsxVerified: false,
              manifestVerified: true,
              error: `CSV file not readable as UTF-8 (${dbItem.profileCode}/${fileItem.fileName}): ${readErr.message}`,
            };
          }

          let records: any[];
          try {
            records = parse(content, {
              columns: true,
              skip_empty_lines: true,
              relax_column_count: false,
            });
          } catch (parseErr: any) {
            return {
              packageId: manifest.packageId,
              verified: false,
              status: 'FAILED',
              databaseBackupVerified: true,
              csvVerified: false,
              xlsxVerified: false,
              manifestVerified: true,
              error: `CSV syntax error in ${dbItem.profileCode}/${fileItem.fileName}: ${parseErr.message}`,
            };
          }

          if (typeof fileItem.rowCount === 'number' && records.length !== fileItem.rowCount) {
            return {
              packageId: manifest.packageId,
              verified: false,
              status: 'FAILED',
              databaseBackupVerified: true,
              csvVerified: false,
              xlsxVerified: false,
              manifestVerified: true,
              error: `CSV row count mismatch on ${dbItem.profileCode}/${fileItem.fileName}: manifest=${fileItem.rowCount}, actual=${records.length}`,
            };
          }

          const actualSha = this.calculateSha256(csvFilePath);
          if (fileItem.sha256 && fileItem.sha256 !== actualSha) {
            return {
              packageId: manifest.packageId,
              verified: false,
              status: 'FAILED',
              databaseBackupVerified: true,
              csvVerified: false,
              xlsxVerified: false,
              manifestVerified: true,
              error: `CSV checksum mismatch on ${dbItem.profileCode}/${fileItem.fileName}`,
            };
          }

          const entityKey = `${dbItem.profileCode}:${fileItem.tableName || fileItem.fileName}`;
          entityRowCounts[entityKey] = records.length;
          details.push(`CSV ${dbItem.profileCode}/${fileItem.fileName}: ${records.length} records verified`);
        }

        // 3. Verify XLSX file
        const dbXlsxFilePath = path.join(bundleDir, dbItem.xlsxFile || `xlsx/${dbItem.profileCode}_business_data.xlsx`);
        if (!fs.existsSync(dbXlsxFilePath)) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: true,
            xlsxVerified: false,
            manifestVerified: true,
            error: `Workbook missing for ${dbItem.profileCode}: ${dbXlsxFilePath}`,
          };
        }

        const xlsxStat = fs.statSync(dbXlsxFilePath);
        if (xlsxStat.size <= 0) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: true,
            xlsxVerified: false,
            manifestVerified: true,
            error: `Workbook file is empty for ${dbItem.profileCode}: ${dbXlsxFilePath}`,
          };
        }

        const workbook = new ExcelJS.Workbook();
        try {
          await workbook.xlsx.readFile(dbXlsxFilePath);
        } catch (xlsxErr: any) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: true,
            xlsxVerified: false,
            manifestVerified: true,
            error: `ExcelJS failed to open workbook for ${dbItem.profileCode}: ${xlsxErr.message}`,
          };
        }

        for (const fileItem of dbItem.csvFiles || []) {
          const sheetName = fileItem.tableName || fileItem.entityName;
          if (!sheetName) continue;
          const worksheet = workbook.getWorksheet(sheetName);
          if (!worksheet) {
            return {
              packageId: manifest.packageId,
              verified: false,
              status: 'FAILED',
              databaseBackupVerified: true,
              csvVerified: true,
              xlsxVerified: false,
              manifestVerified: true,
              error: `Required worksheet "${sheetName}" missing in ${dbItem.profileCode} workbook`,
            };
          }

          const headerRow = worksheet.getRow(1);
          if (!headerRow || headerRow.actualCellCount <= 0) {
            return {
              packageId: manifest.packageId,
              verified: false,
              status: 'FAILED',
              databaseBackupVerified: true,
              csvVerified: true,
              xlsxVerified: false,
              manifestVerified: true,
              error: `Worksheet "${sheetName}" in ${dbItem.profileCode} is missing header columns`,
            };
          }

          const dataRows = Math.max(0, worksheet.actualRowCount - 1);
          if (typeof fileItem.rowCount === 'number' && dataRows !== fileItem.rowCount) {
            return {
              packageId: manifest.packageId,
              verified: false,
              status: 'FAILED',
              databaseBackupVerified: true,
              csvVerified: true,
              xlsxVerified: false,
              manifestVerified: true,
              error: `Worksheet "${sheetName}" row count mismatch (${dbItem.profileCode}): manifest=${fileItem.rowCount}, actual=${dataRows}`,
            };
          }
          details.push(`XLSX [${dbItem.profileCode}] sheet "${sheetName}": ${dataRows} rows verified`);
        }
      }
    }

    // ── Top-Level / Root Artifacts Verification (Single DB or Primary DB mirror) ──
    if (manifest.artifacts) {
      const dbBackupFile = path.join(bundleDir, manifest.artifacts?.databaseBackup?.file || 'database_backup.db');
      if (!fs.existsSync(dbBackupFile)) {
        return {
          packageId: manifest.packageId,
          verified: false,
          status: 'FAILED',
          databaseBackupVerified: false,
          csvVerified: false,
          xlsxVerified: false,
          manifestVerified: true,
          error: `database_backup.db file missing: ${dbBackupFile}`,
        };
      }

      const dbValidation = await databaseValidationService.validateDatabase(dbBackupFile);
      if (dbValidation.status !== 'ACTIVE') {
        return {
          packageId: manifest.packageId,
          verified: false,
          status: 'FAILED',
          databaseBackupVerified: false,
          csvVerified: false,
          xlsxVerified: false,
          manifestVerified: true,
          error: `Database backup failed validation: ${dbValidation.details}`,
        };
      }

      const actualDbSha = this.calculateSha256(dbBackupFile);
      if (manifest.artifacts?.databaseBackup?.sha256 && manifest.artifacts.databaseBackup.sha256 !== actualDbSha) {
        return {
          packageId: manifest.packageId,
          verified: false,
          status: 'FAILED',
          databaseBackupVerified: false,
          csvVerified: false,
          xlsxVerified: false,
          manifestVerified: true,
          error: 'Database backup SHA-256 checksum mismatch',
        };
      }

      const csvDir = path.join(bundleDir, 'csv');
      if (!fs.existsSync(csvDir)) {
        return {
          packageId: manifest.packageId,
          verified: false,
          status: 'FAILED',
          databaseBackupVerified: true,
          csvVerified: false,
          xlsxVerified: false,
          manifestVerified: true,
          error: 'CSV export directory missing from bundle',
        };
      }

      const exportManifestPath = path.join(bundleDir, 'export-manifest.json');
      if (!fs.existsSync(exportManifestPath)) {
        return {
          packageId: manifest.packageId,
          verified: false,
          status: 'FAILED',
          databaseBackupVerified: true,
          csvVerified: false,
          xlsxVerified: false,
          manifestVerified: true,
          error: 'export-manifest.json missing from bundle',
        };
      }

      let exportManifest: any;
      try {
        exportManifest = JSON.parse(fs.readFileSync(exportManifestPath, 'utf-8'));
      } catch {
        return {
          packageId: manifest.packageId,
          verified: false,
          status: 'FAILED',
          databaseBackupVerified: true,
          csvVerified: false,
          xlsxVerified: false,
          manifestVerified: true,
          error: 'Corrupt export-manifest.json',
        };
      }

      for (const fileItem of exportManifest.csv?.files || []) {
        const csvFilePath = path.join(csvDir, fileItem.fileName);
        if (!fs.existsSync(csvFilePath)) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: false,
            xlsxVerified: false,
            manifestVerified: true,
            error: `Required CSV export missing: ${fileItem.fileName}`,
          };
        }

        const stat = fs.statSync(csvFilePath);
        if (stat.size <= 0) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: false,
            xlsxVerified: false,
            manifestVerified: true,
            error: `CSV export file is empty: ${fileItem.fileName}`,
          };
        }

        let content: string;
        try {
          content = fs.readFileSync(csvFilePath, 'utf-8');
        } catch (readErr: any) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: false,
            xlsxVerified: false,
            manifestVerified: true,
            error: `CSV file not readable as UTF-8 (${fileItem.fileName}): ${readErr.message}`,
          };
        }

        let records: any[];
        try {
          records = parse(content, {
            columns: true,
            skip_empty_lines: true,
            relax_column_count: false,
          });
        } catch (parseErr: any) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: false,
            xlsxVerified: false,
            manifestVerified: true,
            error: `CSV syntax error in ${fileItem.fileName}: ${parseErr.message}`,
          };
        }

        if (typeof fileItem.rowCount === 'number' && records.length !== fileItem.rowCount) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: false,
            xlsxVerified: false,
            manifestVerified: true,
            error: `CSV row count mismatch on ${fileItem.fileName}: manifest=${fileItem.rowCount}, actual=${records.length}`,
          };
        }

        const actualSha = this.calculateSha256(csvFilePath);
        if (fileItem.sha256 && fileItem.sha256 !== actualSha) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: false,
            xlsxVerified: false,
            manifestVerified: true,
            error: `CSV checksum mismatch on ${fileItem.fileName}`,
          };
        }

        const entityKey = fileItem.entityName || fileItem.fileName;
        entityRowCounts[entityKey] = records.length;
        details.push(`CSV ${fileItem.fileName}: ${records.length} records verified`);
      }

      const xlsxFilePath = path.join(bundleDir, 'xlsx', 'business_data.xlsx');
      if (!fs.existsSync(xlsxFilePath)) {
        return {
          packageId: manifest.packageId,
          verified: false,
          status: 'FAILED',
          databaseBackupVerified: true,
          csvVerified: true,
          xlsxVerified: false,
          manifestVerified: true,
          error: 'business_data.xlsx missing from bundle',
        };
      }

      const xlsxStat = fs.statSync(xlsxFilePath);
      if (xlsxStat.size <= 0) {
        return {
          packageId: manifest.packageId,
          verified: false,
          status: 'FAILED',
          databaseBackupVerified: true,
          csvVerified: true,
          xlsxVerified: false,
          manifestVerified: true,
          error: 'business_data.xlsx workbook file is empty',
        };
      }

      const actualXlsxSha = this.calculateSha256(xlsxFilePath);
      if (exportManifest.xlsx?.sha256 && exportManifest.xlsx.sha256 !== actualXlsxSha) {
        return {
          packageId: manifest.packageId,
          verified: false,
          status: 'FAILED',
          databaseBackupVerified: true,
          csvVerified: true,
          xlsxVerified: false,
          manifestVerified: true,
          error: 'XLSX checksum mismatch',
        };
      }

      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.readFile(xlsxFilePath);
      } catch (xlsxErr: any) {
        return {
          packageId: manifest.packageId,
          verified: false,
          status: 'FAILED',
          databaseBackupVerified: true,
          csvVerified: true,
          xlsxVerified: false,
          manifestVerified: true,
          error: `ExcelJS failed to open workbook business_data.xlsx: ${xlsxErr.message}`,
        };
      }

      for (const fileItem of exportManifest.csv?.files || []) {
        const sheetName = fileItem.entityName || fileItem.tableName;
        if (!sheetName) continue;
        const worksheet = workbook.getWorksheet(sheetName);
        if (!worksheet) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: true,
            xlsxVerified: false,
            manifestVerified: true,
            error: `Required worksheet "${sheetName}" missing in business_data.xlsx`,
          };
        }

        const headerRow = worksheet.getRow(1);
        if (!headerRow || headerRow.actualCellCount <= 0) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: true,
            xlsxVerified: false,
            manifestVerified: true,
            error: `Worksheet "${sheetName}" is missing header columns.`,
          };
        }

        const dataRows = Math.max(0, worksheet.actualRowCount - 1);
        if (typeof fileItem.rowCount === 'number' && dataRows !== fileItem.rowCount) {
          return {
            packageId: manifest.packageId,
            verified: false,
            status: 'FAILED',
            databaseBackupVerified: true,
            csvVerified: true,
            xlsxVerified: false,
            manifestVerified: true,
            error: `Worksheet "${sheetName}" row count mismatch: manifest=${fileItem.rowCount}, actual=${dataRows}`,
          };
        }
        details.push(`XLSX sheet "${sheetName}": ${dataRows} rows verified`);
      }
    }

    return {
      packageId: manifest.packageId,
      verified: true,
      status: 'VERIFIED',
      databaseBackupVerified: true,
      csvVerified: true,
      xlsxVerified: true,
      manifestVerified: true,
      verifiedAt: new Date().toISOString(),
      details,
      entityRowCounts,
    };
  }

  /**
   * Reconciles preservation packages left in transient/in-progress states
   * (PENDING, BACKING_UP, EXPORTING, VERIFYING) due to crash, power loss, or service restart.
   * Marks them FAILED and cleans up incomplete staging.
   */
  public async reconcileInterruptedPreservations(): Promise<{ reconciledCount: number }> {
    let reconciledCount = 0;
    try {
      const interrupted = await systemPrisma.preservationPackage.findMany({
        where: {
          status: { in: ['PENDING', 'BACKING_UP', 'EXPORTING', 'VERIFYING'] },
        },
      });

      for (const pkg of interrupted) {
        logger.warn(`[PreservationService] Reconciling interrupted preservation package ${pkg.packageId} (was ${pkg.status})`);
        await systemPrisma.preservationPackage.update({
          where: { id: pkg.id },
          data: {
            status: 'FAILED',
            errorMessage: 'Operation was interrupted by system shutdown or restart before completion.',
          },
        });
        reconciledCount++;

        if (pkg.destinationPath && fs.existsSync(pkg.destinationPath)) {
          const exportDir = getExportDir();
          if (pkg.destinationPath.startsWith(exportDir)) {
            try {
              const manifestPath = path.join(pkg.destinationPath, 'preservation-manifest.json');
              if (!fs.existsSync(manifestPath)) {
                fs.rmSync(pkg.destinationPath, { recursive: true, force: true });
                logger.info(`[PreservationService] Cleaned up incomplete preservation directory: ${pkg.destinationPath}`);
              }
            } catch (err) {
              logger.warn(`[PreservationService] Could not clean up partial dir ${pkg.destinationPath}: ${String(err)}`);
            }
          }
        }
      }
    } catch (err) {
      logger.error(`[PreservationService] Error reconciling interrupted preservations: ${String(err)}`);
    }

    return { reconciledCount };
  }
}

export const preservationService = new PreservationService();
