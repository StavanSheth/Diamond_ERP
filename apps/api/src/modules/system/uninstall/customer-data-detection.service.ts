import fs from 'fs';
import path from 'path';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import {
  getDataDir,
  getDatabasesDir,
  getExportDir,
  getControlDbPath,
  getDatabaseTemplatePath,
  ensureAllDataDirs,
} from '../../../infrastructure/paths';
import { logger } from '../../../infrastructure/logging';

export interface DetectedDatabaseInfo {
  databaseId: string;
  displayName: string;
  canonicalPath: string;
  sizeBytes: number;
  hasRecentBackup: boolean;
  latestBackupAt?: string | null;
}

export interface DetectedExportBundleInfo {
  bundleDirName: string;
  fullPath: string;
  format?: string;
  sizeBytes: number;
  createdAt: string;
}

export interface DetectedPreservationPackageInfo {
  packageId: string;
  status: string;
  destinationPath: string;
  verifiedAt?: string | null;
}

export interface CustomerDataDetectionResult {
  hasCustomerData: boolean;
  databases: DetectedDatabaseInfo[];
  exportBundles: DetectedExportBundleInfo[];
  preservationPackages: DetectedPreservationPackageInfo[];
  activeUserCount: number;
  deletedUserCount: number;
  statusFilePath: string;
  inspectedAt: string;
}

export class CustomerDataDetectionService {
  /**
   * Unified authoritative customer data detection across physical files,
   * database registrations, export bundles, and user profiles.
   * Also writes customer-data-status.json to AppData for offline uninstaller gating.
   */
  async detectCustomerData(): Promise<CustomerDataDetectionResult> {
    ensureAllDataDirs();
    const dataDir = getDataDir();
    const databasesDir = getDatabasesDir();
    const exportDir = getExportDir();
    const controlDb = getControlDbPath().toLowerCase();
    const templateDb = getDatabaseTemplatePath()?.toLowerCase() || '';

    const databases: DetectedDatabaseInfo[] = [];
    const seenPaths = new Set<string>();

    // 1. Registered active databases
    try {
      const registries = await systemPrisma.databaseRegistry.findMany({
        where: { status: 'ACTIVE' },
      });

      for (const reg of registries) {
        if (!fs.existsSync(reg.canonicalPath)) continue;
        const lower = reg.canonicalPath.toLowerCase();
        if (lower === controlDb || lower === templateDb) continue;
        if (seenPaths.has(lower)) continue;
        seenPaths.add(lower);

        const sizeBytes = fs.statSync(reg.canonicalPath).size;
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
    } catch (err) {
      logger.warn(`[CustomerDataDetectionService] Error querying database registries: ${String(err)}`);
    }

    // 2. Physical database files in databases directory
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
        logger.warn(`[CustomerDataDetectionService] Error scanning databases dir: ${String(err)}`);
      }
    }

    // 3. Export bundles in exports directory
    const exportBundles: DetectedExportBundleInfo[] = [];
    if (fs.existsSync(exportDir)) {
      try {
        const entries = fs.readdirSync(exportDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(exportDir, entry.name);
          if (entry.isDirectory()) {
            const stat = fs.statSync(fullPath);
            exportBundles.push({
              bundleDirName: entry.name,
              fullPath,
              sizeBytes: stat.size,
              createdAt: stat.birthtime.toISOString(),
            });
          } else if (entry.isFile() && (entry.name.endsWith('.zip') || entry.name.endsWith('.db') || entry.name.endsWith('.xlsx') || entry.name.endsWith('.csv'))) {
            const stat = fs.statSync(fullPath);
            exportBundles.push({
              bundleDirName: entry.name,
              fullPath,
              format: path.extname(entry.name).toUpperCase().replace('.', ''),
              sizeBytes: stat.size,
              createdAt: stat.birthtime.toISOString(),
            });
          }
        }
      } catch (err) {
        logger.warn(`[CustomerDataDetectionService] Error scanning exports dir: ${String(err)}`);
      }
    }

    // 4. Preservation packages in DB
    const preservationPackages: DetectedPreservationPackageInfo[] = [];
    try {
      const pkgs = await systemPrisma.preservationPackage.findMany({
        where: { status: { in: ['VERIFIED', 'PENDING', 'EXPORTING', 'BACKING_UP'] } },
        orderBy: { createdAt: 'desc' },
      });
      for (const p of pkgs) {
        preservationPackages.push({
          packageId: p.packageId,
          status: p.status,
          destinationPath: p.destinationPath,
          verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
        });
      }
    } catch (err) {
      logger.warn(`[CustomerDataDetectionService] Error querying preservation packages: ${String(err)}`);
    }

    // 5. Active & Soft-deleted users
    let activeUserCount = 0;
    let deletedUserCount = 0;
    try {
      activeUserCount = await systemPrisma.user.count({
        where: { deletedAt: null },
      });
      deletedUserCount = await systemPrisma.user.count({
        where: { deletedAt: { not: null } },
      });
    } catch (err) {
      logger.warn(`[CustomerDataDetectionService] Error querying user counts: ${String(err)}`);
    }

    const hasCustomerData =
      databases.length > 0 ||
      exportBundles.length > 0 ||
      preservationPackages.length > 0 ||
      activeUserCount > 1 || // More than just default system user
      deletedUserCount > 0;

    const inspectedAt = new Date().toISOString();
    const statusFilePath = path.join(dataDir, 'customer-data-status.json');

    const result: CustomerDataDetectionResult = {
      hasCustomerData,
      databases,
      exportBundles,
      preservationPackages,
      activeUserCount,
      deletedUserCount,
      statusFilePath,
      inspectedAt,
    };

    // Write atomic status JSON for offline installer / external inspection
    try {
      const tmpPath = `${statusFilePath}.tmp_${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(result, null, 2), 'utf-8');
      fs.renameSync(tmpPath, statusFilePath);
    } catch (err) {
      logger.warn(`[CustomerDataDetectionService] Could not write customer-data-status.json: ${String(err)}`);
    }

    return result;
  }
}

export const customerDataDetectionService = new CustomerDataDetectionService();
