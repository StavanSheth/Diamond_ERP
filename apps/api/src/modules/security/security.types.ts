/**
 * Diamond ERP V3 - Security Module Types
 */

export type {
  PinSetupRequest,
  PinVerifyRequest,
  PinChangeRequest,
  PinVerificationResponse,
  DeviceSecurityDto,
  SecurityStatusDto,
  LockStateDto,
  DeviceBindRequest,
} from '@diamond-erp/contracts';

export interface PinValidationResult {
  valid: boolean;
  reason?: string;
}

export interface SecurityAuditParams {
  entityType: string;
  entityId: string;
  eventType: string;
  description?: string;
  metadata?: Record<string, unknown>;
  performedBy: string;
  ipAddress?: string;
  deviceId?: string;
  sessionId?: string;
}
