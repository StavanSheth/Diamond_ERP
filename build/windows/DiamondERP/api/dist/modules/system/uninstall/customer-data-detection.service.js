"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerDataDetectionService = exports.CustomerDataDetectionService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../../../infrastructure/database/prisma");
const paths_1 = require("../../../infrastructure/paths");
const logging_1 = require("../../../infrastructure/logging");
class CustomerDataDetectionService {
    /**
     * Unified authoritative customer data detection across physical files,
     * database registrations, export bundles, and user profiles.
     * Also writes customer-data-status.json to AppData for offline uninstaller gating.
     */
    async detectCustomerData() {
        (0, paths_1.ensureAllDataDirs)();
        const dataDir = (0, paths_1.getDataDir)();
        const databasesDir = (0, paths_1.getDatabasesDir)();
        const exportDir = (0, paths_1.getExportDir)();
        const controlDb = (0, paths_1.getControlDbPath)().toLowerCase();
        const templateDb = (0, paths_1.getDatabaseTemplatePath)()?.toLowerCase() || '';
        const databases = [];
        const seenPaths = new Set();
        // 1. Registered active databases
        try {
            const registries = await prisma_1.systemPrisma.databaseRegistry.findMany({
                where: { status: 'ACTIVE' },
            });
            for (const reg of registries) {
                if (!fs_1.default.existsSync(reg.canonicalPath))
                    continue;
                const lower = reg.canonicalPath.toLowerCase();
                if (lower === controlDb || lower === templateDb)
                    continue;
                if (seenPaths.has(lower))
                    continue;
                seenPaths.add(lower);
                const sizeBytes = fs_1.default.statSync(reg.canonicalPath).size;
                const latestBackup = await prisma_1.systemPrisma.backupRecord.findFirst({
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
        }
        catch (err) {
            logging_1.logger.warn(`[CustomerDataDetectionService] Error querying database registries: ${String(err)}`);
        }
        // 2. Physical database files in databases directory
        if (fs_1.default.existsSync(databasesDir)) {
            try {
                const files = fs_1.default.readdirSync(databasesDir);
                for (const file of files) {
                    if (!file.endsWith('.db') && !file.endsWith('.sqlite'))
                        continue;
                    const fullPath = path_1.default.resolve(databasesDir, file);
                    const lower = fullPath.toLowerCase();
                    if (lower === controlDb || lower === templateDb)
                        continue;
                    if (seenPaths.has(lower))
                        continue;
                    seenPaths.add(lower);
                    const stat = fs_1.default.statSync(fullPath);
                    const latestBackup = await prisma_1.systemPrisma.backupRecord.findFirst({
                        where: { status: 'VERIFIED' },
                        orderBy: { createdAt: 'desc' },
                    });
                    databases.push({
                        databaseId: `db_${path_1.default.basename(fullPath, path_1.default.extname(fullPath))}`,
                        displayName: path_1.default.basename(fullPath),
                        canonicalPath: fullPath,
                        sizeBytes: stat.size,
                        hasRecentBackup: !!latestBackup,
                        latestBackupAt: latestBackup?.verifiedAt ? latestBackup.verifiedAt.toISOString() : null,
                    });
                }
            }
            catch (err) {
                logging_1.logger.warn(`[CustomerDataDetectionService] Error scanning databases dir: ${String(err)}`);
            }
        }
        // 3. Export bundles in exports directory
        const exportBundles = [];
        if (fs_1.default.existsSync(exportDir)) {
            try {
                const entries = fs_1.default.readdirSync(exportDir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path_1.default.join(exportDir, entry.name);
                    if (entry.isDirectory()) {
                        const stat = fs_1.default.statSync(fullPath);
                        exportBundles.push({
                            bundleDirName: entry.name,
                            fullPath,
                            sizeBytes: stat.size,
                            createdAt: stat.birthtime.toISOString(),
                        });
                    }
                    else if (entry.isFile() && (entry.name.endsWith('.zip') || entry.name.endsWith('.db') || entry.name.endsWith('.xlsx') || entry.name.endsWith('.csv'))) {
                        const stat = fs_1.default.statSync(fullPath);
                        exportBundles.push({
                            bundleDirName: entry.name,
                            fullPath,
                            format: path_1.default.extname(entry.name).toUpperCase().replace('.', ''),
                            sizeBytes: stat.size,
                            createdAt: stat.birthtime.toISOString(),
                        });
                    }
                }
            }
            catch (err) {
                logging_1.logger.warn(`[CustomerDataDetectionService] Error scanning exports dir: ${String(err)}`);
            }
        }
        // 4. Preservation packages in DB
        const preservationPackages = [];
        try {
            const pkgs = await prisma_1.systemPrisma.preservationPackage.findMany({
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
        }
        catch (err) {
            logging_1.logger.warn(`[CustomerDataDetectionService] Error querying preservation packages: ${String(err)}`);
        }
        // 5. Active & Soft-deleted users
        let activeUserCount = 0;
        let deletedUserCount = 0;
        try {
            activeUserCount = await prisma_1.systemPrisma.user.count({
                where: { deletedAt: null },
            });
            deletedUserCount = await prisma_1.systemPrisma.user.count({
                where: { deletedAt: { not: null } },
            });
        }
        catch (err) {
            logging_1.logger.warn(`[CustomerDataDetectionService] Error querying user counts: ${String(err)}`);
        }
        const hasCustomerData = databases.length > 0 ||
            exportBundles.length > 0 ||
            preservationPackages.length > 0 ||
            activeUserCount > 1 || // More than just default system user
            deletedUserCount > 0;
        const inspectedAt = new Date().toISOString();
        const statusFilePath = path_1.default.join(dataDir, 'customer-data-status.json');
        const result = {
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
            fs_1.default.writeFileSync(tmpPath, JSON.stringify(result, null, 2), 'utf-8');
            fs_1.default.renameSync(tmpPath, statusFilePath);
        }
        catch (err) {
            logging_1.logger.warn(`[CustomerDataDetectionService] Could not write customer-data-status.json: ${String(err)}`);
        }
        return result;
    }
}
exports.CustomerDataDetectionService = CustomerDataDetectionService;
exports.customerDataDetectionService = new CustomerDataDetectionService();
//# sourceMappingURL=customer-data-detection.service.js.map