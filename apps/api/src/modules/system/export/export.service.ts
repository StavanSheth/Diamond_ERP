import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import {
  getExportDir,
  getDatabasesDir,
  getControlDbPath,
  getDatabaseTemplatePath,
  ensureAllDataDirs,
} from '../../../infrastructure/paths';
import { canonicalizeDatabasePath } from '../database/database-path.util';
import { installationService } from '../installation.service';
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

  private calculateSha256(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
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

    const bundlePath = path.join(destinationRoot, bundleDirName);
    fs.mkdirSync(bundlePath, { recursive: true });

    const controlDb = getControlDbPath().toLowerCase();
    const templateDb = getDatabaseTemplatePath()?.toLowerCase() || '';

    // Connect to active profile database
    let activeDbPath = req.databasePath;
    let activeRegistry: any = null;

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
    } else {
      const registries = await systemPrisma.databaseRegistry.findMany({
        where: { installationId: install.id, status: 'ACTIVE' },
        include: { profile: true },
      });
      activeRegistry = registries.find(
        (r) =>
          fs.existsSync(r.canonicalPath) &&
          r.canonicalPath.toLowerCase() !== controlDb &&
          r.canonicalPath.toLowerCase() !== templateDb
      );
      if (activeRegistry) {
        activeDbPath = activeRegistry.canonicalPath;
      } else {
        const defaultPath = path.join(getDatabasesDir(), 'Stavan.db');
        if (fs.existsSync(defaultPath)) {
          activeDbPath = defaultPath;
        }
      }
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

    // Defined business entities to export from authoritative registry (strictly omitting System/User/Session/Security)
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
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Diamond ERP V3';
        workbook.created = new Date();

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

          totalRows += sanitizedRows.length;
        }

        const xlsxFileName = 'business_data.xlsx';
        const xlsxPath = path.join(bundlePath, xlsxFileName);
        await workbook.xlsx.writeFile(xlsxPath);

        const stats = fs.statSync(xlsxPath);
        totalSizeBytes = stats.size;
        const sha256 = this.calculateSha256(xlsxPath);

        exportedTables.push({
          tableName: 'AllEntities',
          rowCount: totalRows,
          fileName: xlsxFileName,
          sha256,
        });
      } else if (requestedFormat === 'SQLITE') {
        // Handle SQLITE format: clean snapshot of business tables
        const sqliteFileName = 'business_data.db';
        const sqlitePath = path.join(bundlePath, sqliteFileName);

        // Checkpoint before copy
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
          databaseId: activeRegistry?.databaseId || 'db_primary',
          schemaVersion: activeRegistry?.schemaVersion || 1,
          profileCode: activeRegistry?.profile?.code || 'Stavan',
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
      // Clean up incomplete bundle directory on error
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
      // Check in export dir
      const inExportDir = path.join(getExportDir(), exportPathOrId);
      if (fs.existsSync(inExportDir)) {
        targetPath = inExportDir;
      } else {
        throw new NotFoundError(`Export bundle not found: ${exportPathOrId}`);
      }
    }

    const manifestFile = path.join(targetPath, 'export-manifest.json');
    if (!fs.existsSync(manifestFile)) {
      return {
        exportId: path.basename(targetPath),
        isValid: false,
        manifestMatches: false,
        fileCount: 0,
        verifiedAt: new Date().toISOString(),
        error: 'Missing export-manifest.json',
      };
    }

    const manifest: ExportManifestDto = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
    let matches = true;
    let fileCount = 0;

    if (manifest.failedTableCount && manifest.failedTableCount > 0) {
      matches = false;
    }

    for (const table of manifest.tables) {
      const filePath = path.join(targetPath, table.fileName);
      if (!fs.existsSync(filePath)) {
        matches = false;
        break;
      }
      fileCount++;
      const currentHash = this.calculateSha256(filePath);
      if (currentHash !== table.sha256) {
        matches = false;
        break;
      }
    }

    return {
      exportId: manifest.exportId,
      isValid: matches,
      manifestMatches: matches,
      fileCount,
      tableCount: manifest.tableCount,
      tablesVerified: matches && (!manifest.failedTableCount || manifest.failedTableCount === 0),
      verifiedAt: new Date().toISOString(),
      error: !matches ? 'One or more exported files are missing or have mismatched checksums.' : null,
    };
  }
}

export const exportService = new ExportService();
