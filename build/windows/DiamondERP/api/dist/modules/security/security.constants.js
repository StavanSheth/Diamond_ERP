"use strict";
/**
 * Diamond ERP V3 - Security Policy Constants
 * Authoritative security constants and configuration parameters.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECURITY_AUDIT_EVENTS = exports.DISALLOWED_PINS = exports.SECURITY_CONFIG = void 0;
exports.SECURITY_CONFIG = {
    MIN_PIN_LENGTH: 6,
    MAX_PIN_LENGTH: 6,
    MAX_FAILED_PIN_ATTEMPTS: 5,
    PIN_LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes lockout
    BCRYPT_PIN_ROUNDS: 10,
};
/**
 * Disallowed trivially sequential or repeated PIN combinations.
 */
exports.DISALLOWED_PINS = new Set([
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
exports.SECURITY_AUDIT_EVENTS = {
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
    APPLICATION_LOCKED: 'APPLICATION_LOCKED',
    APPLICATION_UNLOCKED: 'APPLICATION_UNLOCKED',
    SECURITY_STATE_CHANGED: 'SECURITY_STATE_CHANGED',
};
//# sourceMappingURL=security.constants.js.map