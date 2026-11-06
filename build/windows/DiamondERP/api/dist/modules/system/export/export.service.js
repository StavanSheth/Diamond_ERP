"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportService = exports.ExportService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const sync_1 = require("csv-stringify/sync");
const exceljs_1 = __importDefault(require("exceljs"));
const prisma_1 = require("../../../infrastructure/database/prisma");
const database_context_service_1 = require("../../../infrastructure/database/database-context.service");
const paths_1 = require("../../../infrastructure/paths");
const database_path_util_1 = require("../database/database-path.util");
const installation_service_1 = require("../installation.service");
const data_1 = require("../../../infrastructure/data");
const errors_1 = require("../../../errors");
const export_entity_registry_1 = require("./export-entity-registry");
const semantic_verification_service_1 = require("./semantic-verification.service");
class ExportService {
    /**
     * Sanitizes values against CSV/Excel spreadsheet formula injection.
     */
    sanitizeCellValue(value) {
        if (value === null || value === undefined)
            return '';
        if (typeof value === 'object' && value !== null && typeof value.toNumber === 'function') {
            return value.toNumber();
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (/^[=+\-@\t\r]/.test(trimmed)) {
                return `'${value}`;
            }
        }
        return value;
    }
    calculateSha256(filePath) {
        const fileBuffer = fs_1.default.readFileSync(filePath);
        return crypto_1.default.createHash('sha256').update(fileBuffer).digest('hex');
    }
    /**
     * Authoritative workbook generator from a live PrismaClient.
     * Shared by standard user export, Settings export, and preservation export.
     */
    async generateWorkbook(client, entityFilter) {
        const workbook = new exceljs_1.default.Workbook();
        workbook.creator = 'Diamond ERP V3';
        workbook.created = new Date();
        const tableEntities = (0, export_entity_registry_1.buildExportQueries)(client);
        const requiredEntities = entityFilter && entityFilter.length > 0
            ? tableEntities.filter((e) => entityFilter.includes(e.name))
            : tableEntities;
        for (const entity of requiredEntities) {
            let rows = [];
            try {
                rows = await entity.query();
            }
            catch {
                throw new errors_1.ConflictError(`Export failed: unable to query table "${entity.name}". All-or-nothing export aborted.`);
            }
            const sanitizedRows = rows.map((row) => {
                const clean = {};
                for (const [k, v] of Object.entries(row)) {
                    if (/password|pin|hash|secret|token/i.test(k))
                        continue;
                    clean[k] = this.sanitizeCellValue(v);
                }
                return clean;
            });
            const sheet = workbook.addWorksheet(entity.name);
            let columnKeys = [];
            if (sanitizedRows.length > 0) {
                columnKeys = Object.keys(sanitizedRows[0]);
            }
            else {
                try {
                    const colInfo = await client.$queryRawUnsafe(`PRAGMA table_info("${entity.name}");`);
                    columnKeys = colInfo
                        .map((c) => c.name)
                        .filter((k) => !/password|pin|hash|secret|token/i.test(k) && k !== 'createdAt' && k !== 'updatedAt' && k !== 'lastValidatedAt');
                }
                catch {
                    columnKeys = ['id'];
                }
            }
            sheet.columns = columnKeys.map((key) => ({
                header: key,
                key,
                width: Math.max(key.length + 4, 12),
            }));
            if (sanitizedRows.length > 0) {
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
    async exportBusinessData(req, performedBy = 'system') {
        (0, paths_1.ensureAllDataDirs)();
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const exportId = `exp_${crypto_1.default.randomUUID()}`;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const bundleDirName = req.bundleDirName || `DiamondERP_Export_${timestamp}_${exportId}`;
        const destinationRoot = req.customDestinationDir
            ? path_1.default.resolve(req.customDestinationDir)
            : (0, paths_1.getExportDir)();
        // Disk space check (Section 25)
        data_1.dataLocationService.assertDiskSpaceAvailable(25 * 1024 * 1024, destinationRoot);
        const bundlePath = req.exactTargetDir
            ? path_1.default.resolve(req.exactTargetDir)
            : path_1.default.join(destinationRoot, bundleDirName);
        fs_1.default.mkdirSync(bundlePath, { recursive: true });
        const controlDb = (0, paths_1.getControlDbPath)().toLowerCase();
        const templateDb = (0, paths_1.getDatabaseTemplatePath)()?.toLowerCase() || '';
        // Authoritative resolution of profile business database strictly via DatabaseContextService
        let activeDbPath = req.databasePath;
        let activeRegistry = null;
        let resolvedProfileCode;
        if (activeDbPath) {
            const pathRes = (0, database_path_util_1.canonicalizeDatabasePath)(activeDbPath);
            if (!pathRes.valid) {
                throw new errors_1.ValidationError(pathRes.error || 'Invalid database path for export.');
            }
            const canonical = pathRes.canonicalPath;
            if (!fs_1.default.existsSync(canonical)) {
                throw new errors_1.NotFoundError(`Specified database not found for export: ${canonical}`);
            }
            if (canonical.toLowerCase() === controlDb) {
                throw new errors_1.ValidationError('Cannot export the system control database as business data.');
            }
            if (canonical.toLowerCase() === templateDb) {
                throw new errors_1.ValidationError('Cannot export the template database as business data.');
            }
            activeDbPath = canonical;
            activeRegistry = await prisma_1.systemPrisma.databaseRegistry.findUnique({
                where: { canonicalPath: canonical },
                include: { profile: true },
            });
            if (!activeRegistry) {
                const allRegistries = await prisma_1.systemPrisma.databaseRegistry.findMany({
                    include: { profile: true },
                });
                activeRegistry = allRegistries.find((r) => path_1.default.resolve(r.canonicalPath).toLowerCase() === canonical.toLowerCase()) || null;
            }
            resolvedProfileCode =
                activeRegistry?.profile?.code ||
                    (activeRegistry?.displayName
                        ? activeRegistry.displayName.replace(/[^a-zA-Z0-9_-]/g, '_')
                        : path_1.default.basename(canonical, '.db'));
        }
        else {
            let dbContext = null;
            if (req.profileId) {
                dbContext = await database_context_service_1.databaseContextService.getDatabaseForProfile(req.profileId);
            }
            else if (req.profileCode) {
                dbContext = await database_context_service_1.databaseContextService.getDatabaseForProfileCode(req.profileCode);
            }
            else {
                dbContext = await database_context_service_1.databaseContextService.getActiveProfileDatabase();
            }
            if (!dbContext) {
                throw new errors_1.NotFoundError('No active business database found to export. Explicit profile context required.');
            }
            activeDbPath = dbContext.canonicalPath;
            resolvedProfileCode = dbContext.profileCode;
            activeRegistry = await prisma_1.systemPrisma.databaseRegistry.findUnique({
                where: { databaseId: dbContext.databaseId },
                include: { profile: true },
            });
        }
        if (!activeDbPath || !fs_1.default.existsSync(activeDbPath)) {
            throw new errors_1.NotFoundError('No active business database found to export.');
        }
        if (activeDbPath.toLowerCase() === controlDb || activeDbPath.toLowerCase() === templateDb) {
            throw new errors_1.ValidationError('Cannot export control or template database as business data.');
        }
        const client = new client_1.PrismaClient({
            datasources: { db: { url: `file:${activeDbPath.replace(/\\/g, '/')}` } },
        });
        const exportedTables = [];
        let totalRows = 0;
        let totalSizeBytes = 0;
        const tableEntities = (0, export_entity_registry_1.buildExportQueries)(client);
        const requiredEntities = req.tables && req.tables.length > 0
            ? tableEntities.filter((e) => req.tables.includes(e.name))
            : tableEntities;
        const requestedFormat = req.format || 'CSV';
        try {
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'EXPORT',
                    entityId: exportId,
                    eventType: 'EXPORT_STARTED',
                    description: `Business data export initiated: ${bundleDirName} (${requestedFormat})`,
                    performedBy,
                },
            });
            if (requestedFormat === 'SQLITE') {
                const sqliteFileName = 'business_data.db';
                const sqlitePath = path_1.default.join(bundlePath, sqliteFileName);
                try {
                    await client.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
                }
                catch { }
                try {
                    await client.$executeRawUnsafe(`VACUUM INTO '${sqlitePath.replace(/\\/g, '/')}'`);
                }
                catch {
                    fs_1.default.copyFileSync(activeDbPath, sqlitePath);
                }
                const stats = fs_1.default.statSync(sqlitePath);
                totalSizeBytes = stats.size;
                const sha256 = this.calculateSha256(sqlitePath);
                exportedTables.push({
                    tableName: 'DatabaseSnapshot',
                    rowCount: 0,
                    fileName: sqliteFileName,
                    sha256,
                });
            }
            else {
                const snapshotMap = new Map();
                for (const entity of requiredEntities) {
                    let rows = [];
                    try {
                        rows = await entity.query();
                    }
                    catch {
                        throw new errors_1.ConflictError(`Export failed: unable to query table "${entity.name}". All-or-nothing export aborted.`);
                    }
                    const sanitizedRows = rows.map((row) => {
                        const clean = {};
                        for (const [k, v] of Object.entries(row)) {
                            if (/password|pin|hash|secret|token/i.test(k))
                                continue;
                            clean[k] = this.sanitizeCellValue(v);
                        }
                        return clean;
                    });
                    // Section 7 & 23: Determine authoritative schema columns (headers even if zero rows)
                    let columns = [];
                    if (sanitizedRows.length > 0) {
                        columns = Object.keys(sanitizedRows[0]);
                    }
                    else {
                        try {
                            const tableInfo = await client.$queryRawUnsafe(`PRAGMA table_info("${entity.name}");`);
                            columns = tableInfo
                                .map((c) => c.name)
                                .filter((k) => !/password|pin|hash|secret|token/i.test(k) && k !== 'createdAt' && k !== 'updatedAt' && k !== 'lastValidatedAt');
                        }
                        catch {
                            columns = ['id'];
                        }
                    }
                    snapshotMap.set(entity.name, {
                        name: entity.name,
                        rows: sanitizedRows,
                        columns,
                        primaryKey: 'id',
                    });
                }
                // 1. Generate CSV files for all entities from snapshot
                for (const [entityName, snapshot] of snapshotMap.entries()) {
                    const fileName = `${entityName}.csv`;
                    const filePath = path_1.default.join(bundlePath, fileName);
                    // stringify with header: true and columns outputs header row even if rows is empty
                    const csvOutput = (0, sync_1.stringify)(snapshot.rows, {
                        header: true,
                        columns: snapshot.columns,
                    });
                    fs_1.default.writeFileSync(filePath, csvOutput, 'utf-8');
                    const stats = fs_1.default.statSync(filePath);
                    const sha256 = this.calculateSha256(filePath);
                    exportedTables.push({
                        tableName: entityName,
                        rowCount: snapshot.rows.length,
                        fileName,
                        sha256,
                    });
                    totalRows += snapshot.rows.length;
                    totalSizeBytes += stats.size;
                }
                // 2. Generate matching XLSX workbook from the exact same in-memory snapshot
                const workbook = new exceljs_1.default.Workbook();
                workbook.creator = 'Diamond ERP V3';
                workbook.created = new Date();
                for (const [entityName, snapshot] of snapshotMap.entries()) {
                    const sheet = workbook.addWorksheet(entityName);
                    sheet.columns = snapshot.columns.map((key) => ({
                        header: key,
                        key,
                        width: Math.max(key.length + 4, 12),
                    }));
                    if (snapshot.rows.length > 0) {
                        sheet.addRows(snapshot.rows);
                    }
                }
                const xlsxFileName = 'business_data.xlsx';
                const xlsxPath = path_1.default.join(bundlePath, xlsxFileName);
                await workbook.xlsx.writeFile(xlsxPath);
                const xlsxStats = fs_1.default.statSync(xlsxPath);
                totalSizeBytes += xlsxStats.size;
                // Section 8: Export verification MUST run during normal export
                const semanticResult = await semantic_verification_service_1.semanticVerificationService.verifyDatabaseAgainstExports(client, bundlePath, xlsxPath, requiredEntities.map((e) => e.name));
                if (semanticResult.status !== 'VERIFIED') {
                    throw new errors_1.ConflictError(`Export semantic verification failed: databaseVsCsv=${semanticResult.databaseVsCsv}, databaseVsXlsx=${semanticResult.databaseVsXlsx}, csvVsXlsx=${semanticResult.csvVsXlsx}. All-or-nothing export aborted.`);
                }
            }
            // Write Manifest JSON (Section 24: Hardened Export Manifest)
            const manifest = {
                formatVersion: 2,
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
            const manifestPath = path_1.default.join(bundlePath, 'export-manifest.json');
            fs_1.default.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
            await prisma_1.systemPrisma.auditEvent.create({
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
        }
        catch (err) {
            if (fs_1.default.existsSync(bundlePath)) {
                try {
                    fs_1.default.rmSync(bundlePath, { recursive: true, force: true });
                }
                catch { }
            }
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'EXPORT',
                    entityId: exportId,
                    eventType: 'EXPORT_FAILED',
                    description: `Export failed: ${err?.message || 'Unknown error'}`,
                    performedBy,
                },
            });
            throw err;
        }
        finally {
            await client.$disconnect();
        }
    }
    /**
     * Verifies an export bundle against its manifest.
     */
    async verifyExport(exportPathOrId) {
        let targetPath = path_1.default.resolve(exportPathOrId);
        if (!fs_1.default.existsSync(targetPath)) {
            const inExportDir = path_1.default.join((0, paths_1.getExportDir)(), exportPathOrId);
            if (fs_1.default.existsSync(inExportDir)) {
                targetPath = inExportDir;
            }
            else {
                throw new errors_1.NotFoundError(`Export bundle not found: ${exportPathOrId}`);
            }
        }
        const manifestFile = path_1.default.join(targetPath, 'export-manifest.json');
        if (!fs_1.default.existsSync(manifestFile)) {
            throw new errors_1.ValidationError(`Export manifest not found in bundle: ${manifestFile}`);
        }
        let manifest;
        try {
            manifest = JSON.parse(fs_1.default.readFileSync(manifestFile, 'utf-8'));
        }
        catch {
            throw new errors_1.ValidationError('Export manifest is corrupted or unreadable JSON.');
        }
        let allFilesPresent = true;
        let hashesMatch = true;
        const errors = [];
        for (const table of manifest.tables || []) {
            const filePath = path_1.default.join(targetPath, table.fileName);
            if (!fs_1.default.existsSync(filePath)) {
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
exports.ExportService = ExportService;
exports.exportService = new ExportService();
//# sourceMappingURL=export.service.js.map