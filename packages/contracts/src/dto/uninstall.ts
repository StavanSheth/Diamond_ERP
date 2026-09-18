/**
 * Phase 5 - Uninstall Data Preservation Contracts
 */

export interface UninstallPreflightDto {
  canSafelyUninstall: boolean;
  userAppDataDir: string;
  userAppDataPreservedByDefault: boolean;
  activeDatabasesCount: number;
  databases: Array<{
    databaseId: string;
    displayName: string;
    canonicalPath: string;
    sizeBytes: number;
    hasRecentBackup: boolean;
    latestBackupAt?: string | null;
  }>;
  totalBackupsCount: number;
  latestVerifiedBackupAt?: string | null;
  warningMessage?: string | null;
}

export interface UninstallExportRequest {
  destinationDir?: string;
  includeRawDatabases?: boolean;
  includeExcelExports?: boolean;
  confirmPreUninstallBackup: boolean;
}

export interface UninstallExportResponseDto {
  success: boolean;
  exportBundlePath: string;
  manifestPath: string;
  sizeBytes: number;
  databasesBackedUp: number;
  verifiedAt: string;
}
