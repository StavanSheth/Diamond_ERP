/**
 * Phase 5 - Recovery & Reinstall Contracts
 */

import type { DatabaseStatus } from './lifecycle';
import type { DatabaseSuitability } from './onboarding';

export type RestoreStatus =
  | 'PENDING'
  | 'STAGING'
  | 'VALIDATED'
  | 'CONFIRMED'
  | 'ACTIVATING'
  | 'VERIFIED'
  | 'FAILED'
  | 'ROLLED_BACK';

export interface RecoveryCandidateDto {
  candidateId: string;
  displayName: string;
  canonicalPath: string;
  source: 'BACKUP_REGISTRY' | 'BACKUPS_DIR' | 'DATABASES_DIR' | 'PREVIOUS_INSTALL' | 'EXTERNAL';
  status: DatabaseStatus;
  suitability: DatabaseSuitability;
  sizeBytes: number;
  lastModifiedAt: string;
  hasManifest: boolean;
  sha256?: string | null;
  schemaVersion?: number;
  profileCode?: string | null;
  details?: string | null;
}

export interface RecoveryCandidateDiscoveryResponseDto {
  candidates: RecoveryCandidateDto[];
  totalCount: number;
}

export interface InspectRecoveryCandidateRequest {
  path: string;
}

export interface RecoveryInspectionPreviewDto {
  canonicalPath: string;
  displayName: string;
  sizeBytes: number;
  tableCount: number;
  schemaVersion: number;
  profileCode?: string | null;
  profileName?: string | null;
  status: DatabaseStatus;
  suitability: DatabaseSuitability;
  hasManifest: boolean;
  manifest?: any;
  sqliteIntegrity: string;
  conflictReason?: string | null;
  details?: string | null;
}

export interface PrepareRestoreRequest {
  candidatePath: string;
  targetProfileCode?: string;
}

export interface RestorePreviewDto {
  restoreId: string;
  candidatePath: string;
  stagedPath: string;
  targetProfileCode: string;
  targetDatabasePath: string;
  targetDatabaseExists: boolean;
  targetDatabaseSize?: number;
  schemaVersion: number;
  tableCount: number;
  status: RestoreStatus;
  requiresRollbackBackup: boolean;
}

export interface ConfirmRestoreRequest {
  restoreId: string;
  confirmDestructiveOverwrite: boolean;
  targetProfileCode: string;
}

export interface RestoreOperationResponseDto {
  success: boolean;
  restoreId: string;
  status: RestoreStatus;
  message: string;
  rollbackBackupCreated?: boolean;
  rollbackBackupPath?: string | null;
}

export interface ReinstallDetectionDto {
  hasPreviousData: boolean;
  previousInstallationId?: string | null;
  previousAppVersion?: string | null;
  previousDatabasesCount: number;
  previousBackupsCount: number;
  canContinue: boolean;
  canRestore: boolean;
  canStartFresh: boolean;
  details?: string;
}
