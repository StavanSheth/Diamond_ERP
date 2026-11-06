import type { SecurityStatusDto, PinVerificationResponse, LockStateDto, DeviceSecurityDto } from './security.types';
export interface AuditMeta {
    ip?: string;
    userAgent?: string;
    userId?: string;
    sessionId?: string;
}
export declare class DeviceSecurityService {
    /**
     * Safe audit event recording. Never logs plaintext PIN, hash, or secrets.
     * Uses positive sanitization to ensure no credential leaks occur.
     */
    private recordAuditEvent;
    /**
     * Atomically records a PIN authentication failure (used by verifyPin and changePin).
     * Increments failed attempts, triggers 15-minute lockout at threshold (5 attempts),
     * and emits appropriate audit events.
     */
    recordPinFailure(deviceId: string, meta?: AuditMeta, context?: 'VERIFY' | 'CHANGE_PIN'): Promise<{
        failedAttempts: number;
        remainingAttempts: number;
        isLockedOut: boolean;
        lockedUntil: Date | null;
    }>;
    /**
     * Retrieves or initializes the DeviceSecurity record for a given deviceId.
     * Enforces cross-installation isolation: device must belong to current installation.
     */
    getOrCreateDeviceSecurity(deviceId: string): Promise<{
        device: any;
        security: any;
    }>;
    /**
     * Returns sanitized, non-secret security status of the device.
     * Invariant: Never exposes pinHash or secrets.
     * Decouples workstation screen lock (applicationLocked) from authentication lockout (authenticationLockedUntil).
     */
    getSecurityStatus(deviceId: string): Promise<SecurityStatusDto>;
    /**
     * Initial PIN setup. Allowed only when PIN is not yet configured.
     * Invariant: Concurrent setups must fail for all but one winner.
     */
    setupPin(deviceId: string, pin: string, meta?: AuditMeta): Promise<DeviceSecurityDto>;
    /**
     * Verifies an input PIN against the device security record.
     * Manages failed attempts, automatic 15-min lockout on 5 failures, and lockout expiration.
     * Invariant: During active lockout, all attempts (even correct PIN) are rejected.
     */
    verifyPin(deviceId: string, pin: string, meta?: AuditMeta): Promise<PinVerificationResponse>;
    /**
     * Authenticated PIN change requiring valid current PIN.
     * Enforces lockout checks, prevents same-PIN reuse, resets counters, and invalidates active sessions on this device.
     */
    changePin(deviceId: string, currentPin: string, newPin: string, meta?: AuditMeta): Promise<DeviceSecurityDto>;
    /**
     * Explicitly locks the application workstation (screen shield / idle lock).
     * Invariant: Mutates applicationLocked (isLocked) only; does not alter authentication lockout.
     */
    lockApplication(deviceId: string, meta?: AuditMeta): Promise<LockStateDto>;
    /**
     * Unlocks the application workstation using valid PIN authentication.
     */
    unlockApplication(deviceId: string, pin: string, meta?: AuditMeta): Promise<LockStateDto>;
    /**
     * Ensures device is bound and initialized.
     */
    bindDevice(deviceId: string, meta?: AuditMeta): Promise<SecurityStatusDto>;
}
export declare const deviceSecurityService: DeviceSecurityService;
//# sourceMappingURL=device-security.service.d.ts.map