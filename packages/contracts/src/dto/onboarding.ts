import type { LifecycleState, DatabaseStatus } from './lifecycle';
import type { ReinstallDetectionDto } from './recovery';

export type DatabaseSuitability =
  | 'VALID'
  | 'REQUIRES_CONFIRMATION'
  | 'UNSUPPORTED'
  | 'CORRUPTED'
  | 'INVALID'
  | 'CONFLICT'
  | 'MISSING';

export interface OnboardingStatusDto {
  lifecycleState: LifecycleState;
  currentStep?: LifecycleState;
  completedSteps?: string[];
  canContinue?: boolean;
  installationInitialized: boolean;
  deviceConfigured: boolean;
  pinConfigured: boolean;
  userConfigured: boolean;
  databaseConfigured: boolean;
  ready: boolean;
  reinstallRecovery?: ReinstallDetectionDto | null;
  installation: {
    id: string;
    installationId: string;
    appVersion: string;
    status: string;
  } | null;
  device: {
    deviceId: string;
    deviceName: string;
    platform: string;
    status: string;
  } | null;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  } | null;
  database: {
    databaseId: string;
    displayName: string;
    canonicalPath: string;
    status: string;
    profileCode?: string | null;
  } | null;
}

export interface UserDiscoveryCandidateDto {
  id: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
  associatedWithInstallation: boolean;
  createdAt: string;
}

export interface UserDiscoveryResponseDto {
  candidates: UserDiscoveryCandidateDto[];
}

export interface SelectUserRequest {
  userId: string;
}

export interface CreateOnboardingUserRequest {
  username: string;
  password: string;
  displayName: string;
  role?: string;
}

export interface DatabaseDiscoveryCandidateDto {
  displayName: string;
  canonicalPath: string;
  source: 'REGISTRY' | 'PROFILE' | 'LOCAL_DIR' | 'EXTERNAL';
  status: DatabaseStatus;
  isKnown: boolean;
  isCurrentInstallation: boolean;
}

export interface DatabaseDiscoveryResponseDto {
  candidates: DatabaseDiscoveryCandidateDto[];
}

export interface InspectDatabaseRequest {
  path: string;
}

export interface DatabaseAttachmentPreviewDto {
  canonicalPath: string;
  displayName: string;
  status: DatabaseStatus;
  suitability: DatabaseSuitability;
  tableCount: number;
  schemaVersion: number;
  profileCode?: string | null;
  profileName?: string | null;
  isExistingRegistry: boolean;
  conflictReason?: string | null;
  details?: string | null;
}

export interface AttachDatabaseRequest {
  path: string;
  displayName?: string;
  profileCode?: string;
  profileName?: string;
  confirmAttachment: boolean;
  userId?: string;
  targetUserId?: string;
}

export interface CreateBusinessUserResponseDto {
  success: boolean;
  user: any;
  provisioningContext: {
    userId: string;
    installationId: string;
  };
}

export interface CreateDatabaseRequest {
  displayName: string;
  profileCode?: string;
  profileName?: string;
  userId: string;
  provisioningOperationId?: string;
}

export type ProvisioningOperationStatus =
  | 'PENDING'
  | 'DESTINATION_RESERVED'
  | 'FILE_CREATED'
  | 'DATABASE_VALIDATED'
  | 'PRISTINE_VALIDATED'
  | 'CONTROL_RECORDS_CREATED'
  | 'RUNTIME_REGISTERED'
  | 'COMPLETED'
  | 'FAILED'
  | 'COMPENSATING'
  | 'COMPENSATED'
  | 'RECOVERABLE';

export interface ProvisioningOperationDto {
  id: string;
  operationId: string;
  installationId: string;
  userId: string;
  profileCode: string;
  targetPath: string;
  status: ProvisioningOperationStatus;
  requestHash: string;
  databaseId?: string | null;
  profileId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface ProvisionDatabaseResultDto {
  databaseId: string;
  displayName: string;
  canonicalPath: string;
  profileId: string;
  profileCode: string;
  schemaVersion: number;
  status: DatabaseStatus;
  isPristine: boolean;
  operationId?: string;
}

export interface OnboardingOperationResponse {
  success: boolean;
  message?: string;
  data?: any;
}

