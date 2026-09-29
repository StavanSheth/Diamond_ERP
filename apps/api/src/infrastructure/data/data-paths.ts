import path from 'path';
import os from 'os';
import fs from 'fs';

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

function checkIsProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function getDefaultDataRoot(): string {
  // Test environment without explicit override uses repo-local sandbox
  if (process.env.NODE_ENV === 'test' && !overriddenDataRoot && !process.env.DIAMOND_DATA_DIR) {
    return path.resolve(__dirname, '../../../');
  }
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'DiamondERP');
}

let overriddenDataRoot: string | null = null;

/**
 * Set an in-memory override for the data root (e.g. during tests or data location migration).
 */
export function setCustomDataRoot(customPath: string | null): void {
  overriddenDataRoot = customPath ? path.resolve(customPath) : null;
}

/**
 * Resolve the authoritative root directory for DiamondERP data.
 */
export function getDataRoot(): string {
  if (overriddenDataRoot) {
    return overriddenDataRoot;
  }

  if (process.env.DIAMOND_DATA_DIR) {
    return path.resolve(process.env.DIAMOND_DATA_DIR);
  }

  // Check persistent config file if present
  try {
    const defaultRoot = getDefaultDataRoot();
    const configPath = path.join(defaultRoot, 'config', '.data-location.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (parsed?.dataRoot && fs.existsSync(parsed.dataRoot)) {
        return path.resolve(parsed.dataRoot);
      }
    }
  } catch {
    // Fall back to default root if config read fails
  }

  return getDefaultDataRoot();
}

/**
 * Alias for backward compatibility.
 */
export const getDataDir = getDataRoot;

/**
 * Path to the authoritative system/control database (system.db).
 */
export function getSystemDatabasePath(): string {
  if (overriddenDataRoot) {
    const systemSubdir = path.join(overriddenDataRoot, 'system', 'system.db');
    if (fs.existsSync(systemSubdir)) return systemSubdir;
    return path.join(overriddenDataRoot, 'system.db');
  }
  if (process.env.DIAMOND_SYSTEM_DB) {
    return path.resolve(process.env.DIAMOND_SYSTEM_DB);
  }
  // In automated test environment, allow DATABASE_URL to isolate test control DB
  if (process.env.NODE_ENV === 'test' && process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) {
    const rawPath = process.env.DATABASE_URL.slice(5);
    if (!path.isAbsolute(rawPath)) {
      return path.resolve(__dirname, '../../../prisma', rawPath);
    }
    return path.resolve(rawPath);
  }
  // Authoritative system control database: %LOCALAPPDATA%\DiamondERP\system.db
  const systemSubdir = path.join(getDataRoot(), 'system', 'system.db');
  if (fs.existsSync(systemSubdir)) {
    return systemSubdir;
  }
  return path.join(getDataRoot(), 'system.db');
}

/**
 * Alias for backward compatibility with control DB naming.
 */
export const getControlDbPath = getSystemDatabasePath;

/**
 * Directory for SQLite profile business database files.
 */
export function getDatabaseRoot(): string {
  if (process.env.DIAMOND_DB_DIR) {
    return path.resolve(process.env.DIAMOND_DB_DIR);
  }
  return path.join(getDataRoot(), 'databases');
}

export const getDatabasesDir = getDatabaseRoot;

/**
 * Directory for database backups.
 */
export function getBackupRoot(): string {
  if (process.env.DIAMOND_BACKUPS_DIR) {
    return path.resolve(process.env.DIAMOND_BACKUPS_DIR);
  }
  return path.join(getDataRoot(), 'backups');
}

export const getBackupsDir = getBackupRoot;

/**
 * Directory for business data export packages (CSV, XLSX).
 */
export function getExportRoot(): string {
  if (process.env.DIAMOND_EXPORT_DIR) {
    return path.resolve(process.env.DIAMOND_EXPORT_DIR);
  }
  return path.join(getDataRoot(), 'exports');
}

export const getExportDir = getExportRoot;

/**
 * Directory for certificate uploads and documents.
 */
export function getUploadRoot(): string {
  if (process.env.DIAMOND_UPLOADS_DIR) {
    return path.resolve(process.env.DIAMOND_UPLOADS_DIR);
  }
  return path.join(getDataRoot(), 'uploads', 'certs');
}

export const getUploadsDir = getUploadRoot;

/**
 * Directory for application and diagnostic logs.
 */
export function getLogRoot(): string {
  if (process.env.DIAMOND_LOGS_DIR) {
    return path.resolve(process.env.DIAMOND_LOGS_DIR);
  }
  return path.join(getDataRoot(), 'logs');
}

export const getLogsDir = getLogRoot;

/**
 * Directory for recovery candidates and staged artifacts.
 */
export function getRecoveryRoot(): string {
  if (process.env.DIAMOND_RECOVERY_DIR) {
    return path.resolve(process.env.DIAMOND_RECOVERY_DIR);
  }
  return path.join(getDataRoot(), 'recovery');
}

export const getRecoveryDir = getRecoveryRoot;

/**
 * Directory for staged atomic backup creation.
 */
export function getBackupStagingRoot(): string {
  if (process.env.DIAMOND_BACKUP_STAGING_DIR) {
    return path.resolve(process.env.DIAMOND_BACKUP_STAGING_DIR);
  }
  return path.join(getBackupRoot(), 'backup-staging');
}

export const getBackupStagingDir = getBackupStagingRoot;

/**
 * Directory for staged database restore operations.
 */
export function getRestoreStagingRoot(): string {
  if (process.env.DIAMOND_RESTORE_STAGING_DIR) {
    return path.resolve(process.env.DIAMOND_RESTORE_STAGING_DIR);
  }
  return path.join(getDataRoot(), 'restore-staging');
}

export const getRestoreStagingDir = getRestoreStagingRoot;

/**
 * Directory for runtime configurations (e.g. .installation-id, .data-location.json).
 */
export function getConfigRoot(): string {
  if (process.env.DIAMOND_CONFIG_DIR) {
    return path.resolve(process.env.DIAMOND_CONFIG_DIR);
  }
  if (checkIsProduction() || process.env.DIAMOND_DATA_DIR || overriddenDataRoot) {
    return path.join(getDataRoot(), 'config');
  }
  return path.resolve(__dirname, '../../../');
}

export const getConfigDir = getConfigRoot;

/**
 * Path to the pre-migrated schema template database.
 */
export function getDatabaseTemplatePath(): string | null {
  if (process.env.DIAMOND_TEMPLATE_DB !== undefined) {
    const custom = process.env.DIAMOND_TEMPLATE_DB.trim();
    if (!custom) return null;
    return fs.existsSync(custom) ? path.resolve(custom) : null;
  }

  const candidates = [
    path.resolve(__dirname, '../../../prisma/template.db'),
    path.resolve(__dirname, '../../prisma/template.db'),
    path.resolve(__dirname, '../prisma/template.db'),
    path.resolve(getDataRoot(), 'template.db'),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Path to the production React distribution bundle.
 */
export function getWebDistDir(): string | null {
  if (process.env.WEB_DIST_DIR) {
    const customPath = path.resolve(process.env.WEB_DIST_DIR);
    if (fs.existsSync(customPath)) return customPath;
  }

  const isCompiled = __filename.endsWith('.js') && __dirname.includes('dist');
  const candidates = [
    path.resolve(__dirname, isCompiled ? '../../../../web/dist' : '../../../../../web/dist'),
    path.resolve(__dirname, isCompiled ? '../../../../apps/web/dist' : '../../../../../apps/web/dist'),
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'web/dist'),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  return null;
}

/**
 * Ensures all required application data directories exist on disk.
 */
export function ensureAllDataDirs(): void {
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
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.warn(`[DataPaths] Could not create directory "${dir}":`, err);
    }
  }
}
