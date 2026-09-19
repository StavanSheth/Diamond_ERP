/**
 * Lifecycle & Device Foundation DTOs for Diamond ERP.
 * Phase 2 foundation contracts shared between API and frontend.
 */

export type LifecycleState =
  | 'NOT_INITIALIZED'
  | 'APP_SETUP'
  | 'PIN_SETUP'
  | 'DEVICE_SETUP'
  | 'USER_DISCOVERY'
  | 'DATABASE_DISCOVERY'
  | 'DATABASE_VALIDATION'
  | 'DATABASE_SETUP'
  | 'READY';

export type InstallationStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type DeviceStatus = 'ACTIVE' | 'REVOKED' | 'PENDING';

export type DatabaseStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'MISSING'
  | 'ORPHANED'
  | 'UNAVAILABLE'
  | 'INVALID'
  | 'CORRUPTED'
  | 'UNSUPPORTED'
  | 'PENDING';

export interface InstallationDto {
  id: string;
  installationId: string;
  appVersion: string;
  status: InstallationStatus;
  lifecycleState: LifecycleState;
  initializedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deviceCount?: number;
}

export interface DeviceDto {
  id: string;
  deviceId: string;
  installationId: string;
  deviceName: string;
  platform: string;
  osVersion?: string | null;
  status: DeviceStatus;
  revokedAt?: string | null;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterDeviceRequest {
  deviceId?: string;
  deviceName: string;
  platform?: string;
  osVersion?: string;
}

export interface LifecycleStatusResponse {
  installationId: string;
  appVersion: string;
  lifecycleState: LifecycleState;
  status: InstallationStatus;
  isInitialized: boolean;
  initializedAt?: string | null;
  activeProfile: string;
}

export interface DatabaseMetadataDto {
  id: string;
  code: string;
  name: string;
  dbPath?: string | null;
  schemaVersion: number;
  status: DatabaseStatus;
  lastValidatedAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseRegistryDto {
  id: string;
  databaseId: string;
  displayName: string;
  canonicalPath: string;
  schemaVersion: number;
  status: DatabaseStatus;
  databaseType: string;
  profileId?: string | null;
  installationId: string;
  lastValidatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseValidationResultDto {
  status: DatabaseStatus;
  canonicalPath: string;
  isValid: boolean;
  tableCount: number;
  schemaVersion: number;
  integrityCheck: string;
  tablesFound: string[];
  missingRequiredTables: string[];
  missingRequiredColumns?: Record<string, string[]>;
  detectedType?: string;
  details?: string;
  error?: string;
}

export interface InstallationUserDto {
  id: string;
  installationId: string;
  userId: string;
  createdAt: string;
}

export interface HealthResponse {
  backend: string;
  database: string;
  status: 'ok' | 'error';
  uptime: number;
  requestId?: string;
  timestamp: string;
  error?: string;
}

