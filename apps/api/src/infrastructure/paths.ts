import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * Authoritative Windows & Cross-Platform Path Resolution Service.
 *
 * Enforces production-safe Windows Application Data paths under:
 *   %LOCALAPPDATA%\DiamondERP\
 *     ├── databases\       (SQLite profile database files)
 *     ├── uploads\certs\   (Certificate PDF files)
 *     ├── backups\         (Atomic database backups)
 *     ├── logs\            (Application and crash logs)
 *     └── config\          (Runtime profile and system configuration)
 *
 * In Development mode:
 *   Defaults to local repository paths to avoid any regression for developers.
 *
 * In Production mode or when DIAMOND_DATA_DIR is set:
 *   Routes all mutable state to the user data directory, guaranteeing that
 *   application binaries can be installed into read-only locations such as
 *   C:\Program Files\DiamondERP without permission failures.
 */

function checkIsProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// Detect whether running from compiled dist or source ts
const isCompiled = __filename.endsWith('.js') && __dirname.includes('dist');

/**
 * Root directory for mutable user data.
 */
export function getDataDir(): string {
  if (process.env.DIAMOND_DATA_DIR) {
    return path.resolve(process.env.DIAMOND_DATA_DIR);
  }

  if (checkIsProduction()) {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'DiamondERP');
  }

  // Development mode default: backend root directory (apps/api)
  return path.resolve(__dirname, '../../');
}

/**
 * Directory for SQLite database files.
 */
export function getDatabasesDir(): string {
  if (process.env.DIAMOND_DB_DIR) {
    return path.resolve(process.env.DIAMOND_DB_DIR);
  }

  if (checkIsProduction() || process.env.DIAMOND_DATA_DIR) {
    return path.join(getDataDir(), 'databases');
  }

  // Development mode: backend root (apps/api) where Stavan.db and profile DBs reside
  return path.resolve(__dirname, '../../');
}

/**
 * Directory for certificate uploads and documents.
 */
export function getUploadsDir(): string {
  if (process.env.DIAMOND_UPLOADS_DIR) {
    return path.resolve(process.env.DIAMOND_UPLOADS_DIR);
  }

  if (checkIsProduction() || process.env.DIAMOND_DATA_DIR) {
    return path.join(getDataDir(), 'uploads', 'certs');
  }

  // Development mode: apps/api/uploads/certs
  return path.resolve(__dirname, '../../uploads/certs');
}

/**
 * Directory for database backups.
 */
export function getBackupsDir(): string {
  if (process.env.DIAMOND_BACKUPS_DIR) {
    return path.resolve(process.env.DIAMOND_BACKUPS_DIR);
  }

  return path.join(getDataDir(), 'backups');
}

/**
 * Directory for recovery candidates and staged artifacts.
 */
export function getRecoveryDir(): string {
  if (process.env.DIAMOND_RECOVERY_DIR) {
    return path.resolve(process.env.DIAMOND_RECOVERY_DIR);
  }

  return path.join(getDataDir(), 'recovery');
}

/**
 * Directory for business data export packages.
 */
export function getExportDir(): string {
  if (process.env.DIAMOND_EXPORT_DIR) {
    return path.resolve(process.env.DIAMOND_EXPORT_DIR);
  }

  return path.join(getDataDir(), 'exports');
}

/**
 * Directory for staged database restore operations.
 */
export function getRestoreStagingDir(): string {
  if (process.env.DIAMOND_RESTORE_STAGING_DIR) {
    return path.resolve(process.env.DIAMOND_RESTORE_STAGING_DIR);
  }

  return path.join(getDataDir(), 'restore-staging');
}

/**
 * Directory for staged atomic backup creation.
 */
export function getBackupStagingDir(): string {
  if (process.env.DIAMOND_BACKUP_STAGING_DIR) {
    return path.resolve(process.env.DIAMOND_BACKUP_STAGING_DIR);
  }

  return path.join(getBackupsDir(), 'backup-staging');
}

/**
 * Directory for runtime application logs.
 */
export function getLogsDir(): string {
  if (process.env.DIAMOND_LOGS_DIR) {
    return path.resolve(process.env.DIAMOND_LOGS_DIR);
  }

  return path.join(getDataDir(), 'logs');
}

/**
 * Directory for runtime configurations (e.g. .profile-config.json, .jwt_secret, .app-activation.json).
 */
export function getConfigDir(): string {
  if (process.env.DIAMOND_CONFIG_DIR) {
    return path.resolve(process.env.DIAMOND_CONFIG_DIR);
  }

  if (checkIsProduction() || process.env.DIAMOND_DATA_DIR) {
    return path.join(getDataDir(), 'config');
  }

  // Development mode: backend root (apps/api)
  return path.resolve(__dirname, '../../');
}

/**
 * Path to the authoritative Control / System database.
 * Owns installation identity, device associations, database registry, and core user metadata.
 */
export function getControlDbPath(): string {
  if (process.env.DIAMOND_SYSTEM_DB) {
    return path.resolve(process.env.DIAMOND_SYSTEM_DB);
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) {
    return path.resolve(process.env.DATABASE_URL.slice(5));
  }
  if (checkIsProduction() || process.env.DIAMOND_DATA_DIR) {
    return path.join(getDataDir(), 'system.db');
  }
  const devSystemDb = path.resolve(__dirname, '../../system.db');
  return devSystemDb;
}

/**
 * Path to the pre-migrated schema template database.
 * Used to provision brand new databases offline without needing prisma CLI.
 */
export function getDatabaseTemplatePath(): string | null {
  // 1. Explicit environment override takes precedence
  if (process.env.DIAMOND_TEMPLATE_DB !== undefined) {
    const custom = process.env.DIAMOND_TEMPLATE_DB.trim();
    if (!custom) return null;
    return fs.existsSync(custom) ? path.resolve(custom) : null;
  }

  const candidates = [
    // 2. Relative to runtime api/prisma/template.db
    path.resolve(__dirname, '../../prisma/template.db'),
    // 3. Staging / standalone layout: api/prisma/template.db
    path.resolve(__dirname, '../prisma/template.db'),
    // 4. User data dir / production assets layout
    path.resolve(getDataDir(), 'template.db'),
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

  // Common relative locations
  const candidates = [
    // Staging structure: build/windows/DiamondERP/api -> build/windows/DiamondERP/web/dist
    path.resolve(__dirname, isCompiled ? '../../../web/dist' : '../../../../web/dist'),
    // Monorepo source structure: apps/api -> apps/web/dist
    path.resolve(__dirname, isCompiled ? '../../../apps/web/dist' : '../../../../apps/web/dist'),
    path.resolve(__dirname, isCompiled ? '../../../../apps/web/dist' : '../../../../apps/web/dist'),
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
 * Ensures all required mutable application data directories exist.
 */
export function ensureAllDataDirs(): void {
  const dirs = [
    getDataDir(),
    getDatabasesDir(),
    getUploadsDir(),
    getBackupsDir(),
    getRecoveryDir(),
    getExportDir(),
    getRestoreStagingDir(),
    getBackupStagingDir(),
    getLogsDir(),
    getConfigDir(),
  ];

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.warn(`[Paths] Could not create directory "${dir}":`, err);
    }
  }
}
