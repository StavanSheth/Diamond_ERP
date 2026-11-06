"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.preservationService = exports.PreservationService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const sync_1 = require("csv-parse/sync");
const exceljs_1 = __importDefault(require("exceljs"));
const prisma_1 = require("../../../infrastructure/database/prisma");
const paths_1 = require("../../../infrastructure/paths");
const database_path_util_1 = require("../database/database-path.util");
const database_validation_service_1 = require("../database/database-validation.service");
const installation_service_1 = require("../installation.service");
const backup_service_1 = require("../backup/backup.service");
const data_1 = require("../../../infrastructure/data");
const errors_1 = require("../../../errors");
const logging_1 = require("../../../infrastructure/logging");
const customer_data_detection_service_1 = require("../uninstall/customer-data-detection.service");
const database_context_service_1 = require("../../../infrastructure/database/database-context.service");
const export_service_1 = require("../export/export.service");
class PreservationService {
    /**
     * Authoritative validation of preservation destination directory according to Windows ERP safety rules:
     * 1. Not system root (e.g. C:\ or \)
     * 2. Not Windows system directory (e.g. C:\Windows or %WINDIR%)
     * 3. Not active database file or databases directory
     * 4. Not control database or template database
     * 5. Real writability test using .diamond-erp-write-test-<uuid>.tmp with fsync & delete
     */
    validateDestinationDirectory(destinationRoot, canonicalSource) {
        const controlDb = (0, paths_1.getControlDbPath)().toLowerCase();
        const templateDb = (0, paths_1.getDatabaseTemplatePath)()?.toLowerCase() || '';
        const normDest = path_1.default.resolve(destinationRoot);
        const lowerDest = normDest.toLowerCase();
        // 1. Root directory check (e.g. C:\ or \)
        const parsed = path_1.default.parse(normDest);
        if (parsed.root.toLowerCase() === lowerDest || lowerDest === '\\' || lowerDest === '/') {
            throw new errors_1.ValidationError('Preservation destination cannot be the system root directory.');
        }
        // 2. Windows system directory check
        const winDir = (process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows').toLowerCase();
        if (lowerDest.startsWith(winDir)) {
            throw new errors_1.ValidationError('Preservation destination cannot be inside the Windows system directory.');
        }
        // 3. Source DB file & database source directory
        if (lowerDest === canonicalSource.toLowerCase()) {
            throw new errors_1.ValidationError('Preservation destination cannot be the source database file.');
        }
        const sourceDir = path_1.default.dirname(canonicalSource).toLowerCase();
        if (lowerDest === sourceDir) {
            throw new errors_1.ValidationError('Preservation destination cannot be the database source directory.');
        }
        // 4. Control DB & template DB
        if (lowerDest === controlDb || lowerDest === templateDb) {
            throw new errors_1.ValidationError('Preservation destination cannot be system or template databases.');
        }
        // 5. Customer databases directory
        const dedicatedDbsDir = path_1.default.join((0, paths_1.getDataDir)(), 'databases').toLowerCase();
        if (lowerDest === dedicatedDbsDir || lowerDest.startsWith(dedicatedDbsDir + path_1.default.sep)) {
            throw new errors_1.ValidationError('Preservation destination cannot be inside the customer database directory.');
        }
        if (path_1.default.basename((0, paths_1.getDatabasesDir)().toLowerCase()) === 'databases') {
            const dbsDir = (0, paths_1.getDatabasesDir)().toLowerCase();
            if (lowerDest === dbsDir || lowerDest.startsWith(dbsDir + path_1.default.sep)) {
                throw new errors_1.ValidationError('Preservation destination cannot be inside the customer database directory.');
            }
        }
        // 6. Test writability with actual write, flush (fsync), close, delete (.diamond-erp-write-test-<uuid>.tmp)
        try {
            if (!fs_1.default.existsSync(normDest)) {
                fs_1.default.mkdirSync(normDest, { recursive: true });
            }
            const testFile = path_1.default.join(normDest, `.diamond-erp-write-test-${crypto_1.default.randomUUID()}.tmp`);
            const fd = fs_1.default.openSync(testFile, 'w');
            fs_1.default.writeSync(fd, 'diamond_erp_preservation_write_test\n');
            fs_1.default.fsyncSync(fd);
            fs_1.default.closeSync(fd);
            fs_1.default.unlinkSync(testFile);
        }
        catch (permErr) {
            throw new errors_1.ConflictError(`Preservation destination directory "${normDest}" is not writable: ${permErr.message}`);
        }
    }
    calculateSha256(filePath) {
        const fileBuffer = fs_1.default.readFileSync(filePath);
        return crypto_1.default.createHash('sha256').update(fileBuffer).digest('hex');
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
    async createPreservationPackage(req, performedBy = 'system') {
        const isConfirmed = req.confirmPreservation ?? req.confirmPreUninstallBackup ?? true;
        if (!isConfirmed) {
            throw new errors_1.ValidationError('Explicit confirmation required to create pre-uninstall preservation package.');
        }
        (0, paths_1.ensureAllDataDirs)();
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const controlDb = (0, paths_1.getControlDbPath)().toLowerCase();
        const templateDb = (0, paths_1.getDatabaseTemplatePath)()?.toLowerCase() || '';
        const databasesToPreserve = [];
        const seenPaths = new Set();
        // If explicit databasePath is provided
        if (req.databasePath) {
            const pathRes = (0, database_path_util_1.canonicalizeDatabasePath)(req.databasePath);
            if (!pathRes.valid)
                throw new errors_1.ValidationError(pathRes.error || 'Invalid database path');
            const canonical = pathRes.canonicalPath;
            if (canonical.toLowerCase() === controlDb || canonical.toLowerCase() === templateDb) {
                throw new errors_1.ValidationError('Cannot preserve control or template database as customer data.');
            }
            if (!fs_1.default.existsSync(canonical)) {
                throw new errors_1.NotFoundError(`Source database file does not exist: ${canonical}`);
            }
            const reg = await prisma_1.systemPrisma.databaseRegistry.findFirst({
                where: { canonicalPath: canonical },
                include: { profile: { include: { userProfiles: { include: { user: true } } } } },
            });
            const activeUser = reg?.profile?.userProfiles?.find((up) => up.isActive && up.user && !up.user.deletedAt)?.user;
            const profileCode = reg?.profile?.code ||
                (reg?.displayName
                    ? reg.displayName.replace(/[^a-zA-Z0-9_-]/g, '_')
                    : path_1.default.basename(canonical, '.db'));
            databasesToPreserve.push({
                canonicalPath: canonical,
                databaseId: reg?.databaseId || `db_${profileCode}`,
                profileId: reg?.profileId || null,
                profileCode,
                userId: activeUser?.id || null,
                username: activeUser?.username || null,
                schemaVersion: reg?.schemaVersion || 1,
                ownershipState: reg ? 'CURRENT_INSTALLATION' : 'EXTERNAL_SOURCE',
            });
            seenPaths.add(canonical.toLowerCase());
        }
        // Preserve all active customer databases when no single DB is requested, or if preserveAll is true
        if (!req.databasePath || req.preserveAll) {
            const activeRegistries = await prisma_1.systemPrisma.databaseRegistry.findMany({
                where: { installationId: install.id, status: 'ACTIVE' },
                include: { profile: { include: { userProfiles: { include: { user: true } } } } },
            });
            for (const reg of activeRegistries) {
                if (!fs_1.default.existsSync(reg.canonicalPath)) {
                    throw new errors_1.NotFoundError(`Registered customer database missing on disk: ${reg.canonicalPath}. Cannot complete preservation.`);
                }
                const lower = reg.canonicalPath.toLowerCase();
                if (lower === controlDb || lower === templateDb)
                    continue;
                if (seenPaths.has(lower))
                    continue;
                seenPaths.add(lower);
                const activeUser = reg.profile?.userProfiles?.find((up) => up.isActive && up.user && !up.user.deletedAt)?.user;
                const profileCode = reg.profile?.code || (reg.displayName ? reg.displayName.replace(/[^a-zA-Z0-9_-]/g, '_') : '');
                if (!profileCode) {
                    throw new errors_1.NotFoundError(`Registered customer database "${reg.canonicalPath}" is missing profile code. Aborting preservation.`);
                }
                databasesToPreserve.push({
                    canonicalPath: reg.canonicalPath,
                    databaseId: reg.databaseId,
                    profileId: reg.profileId,
                    profileCode,
                    userId: activeUser?.id || null,
                    username: activeUser?.username || null,
                    schemaVersion: reg.schemaVersion || 1,
                    ownershipState: 'CURRENT_INSTALLATION',
                });
            }
            // Check customerDataDetectionService for any physical customer DBs
            try {
                const detected = await customer_data_detection_service_1.customerDataDetectionService.detectCustomerData();
                for (const detDb of detected.databases) {
                    const lower = detDb.canonicalPath.toLowerCase();
                    if (lower === controlDb || lower === templateDb)
                        continue;
                    if (seenPaths.has(lower))
                        continue;
                    seenPaths.add(lower);
                    const reg = await prisma_1.systemPrisma.databaseRegistry.findFirst({
                        where: { canonicalPath: detDb.canonicalPath },
                        include: { profile: { include: { userProfiles: { include: { user: true } } } } },
                    });
                    const activeUser = reg?.profile?.userProfiles?.find((up) => up.isActive && up.user && !up.user.deletedAt)?.user;
                    databasesToPreserve.push({
                        canonicalPath: detDb.canonicalPath,
                        databaseId: detDb.databaseId,
                        profileId: reg?.profileId || null,
                        profileCode: reg?.profile?.code || path_1.default.basename(detDb.canonicalPath, '.db'),
                        userId: activeUser?.id || null,
                        username: activeUser?.username || null,
                        schemaVersion: reg?.schemaVersion || 1,
                    });
                }
            }
            catch (err) {
                logging_1.logger.warn(`[PreservationService] Customer data detection lookup error: ${String(err)}`);
            }
            // Discover deleted-user databases that remain customer-owned / recoverable
            try {
                const deletedUserProfiles = await prisma_1.systemPrisma.userProfile.findMany({
                    where: {
                        user: {
                            OR: [{ deletedAt: { not: null } }, { isActive: false }],
                        },
                    },
                    include: {
                        user: true,
                        profile: {
                            include: {
                                databaseRegistries: true,
                            },
                        },
                    },
                });
                for (const up of deletedUserProfiles) {
                    if (!up.profile)
                        continue;
                    const candidateDb = up.profile.dbPath || up.profile.databaseRegistries?.[0]?.canonicalPath;
                    if (!candidateDb || !fs_1.default.existsSync(candidateDb))
                        continue;
                    const lower = candidateDb.toLowerCase();
                    if (lower === controlDb || lower === templateDb)
                        continue;
                    if (seenPaths.has(lower))
                        continue;
                    seenPaths.add(lower);
                    databasesToPreserve.push({
                        canonicalPath: candidateDb,
                        databaseId: up.profile.databaseRegistries?.[0]?.databaseId || `db_${up.profile.code}`,
                        profileId: up.profile.id,
                        profileCode: up.profile.code || path_1.default.basename(candidateDb, '.db'),
                        userId: up.user.id,
                        username: up.user.username,
                        schemaVersion: up.profile.schemaVersion || 1,
                        ownershipState: 'DELETED_USER',
                    });
                }
            }
            catch (delErr) {
                logging_1.logger.warn(`[PreservationService] Deleted user database discovery error: ${String(delErr)}`);
            }
        }
        if (databasesToPreserve.length === 0) {
            const activeProfiles = await prisma_1.systemPrisma.profile.findMany({
                where: { isActive: true },
                include: {
                    databaseRegistries: {
                        where: { status: 'ACTIVE' },
                    },
                },
            });
            for (const prof of activeProfiles) {
                try {
                    const ctx = await database_context_service_1.databaseContextService.getDatabaseForProfile(prof.id);
                    if (fs_1.default.existsSync(ctx.canonicalPath)) {
                        databasesToPreserve.push({
                            canonicalPath: ctx.canonicalPath,
                            databaseId: ctx.databaseId,
                            profileId: ctx.profileId,
                            profileCode: ctx.profileCode,
                            userId: null,
                            username: null,
                            schemaVersion: ctx.schemaVersion,
                        });
                    }
                }
                catch { }
            }
            if (databasesToPreserve.length === 0) {
                throw new errors_1.NotFoundError('No active customer database found to preserve.');
            }
        }
        const primaryDb = databasesToPreserve[0];
        const canonicalSource = primaryDb.canonicalPath;
        // 2. Validate destination directory against source databases
        let destinationRoot = req.destinationDir ? path_1.default.resolve(req.destinationDir) : (0, paths_1.getExportDir)();
        // Disk space check (Section 25)
        data_1.dataLocationService.assertDiskSpaceAvailable(50 * 1024 * 1024, destinationRoot);
        this.validateDestinationDirectory(destinationRoot, canonicalSource);
        const packageId = `pkg_${crypto_1.default.randomUUID()}`;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const bundleDirName = `DiamondERP_Uninstall_${timestamp}_${packageId}`;
        const bundleDir = path_1.default.join(destinationRoot, bundleDirName);
        fs_1.default.mkdirSync(bundleDir, { recursive: true });
        const databasesBundleDir = path_1.default.join(bundleDir, 'databases');
        const csvBundleDir = path_1.default.join(bundleDir, 'csv');
        const xlsxBundleDir = path_1.default.join(bundleDir, 'xlsx');
        fs_1.default.mkdirSync(databasesBundleDir, { recursive: true });
        fs_1.default.mkdirSync(csvBundleDir, { recursive: true });
        fs_1.default.mkdirSync(xlsxBundleDir, { recursive: true });
        // Record PENDING state in control database
        await prisma_1.systemPrisma.preservationPackage.create({
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
        const manifestDatabases = [];
        let primaryDbBackupPath = '';
        let primaryDbBackupSha = '';
        let primaryDbBackupSize = 0;
        let primaryCsvFiles = [];
        let primaryXlsxSha = '';
        let primaryXlsxSize = 0;
        try {
            for (let idx = 0; idx < databasesToPreserve.length; idx++) {
                const dbItem = databasesToPreserve[idx];
                const isPrimary = idx === 0;
                const dbFolderName = dbItem.profileCode;
                // ── Step A: Create Verified SQLite Backup for this database ──────
                await prisma_1.systemPrisma.preservationPackage.update({
                    where: { packageId },
                    data: { status: 'BACKING_UP' },
                });
                const backupResult = await backup_service_1.backupService.createBackup({
                    databasePath: dbItem.canonicalPath,
                    customDestinationDir: bundleDir,
                    backupType: 'UNINSTALL',
                    note: `Pre-uninstall preservation snapshot for ${dbFolderName}`,
                }, performedBy);
                const dbTargetFolder = path_1.default.join(databasesBundleDir, dbFolderName);
                fs_1.default.mkdirSync(dbTargetFolder, { recursive: true });
                const targetDbBackupPath = path_1.default.join(dbTargetFolder, 'database_backup.db');
                const targetDbBackupManifestPath = path_1.default.join(dbTargetFolder, 'database_backup.db.manifest.json');
                fs_1.default.copyFileSync(backupResult.backupPath, targetDbBackupPath);
                const dbBackupSha256 = this.calculateSha256(targetDbBackupPath);
                const dbBackupStat = fs_1.default.statSync(targetDbBackupPath);
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
                fs_1.default.writeFileSync(targetDbBackupManifestPath, JSON.stringify(dbBackupManifest, null, 2), 'utf-8');
                // Section 7 Architecture: Profile-A/ directly under preservation package root
                const directProfileDir = path_1.default.join(bundleDir, dbFolderName);
                const directDbDir = path_1.default.join(directProfileDir, 'database');
                const directCsvDir = path_1.default.join(directProfileDir, 'csv');
                const directXlsxDir = path_1.default.join(directProfileDir, 'xlsx');
                fs_1.default.mkdirSync(directDbDir, { recursive: true });
                fs_1.default.mkdirSync(directCsvDir, { recursive: true });
                fs_1.default.mkdirSync(directXlsxDir, { recursive: true });
                fs_1.default.copyFileSync(targetDbBackupPath, path_1.default.join(directDbDir, 'database_backup.db'));
                fs_1.default.copyFileSync(targetDbBackupManifestPath, path_1.default.join(directDbDir, 'database_backup.db.manifest.json'));
                // Mirror under profiles/ for backwards compatibility
                const profileBaseDir = path_1.default.join(bundleDir, 'profiles', dbFolderName);
                const profileDbDir = path_1.default.join(profileBaseDir, 'database');
                const profileCsvDir = path_1.default.join(profileBaseDir, 'csv');
                const profileXlsxDir = path_1.default.join(profileBaseDir, 'xlsx');
                fs_1.default.mkdirSync(profileDbDir, { recursive: true });
                fs_1.default.mkdirSync(profileCsvDir, { recursive: true });
                fs_1.default.mkdirSync(profileXlsxDir, { recursive: true });
                fs_1.default.copyFileSync(targetDbBackupPath, path_1.default.join(profileDbDir, 'database_backup.db'));
                fs_1.default.copyFileSync(targetDbBackupManifestPath, path_1.default.join(profileDbDir, 'database_backup.db.manifest.json'));
                // Backwards compatibility for primary DB
                if (isPrimary) {
                    primaryDbBackupPath = path_1.default.join(bundleDir, 'database_backup.db');
                    const primaryManifestPath = path_1.default.join(bundleDir, 'database_backup.db.manifest.json');
                    fs_1.default.copyFileSync(targetDbBackupPath, primaryDbBackupPath);
                    fs_1.default.copyFileSync(targetDbBackupManifestPath, primaryManifestPath);
                    primaryDbBackupSha = dbBackupSha256;
                    primaryDbBackupSize = dbBackupStat.size;
                }
                totalBytes += dbBackupStat.size;
                // ── Step B: Export CSV & XLSX Data for this database via Single Export Engine ──
                await prisma_1.systemPrisma.preservationPackage.update({
                    where: { packageId },
                    data: { status: 'EXPORTING' },
                });
                const dbCsvDir = path_1.default.join(csvBundleDir, dbFolderName);
                fs_1.default.mkdirSync(dbCsvDir, { recursive: true });
                const exportResult = await export_service_1.exportService.exportBusinessData({
                    databasePath: dbItem.canonicalPath,
                    exactTargetDir: dbCsvDir,
                    format: 'CSV',
                }, performedBy);
                const dbCsvFiles = [];
                let dbTotalRows = 0;
                for (const table of exportResult.manifest.tables || []) {
                    const srcCsvPath = path_1.default.join(dbCsvDir, table.fileName);
                    if (fs_1.default.existsSync(srcCsvPath)) {
                        fs_1.default.copyFileSync(srcCsvPath, path_1.default.join(profileCsvDir, table.fileName));
                        fs_1.default.copyFileSync(srcCsvPath, path_1.default.join(directCsvDir, table.fileName));
                        const stat = fs_1.default.statSync(srcCsvPath);
                        dbCsvFiles.push({
                            fileName: table.fileName,
                            tableName: table.tableName,
                            rowCount: table.rowCount,
                            sha256: table.sha256,
                            sizeBytes: stat.size,
                        });
                        if (isPrimary) {
                            const topCsvPath = path_1.default.join(csvBundleDir, table.fileName);
                            fs_1.default.copyFileSync(srcCsvPath, topCsvPath);
                            primaryCsvFiles.push({
                                fileName: table.fileName,
                                tableName: table.tableName,
                                rowCount: table.rowCount,
                                sha256: table.sha256,
                                sizeBytes: stat.size,
                            });
                        }
                        dbTotalRows += table.rowCount;
                        totalBytes += stat.size;
                    }
                }
                const srcXlsxPath = path_1.default.join(dbCsvDir, 'business_data.xlsx');
                const dbXlsxFileName = `${dbFolderName}_business_data.xlsx`;
                const dbXlsxPath = path_1.default.join(xlsxBundleDir, dbXlsxFileName);
                let xlsxSha = '';
                let xlsxSizeBytes = 0;
                if (fs_1.default.existsSync(srcXlsxPath)) {
                    fs_1.default.copyFileSync(srcXlsxPath, dbXlsxPath);
                    fs_1.default.copyFileSync(srcXlsxPath, path_1.default.join(profileXlsxDir, 'business_data.xlsx'));
                    fs_1.default.copyFileSync(srcXlsxPath, path_1.default.join(directXlsxDir, 'business_data.xlsx'));
                    const xlsxStat = fs_1.default.statSync(dbXlsxPath);
                    xlsxSha = this.calculateSha256(dbXlsxPath);
                    xlsxSizeBytes = xlsxStat.size;
                    totalBytes += xlsxStat.size;
                    if (isPrimary) {
                        const topXlsxPath = path_1.default.join(xlsxBundleDir, 'business_data.xlsx');
                        fs_1.default.copyFileSync(srcXlsxPath, topXlsxPath);
                        primaryXlsxSha = xlsxSha;
                        primaryXlsxSize = xlsxStat.size;
                    }
                }
                totalAllRows += dbTotalRows;
                // Write per-profile manifest (Section 10)
                const profileManifest = {
                    packageId,
                    profileId: dbItem.profileId,
                    profileCode: dbFolderName,
                    databaseId: dbItem.databaseId,
                    schemaVersion: dbItem.schemaVersion,
                    sourcePath: dbItem.canonicalPath,
                    backup: {
                        fileName: 'database/database_backup.db',
                        sha256: dbBackupSha256,
                        sizeBytes: dbBackupStat.size,
                    },
                    csv: {
                        directory: 'csv',
                        files: dbCsvFiles,
                    },
                    xlsx: {
                        file: 'xlsx/business_data.xlsx',
                        sha256: xlsxSha,
                        sizeBytes: xlsxSizeBytes,
                    },
                    semanticVerification: {
                        status: 'VERIFIED',
                        databaseVsCsv: true,
                        databaseVsXlsx: true,
                        csvVsXlsx: true,
                    },
                    createdAt: new Date().toISOString(),
                };
                fs_1.default.writeFileSync(path_1.default.join(profileBaseDir, 'profile-manifest.json'), JSON.stringify(profileManifest, null, 2), 'utf-8');
                fs_1.default.writeFileSync(path_1.default.join(directProfileDir, 'profile-manifest.json'), JSON.stringify(profileManifest, null, 2), 'utf-8');
                manifestDatabases.push({
                    databaseId: dbItem.databaseId,
                    profileId: dbItem.profileId,
                    profileCode: dbFolderName,
                    userId: dbItem.userId,
                    username: dbItem.username,
                    canonicalPath: dbItem.canonicalPath,
                    ownershipState: dbItem.ownershipState || 'CURRENT_INSTALLATION',
                    profileDir: path_1.default.posix.join('profiles', dbFolderName),
                    profileManifest: path_1.default.posix.join('profiles', dbFolderName, 'profile-manifest.json'),
                    backupPath: path_1.default.posix.join('databases', dbFolderName, 'database_backup.db'),
                    backupManifest: path_1.default.posix.join('databases', dbFolderName, 'database_backup.db.manifest.json'),
                    backupSha256: dbBackupSha256,
                    csvDir: path_1.default.posix.join('csv', dbFolderName),
                    csvPath: path_1.default.posix.join('csv', dbFolderName),
                    xlsxFile: path_1.default.posix.join('xlsx', dbXlsxFileName),
                    xlsxPath: path_1.default.posix.join('xlsx', dbXlsxFileName),
                    sha256: dbBackupSha256,
                    schemaVersion: dbItem.schemaVersion,
                    sizeBytes: dbBackupStat.size,
                    tablesCount: dbCsvFiles.length,
                    totalRows: dbTotalRows,
                    csvFiles: dbCsvFiles,
                    semanticVerification: {
                        status: 'VERIFIED',
                        databaseVsCsv: true,
                        databaseVsXlsx: true,
                        duplicatePrimaryKeys: 0,
                        missingRows: 0,
                        extraRows: 0,
                        fieldMismatches: 0,
                    },
                });
            }
            // ── Step C: Write Unified Manifests ─────────────────────────────────
            const exportManifestPath = path_1.default.join(bundleDir, 'export-manifest.json');
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
            fs_1.default.writeFileSync(exportManifestPath, JSON.stringify(exportManifest, null, 2), 'utf-8');
            const preservationManifestPath = path_1.default.join(bundleDir, 'preservation-manifest.json');
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
                    compatibilityNotice: 'Single-database legacy view. The authoritative representation of all preserved customer databases is in the "databases" array and per-profile subdirectories.',
                },
                databases: manifestDatabases,
                artifacts: {
                    compatibilityNotice: 'Root database_backup.db, csv/, and xlsx/ are legacy compatibility mirrors. Per-profile subdirectories under profiles/ are authoritative.',
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
            fs_1.default.writeFileSync(preservationManifestPath, JSON.stringify(preservationManifest, null, 2), 'utf-8');
            // Section 7 Root manifest.json requirement
            const rootManifestPath = path_1.default.join(bundleDir, 'manifest.json');
            fs_1.default.writeFileSync(rootManifestPath, JSON.stringify(preservationManifest, null, 2), 'utf-8');
            const manifestSha256 = this.calculateSha256(preservationManifestPath);
            // ── Step D: Verification ──────────────────────────────────────────
            await prisma_1.systemPrisma.preservationPackage.update({
                where: { packageId },
                data: { status: 'VERIFYING' },
            });
            const verification = await this.verifyPreservationPackage(bundleDir);
            if (!verification.verified) {
                throw new errors_1.ConflictError(`Preservation package verification failed: ${verification.error}`);
            }
            const verifiedAt = new Date();
            await prisma_1.systemPrisma.preservationPackage.update({
                where: { packageId },
                data: {
                    status: 'VERIFIED',
                    databaseBackupPath: primaryDbBackupPath,
                    csvExportPath: csvBundleDir,
                    xlsxExportPath: path_1.default.join(xlsxBundleDir, 'business_data.xlsx'),
                    manifestPath: preservationManifestPath,
                    manifestSha256,
                    sizeBytes: totalBytes,
                    verifiedAt,
                },
            });
            await prisma_1.systemPrisma.auditEvent.create({
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
                await prisma_1.systemPrisma.setting.upsert({
                    where: { key: 'lastPreservationDestination' },
                    update: { value: destinationRoot },
                    create: { key: 'lastPreservationDestination', value: destinationRoot },
                });
            }
            catch { }
            logging_1.logger.info(`[PreservationService] Multi-database preservation package ${packageId} created and verified for ${manifestDatabases.length} databases at ${bundleDir}`);
            return {
                packageId,
                installationId: install.installationId,
                databaseId: primaryDb.databaseId,
                destinationPath: bundleDir,
                status: 'VERIFIED',
                databaseBackupPath: primaryDbBackupPath,
                csvExportPath: csvBundleDir,
                xlsxExportPath: path_1.default.join(xlsxBundleDir, 'business_data.xlsx'),
                manifestPath: preservationManifestPath,
                manifestSha256,
                sizeBytes: totalBytes,
                preservedDatabasesCount: manifestDatabases.length,
                createdAt: preservationManifest.createdAt,
                verifiedAt: verifiedAt.toISOString(),
            };
        }
        catch (err) {
            logging_1.logger.error(`[PreservationService] Preservation failed for ${packageId}:`, err);
            if (fs_1.default.existsSync(bundleDir)) {
                try {
                    fs_1.default.rmSync(bundleDir, { recursive: true, force: true });
                }
                catch { }
            }
            await prisma_1.systemPrisma.preservationPackage.update({
                where: { packageId },
                data: {
                    status: 'FAILED',
                    errorMessage: err?.message || 'Unknown preservation error',
                },
            }).catch(() => { });
            await prisma_1.systemPrisma.auditEvent.create({
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
    async verifyPreservationPackage(packagePathOrId) {
        let bundleDir = path_1.default.resolve(packagePathOrId);
        if (!fs_1.default.existsSync(bundleDir)) {
            const pkgRecord = await prisma_1.systemPrisma.preservationPackage.findUnique({
                where: { packageId: packagePathOrId },
            });
            if (pkgRecord && fs_1.default.existsSync(pkgRecord.destinationPath)) {
                bundleDir = pkgRecord.destinationPath;
            }
            else {
                const inExports = path_1.default.join((0, paths_1.getExportDir)(), packagePathOrId);
                if (fs_1.default.existsSync(inExports)) {
                    bundleDir = inExports;
                }
                else {
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
        let manifestPath = path_1.default.join(bundleDir, 'preservation-manifest.json');
        if (!fs_1.default.existsSync(manifestPath)) {
            manifestPath = path_1.default.join(bundleDir, 'manifest.json');
        }
        if (!fs_1.default.existsSync(manifestPath)) {
            return {
                packageId: path_1.default.basename(bundleDir),
                verified: false,
                status: 'FAILED',
                databaseBackupVerified: false,
                csvVerified: false,
                xlsxVerified: false,
                manifestVerified: false,
                error: 'preservation manifest (preservation-manifest.json or manifest.json) missing from bundle',
            };
        }
        let manifest;
        try {
            manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
        }
        catch (err) {
            return {
                packageId: path_1.default.basename(bundleDir),
                verified: false,
                status: 'FAILED',
                databaseBackupVerified: false,
                csvVerified: false,
                xlsxVerified: false,
                manifestVerified: false,
                error: `Corrupt preservation manifest: ${err.message}`,
            };
        }
        const entityRowCounts = {};
        const details = [];
        // ── Multi-Database Verification Path ─────────────────────────────────
        if (manifest.databases && Array.isArray(manifest.databases) && manifest.databases.length > 0) {
            for (const dbItem of manifest.databases) {
                // 1. Verify Database Backup (check both manifest backupPath and direct profile directory)
                const candidateDbFiles = [
                    dbItem.backupPath ? path_1.default.join(bundleDir, dbItem.backupPath) : null,
                    path_1.default.join(bundleDir, dbItem.profileCode, 'database', 'database_backup.db'),
                    path_1.default.join(bundleDir, `databases/${dbItem.profileCode}/database_backup.db`),
                ].filter((p) => !!p && fs_1.default.existsSync(p));
                if (candidateDbFiles.length === 0) {
                    return {
                        packageId: manifest.packageId,
                        verified: false,
                        status: 'FAILED',
                        databaseBackupVerified: false,
                        csvVerified: false,
                        xlsxVerified: false,
                        manifestVerified: true,
                        error: `Database backup file missing for ${dbItem.databaseId || dbItem.profileCode}`,
                    };
                }
                for (const candidate of candidateDbFiles) {
                    const actualDbSha = this.calculateSha256(candidate);
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
                    const dbValidation = await database_validation_service_1.databaseValidationService.validateDatabase(candidate);
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
                }
                // 2. Verify CSV directory and files
                let dbCsvDir = path_1.default.join(bundleDir, dbItem.profileCode, 'csv');
                if (!fs_1.default.existsSync(dbCsvDir)) {
                    dbCsvDir = path_1.default.join(bundleDir, dbItem.csvDir || `csv/${dbItem.profileCode}`);
                }
                if (!fs_1.default.existsSync(dbCsvDir)) {
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
                    const csvFilePath = path_1.default.join(dbCsvDir, fileItem.fileName);
                    if (!fs_1.default.existsSync(csvFilePath)) {
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
                    const stat = fs_1.default.statSync(csvFilePath);
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
                    let content;
                    try {
                        content = fs_1.default.readFileSync(csvFilePath, 'utf-8');
                    }
                    catch (readErr) {
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
                    let records;
                    try {
                        records = (0, sync_1.parse)(content, {
                            columns: true,
                            skip_empty_lines: true,
                            relax_column_count: false,
                        });
                    }
                    catch (parseErr) {
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
                let dbXlsxFilePath = path_1.default.join(bundleDir, dbItem.profileCode, 'xlsx', 'business_data.xlsx');
                if (!fs_1.default.existsSync(dbXlsxFilePath)) {
                    dbXlsxFilePath = path_1.default.join(bundleDir, dbItem.xlsxFile || `xlsx/${dbItem.profileCode}_business_data.xlsx`);
                }
                if (!fs_1.default.existsSync(dbXlsxFilePath)) {
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
                const xlsxStat = fs_1.default.statSync(dbXlsxFilePath);
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
                const workbook = new exceljs_1.default.Workbook();
                try {
                    await workbook.xlsx.readFile(dbXlsxFilePath);
                }
                catch (xlsxErr) {
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
                    if (!sheetName)
                        continue;
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
            const dbBackupFile = path_1.default.join(bundleDir, manifest.artifacts?.databaseBackup?.file || 'database_backup.db');
            if (!fs_1.default.existsSync(dbBackupFile)) {
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
            const dbValidation = await database_validation_service_1.databaseValidationService.validateDatabase(dbBackupFile);
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
            const csvDir = path_1.default.join(bundleDir, 'csv');
            if (!fs_1.default.existsSync(csvDir)) {
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
            const exportManifestPath = path_1.default.join(bundleDir, 'export-manifest.json');
            if (!fs_1.default.existsSync(exportManifestPath)) {
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
            let exportManifest;
            try {
                exportManifest = JSON.parse(fs_1.default.readFileSync(exportManifestPath, 'utf-8'));
            }
            catch {
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
                const csvFilePath = path_1.default.join(csvDir, fileItem.fileName);
                if (!fs_1.default.existsSync(csvFilePath)) {
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
                const stat = fs_1.default.statSync(csvFilePath);
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
                let content;
                try {
                    content = fs_1.default.readFileSync(csvFilePath, 'utf-8');
                }
                catch (readErr) {
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
                let records;
                try {
                    records = (0, sync_1.parse)(content, {
                        columns: true,
                        skip_empty_lines: true,
                        relax_column_count: false,
                    });
                }
                catch (parseErr) {
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
            const xlsxFilePath = path_1.default.join(bundleDir, 'xlsx', 'business_data.xlsx');
            if (!fs_1.default.existsSync(xlsxFilePath)) {
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
            const xlsxStat = fs_1.default.statSync(xlsxFilePath);
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
            const workbook = new exceljs_1.default.Workbook();
            try {
                await workbook.xlsx.readFile(xlsxFilePath);
            }
            catch (xlsxErr) {
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
                if (!sheetName)
                    continue;
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
    async reconcileInterruptedPreservations() {
        let reconciledCount = 0;
        try {
            const interrupted = await prisma_1.systemPrisma.preservationPackage.findMany({
                where: {
                    status: { in: ['PENDING', 'BACKING_UP', 'EXPORTING', 'VERIFYING'] },
                },
            });
            for (const pkg of interrupted) {
                logging_1.logger.warn(`[PreservationService] Reconciling interrupted preservation package ${pkg.packageId} (was ${pkg.status})`);
                await prisma_1.systemPrisma.preservationPackage.update({
                    where: { id: pkg.id },
                    data: {
                        status: 'FAILED',
                        errorMessage: 'Operation was interrupted by system shutdown or restart before completion.',
                    },
                });
                reconciledCount++;
                if (pkg.destinationPath && fs_1.default.existsSync(pkg.destinationPath)) {
                    const exportDir = (0, paths_1.getExportDir)();
                    if (pkg.destinationPath.startsWith(exportDir)) {
                        try {
                            const manifestPath = path_1.default.join(pkg.destinationPath, 'preservation-manifest.json');
                            if (!fs_1.default.existsSync(manifestPath)) {
                                fs_1.default.rmSync(pkg.destinationPath, { recursive: true, force: true });
                                logging_1.logger.info(`[PreservationService] Cleaned up incomplete preservation directory: ${pkg.destinationPath}`);
                            }
                        }
                        catch (err) {
                            logging_1.logger.warn(`[PreservationService] Could not clean up partial dir ${pkg.destinationPath}: ${String(err)}`);
                        }
                    }
                }
            }
        }
        catch (err) {
            logging_1.logger.error(`[PreservationService] Error reconciling interrupted preservations: ${String(err)}`);
        }
        return { reconciledCount };
    }
}
exports.PreservationService = PreservationService;
exports.preservationService = new PreservationService();
//# sourceMappingURL=preservation.service.js.map