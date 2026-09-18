import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { stringify } from 'csv-stringify/sync';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import {
  getExportDir,
  getDatabasesDir,
  getDatabaseTemplatePath,
  ensureAllDataDirs,
} from '../../../infrastructure/paths';
import { installationService } from '../installation.service';
import { NotFoundError } from '../../../errors';
import { logger } from '../../../infrastructure/logging';
import type {
  ExportBusinessDataRequest,
  ExportManifestDto,
  ExportVerificationDto,
  ExportResponseDto,
} from '@diamond-erp/contracts';

export class ExportService {
  /**
   * Sanitizes values against CSV/Excel spreadsheet formula injection.
   */
  private sanitizeCellValue(val: any): any {
    if (typeof val === 'string') {
      // Strip or escape formula trigger characters: =, +, -, @, tab, CR
      if (/^[=+\-@\t\r]/.test(val)) {
        return `'${val}`;
      }
    }
    return val;
  }

  private calculateSha256(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Exports business ERP data to CSV files in a timestamped export bundle with manifest.
   * STRICTLY excludes password hashes, PIN hashes, session tokens, and secrets.
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

    // Connect to active profile database
    let activeDbPath = req.databasePath;
    let activeRegistry: any = null;

    if (activeDbPath) {
      if (!fs.existsSync(activeDbPath)) {
        throw new NotFoundError(`Specified database not found for export: ${activeDbPath}`);
      }
      activeRegistry = await systemPrisma.databaseRegistry.findFirst({
        where: { canonicalPath: path.resolve(activeDbPath) },
        include: { profile: true },
      });
    } else {
      const registries = await systemPrisma.databaseRegistry.findMany({
        where: { installationId: install.id, status: 'ACTIVE' },
        include: { profile: true },
      });
      activeRegistry = registries.find((r) => fs.existsSync(r.canonicalPath));
      if (activeRegistry) {
        activeDbPath = activeRegistry.canonicalPath;
      } else {
        const defaultPath = path.join(getDatabasesDir(), 'Stavan.db');
        if (fs.existsSync(defaultPath)) {
          activeDbPath = defaultPath;
        } else {
          const templateDb = getDatabaseTemplatePath();
          if (templateDb && fs.existsSync(templateDb)) {
            activeDbPath = templateDb;
          }
        }
      }
    }

    if (!activeDbPath || !fs.existsSync(activeDbPath)) {
      throw new NotFoundError(`Active profile database not found for export.`);
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

    // Defined business entities to export (strictly omitting User, Session, DeviceSecurity)
    const tableEntities: Array<{ name: string; query: () => Promise<any[]> }> = [
      { name: 'Stock', query: () => (client as any).stock.findMany() },
      { name: 'Ledger', query: () => (client as any).ledger.findMany() },
      { name: 'Party', query: () => (client as any).party.findMany() },
      { name: 'DiamondItem', query: () => (client as any).diamondItem.findMany() },
      { name: 'Certification', query: () => (client as any).certification.findMany() },
      { name: 'Repair', query: () => (client as any).repair.findMany() },
      { name: 'Transaction', query: () => (client as any).transaction.findMany() },
      { name: 'TransactionItem', query: () => (client as any).transactionItem.findMany() },
      { name: 'Location', query: () => (client as any).location.findMany() },
    ];

    try {
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'EXPORT',
          entityId: exportId,
          eventType: 'EXPORT_STARTED',
          description: `Business data export initiated: ${bundleDirName}`,
          performedBy,
        },
      });

      for (const entity of tableEntities) {
        if (req.tables && req.tables.length > 0 && !req.tables.includes(entity.name)) {
          continue;
        }

        let rows: any[] = [];
        try {
          rows = await entity.query();
        } catch (queryErr) {
          logger.warn(`[ExportService] Could not query ${entity.name}: ${String(queryErr)}`);
          continue;
        }

        // Sanitize rows and strip secret fields
        const sanitizedRows = rows.map((row) => {
          const clean: Record<string, any> = {};
          for (const [k, v] of Object.entries(row)) {
            // Strip any accidental secret fields
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
        exportFormat: req.format || 'CSV',
        tables: exportedTables,
        totalRows,
        totalSizeBytes,
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
        format: req.format || 'CSV',
        totalRows,
        sizeBytes: totalSizeBytes,
        manifest,
      };
    } catch (err: any) {
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
      verifiedAt: new Date().toISOString(),
      error: !matches ? 'One or more exported files are missing or have mismatched checksums.' : null,
    };
  }
}

export const exportService = new ExportService();
