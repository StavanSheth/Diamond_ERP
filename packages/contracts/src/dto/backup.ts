/**
 * Phase 5 - Data Preservation & Backup Contracts
 */

export type BackupType = 'FULL' | 'SNAPSHOT' | 'PRE_RESTORE' | 'UNINSTALL';

export type BackupStatus =
  | 'PENDING'
  | 'CREATING'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'FAILED'
  | 'CORRUPTED'
  | 'DELETED';

export interface BackupRecordDto {
  id: string;
  backupId: string;
  installationId: string;
  databaseId: string;
  profileId?: string | null;
  sourcePath: string;
  backupPath: string;
  backupType: BackupType;
  schemaVersion: number;
  applicationVersion: string;
  sizeBytes: number;
  sha256: string;
  status: BackupStatus;
  createdAt: string;
  verifiedAt?: string | null;
  errorMessage?: string | null;
}

export interface CreateBackupRequest {
  databasePath?: string;
  profileCode?: string;
  backupType?: BackupType;
  customDestinationDir?: string;
  note?: string;
}

export interface BackupManifestDto {
  formatVersion: number;
  backupId: string;
  createdAt: string;
  application: {
    name: string;
    version: string;
  };
  installation: {
    installationId: string;
  };
  database: {
    databaseId: string;
    schemaVersion: number;
    displayName: string;
    profileCode?: string | null;
  };
  artifact: {
    fileName: string;
    sizeBytes: number;
    sha256: string;
  };
  verification: {
    sqliteIntegrity: string;
    tableCount: number;
    verifiedAt: string;
  };
}

export interface BackupVerificationDto {
  backupId: string;
  isValid: boolean;
  sha256Matches: boolean;
  sqliteIntegrity: string;
  sizeBytes: number;
  manifestPresent: boolean;
  verifiedAt: string;
  error?: string | null;
}

export interface BackupListResponseDto {
  backups: BackupRecordDto[];
}
