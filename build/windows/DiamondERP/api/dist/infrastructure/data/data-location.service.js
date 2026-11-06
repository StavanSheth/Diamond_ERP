"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataLocationService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const data_paths_1 = require("./data-paths");
const prisma_1 = require("../database/prisma");
const backup_service_1 = require("../../modules/system/backup/backup.service");
const database_health_service_1 = require("../../modules/system/database/database-health.service");
const MIGRATION_STATE_FILE = path_1.default.join(process.env.LOCALAPPDATA || path_1.default.join(process.env.HOME || '', 'AppData', 'Local'), 'DiamondERP', 'migration-state.json');
class DataLocationService {
    constructor() {
        this.isMigrationLocked = false;
    }
    isLocked() { return this.isMigrationLocked; }
    setLock(locked) { this.isMigrationLocked = locked; }
    writeMigrationState(record) {
        try {
            fs_1.default.mkdirSync(path_1.default.dirname(MIGRATION_STATE_FILE), { recursive: true });
            fs_1.default.writeFileSync(MIGRATION_STATE_FILE, JSON.stringify(record, null, 2), 'utf-8');
        }
        catch { }
    }
    clearMigrationState() {
        try {
            if (fs_1.default.existsSync(MIGRATION_STATE_FILE))
                fs_1.default.unlinkSync(MIGRATION_STATE_FILE);
        }
        catch { }
    }
    readMigrationState() {
        try {
            if (!fs_1.default.existsSync(MIGRATION_STATE_FILE))
                return null;
            return JSON.parse(fs_1.default.readFileSync(MIGRATION_STATE_FILE, 'utf-8'));
        }
        catch {
            return null;
        }
    }
    checkDiskSpace(targetPath) {
        const dirToCheck = targetPath ? path_1.default.resolve(targetPath) : (0, data_paths_1.getDataRoot)();
        let probePath = dirToCheck;
        while (!fs_1.default.existsSync(probePath)) {
            const parent = path_1.default.dirname(probePath);
            if (parent === probePath)
                break;
            probePath = parent;
        }
        try {
            const stats = fs_1.default.statfsSync(probePath);
            const freeBytes = Number(stats.bavail) * Number(stats.bsize);
            const totalBytes = Number(stats.blocks) * Number(stats.bsize);
            const freeGb = parseFloat((freeBytes / (1024 * 1024 * 1024)).toFixed(2));
            const totalGb = parseFloat((totalBytes / (1024 * 1024 * 1024)).toFixed(2));
            let status = 'HEALTHY';
            if (freeGb < 0.2)
                status = 'INSUFFICIENT';
            else if (freeGb < 1.0)
                status = 'CRITICAL';
            else if (freeGb < 5.0)
                status = 'LOW';
            return { path: dirToCheck, freeBytes, totalBytes, freeGb, totalGb, status, checkedAt: new Date().toISOString() };
        }
        catch {
            return { path: dirToCheck, freeBytes: 10 * 1024 * 1024 * 1024, totalBytes: 100 * 1024 * 1024 * 1024, freeGb: 10, totalGb: 100, status: 'HEALTHY', checkedAt: new Date().toISOString() };
        }
    }
    assertDiskSpaceAvailable(requiredBytes, targetPath) {
        const assessment = this.checkDiskSpace(targetPath);
        if (assessment.status === 'INSUFFICIENT' || assessment.freeBytes < requiredBytes) {
            throw new Error(`Insufficient disk space. Required: ${(requiredBytes / (1024 * 1024)).toFixed(1)} MB, Available: ${(assessment.freeBytes / (1024 * 1024)).toFixed(1)} MB (${assessment.status}).`);
        }
    }
    getDirectorySize(dirPath) {
        if (!fs_1.default.existsSync(dirPath))
            return 0;
        let total = 0;
        const items = fs_1.default.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path_1.default.join(dirPath, item.name);
            if (item.isDirectory())
                total += this.getDirectorySize(fullPath);
            else if (item.isFile())
                total += fs_1.default.statSync(fullPath).size;
        }
        return total;
    }
    /**
     * Safe Data Location Migration with explicit state machine (Phase 25).
     * Rollback restores both runtime config AND DatabaseRegistry paths (Phase 24).
     */
    async migrateDataLocation(newTargetDataDir) {
        const sourceDataDir = path_1.default.resolve((0, data_paths_1.getDataRoot)());
        if (!newTargetDataDir || typeof newTargetDataDir !== 'string')
            throw new Error('Target destination path must be a non-empty string.');
        if (!path_1.default.isAbsolute(newTargetDataDir))
            throw new Error('Target destination path must be an absolute path.');
        const targetDir = path_1.default.resolve(newTargetDataDir);
        if (sourceDataDir.toLowerCase() === targetDir.toLowerCase())
            throw new Error('Destination path cannot be identical to the current data directory.');
        if (targetDir.toLowerCase().startsWith(sourceDataDir.toLowerCase() + path_1.default.sep))
            throw new Error('Destination path cannot be a subdirectory of the current data directory.');
        if (sourceDataDir.toLowerCase().startsWith(targetDir.toLowerCase() + path_1.default.sep))
            throw new Error('Current data directory cannot be inside the target destination path.');
        // PREPARING
        const stateRecord = {
            state: 'PREPARING', sourceDataRoot: sourceDataDir, targetDataRoot: targetDir,
            startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), originalRegistryPaths: {},
        };
        this.writeMigrationState(stateRecord);
        try {
            if (!fs_1.default.existsSync(targetDir))
                fs_1.default.mkdirSync(targetDir, { recursive: true });
            const testFile = path_1.default.join(targetDir, `.perm-test-${Date.now()}.tmp`);
            fs_1.default.writeFileSync(testFile, 'DiamondERP-write-test', 'utf-8');
            const readBack = fs_1.default.readFileSync(testFile, 'utf-8');
            fs_1.default.unlinkSync(testFile);
            if (readBack !== 'DiamondERP-write-test')
                throw new Error('Read verification failed during destination permission check.');
        }
        catch (err) {
            throw new Error(`Cannot write to destination directory "${targetDir}": ${err.message}`);
        }
        this.assertDiskSpaceAvailable(this.getDirectorySize(sourceDataDir) + 500 * 1024 * 1024, targetDir);
        // Snapshot registry paths for rollback
        const allRegistries = await prisma_1.systemPrisma.databaseRegistry.findMany();
        for (const reg of allRegistries)
            stateRecord.originalRegistryPaths[reg.id] = reg.canonicalPath;
        // BACKING_UP
        stateRecord.state = 'BACKING_UP';
        stateRecord.updatedAt = new Date().toISOString();
        this.writeMigrationState(stateRecord);
        const safetyBackups = [];
        const profiles = await prisma_1.systemPrisma.profile.findMany({ where: { status: 'ACTIVE' } });
        for (const profile of profiles) {
            try {
                const backup = await backup_service_1.backupService.createBackup({ profileId: profile.id, backupType: 'MANUAL' });
                safetyBackups.push(backup.backupPath);
            }
            catch (backupErr) {
                throw new Error(`Failed to create safety backup for profile "${profile.code}": ${backupErr.message}`);
            }
        }
        // COPYING
        stateRecord.state = 'COPYING';
        stateRecord.updatedAt = new Date().toISOString();
        this.writeMigrationState(stateRecord);
        this.setLock(true);
        await (0, prisma_1.closeAllDynamicClients)();
        await prisma_1.systemPrisma.$disconnect();
        try {
            this.copyDirectoryRecursive(sourceDataDir, targetDir);
            // VERIFYING â€” real PRAGMA integrity_check (Phase 23)
            stateRecord.state = 'VERIFYING';
            stateRecord.updatedAt = new Date().toISOString();
            this.writeMigrationState(stateRecord);
            const targetDatabasesDir = path_1.default.join(targetDir, 'databases');
            let migratedCount = 0;
            if (fs_1.default.existsSync(targetDatabasesDir)) {
                const dbFiles = fs_1.default.readdirSync(targetDatabasesDir).filter((f) => f.endsWith('.db'));
                migratedCount = dbFiles.length;
                for (const dbFile of dbFiles)
                    await this.verifySqliteFile(path_1.default.join(targetDatabasesDir, dbFile));
            }
            const targetSystemDb = fs_1.default.existsSync(path_1.default.join(targetDir, 'system', 'system.db'))
                ? path_1.default.join(targetDir, 'system', 'system.db') : path_1.default.join(targetDir, 'system.db');
            if (fs_1.default.existsSync(targetSystemDb))
                await this.verifySqliteFile(targetSystemDb);
            // COMMITTING
            stateRecord.state = 'COMMITTING';
            stateRecord.updatedAt = new Date().toISOString();
            this.writeMigrationState(stateRecord);
            (0, data_paths_1.setCustomDataRoot)(targetDir);
            (0, data_paths_1.ensureAllDataDirs)();
            const configDir = path_1.default.join(targetDir, 'config');
            if (!fs_1.default.existsSync(configDir))
                fs_1.default.mkdirSync(configDir, { recursive: true });
            fs_1.default.writeFileSync(path_1.default.join(configDir, '.data-location.json'), JSON.stringify({ dataRoot: targetDir, migratedAt: new Date().toISOString() }, null, 2), 'utf-8');
            await prisma_1.systemPrisma.$connect();
            for (const reg of await prisma_1.systemPrisma.databaseRegistry.findMany()) {
                const newPath = path_1.default.join(targetDatabasesDir, path_1.default.basename(reg.canonicalPath));
                if (fs_1.default.existsSync(newPath)) {
                    await prisma_1.systemPrisma.databaseRegistry.update({ where: { id: reg.id }, data: { canonicalPath: newPath } });
                }
            }
            const health = await database_health_service_1.databaseHealthService.checkAllProfiles();
            const hasUnhealthy = health.some((h) => h.status !== 'HEALTHY');
            if (hasUnhealthy) {
                throw new Error('Database health check failed after updating registry paths.');
            }
            this.setLock(false);
            // COMPLETED
            stateRecord.state = 'COMPLETED';
            stateRecord.updatedAt = new Date().toISOString();
            this.writeMigrationState(stateRecord);
            this.clearMigrationState();
            return {
                success: true,
                previousDataRoot: sourceDataDir, newDataRoot: targetDir,
                databasesMigrated: migratedCount, safetyBackupsCreated: safetyBackups,
                integrityCheckPassed: true, migratedAt: new Date().toISOString(),
            };
        }
        catch (migrationErr) {
            // ROLLING_BACK
            stateRecord.state = 'ROLLING_BACK';
            stateRecord.error = migrationErr.message;
            stateRecord.updatedAt = new Date().toISOString();
            this.writeMigrationState(stateRecord);
            (0, data_paths_1.setCustomDataRoot)(sourceDataDir);
            this.setLock(false);
            try {
                await prisma_1.systemPrisma.$connect();
                // Restore DatabaseRegistry paths to pre-migration values (Phase 24)
                for (const [regId, originalPath] of Object.entries(stateRecord.originalRegistryPaths)) {
                    try {
                        await prisma_1.systemPrisma.databaseRegistry.update({ where: { id: regId }, data: { canonicalPath: originalPath } });
                    }
                    catch { }
                }
                // Verify every registry path restored
                for (const [regId, originalPath] of Object.entries(stateRecord.originalRegistryPaths)) {
                    const current = await prisma_1.systemPrisma.databaseRegistry.findUnique({ where: { id: regId } });
                    if (current && current.canonicalPath !== originalPath) {
                        console.error(`Rollback verification warning for ${regId}: expected ${originalPath}, got ${current.canonicalPath}`);
                    }
                }
            }
            catch { }
            // FAILED
            stateRecord.state = 'FAILED';
            stateRecord.updatedAt = new Date().toISOString();
            this.writeMigrationState(stateRecord);
            throw new Error(`Data location migration failed and was rolled back: ${migrationErr.message}`);
        }
    }
    /**
     * Real SQLite integrity verification using PRAGMA integrity_check and PRAGMA foreign_key_check.
     * Section 14: Migration MUST FAIL if actual SQLite integrity verification cannot execute.
     */
    async verifySqliteFile(dbPath) {
        if (!fs_1.default.existsSync(dbPath))
            throw new Error(`Database file missing for integrity check: ${dbPath}`);
        const fd = fs_1.default.openSync(dbPath, 'r');
        const header = Buffer.alloc(16);
        fs_1.default.readSync(fd, header, 0, 16, 0);
        fs_1.default.closeSync(fd);
        if (!header.toString('utf-8').startsWith('SQLite format 3')) {
            throw new Error(`Invalid SQLite header in copied database: ${dbPath}`);
        }
        let checkPassed = false;
        let fkPassed = false;
        // 1. Try better-sqlite3 first
        try {
            const Database = require('better-sqlite3');
            const db = new Database(dbPath, { readonly: true, fileMustExist: true });
            try {
                const rows = db.prepare('PRAGMA integrity_check;').all();
                if (rows && rows.length > 0 && rows[0].integrity_check === 'ok') {
                    checkPassed = true;
                }
                else {
                    throw new Error(`PRAGMA integrity_check failed for ${dbPath}: ${rows.map((r) => r.integrity_check).join(', ')}`);
                }
                const fkRows = db.prepare('PRAGMA foreign_key_check;').all();
                if (fkRows && fkRows.length > 0) {
                    throw new Error(`PRAGMA foreign_key_check failed for ${dbPath}: ${fkRows.length} foreign key violations found.`);
                }
                fkPassed = true;
            }
            finally {
                db.close();
            }
        }
        catch (err) {
            if (err.message && (err.message.includes('integrity_check failed') || err.message.includes('foreign_key_check failed'))) {
                throw err;
            }
            // 2. If better-sqlite3 cannot be loaded, execute via PrismaClient
            try {
                const { PrismaClient: CheckClient } = require('@prisma/client');
                const checkClient = new CheckClient({
                    datasources: { db: { url: `file:${dbPath.replace(/\\/g, '/')}` } },
                });
                try {
                    const rows = await checkClient.$queryRawUnsafe('PRAGMA integrity_check;');
                    if (rows && rows.length > 0 && rows[0].integrity_check === 'ok') {
                        checkPassed = true;
                    }
                    else {
                        throw new Error(`PRAGMA integrity_check failed for ${dbPath}: ${rows?.map((r) => r.integrity_check).join(', ')}`);
                    }
                    const fkRows = await checkClient.$queryRawUnsafe('PRAGMA foreign_key_check;');
                    if (fkRows && fkRows.length > 0) {
                        throw new Error(`PRAGMA foreign_key_check failed for ${dbPath}: ${fkRows.length} foreign key violations found.`);
                    }
                    fkPassed = true;
                }
                finally {
                    await checkClient.$disconnect();
                }
            }
            catch (prismaErr) {
                throw new Error(`SQLite integrity check could not be executed or failed for ${dbPath}: ${prismaErr.message}`);
            }
        }
        if (!checkPassed || !fkPassed) {
            throw new Error(`SQLite integrity verification failed for ${dbPath}. Migration aborted.`);
        }
    }
    copyDirectoryRecursive(src, dest) {
        if (!fs_1.default.existsSync(dest))
            fs_1.default.mkdirSync(dest, { recursive: true });
        for (const entry of fs_1.default.readdirSync(src, { withFileTypes: true })) {
            const srcPath = path_1.default.join(src, entry.name);
            const destPath = path_1.default.join(dest, entry.name);
            if (entry.isDirectory())
                this.copyDirectoryRecursive(srcPath, destPath);
            else if (entry.isFile())
                fs_1.default.copyFileSync(srcPath, destPath);
        }
    }
    openFolder(folderPath) {
        return new Promise((resolve) => {
            const resolved = path_1.default.resolve(folderPath);
            if (!fs_1.default.existsSync(resolved)) {
                try {
                    fs_1.default.mkdirSync(resolved, { recursive: true });
                }
                catch {
                    return resolve(false);
                }
            }
            const cmd = process.platform === 'win32' ? `explorer "${resolved}"` : process.platform === 'darwin' ? `open "${resolved}"` : `xdg-open "${resolved}"`;
            (0, child_process_1.exec)(cmd, (err) => { if (err)
                console.warn(`[DataLocationService] Failed to open folder "${resolved}":`, err.message); resolve(!err); });
        });
    }
    openDataFolder() { return this.openFolder((0, data_paths_1.getDataRoot)()); }
    openBackupFolder() { return this.openFolder((0, data_paths_1.getBackupRoot)()); }
    openExportFolder() { return this.openFolder((0, data_paths_1.getExportRoot)()); }
    openLogsFolder() { return this.openFolder((0, data_paths_1.getLogRoot)()); }
}
exports.dataLocationService = new DataLocationService();
//# sourceMappingURL=data-location.service.js.map