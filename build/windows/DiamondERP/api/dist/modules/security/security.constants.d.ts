/**
 * Diamond ERP V3 - Security Policy Constants
 * Authoritative security constants and configuration parameters.
 */
export declare const SECURITY_CONFIG: {
    readonly MIN_PIN_LENGTH: 6;
    readonly MAX_PIN_LENGTH: 6;
    readonly MAX_FAILED_PIN_ATTEMPTS: 5;
    readonly PIN_LOCKOUT_DURATION_MS: number;
    readonly BCRYPT_PIN_ROUNDS: 10;
};
/**
 * Disallowed trivially sequential or repeated PIN combinations.
 */
export declare const DISALLOWED_PINS: Set<string>;
/**
 * Authoritative Security Audit Event Types
 */
export declare const SECURITY_AUDIT_EVENTS: {
    readonly PIN_CONFIGURED: "PIN_CONFIGURED";
    readonly PIN_CHANGED: "PIN_CHANGED";
    readonly PIN_VERIFICATION_SUCCESS: "PIN_VERIFICATION_SUCCESS";
    readonly PIN_VERIFICATION_FAILED: "PIN_VERIFICATION_FAILED";
    readonly PIN_LOCKED: "PIN_LOCKED";
    readonly PIN_UNLOCKED: "PIN_UNLOCKED";
    readonly DEVICE_BOUND: "DEVICE_BOUND";
    readonly DEVICE_REVOKED: "DEVICE_REVOKED";
    readonly DEVICE_REACTIVATED: "DEVICE_REACTIVATED";
    readonly DEVICE_AUTH_SUCCESS: "DEVICE_AUTH_SUCCESS";
    readonly DEVICE_AUTH_FAILURE: "DEVICE_AUTH_FAILURE";
    readonly APPLICATION_LOCKED: "APPLICATION_LOCKED";
    readonly APPLICATION_UNLOCKED: "APPLICATION_UNLOCKED";
    readonly SECURITY_STATE_CHANGED: "SECURITY_STATE_CHANGED";
};
export type SecurityAuditEventType = typeof SECURITY_AUDIT_EVENTS[keyof typeof SECURITY_AUDIT_EVENTS];
//# sourceMappingURL=security.constants.d.ts.map