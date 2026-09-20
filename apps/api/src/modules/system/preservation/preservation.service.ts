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
  async createPreservationPackage(
    req: CreatePreservationPackageRequest,
    performedBy: string = 'system'
  ): Promise<PreservationPackageDto> {
    if (!req.confirmPreservation) {
      throw new ValidationError('Explicit confirmation required to create pre-uninstall preservation package.');
    }

    ensureAllDataDirs();
    const install = await installationService.getOrCreateInstallation();

    // 1. Resolve source database
    const controlDb = getControlDbPath().toLowerCase();
    const templateDb = getDatabaseTemplatePath()?.toLowerCase() || '';

    let sourceDbPath = req.databasePath;
    let targetRegistry: any = null;

    if (sourceDbPath) {
      const pathRes = canonicalizeDatabasePath(sourceDbPath);
      if (!pathRes.valid) throw new ValidationError(pathRes.error || 'Invalid database path');
      sourceDbPath = pathRes.canonicalPath;
    } else {
      // Validate that all active registered databases physically exist on disk
      const allActiveRegistries = await systemPrisma.databaseRegistry.findMany({
        where: { installationId: install.id, status: 'ACTIVE' },
        include: { profile: true },
      });
      for (const reg of allActiveRegistries) {
        if (!fs.existsSync(reg.canonicalPath)) {
          throw new NotFoundError(`Registered database missing on disk: ${reg.canonicalPath}`);
        }
      }

      const activeReg = allActiveRegistries[0];
      if (activeReg && fs.existsSync(activeReg.canonicalPath)) {
        sourceDbPath = activeReg.canonicalPath;
        targetRegistry = activeReg;
      } else {
        const defaultDb = path.join(getDatabasesDir(), 'Stavan.db');
        if (fs.existsSync(defaultDb)) {
          sourceDbPath = defaultDb;
        } else {
          throw new NotFoundError('No active customer database found to preserve.');
        }
      }
    }

    if (!sourceDbPath || !fs.existsSync(sourceDbPath)) {
      throw new NotFoundError(`Source database file does not exist: ${sourceDbPath}`);
    }

    const canonicalSource = path.resolve(sourceDbPath);
    if (canonicalSource.toLowerCase() === controlDb || canonicalSource.toLowerCase() === templateDb) {
      throw new ValidationError('Cannot preserve control or template database as customer data.');
    }

    if (!targetRegistry) {
      targetRegistry = await systemPrisma.databaseRegistry.findFirst({
        where: { canonicalPath: canonicalSource },
        include: { profile: true },
      });
    }

    // 2. Validate destination directory
    let destinationRoot = req.destinationDir ? path.resolve(req.destinationDir) : getExportDir();
    this.validateDestinationDirectory(destinationRoot, canonicalSource);

    const packageId = `pkg_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bundleDirName = `DiamondERP_Uninstall_${timestamp}_${packageId}`;
    const bundleDir = path.join(destinationRoot, bundleDirName);
    fs.mkdirSync(bundleDir, { recursive: true });

    const csvDir = path.join(bundleDir, 'csv');
    const xlsxDir = path.join(bundleDir, 'xlsx');
    fs.mkdirSync(csvDir, { recursive: true });
    fs.mkdirSync(xlsxDir, { recursive: true });

    const databaseId = targetRegistry?.databaseId || `db_${path.basename(canonicalSource, '.db')}`;
    const profileId = targetRegistry?.profileId || null;

    // Record PENDING state in control database
    await systemPrisma.preservationPackage.create({
      data: {
        packageId,
        installationId: install.id,
        databaseId,
        profileId,
        destinationPath: bundleDir,
        status: 'PENDING',
        sizeBytes: 0,
      },
    });

    const client = new PrismaClient({
      datasources: { db: { url: `file:${canonicalSource.replace(/\\/g, '/')}` } },
    });

    try {
      await systemPrisma.preservationPackage.update({
        where: { packageId },
        data: { status: 'BACKING_UP' },
      });

      // ── Step A: Create Verified SQLite Backup ──────────────────────────
      const backupResult = await backupService.createBackup(
        {
          databasePath: canonicalSource,
          customDestinationDir: bundleDir,
          backupType: 'UNINSTALL',
          note: 'Pre-uninstall authoritative preservation snapshot',
        },
        performedBy
      );

      // Normalize backup file name inside bundle to database_backup.db
      const finalDbBackupPath = path.join(bundleDir, 'database_backup.db');
      const finalDbBackupManifestPath = path.join(bundleDir, 'database_backup.db.manifest.json');
      fs.copyFileSync(backupResult.backupPath, finalDbBackupPath);

      // Write or copy manifest
      const dbBackupSha256 = this.calculateSha256(finalDbBackupPath);
      const dbBackupStat = fs.statSync(finalDbBackupPath);

      const dbBackupManifest = {
        packageId,
        backupId: backupResult.backupId,
        fileName: 'database_backup.db',
        sha256: dbBackupSha256,
        sizeBytes: dbBackupStat.size,
        schemaVersion: backupResult.schemaVersion,
        applicationVersion: install.appVersion,
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(finalDbBackupManifestPath, JSON.stringify(dbBackupManifest, null, 2), 'utf-8');

      // ── Step B: Export CSV & XLSX Data ─────────────────────────────────
      await systemPrisma.preservationPackage.update({
        where: { packageId },
        data: { status: 'EXPORTING' },
      });

      // Defined business entities to export from authoritative registry
      const tableEntities = buildExportQueries(client);

      const csvFiles: Array<{ fileName: string; tableName: string; rowCount: number; sha256: string; sizeBytes: number }> = [];
      let totalRows = 0;
      let totalBytes = dbBackupStat.size;

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Diamond ERP V3';
      workbook.created = new Date();

      for (const entity of tableEntities) {
        let rows: any[] = [];
        try {
          rows = await entity.query();
        } catch {
          throw new ConflictError(
            `Preservation export failed: could not read table "${entity.name}". All-or-nothing preservation aborted.`
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
        } catch {
          // fallback if table_info is unavailable
        }

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

        // 1. Write CSV with mandatory header columns even for 0 records
        const csvFileName = `${entity.name}.csv`;
        const csvPath = path.join(csvDir, csvFileName);
        const csvOutput = stringify(sanitizedRows, {
          header: true,
          columns: columnNames,
        });
        fs.writeFileSync(csvPath, csvOutput, 'utf-8');

        const csvStat = fs.statSync(csvPath);
        const csvSha = this.calculateSha256(csvPath);
        csvFiles.push({
          fileName: csvFileName,
          tableName: entity.name,
          rowCount: sanitizedRows.length,
          sha256: csvSha,
          sizeBytes: csvStat.size,
        });

        // 2. Add Worksheet to XLSX with mandatory header columns
        const sheet = workbook.addWorksheet(entity.name);
        const columns = columnNames.map((key) => ({
          header: key,
          key,
          width: Math.max(key.length + 4, 12),
        }));
        sheet.columns = columns;
        if (sanitizedRows.length > 0) {
          sheet.addRows(sanitizedRows);
        }

        totalRows += sanitizedRows.length;
        totalBytes += csvStat.size;
      }

      // Write XLSX file
      const xlsxFileName = 'business_data.xlsx';
      const xlsxPath = path.join(xlsxDir, xlsxFileName);
      await workbook.xlsx.writeFile(xlsxPath);

      const xlsxStat = fs.statSync(xlsxPath);
      const xlsxSha = this.calculateSha256(xlsxPath);
      totalBytes += xlsxStat.size;

      // ── Step C: Write Manifests ─────────────────────────────────────────
      const exportManifestPath = path.join(bundleDir, 'export-manifest.json');
      const exportManifest = {
        formatVersion: 1,
        packageId,
        createdAt: new Date().toISOString(),
        application: { name: 'Diamond ERP', version: install.appVersion },
        installationId: install.installationId,
        databaseId,
        tablesCount: tableEntities.length,
        totalRows,
        csv: {
          directory: 'csv',
          files: csvFiles,
        },
        xlsx: {
          file: 'xlsx/business_data.xlsx',
          sha256: xlsxSha,
          sizeBytes: xlsxStat.size,
        },
      };
      fs.writeFileSync(exportManifestPath, JSON.stringify(exportManifest, null, 2), 'utf-8');

      const preservationManifestPath = path.join(bundleDir, 'preservation-manifest.json');
      const preservationManifest = {
        formatVersion: 1,
        packageId,
        createdAt: new Date().toISOString(),
        installation: {
          installationId: install.installationId,
          appVersion: install.appVersion,
        },
        database: {
          databaseId,
          sourcePath: canonicalSource,
          schemaVersion: targetRegistry?.schemaVersion || 1,
          profileCode: targetRegistry?.profile?.code || 'Stavan',
        },
        artifacts: {
          databaseBackup: {
            file: 'database_backup.db',
            manifest: 'database_backup.db.manifest.json',
            sha256: dbBackupSha256,
            sizeBytes: dbBackupStat.size,
          },
          csv: {
            directory: 'csv',
            filesCount: csvFiles.length,
          },
          xlsx: {
            file: 'xlsx/business_data.xlsx',
            sha256: xlsxSha,
            sizeBytes: xlsxStat.size,
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
          databaseBackupPath: finalDbBackupPath,
          csvExportPath: csvDir,
          xlsxExportPath: xlsxPath,
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
          description: `Pre-uninstall preservation package verified (${bundleDirName}, ${totalBytes} bytes)`,
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

      logger.info(`[PreservationService] Preservation package ${packageId} created and 100% verified at ${bundleDir}`);

      return {
        packageId,
        installationId: install.installationId,
        databaseId,
        destinationPath: bundleDir,
        status: 'VERIFIED',
        databaseBackupPath: finalDbBackupPath,
        csvExportPath: csvDir,
        xlsxExportPath: xlsxPath,
        manifestPath: preservationManifestPath,
        manifestSha256,
        sizeBytes: totalBytes,
        createdAt: preservationManifest.createdAt,
        verifiedAt: verifiedAt.toISOString(),
      };
    } catch (err: any) {
      logger.error(`[PreservationService] Preservation failed for ${packageId}:`, err);
      // Clean up incomplete bundle directory
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
    } finally {
      await client.$disconnect();
    }
  }

  /**
   * Repeatable, read-only verification of a preservation package.
   */
  async verifyPreservationPackage(packagePathOrId: string): Promise<PreservationVerificationDto> {
    let bundleDir = path.resolve(packagePathOrId);
    if (!fs.existsSync(bundleDir)) {
      // Check if packagePathOrId is a packageId in database
      const pkgRecord = await systemPrisma.preservationPackage.findUnique({
        where: { packageId: packagePathOrId },
      });
      if (pkgRecord && fs.existsSync(pkgRecord.destinationPath)) {
        bundleDir = pkgRecord.destinationPath;
      } else {
        // Check in exports dir
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

    // 1. Verify Database Backup
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

    // 2. Verify CSV files
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

    const entityRowCounts: Record<string, number> = {};
    const details: string[] = [];

    // 2. Deep CSV verification: file exists, size > 0, UTF-8 readable, parse with csv-parse, verify headers & row count & SHA256
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

    // 3. Deep XLSX verification: file exists, size > 0, SHA256 match, workbook opens, sheets exist, header row, row counts match
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
      const sheetName = fileItem.entityName;
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
