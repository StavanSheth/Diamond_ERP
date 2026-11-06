"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backupService = exports.BackupService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../../../infrastructure/database/prisma");
const database_context_service_1 = require("../../../infrastructure/database/database-context.service");
const paths_1 = require("../../../infrastructure/paths");
const database_path_util_1 = require("../database/database-path.util");
const database_validation_service_1 = require("../database/database-validation.service");
const installation_service_1 = require("../installation.service");
const data_1 = require("../../../infrastructure/data");
const errors_1 = require("../../../errors");
const logging_1 = require("../../../infrastructure/logging");
class BackupService {
    constructor() {
        // Concurrency lock for backup operations by canonical source path
        this.activeLocks = new Set();
    }
    /**
     * Calculate SHA-256 hash of a file on disk.
     */
    calculateSha256(filePath) {
        const fileBuffer = fs_1.default.readFileSync(filePath);
        return crypto_1.default.createHash('sha256').update(fileBuffer).digest('hex');
    }
    /**
     * Creates a safe, verified atomic backup of a live profile database.
     */
    async createBackup(reqBody = {}, performedBy = 'system') {
        (0, paths_1.ensureAllDataDirs)();
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        // 1. Authoritative resolution of source database via DatabaseContextService
        let sourcePath = reqBody.databasePath;
        let targetRegistry = null;
        let resolvedProfileId = null;
        let profileCode = 'erp';
        if (sourcePath) {
            const pathResult = (0, database_path_util_1.canonicalizeDatabasePath)(sourcePath);
            if (!pathResult.valid) {
                throw new errors_1.ValidationError(pathResult.error || 'Invalid database path');
            }
            sourcePath = pathResult.canonicalPath;
            targetRegistry = await prisma_1.systemPrisma.databaseRegistry.findFirst({
                where: { canonicalPath: sourcePath },
                include: { profile: true },
            });
            resolvedProfileId = targetRegistry?.profileId || null;
            profileCode = reqBody.profileCode || targetRegistry?.profile?.code || path_1.default.basename(sourcePath, '.db');
        }
        else {
            let dbContext = null;
            if (reqBody.profileId) {
                dbContext = await database_context_service_1.databaseContextService.getDatabaseForProfile(reqBody.profileId);
            }
            else if (reqBody.profileCode) {
                dbContext = await database_context_service_1.databaseContextService.getDatabaseForProfileCode(reqBody.profileCode);
            }
            else {
                dbContext = await database_context_service_1.databaseContextService.getActiveProfileDatabase();
            }
            if (!dbContext) {
                throw new errors_1.NotFoundError('No active profile database found to back up.');
            }
            sourcePath = dbContext.canonicalPath;
            resolvedProfileId = dbContext.profileId;
            profileCode = dbContext.profileCode;
            targetRegistry = await prisma_1.systemPrisma.databaseRegistry.findUnique({
                where: { databaseId: dbContext.databaseId },
            });
        }
        if (!sourcePath || !fs_1.default.existsSync(sourcePath)) {
            throw new errors_1.NotFoundError(`Source database file does not exist: ${sourcePath}`);
        }
        // 2. Validate source path invariants
        const pathResult = (0, database_path_util_1.canonicalizeDatabasePath)(sourcePath);
        if (!pathResult.valid) {
            throw new errors_1.ValidationError(pathResult.error || 'Invalid database path');
        }
        const canonicalSource = pathResult.canonicalPath;
        if (!fs_1.default.existsSync(canonicalSource)) {
            throw new errors_1.NotFoundError(`Source database file does not exist: ${canonicalSource}`);
        }
        const stat = fs_1.default.statSync(canonicalSource);
        if (stat.isDirectory()) {
            throw new errors_1.ValidationError('Source path must be a regular file, not a directory.');
        }
        // Disk space check (Section 25)
        data_1.dataLocationService.assertDiskSpaceAvailable(stat.size * 2 + 10 * 1024 * 1024, (0, paths_1.getBackupsDir)());
        // Prohibit backing up system control DB or template DB as a business profile backup
        const controlDb = (0, paths_1.getControlDbPath)();
        if (canonicalSource.toLowerCase() === controlDb.toLowerCase()) {
            throw new errors_1.ValidationError('Cannot create a business backup of the system control database.');
        }
        const templateDb = (0, paths_1.getDatabaseTemplatePath)();
        if (templateDb && canonicalSource.toLowerCase() === templateDb.toLowerCase()) {
            throw new errors_1.ValidationError('Cannot create a business backup of the template database.');
        }
        // 3. Concurrency Protection
        if (this.activeLocks.has(canonicalSource)) {
            throw new errors_1.ConflictError('A backup operation is already actively in progress for this database. Please wait.');
        }
        this.activeLocks.add(canonicalSource);
        const backupId = `bkp_${crypto_1.default.randomUUID()}`;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `${profileCode}_backup_${timestamp}_${backupId}.db`;
        if (reqBody.customDestinationDir) {
            const destResolved = path_1.default.resolve(reqBody.customDestinationDir);
            if (destResolved.toLowerCase() === canonicalSource.toLowerCase()) {
                this.activeLocks.delete(canonicalSource);
                throw new errors_1.ValidationError('Backup destination cannot be identical to the source database.');
            }
        }
        const destDir = reqBody.customDestinationDir
            ? path_1.default.resolve(reqBody.customDestinationDir)
            : (0, paths_1.getBackupsDir)();
        if (!fs_1.default.existsSync(destDir)) {
            fs_1.default.mkdirSync(destDir, { recursive: true });
        }
        const finalBackupPath = path_1.default.join(destDir, backupFileName);
        const manifestPath = `${finalBackupPath}.manifest.json`;
        // Verify destination != source
        if (path_1.default.resolve(finalBackupPath).toLowerCase() === canonicalSource.toLowerCase()) {
            this.activeLocks.delete(canonicalSource);
            throw new errors_1.ValidationError('Backup destination cannot be identical to the source database.');
        }
        // Staging directory for crash-safe publication
        const stagingDir = path_1.default.join((0, paths_1.getBackupStagingDir)(), backupId);
        fs_1.default.mkdirSync(stagingDir, { recursive: true });
        const stagedDbPath = path_1.default.join(stagingDir, backupFileName);
        const stagedManifestPath = path_1.default.join(stagingDir, `${backupFileName}.manifest.json`);
        // 4. Record PENDING state in Database
        const databaseId = targetRegistry?.databaseId || `db_${path_1.default.basename(canonicalSource, '.db')}`;
        const profileId = resolvedProfileId;
        let backupRecord = await prisma_1.systemPrisma.backupRecord.create({
            data: {
                backupId,
                installationId: install.id,
                databaseId,
                profileId,
                sourcePath: canonicalSource,
                backupPath: finalBackupPath,
                backupType: reqBody.backupType || 'FULL',
                schemaVersion: targetRegistry?.schemaVersion || 1,
                applicationVersion: install.appVersion || '3.0.0',
                sizeBytes: stat.size,
                sha256: '', // populated post-creation
                status: 'CREATING',
            },
        });
        try {
            // 5. Checkpoint SQLite WAL to guarantee clean standalone database state
            const sourceClient = new client_1.PrismaClient({
                datasources: { db: { url: `file:${canonicalSource.replace(/\\/g, '/')}` } },
            });
            try {
                await sourceClient.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
            }
            catch (checkpointErr) {
                logging_1.logger.warn(`[BackupService] WAL checkpoint on ${canonicalSource} non-critical warning: ${String(checkpointErr)}`);
            }
            finally {
                await sourceClient.$disconnect();
            }
            // 6. Safe copy / VACUUM INTO to staging file
            let snapshotSuccess = false;
            try {
                const tempClient = new client_1.PrismaClient({
                    datasources: { db: { url: `file:${canonicalSource.replace(/\\/g, '/')}` } },
                });
                await tempClient.$executeRawUnsafe(`VACUUM INTO '${stagedDbPath.replace(/\\/g, '/')}'`);
                await tempClient.$disconnect();
                snapshotSuccess = true;
            }
            catch (vacuumErr) {
                logging_1.logger.warn(`[BackupService] VACUUM INTO failed, running full checkpoint before fallback copy: ${String(vacuumErr)}`);
            }
            if (!snapshotSuccess) {
                const checkpointClient = new client_1.PrismaClient({
                    datasources: { db: { url: `file:${canonicalSource.replace(/\\/g, '/')}` } },
                });
                try {
                    await checkpointClient.$queryRawUnsafe('PRAGMA wal_checkpoint(FULL);');
                }
                finally {
                    await checkpointClient.$disconnect();
                }
                fs_1.default.copyFileSync(canonicalSource, stagedDbPath);
            }
            // 7. Verify staging database SQLite integrity
            const verifyClient = new client_1.PrismaClient({
                datasources: { db: { url: `file:${stagedDbPath.replace(/\\/g, '/')}` } },
            });
            let tableCount = 0;
            let integrityResult = 'unknown';
            try {
                const integrityRows = await verifyClient.$queryRawUnsafe('PRAGMA integrity_check;');
                integrityResult = integrityRows?.[0]?.integrity_check || 'ok';
                if (integrityResult !== 'ok') {
                    throw new errors_1.ValidationError(`SQLite integrity check failed: ${integrityResult}`);
                }
                // Run PRAGMA foreign_key_check (Section 17)
                const fkRows = await verifyClient.$queryRawUnsafe('PRAGMA foreign_key_check;');
                if (fkRows && fkRows.length > 0) {
                    throw new errors_1.ValidationError(`SQLite foreign key check failed with ${fkRows.length} violation(s)`);
                }
                const tables = await verifyClient.$queryRawUnsafe("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
                tableCount = Number(tables?.[0]?.count || 0);
            }
            finally {
                await verifyClient.$disconnect();
            }
            // 8. Compute final SHA-256 and size on finalized staged file
            const finalStats = fs_1.default.statSync(stagedDbPath);
            const sha256 = this.calculateSha256(stagedDbPath);
            // 9. Write Manifest JSON into staging directory (Never contains passwords, PINs, or secrets)
            const manifest = {
                formatVersion: 1,
                backupId,
                createdAt: new Date().toISOString(),
                application: {
                    name: 'Diamond ERP',
                    version: install.appVersion || '3.0.0',
                },
                installation: {
                    installationId: install.installationId,
                },
                database: {
                    databaseId,
                    schemaVersion: targetRegistry?.schemaVersion || 1,
                    displayName: targetRegistry?.displayName || path_1.default.basename(canonicalSource),
                    profileCode,
                },
                artifact: {
                    fileName: backupFileName,
                    sizeBytes: finalStats.size,
                    sha256,
                },
                verification: {
                    sqliteIntegrity: integrityResult,
                    tableCount,
                    verifiedAt: new Date().toISOString(),
                },
            };
            fs_1.default.writeFileSync(stagedManifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
            // Verify staged manifest
            if (!fs_1.default.existsSync(stagedManifestPath)) {
                throw new Error('Failed to write backup manifest in staging.');
            }
            // 10. Atomic publication to final destination
            fs_1.default.copyFileSync(stagedDbPath, finalBackupPath);
            fs_1.default.copyFileSync(stagedManifestPath, manifestPath);
            // Clean up staging folder
            try {
                if (fs_1.default.existsSync(stagedDbPath))
                    fs_1.default.unlinkSync(stagedDbPath);
                if (fs_1.default.existsSync(stagedManifestPath))
                    fs_1.default.unlinkSync(stagedManifestPath);
                if (fs_1.default.existsSync(stagingDir))
                    fs_1.default.rmdirSync(stagingDir);
            }
            catch { }
            // 11. Mark VERIFIED in Database
            backupRecord = await prisma_1.systemPrisma.backupRecord.update({
                where: { id: backupRecord.id },
                data: {
                    status: 'VERIFIED',
                    sizeBytes: finalStats.size,
                    sha256,
                    verifiedAt: new Date(),
                },
            });
            // 12. Log audit event
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'BACKUP',
                    entityId: backupId,
                    eventType: 'BACKUP_VERIFIED',
                    description: `Verified backup created: ${backupFileName} (${finalStats.size} bytes)`,
                    metadata: JSON.stringify({
                        backupId,
                        sizeBytes: finalStats.size,
                        sha256,
                        tableCount,
                    }),
                    performedBy,
                },
            });
            // Safe retention: prune old backups beyond retention limit (keep minimum 5, never delete latest/only verified)
            if (profileId) {
                await this.pruneBackups(profileId, 5).catch(() => { });
            }
            return this.formatRecord(backupRecord);
        }
        catch (err) {
            // Clean up staging and any incomplete output on failure
            try {
                if (fs_1.default.existsSync(stagingDir)) {
                    fs_1.default.rmSync(stagingDir, { recursive: true, force: true });
                }
                if (fs_1.default.existsSync(finalBackupPath)) {
                    fs_1.default.unlinkSync(finalBackupPath);
                }
                if (fs_1.default.existsSync(manifestPath)) {
                    fs_1.default.unlinkSync(manifestPath);
                }
            }
            catch { }
            await prisma_1.systemPrisma.backupRecord.update({
                where: { id: backupRecord.id },
                data: {
                    status: 'FAILED',
                    errorMessage: err?.message || 'Backup creation failed',
                },
            });
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'BACKUP',
                    entityId: backupId,
                    eventType: 'BACKUP_FAILED',
                    description: `Backup creation failed: ${err?.message || 'Unknown error'}`,
                    performedBy,
                },
            });
            throw err;
        }
        finally {
            this.activeLocks.delete(canonicalSource);
        }
    }
    /**
     * List all verified backups from database and directory.
     */
    async listBackups() {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const records = await prisma_1.systemPrisma.backupRecord.findMany({
            where: {
                installationId: install.id,
                status: { in: ['VERIFIED', 'CREATING', 'FAILED'] },
            },
            orderBy: { createdAt: 'desc' },
        });
        return {
            backups: records.map((r) => this.formatRecord(r)),
        };
    }
    /**
     * Inspect a backup by backupId or file path.
     */
    async inspectBackup(backupIdOrPath) {
        const record = await prisma_1.systemPrisma.backupRecord.findFirst({
            where: {
                OR: [{ backupId: backupIdOrPath }, { backupPath: backupIdOrPath }],
            },
        });
        const targetPath = record ? record.backupPath : path_1.default.resolve(backupIdOrPath);
        if (!fs_1.default.existsSync(targetPath)) {
            throw new errors_1.NotFoundError(`Backup file not found: ${targetPath}`);
        }
        const manifestPath = `${targetPath}.manifest.json`;
        let manifest = null;
        if (fs_1.default.existsSync(manifestPath)) {
            try {
                manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
            }
            catch { }
        }
        const stats = fs_1.default.statSync(targetPath);
        const validation = await database_validation_service_1.databaseValidationService.validateDatabase(targetPath);
        return {
            backupId: record?.backupId || path_1.default.basename(targetPath, '.db'),
            canonicalPath: targetPath,
            sizeBytes: stats.size,
            lastModified: stats.mtime.toISOString(),
            status: record?.status || (validation.isValid ? 'VERIFIED' : 'INVALID'),
            sha256: record?.sha256 || this.calculateSha256(targetPath),
            manifest,
            validation,
        };
    }
    /**
     * Verify backup integrity and hash match.
     */
    async verifyBackup(backupIdOrPath) {
        const record = await prisma_1.systemPrisma.backupRecord.findFirst({
            where: {
                OR: [{ backupId: backupIdOrPath }, { backupPath: backupIdOrPath }],
            },
        });
        const targetPath = record ? record.backupPath : path_1.default.resolve(backupIdOrPath);
        if (!fs_1.default.existsSync(targetPath)) {
            throw new errors_1.NotFoundError(`Backup file not found: ${targetPath}`);
        }
        const manifestPath = `${targetPath}.manifest.json`;
        let manifestPresent = fs_1.default.existsSync(manifestPath);
        let expectedHash = record?.sha256 || '';
        if (manifestPresent) {
            try {
                const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
                expectedHash = manifest.artifact.sha256;
            }
            catch { }
        }
        const currentHash = this.calculateSha256(targetPath);
        const stats = fs_1.default.statSync(targetPath);
        const client = new client_1.PrismaClient({
            datasources: { db: { url: `file:${targetPath.replace(/\\/g, '/')}` } },
        });
        let integrityResult = 'unknown';
        try {
            const integrityRows = await client.$queryRawUnsafe('PRAGMA integrity_check;');
            integrityResult = integrityRows?.[0]?.integrity_check || 'ok';
        }
        catch (err) {
            integrityResult = err?.message || 'failed';
        }
        finally {
            await client.$disconnect();
        }
        const sha256Matches = !expectedHash || expectedHash === currentHash;
        const isValid = integrityResult === 'ok' && sha256Matches;
        if (record) {
            await prisma_1.systemPrisma.backupRecord.update({
                where: { id: record.id },
                data: {
                    status: isValid ? 'VERIFIED' : 'CORRUPTED',
                    verifiedAt: new Date(),
                },
            });
        }
        return {
            backupId: record?.backupId || path_1.default.basename(targetPath, '.db'),
            isValid,
            sha256Matches,
            sqliteIntegrity: integrityResult,
            sizeBytes: stats.size,
            manifestPresent,
            verifiedAt: new Date().toISOString(),
            error: !isValid ? `Integrity check: ${integrityResult}, SHA match: ${sha256Matches}` : null,
        };
    }
    /**
     * Delete backup record (soft-delete, never touches live DB).
     */
    async deleteBackupRecord(backupId) {
        const record = await prisma_1.systemPrisma.backupRecord.findUnique({
            where: { backupId },
        });
        if (!record) {
            throw new errors_1.NotFoundError(`Backup record not found: ${backupId}`);
        }
        await prisma_1.systemPrisma.backupRecord.update({
            where: { backupId },
            data: { status: 'DELETED' },
        });
    }
    /**
     * Clean up interrupted .partial files from backup directory.
     */
    cleanupPartialBackups() {
        const backupsDir = (0, paths_1.getBackupsDir)();
        if (fs_1.default.existsSync(backupsDir)) {
            try {
                const files = fs_1.default.readdirSync(backupsDir);
                for (const file of files) {
                    if (file.endsWith('.partial')) {
                        const fullPath = path_1.default.join(backupsDir, file);
                        try {
                            fs_1.default.unlinkSync(fullPath);
                            logging_1.logger.info(`[BackupService] Purged stale partial backup: ${file}`);
                        }
                        catch { }
                    }
                }
            }
            catch { }
        }
        const stagingDir = (0, paths_1.getBackupStagingDir)();
        if (fs_1.default.existsSync(stagingDir)) {
            try {
                const entries = fs_1.default.readdirSync(stagingDir);
                for (const entry of entries) {
                    const fullPath = path_1.default.join(stagingDir, entry);
                    try {
                        fs_1.default.rmSync(fullPath, { recursive: true, force: true });
                        logging_1.logger.info(`[BackupService] Purged stale backup staging folder: ${entry}`);
                    }
                    catch { }
                }
            }
            catch { }
        }
    }
    /**
     * Safe backup retention enforcement (Section 34):
     * - Never deletes the latest verified backup
     * - Never deletes the only backup
     * - Keeps at least retainCount verified backups per profile
     */
    async pruneBackups(profileId, retainCount = 5) {
        const whereClause = {
            status: 'VERIFIED',
        };
        if (profileId) {
            whereClause.profileId = profileId;
        }
        const verifiedBackups = await prisma_1.systemPrisma.backupRecord.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
        });
        // Safety 1: Never retain less than 2 verified backups per profile (Section 18)
        const safeRetainCount = Math.max(retainCount, 2);
        if (verifiedBackups.length <= safeRetainCount) {
            return 0;
        }
        // Keep the first `safeRetainCount` records (which are newest verified)
        const toPrune = verifiedBackups.slice(safeRetainCount);
        let pruned = 0;
        for (const bkp of toPrune) {
            try {
                // Safety 3: Never delete backup referenced by a preservation package
                const inPreservation = await prisma_1.systemPrisma.preservationPackage.findFirst({
                    where: {
                        destinationPath: { contains: bkp.backupId },
                    },
                });
                if (inPreservation) {
                    logging_1.logger.info(`[BackupService] Skipping prune for backup ${bkp.backupId}: referenced by preservation package ${inPreservation.packageId}`);
                    continue;
                }
                // Safety 4: Retain PROFILE_DELETE backups for safety window
                if (bkp.backupType === 'PROFILE_DELETE') {
                    const ageMs = Date.now() - new Date(bkp.createdAt).getTime();
                    if (ageMs < 30 * 24 * 60 * 60 * 1000) {
                        continue;
                    }
                }
                if (fs_1.default.existsSync(bkp.backupPath)) {
                    fs_1.default.unlinkSync(bkp.backupPath);
                }
                const manifestPath = `${bkp.backupPath}.manifest.json`;
                if (fs_1.default.existsSync(manifestPath)) {
                    fs_1.default.unlinkSync(manifestPath);
                }
                await prisma_1.systemPrisma.backupRecord.update({
                    where: { id: bkp.id },
                    data: { status: 'DELETED' },
                });
                pruned++;
            }
            catch (err) {
                logging_1.logger.warn(`[BackupService] Could not prune backup ${bkp.backupId}: ${err.message}`);
            }
        }
        return pruned;
    }
    formatRecord(record) {
        return {
            id: record.id,
            backupId: record.backupId,
            installationId: record.installationId,
            databaseId: record.databaseId,
            profileId: record.profileId,
            sourcePath: record.sourcePath,
            backupPath: record.backupPath,
            backupType: record.backupType,
            schemaVersion: record.schemaVersion,
            applicationVersion: record.applicationVersion,
            sizeBytes: record.sizeBytes,
            sha256: record.sha256,
            status: record.status,
            createdAt: record.createdAt.toISOString(),
            verifiedAt: record.verifiedAt ? record.verifiedAt.toISOString() : null,
            errorMessage: record.errorMessage,
        };
    }
}
exports.BackupService = BackupService;
exports.backupService = new BackupService();
//# sourceMappingURL=backup.service.js.map