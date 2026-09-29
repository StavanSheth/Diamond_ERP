import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { systemPrisma, getActiveProfileOrDefault } from '../../../infrastructure/database/prisma';
import { databaseContextService } from '../../../infrastructure/database/database-context.service';
import {
  getExportDir,
  getControlDbPath,
  getDatabaseTemplatePath,
  ensureAllDataDirs,
} from '../../../infrastructure/paths';
import { canonicalizeDatabasePath } from '../database/database-path.util';
import { installationService } from '../installation.service';
import { dataLocationService } from '../../../infrastructure/data';
import { NotFoundError, ValidationError, ConflictError } from '../../../errors';
import type {
  ExportBusinessDataRequest,
  ExportManifestDto,
  ExportVerificationDto,
  ExportResponseDto,
} from '@diamond-erp/contracts';
import { buildExportQueries } from './export-entity-registry';

export class ExportService {
  /**
   * Sanitizes values against CSV/Excel spreadsheet formula injection.
   */
  public sanitizeCellValue(value: any): any {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^[=+\-@\t\r]/.test(trimmed)) {
        return `'${value}`;
      }
    }
    return value;
  }

  public calculateSha256(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Authoritative workbook generator from a live PrismaClient.
   * Shared by standard user export, Settings export, and preservation export.
   */
  async generateWorkbook(
    client: PrismaClient,
    entityFilter?: string[]
  ): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Diamond ERP V3';
    workbook.created = new Date();

    const tableEntities = buildExportQueries(client);
    const requiredEntities = entityFilter && entityFilter.length > 0
      ? tableEntities.filter((e) => entityFilter.includes(e.name))
      : tableEntities;

    for (const entity of requiredEntities) {
      let rows: any[] = [];
      try {
        rows = await entity.query();
      } catch {
        throw new ConflictError(
          `Export failed: unable to query table "${entity.name}". All-or-nothing export aborted.`
        );
      }

      const sanitizedRows = rows.map((row) => {
        const clean: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          if (/password|pin|hash|secret|token/i.test(k)) continue;
          clean[k] = this.sanitizeCellValue(v);
        }
        return clean;
      });

      const sheet = workbook.addWorksheet(entity.name);
      if (sanitizedRows.length > 0) {
        const columns = Object.keys(sanitizedRows[0]).map((key) => ({
          header: key,
          key,
          width: Math.max(key.length + 4, 12),
        }));
        sheet.columns = columns;
        sheet.addRows(sanitizedRows);
      }
    }

    return workbook;
  }

  /**
   * Authoritative Business Data Export across defined entities.
   * Strictly excludes passwords, PINs, tokens, and internal security metadata.
   * All-or-nothing: never silently skips failed tables.
   * Strictly rejects template.db and system.db.
   */
  async exportBusinessData(
    req: ExportBusinessDataRequest,
    performedBy: string = 'system'
  ): Promise<ExportResponseDto> {
    ensureAllDataDirs();
    const install = await installationService.getOrCreateInstallation();

    const exportId = `exp_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bundleDirName = `DiamondERP_Export_${timestamp}_${exportId}`;
    const destinationRoot = req.customDestinationDir
      ? path.resolve(req.customDestinationDir)
      : getExportDir();

    // Disk space check (Section 25)
    dataLocationService.assertDiskSpaceAvailable(25 * 1024 * 1024, destinationRoot);

    const bundlePath = path.join(destinationRoot, bundleDirName);
    fs.mkdirSync(bundlePath, { recursive: true });

    const controlDb = getControlDbPath().toLowerCase();
    const templateDb = getDatabaseTemplatePath()?.toLowerCase() || '';

    // Authoritative resolution of profile business database via DatabaseContextService
    let activeDbPath = req.databasePath;
    let activeRegistry: any = null;
    let resolvedProfileCode = 'Stavan';

    if (activeDbPath) {
      const pathRes = canonicalizeDatabasePath(activeDbPath);
      if (!pathRes.valid) {
        throw new ValidationError(pathRes.error || 'Invalid database path for export.');
      }
      const canonical = pathRes.canonicalPath;

      if (!fs.existsSync(canonical)) {
        throw new NotFoundError(`Specified database not found for export: ${canonical}`);
      }
      if (canonical.toLowerCase() === controlDb) {
        throw new ValidationError('Cannot export the system control database as business data.');
      }
      if (canonical.toLowerCase() === templateDb) {
        throw new ValidationError('Cannot export the template database as business data.');
      }

      activeDbPath = canonical;
      activeRegistry = await systemPrisma.databaseRegistry.findFirst({
        where: { canonicalPath: canonical },
        include: { profile: true },
      });
      resolvedProfileCode = activeRegistry?.profile?.code || path.basename(canonical, '.db');
    } else {
      let dbContext: any = null;
      if (req.profileId) {
        dbContext = await databaseContextService.getDatabaseForProfile(req.profileId);
      } else if (req.profileCode) {
        dbContext = await databaseContextService.getDatabaseForProfileCode(req.profileCode);
      } else {
        try {
          dbContext = await databaseContextService.getActiveProfileDatabase();
        } catch {
          const fallback = getActiveProfileOrDefault();
          if (fallback) {
            dbContext = await databaseContextService.getDatabaseForProfileCode(fallback);
          }
        }
      }

      if (!dbContext) {
        throw new NotFoundError('No active business database found to export.');
      }

      activeDbPath = dbContext.canonicalPath;
      resolvedProfileCode = dbContext.profileCode;
      activeRegistry = await systemPrisma.databaseRegistry.findUnique({
        where: { databaseId: dbContext.databaseId },
        include: { profile: true },
      });
    }

    if (!activeDbPath || !fs.existsSync(activeDbPath)) {
      throw new NotFoundError('No active business database found to export.');
    }

    if (activeDbPath.toLowerCase() === controlDb || activeDbPath.toLowerCase() === templateDb) {
      throw new ValidationError('Cannot export control or template database as business data.');
    }

    const client = new PrismaClient({
      datasources: { db: { url: `file:${activeDbPath.replace(/\\/g, '/')}` } },
    });

    const exportedTables: Array<{
      tableName: string;
      rowCount: number;
      fileName: string;
      sha256: string;
    }> = [];

    let totalRows = 0;
    let totalSizeBytes = 0;

    const tableEntities = buildExportQueries(client);
    const requiredEntities = req.tables && req.tables.length > 0
      ? tableEntities.filter((e) => req.tables!.includes(e.name))
      : tableEntities;

    const requestedFormat = req.format || 'CSV';

    try {
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'EXPORT',
          entityId: exportId,
          eventType: 'EXPORT_STARTED',
          description: `Business data export initiated: ${bundleDirName} (${requestedFormat})`,
          performedBy,
        },
      });

      // Handle XLSX format
      if (requestedFormat === 'XLSX') {
        const workbook = await this.generateWorkbook(
          client,
          req.tables && req.tables.length > 0 ? req.tables : undefined
        );

        const xlsxFileName = 'business_data.xlsx';
        const xlsxPath = path.join(bundlePath, xlsxFileName);
        await workbook.xlsx.writeFile(xlsxPath);

        const stats = fs.statSync(xlsxPath);
        totalSizeBytes = stats.size;
        const sha256 = this.calculateSha256(xlsxPath);

        let xlsxRowCount = 0;
        workbook.eachSheet((sheet) => {
          xlsxRowCount += Math.max(0, sheet.rowCount - 1);
        });

        exportedTables.push({
          tableName: 'AllEntities',
          rowCount: xlsxRowCount,
          fileName: xlsxFileName,
          sha256,
        });
        totalRows = xlsxRowCount;
      } else if (requestedFormat === 'SQLITE') {
        const sqliteFileName = 'business_data.db';
        const sqlitePath = path.join(bundlePath, sqliteFileName);

        try {
          await client.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
        } catch {}

        try {
          await client.$executeRawUnsafe(`VACUUM INTO '${sqlitePath.replace(/\\/g, '/')}'`);
        } catch {
          fs.copyFileSync(activeDbPath, sqlitePath);
        }

        const stats = fs.statSync(sqlitePath);
        totalSizeBytes = stats.size;
        const sha256 = this.calculateSha256(sqlitePath);

        exportedTables.push({
          tableName: 'DatabaseSnapshot',
          rowCount: 0,
          fileName: sqliteFileName,
          sha256,
        });
      } else {
        // Handle CSV format (default)
        for (const entity of requiredEntities) {
          let rows: any[] = [];
          try {
            rows = await entity.query();
          } catch {
            throw new ConflictError(
              `Export failed: unable to query table "${entity.name}". All-or-nothing export aborted.`
            );
          }

          const sanitizedRows = rows.map((row) => {
            const clean: Record<string, any> = {};
            for (const [k, v] of Object.entries(row)) {
              if (/password|pin|hash|secret|token/i.test(k)) continue;
              clean[k] = this.sanitizeCellValue(v);
            }
            return clean;
          });

          const fileName = `${entity.name}.csv`;
          const filePath = path.join(bundlePath, fileName);

          if (sanitizedRows.length > 0) {
            const csvOutput = stringify(sanitizedRows, { header: true });
            fs.writeFileSync(filePath, csvOutput, 'utf-8');
          } else {
            fs.writeFileSync(filePath, '', 'utf-8');
          }

          const stats = fs.statSync(filePath);
          const sha256 = this.calculateSha256(filePath);

          exportedTables.push({
            tableName: entity.name,
            rowCount: sanitizedRows.length,
            fileName,
            sha256,
          });

          totalRows += sanitizedRows.length;
          totalSizeBytes += stats.size;
        }

        // Also generate matching plain unencrypted XLSX for universal portability
        const workbook = await this.generateWorkbook(
          client,
          req.tables && req.tables.length > 0 ? req.tables : undefined
        );
        const xlsxFileName = 'business_data.xlsx';
        const xlsxPath = path.join(bundlePath, xlsxFileName);
        await workbook.xlsx.writeFile(xlsxPath);
      }

      // Write Manifest JSON
      const manifest: ExportManifestDto = {
        formatVersion: 1,
        exportId,
        createdAt: new Date().toISOString(),
        application: {
          name: 'Diamond ERP',
          version: install.appVersion || '3.0.0',
        },
        installation: {
          installationId: install.installationId,
        },
        database: {
          databaseId: activeRegistry?.databaseId || `db_${resolvedProfileCode}`,
          schemaVersion: activeRegistry?.schemaVersion || 1,
          profileCode: resolvedProfileCode,
        },
        exportFormat: requestedFormat,
        format: requestedFormat,
        tables: exportedTables,
        totalRows,
        totalSizeBytes,
        tableCount: requiredEntities.length,
        exportedTableCount: exportedTables.length,
        failedTableCount: 0,
      };

      const manifestPath = path.join(bundlePath, 'export-manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'EXPORT',
          entityId: exportId,
          eventType: 'EXPORT_COMPLETED',
          description: `Export completed: ${bundleDirName} (${totalRows} rows, ${totalSizeBytes} bytes)`,
          metadata: JSON.stringify({
            exportId,
            totalRows,
            totalSizeBytes,
            tablesCount: exportedTables.length,
          }),
          performedBy,
        },
      });

      return {
        success: true,
        exportId,
        filePath: bundlePath,
        format: requestedFormat,
        totalRows,
        sizeBytes: totalSizeBytes,
        manifest,
      };
    } catch (err: any) {
      if (fs.existsSync(bundlePath)) {
        try {
          fs.rmSync(bundlePath, { recursive: true, force: true });
        } catch {}
      }

      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'EXPORT',
          entityId: exportId,
          eventType: 'EXPORT_FAILED',
          description: `Export failed: ${err?.message || 'Unknown error'}`,
          performedBy,
        },
      });
      throw err;
    } finally {
      await client.$disconnect();
    }
  }

  /**
   * Verifies an export bundle against its manifest.
   */
  async verifyExport(exportPathOrId: string): Promise<ExportVerificationDto> {
    let targetPath = path.resolve(exportPathOrId);
    if (!fs.existsSync(targetPath)) {
      const inExportDir = path.join(getExportDir(), exportPathOrId);
      if (fs.existsSync(inExportDir)) {
        targetPath = inExportDir;
      } else {
        throw new NotFoundError(`Export bundle not found: ${exportPathOrId}`);
      }
    }

    const manifestFile = path.join(targetPath, 'export-manifest.json');
    if (!fs.existsSync(manifestFile)) {
      throw new ValidationError(`Export manifest not found in bundle: ${manifestFile}`);
    }

    let manifest: ExportManifestDto;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
    } catch {
      throw new ValidationError('Export manifest is corrupted or unreadable JSON.');
    }

    let allFilesPresent = true;
    let hashesMatch = true;
    const errors: string[] = [];

    for (const table of manifest.tables || []) {
      const filePath = path.join(targetPath, table.fileName);
      if (!fs.existsSync(filePath)) {
        allFilesPresent = false;
        errors.push(`Exported file missing from bundle: ${table.fileName}`);
        continue;
      }

      const currentHash = this.calculateSha256(filePath);
      if (table.sha256 && table.sha256 !== currentHash) {
        hashesMatch = false;
        errors.push(`SHA-256 hash mismatch for ${table.fileName}: expected ${table.sha256}, got ${currentHash}`);
      }
    }

    const isValid = allFilesPresent && hashesMatch;

    return {
      exportId: manifest.exportId,
      isValid,
      manifestMatches: isValid,
      hashesMatch,
      allFilesPresent,
      fileCount: (manifest.tables || []).length,
      totalRows: manifest.totalRows,
      tableCount: manifest.tableCount,
      verifiedAt: new Date().toISOString(),
      errors,
    };
  }
}

export const exportService = new ExportService();
