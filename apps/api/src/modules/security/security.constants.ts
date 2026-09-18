/**
 * Diamond ERP V3 - Security Policy Constants
 * Authoritative security constants and configuration parameters.
 */

export const SECURITY_CONFIG = {
  MIN_PIN_LENGTH: 6,
  MAX_PIN_LENGTH: 6,
  MAX_FAILED_PIN_ATTEMPTS: 5,
  PIN_LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes lockout
  BCRYPT_PIN_ROUNDS: 10,
} as const;

/**
 * Disallowed trivially sequential or repeated PIN combinations.
 */
export const DISALLOWED_PINS = new Set<string>([
  '000000',
  '111111',
  '222222',
  '333333',
  '444444',
  '555555',
  '666666',
  '777777',
  '888888',
  '999999',
  '123456',
  '654321',
  '012345',
  '543210',
  '121212',
  '212121',
  '112233',
  '332211',
]);

/**
 * Authoritative Security Audit Event Types
 */
export const SECURITY_AUDIT_EVENTS = {
  PIN_CONFIGURED: 'PIN_CONFIGURED',
  PIN_CHANGED: 'PIN_CHANGED',
  PIN_VERIFICATION_SUCCESS: 'PIN_VERIFICATION_SUCCESS',
  PIN_VERIFICATION_FAILED: 'PIN_VERIFICATION_FAILED',
  PIN_LOCKED: 'PIN_LOCKED',
  PIN_UNLOCKED: 'PIN_UNLOCKED',
  DEVICE_BOUND: 'DEVICE_BOUND',
  DEVICE_REVOKED: 'DEVICE_REVOKED',
  DEVICE_REACTIVATED: 'DEVICE_REACTIVATED',
  DEVICE_AUTH_SUCCESS: 'DEVICE_AUTH_SUCCESS',
  DEVICE_AUTH_FAILURE: 'DEVICE_AUTH_FAILURE',
  SECURITY_STATE_CHANGED: 'SECURITY_STATE_CHANGED',
} as const;

export type SecurityAuditEventType = typeof SECURITY_AUDIT_EVENTS[keyof typeof SECURITY_AUDIT_EVENTS];
