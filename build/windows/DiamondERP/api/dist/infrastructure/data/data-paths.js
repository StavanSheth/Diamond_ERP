"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfigDir = exports.getRestoreStagingDir = exports.getBackupStagingDir = exports.getRecoveryDir = exports.getLogsDir = exports.getUploadsDir = exports.getExportDir = exports.getBackupsDir = exports.getDatabasesDir = exports.getControlDbPath = exports.getDataDir = void 0;
exports.setCustomDataRoot = setCustomDataRoot;
exports.getDataRoot = getDataRoot;
exports.getSystemDatabasePath = getSystemDatabasePath;
exports.getDatabaseRoot = getDatabaseRoot;
exports.getBackupRoot = getBackupRoot;
exports.getExportRoot = getExportRoot;
exports.getUploadRoot = getUploadRoot;
exports.getLogRoot = getLogRoot;
exports.getRecoveryRoot = getRecoveryRoot;
exports.getBackupStagingRoot = getBackupStagingRoot;
exports.getRestoreStagingRoot = getRestoreStagingRoot;
exports.getConfigRoot = getConfigRoot;
exports.getDatabaseTemplatePath = getDatabaseTemplatePath;
exports.getWebDistDir = getWebDistDir;
exports.ensureAllDataDirs = ensureAllDataDirs;
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
/**
 * Authoritative Data Paths Service for DiamondERP V3.
 *
 * Implements the single authority for local-first data directory resolution.
 * Default data root:
 *   %LOCALAPPDATA%\DiamondERP\
 *     ├── system\          (Authoritative system.db control database)
 *     ├── databases\       (Profile-scoped SQLite business databases)
 *     ├── backups\         (Verified SQLite backups)
 *     │    └── backup-staging\
 *     ├── exports\         (Plain unencrypted CSV and XLSX snapshots)
 *     ├── uploads\certs\   (Certificate uploads and documents)
 *     ├── logs\            (Application and diagnostic logs)
 *     ├── recovery\        (Disaster recovery artifacts and candidates)
 *     ├── restore-staging\ (Staged database restore checkpoints)
 *     └── config\          (Runtime configuration and device tokens)
 */
function checkIsProduction() {
    return process.env.NODE_ENV === 'production';
}
function getDefaultDataRoot() {
    // Test environment without explicit override uses repo-local sandbox
    if (process.env.NODE_ENV === 'test' && !overriddenDataRoot && !process.env.DIAMOND_DATA_DIR) {
        return path_1.default.resolve(__dirname, '../../../');
    }
    const localAppData = process.env.LOCALAPPDATA || path_1.default.join(os_1.default.homedir(), 'AppData', 'Local');
    return path_1.default.join(localAppData, 'DiamondERP');
}
let overriddenDataRoot = null;
/**
 * Set an in-memory override for the data root (e.g. during tests or data location migration).
 */
function setCustomDataRoot(customPath) {
    overriddenDataRoot = customPath ? path_1.default.resolve(customPath) : null;
}
/**
 * Resolve the authoritative root directory for DiamondERP data.
 */
function getDataRoot() {
    if (overriddenDataRoot) {
        return overriddenDataRoot;
    }
    if (process.env.DIAMOND_DATA_DIR) {
        return path_1.default.resolve(process.env.DIAMOND_DATA_DIR);
    }
    // Check persistent config file if present
    try {
        const defaultRoot = getDefaultDataRoot();
        const configPath = path_1.default.join(defaultRoot, 'config', '.data-location.json');
        if (fs_1.default.existsSync(configPath)) {
            const parsed = JSON.parse(fs_1.default.readFileSync(configPath, 'utf-8'));
            if (parsed?.dataRoot && fs_1.default.existsSync(parsed.dataRoot)) {
                return path_1.default.resolve(parsed.dataRoot);
            }
        }
    }
    catch {
        // Fall back to default root if config read fails
    }
    return getDefaultDataRoot();
}
/**
 * Alias for backward compatibility.
 */
exports.getDataDir = getDataRoot;
/**
 * Path to the authoritative system/control database (system.db).
 */
function getSystemDatabasePath() {
    if (overriddenDataRoot) {
        const systemSubdir = path_1.default.join(overriddenDataRoot, 'system', 'system.db');
        if (fs_1.default.existsSync(systemSubdir))
            return systemSubdir;
        return path_1.default.join(overriddenDataRoot, 'system.db');
    }
    if (process.env.DIAMOND_SYSTEM_DB) {
        return path_1.default.resolve(process.env.DIAMOND_SYSTEM_DB);
    }
    // In automated test environment, allow DATABASE_URL to isolate test control DB
    if (process.env.NODE_ENV === 'test' && process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) {
        const rawPath = process.env.DATABASE_URL.slice(5);
        if (!path_1.default.isAbsolute(rawPath)) {
            return path_1.default.resolve(__dirname, '../../../prisma', rawPath);
        }
        return path_1.default.resolve(rawPath);
    }
    // Authoritative system control database: %LOCALAPPDATA%\DiamondERP\system.db
    const systemSubdir = path_1.default.join(getDataRoot(), 'system', 'system.db');
    if (fs_1.default.existsSync(systemSubdir)) {
        return systemSubdir;
    }
    return path_1.default.join(getDataRoot(), 'system.db');
}
/**
 * Alias for backward compatibility with control DB naming.
 */
exports.getControlDbPath = getSystemDatabasePath;
/**
 * Directory for SQLite profile business database files.
 */
function getDatabaseRoot() {
    if (process.env.DIAMOND_DB_DIR) {
        return path_1.default.resolve(process.env.DIAMOND_DB_DIR);
    }
    return path_1.default.join(getDataRoot(), 'databases');
}
exports.getDatabasesDir = getDatabaseRoot;
/**
 * Directory for database backups.
 */
function getBackupRoot() {
    if (process.env.DIAMOND_BACKUPS_DIR) {
        return path_1.default.resolve(process.env.DIAMOND_BACKUPS_DIR);
    }
    return path_1.default.join(getDataRoot(), 'backups');
}
exports.getBackupsDir = getBackupRoot;
/**
 * Directory for business data export packages (CSV, XLSX).
 */
function getExportRoot() {
    if (process.env.DIAMOND_EXPORT_DIR) {
        return path_1.default.resolve(process.env.DIAMOND_EXPORT_DIR);
    }
    return path_1.default.join(getDataRoot(), 'exports');
}
exports.getExportDir = getExportRoot;
/**
 * Directory for certificate uploads and documents.
 */
function getUploadRoot() {
    if (process.env.DIAMOND_UPLOADS_DIR) {
        return path_1.default.resolve(process.env.DIAMOND_UPLOADS_DIR);
    }
    return path_1.default.join(getDataRoot(), 'uploads', 'certs');
}
exports.getUploadsDir = getUploadRoot;
/**
 * Directory for application and diagnostic logs.
 */
function getLogRoot() {
    if (process.env.DIAMOND_LOGS_DIR) {
        return path_1.default.resolve(process.env.DIAMOND_LOGS_DIR);
    }
    return path_1.default.join(getDataRoot(), 'logs');
}
exports.getLogsDir = getLogRoot;
/**
 * Directory for recovery candidates and staged artifacts.
 */
function getRecoveryRoot() {
    if (process.env.DIAMOND_RECOVERY_DIR) {
        return path_1.default.resolve(process.env.DIAMOND_RECOVERY_DIR);
    }
    return path_1.default.join(getDataRoot(), 'recovery');
}
exports.getRecoveryDir = getRecoveryRoot;
/**
 * Directory for staged atomic backup creation.
 */
function getBackupStagingRoot() {
    if (process.env.DIAMOND_BACKUP_STAGING_DIR) {
        return path_1.default.resolve(process.env.DIAMOND_BACKUP_STAGING_DIR);
    }
    return path_1.default.join(getBackupRoot(), 'backup-staging');
}
exports.getBackupStagingDir = getBackupStagingRoot;
/**
 * Directory for staged database restore operations.
 */
function getRestoreStagingRoot() {
    if (process.env.DIAMOND_RESTORE_STAGING_DIR) {
        return path_1.default.resolve(process.env.DIAMOND_RESTORE_STAGING_DIR);
    }
    return path_1.default.join(getDataRoot(), 'restore-staging');
}
exports.getRestoreStagingDir = getRestoreStagingRoot;
/**
 * Directory for runtime configurations (e.g. .installation-id, .data-location.json).
 */
function getConfigRoot() {
    if (process.env.DIAMOND_CONFIG_DIR) {
        return path_1.default.resolve(process.env.DIAMOND_CONFIG_DIR);
    }
    if (checkIsProduction() || process.env.DIAMOND_DATA_DIR || overriddenDataRoot) {
        return path_1.default.join(getDataRoot(), 'config');
    }
    return path_1.default.resolve(__dirname, '../../../');
}
exports.getConfigDir = getConfigRoot;
/**
 * Path to the pre-migrated schema template database.
 */
function getDatabaseTemplatePath() {
    if (process.env.DIAMOND_TEMPLATE_DB !== undefined) {
        const custom = process.env.DIAMOND_TEMPLATE_DB.trim();
        if (!custom)
            return null;
        return fs_1.default.existsSync(custom) ? path_1.default.resolve(custom) : null;
    }
    const candidates = [
        path_1.default.resolve(__dirname, '../../../prisma/template.db'),
        path_1.default.resolve(__dirname, '../../prisma/template.db'),
        path_1.default.resolve(__dirname, '../prisma/template.db'),
        path_1.default.resolve(getDataRoot(), 'template.db'),
    ];
    for (const candidate of candidates) {
        if (candidate && fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}
/**
 * Path to the production React distribution bundle.
 */
function getWebDistDir() {
    if (process.env.WEB_DIST_DIR) {
        const customPath = path_1.default.resolve(process.env.WEB_DIST_DIR);
        if (fs_1.default.existsSync(customPath))
            return customPath;
    }
    const isCompiled = __filename.endsWith('.js') && __dirname.includes('dist');
    const candidates = [
        path_1.default.resolve(__dirname, isCompiled ? '../../../../web/dist' : '../../../../../web/dist'),
        path_1.default.resolve(__dirname, isCompiled ? '../../../../apps/web/dist' : '../../../../../apps/web/dist'),
        path_1.default.resolve(process.cwd(), 'apps/web/dist'),
        path_1.default.resolve(process.cwd(), '../web/dist'),
        path_1.default.resolve(process.cwd(), 'web/dist'),
    ];
    for (const candidate of candidates) {
        if (candidate && fs_1.default.existsSync(candidate) && fs_1.default.existsSync(path_1.default.join(candidate, 'index.html'))) {
            return candidate;
        }
    }
    return null;
}
/**
 * Ensures all required application data directories exist on disk.
 */
function ensureAllDataDirs() {
    const dirs = [
        getDataRoot(),
        getDatabaseRoot(),
        getBackupRoot(),
        getExportRoot(),
        getUploadRoot(),
        getLogRoot(),
        getRecoveryRoot(),
        getBackupStagingRoot(),
        getRestoreStagingRoot(),
        getConfigRoot(),
    ];
    for (const dir of dirs) {
        try {
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
        }
        catch (err) {
            console.warn(`[DataPaths] Could not create directory "${dir}":`, err);
        }
    }
}
//# sourceMappingURL=data-paths.js.map