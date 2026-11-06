import { AuditMeta } from './device-security.service';
import type { SecurityStatusDto, PinVerificationResponse, LockStateDto, DeviceSecurityDto } from './security.types';
export declare class SecurityService {
    /**
     * Resolves the authoritative local device ID from disk/control layer.
     */
    getLocalDeviceId(): string;
    /**
     * Resolves the authoritative local device ID and verifies that any client-supplied
     * deviceId strictly matches this node's authoritative identity.
     * Invariant: Client cannot spoof or operate on another device's security state.
     */
    resolveAuthoritativeDeviceId(requestedDeviceId?: string): string;
    /**
     * Retrieves security status for the local authoritative device.
     */
    getStatus(deviceId?: string): Promise<SecurityStatusDto>;
    /**
     * Configures initial PIN for the local authoritative device.
     */
    setupPin(pin: string, deviceId?: string, meta?: AuditMeta): Promise<DeviceSecurityDto>;
    /**
     * Verifies PIN for the local authoritative device.
     */
    verifyPin(pin: string, deviceId?: string, meta?: AuditMeta): Promise<PinVerificationResponse>;
    /**
     * Changes PIN for the local authoritative device.
     */
    changePin(currentPin: string, newPin: string, deviceId?: string, meta?: AuditMeta): Promise<DeviceSecurityDto>;
    /**
     * Locks the application workstation on the local authoritative device.
     */
    lock(deviceId?: string, meta?: AuditMeta): Promise<LockStateDto>;
    /**
     * Unlocks the application workstation on the local authoritative device with PIN.
     */
    unlock(pin: string, deviceId?: string, meta?: AuditMeta): Promise<LockStateDto>;
    /**
     * Binds the local authoritative device.
     */
    bind(deviceId?: string, meta?: AuditMeta): Promise<SecurityStatusDto>;
}
export declare const securityService: SecurityService;
//# sourceMappingURL=security.service.d.ts.map