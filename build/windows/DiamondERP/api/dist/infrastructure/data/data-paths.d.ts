/**
 * Set an in-memory override for the data root (e.g. during tests or data location migration).
 */
export declare function setCustomDataRoot(customPath: string | null): void;
/**
 * Resolve the authoritative root directory for DiamondERP data.
 */
export declare function getDataRoot(): string;
/**
 * Alias for backward compatibility.
 */
export declare const getDataDir: typeof getDataRoot;
/**
 * Path to the authoritative system/control database (system.db).
 */
export declare function getSystemDatabasePath(): string;
/**
 * Alias for backward compatibility with control DB naming.
 */
export declare const getControlDbPath: typeof getSystemDatabasePath;
/**
 * Directory for SQLite profile business database files.
 */
export declare function getDatabaseRoot(): string;
export declare const getDatabasesDir: typeof getDatabaseRoot;
/**
 * Directory for database backups.
 */
export declare function getBackupRoot(): string;
export declare const getBackupsDir: typeof getBackupRoot;
/**
 * Directory for business data export packages (CSV, XLSX).
 */
export declare function getExportRoot(): string;
export declare const getExportDir: typeof getExportRoot;
/**
 * Directory for certificate uploads and documents.
 */
export declare function getUploadRoot(): string;
export declare const getUploadsDir: typeof getUploadRoot;
/**
 * Directory for application and diagnostic logs.
 */
export declare function getLogRoot(): string;
export declare const getLogsDir: typeof getLogRoot;
/**
 * Directory for recovery candidates and staged artifacts.
 */
export declare function getRecoveryRoot(): string;
export declare const getRecoveryDir: typeof getRecoveryRoot;
/**
 * Directory for staged atomic backup creation.
 */
export declare function getBackupStagingRoot(): string;
export declare const getBackupStagingDir: typeof getBackupStagingRoot;
/**
 * Directory for staged database restore operations.
 */
export declare function getRestoreStagingRoot(): string;
export declare const getRestoreStagingDir: typeof getRestoreStagingRoot;
/**
 * Directory for runtime configurations (e.g. .installation-id, .data-location.json).
 */
export declare function getConfigRoot(): string;
export declare const getConfigDir: typeof getConfigRoot;
/**
 * Path to the pre-migrated schema template database.
 */
export declare function getDatabaseTemplatePath(): string | null;
/**
 * Path to the production React distribution bundle.
 */
export declare function getWebDistDir(): string | null;
/**
 * Ensures all required application data directories exist on disk.
 */
export declare function ensureAllDataDirs(): void;
//# sourceMappingURL=data-paths.d.ts.map