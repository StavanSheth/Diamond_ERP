/**
 * Phase 7 - Uninstall Data Preservation & Authorization Gate Contracts
 */

export type PreservationStatus =
  | 'PENDING'
  | 'EXPORTING'
  | 'BACKING_UP'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'FAILED';

export type UninstallPreflightClassification =
  | 'NO_CUSTOMER_DATA'
  | 'CUSTOMER_DATA_PRESENT'
  | 'EXPORT_REQUIRED'
  | 'BACKUP_REQUIRED'
  | 'PRESERVATION_IN_PROGRESS'
  | 'PRESERVATION_VERIFIED'
  | 'PRESERVATION_FAILED'
  | 'READY_FOR_UNINSTALL'
  | 'BLOCKED';

export interface UninstallPreflightDto {
  canSafelyUninstall: boolean;
  classification: UninstallPreflightClassification;
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
  preservationPackageCount?: number;
  latestPreservationPackageId?: string | null;
  latestPreservationVerifiedAt?: string | null;
  warningMessage?: string | null;
  applicationVersion?: string;
  installationId?: string;
  pendingOperationsCount?: number;
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

export interface CreatePreservationPackageRequest {
  destinationDir?: string;
  databasePath?: string;
  confirmPreservation: boolean;
}

export interface PreservationPackageDto {
  packageId: string;
  installationId: string;
  databaseId: string;
  destinationPath: string;
  status: PreservationStatus;
  databaseBackupPath?: string | null;
  csvExportPath?: string | null;
  xlsxExportPath?: string | null;
  manifestPath?: string | null;
  manifestSha256?: string | null;
  sizeBytes: number;
  createdAt: string;
  verifiedAt?: string | null;
  errorMessage?: string | null;
}

export interface PreservationVerificationDto {
  packageId: string;
  verified: boolean;
  status: PreservationStatus;
  databaseBackupVerified: boolean;
  csvVerified: boolean;
  xlsxVerified: boolean;
  manifestVerified: boolean;
  verifiedAt?: string | null;
  error?: string | null;
}

export interface AuthorizeUninstallRequest {
  preservationPackageId: string;
  confirmOneTimeAuthorization: boolean;
}

export interface UninstallAuthorizationDto {
  authorizationId: string;
  installationId: string;
  preservationPackageId: string;
  manifestSha256: string;
  status: 'ISSUED' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
  expiresAt: string;
  consumedAt?: string | null;
  tokenFilePath?: string;
}
