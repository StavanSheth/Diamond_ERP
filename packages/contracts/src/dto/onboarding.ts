import type { LifecycleState, DatabaseStatus } from './lifecycle';

export type DatabaseSuitability =
  | 'VALID'
  | 'REQUIRES_CONFIRMATION'
  | 'UNSUPPORTED'
  | 'CORRUPTED'
  | 'INVALID'
  | 'CONFLICT';

export interface OnboardingStatusDto {
  lifecycleState: LifecycleState;
  installationInitialized: boolean;
  deviceConfigured: boolean;
  pinConfigured: boolean;
  userConfigured: boolean;
  databaseConfigured: boolean;
  ready: boolean;
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
}

export interface CreateDatabaseRequest {
  displayName: string;
  profileCode?: string;
  profileName?: string;
}

export interface OnboardingOperationResponse {
  success: boolean;
  message?: string;
  data?: any;
}
