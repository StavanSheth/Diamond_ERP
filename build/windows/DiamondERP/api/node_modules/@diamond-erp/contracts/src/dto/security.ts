/**
 * Security & PIN Foundation DTOs for Diamond ERP V3.
 * Phase 3 foundation contracts shared across backend, frontend, and test harnesses.
 */

export interface PinSetupRequest {
  pin: string;
  deviceId?: string;
}

export interface PinVerifyRequest {
  pin: string;
  deviceId?: string;
}

export interface PinChangeRequest {
  currentPin: string;
  newPin: string;
  deviceId?: string;
}

export interface PinVerificationResponse {
  success: boolean;
  applicationLocked?: boolean;
  authenticationLockedUntil?: string | null;
  isLocked: boolean;
  locked?: boolean;
  failedAttemptsRemaining?: number;
  remainingAttempts?: number;
  lockedUntil?: string | null;
  message?: string;
}

export interface DeviceSecurityDto {
  deviceId: string;
  isPinConfigured: boolean;
  configured?: boolean;
  applicationLocked?: boolean;
  authenticationLockedUntil?: string | null;
  isLocked: boolean;
  lockedUntil?: string | null;
  failedAttempts: number;
  lastAuthenticatedAt?: string | null;
  lastPinChangeAt?: string | null;
}

export interface SecurityStatusDto {
  installationId?: string;
  deviceId: string;
  isDeviceBound: boolean;
  deviceBound?: boolean;
  deviceStatus: string;
  isPinConfigured: boolean;
  configured?: boolean;
  applicationLocked?: boolean;
  authenticationLockedUntil?: string | null;
  isLocked: boolean;
  lockedUntil?: string | null;
  failedAttempts?: number;
  failedAttemptsRemaining: number;
  lifecycleState?: string;
  lastAuthenticatedAt?: string | null;
}

export interface LockStateDto {
  applicationLocked?: boolean;
  authenticationLockedUntil?: string | null;
  isLocked: boolean;
  lockedUntil?: string | null;
  reason?: string;
}

export interface DeviceBindRequest {
  deviceId?: string;
}
