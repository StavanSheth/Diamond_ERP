import type { LifecycleState, InstallationDto, DeviceDto, LifecycleStatusResponse, InstallationUserDto } from '@diamond-erp/contracts';
export declare const LIFECYCLE_STAGES: LifecycleState[];
export declare const VALID_LIFECYCLE_RESET_REASONS: readonly ["ADMINISTRATIVE_RESET", "RECOVERY_RESET", "FAILED_ONBOARDING_RECOVERY", "DEVELOPMENT_TEST_RESET"];
export type LifecycleResetReason = (typeof VALID_LIFECYCLE_RESET_REASONS)[number];
export declare class InstallationService {
    getInstallationIdFilePath(): string;
    getDeviceIdFilePath(): string;
    /**
     * Resolves or generates the permanent installation ID.
     * Backed by %LOCALAPPDATA%\DiamondERP\config\.installation-id for recovery.
     *
     * Safety invariant: If persistent storage fails, it throws rather than
     * silently generating an unstable ephemeral ID.
     */
    getOrGenerateInstallationId(): string;
    /**
     * Resolves or generates the stable local device ID.
     * Backed by %LOCALAPPDATA%\DiamondERP\config\.device-id.
     */
    getOrGenerateDeviceId(): string;
    /**
     * Retrieve or automatically initialize the local Installation record in system DB.
     */
    getOrCreateInstallation(): Promise<InstallationDto>;
    /**
     * Check if a state transition is permitted.
     */
    canTransition(current: LifecycleState, target: LifecycleState, options?: {
        isReset?: boolean;
        resetReason?: string;
    }): boolean;
    /**
     * Controlled state transition for the onboarding/lifecycle state machine.
     */
    updateLifecycleState(targetState: LifecycleState, options?: {
        isReset?: boolean;
        resetReason?: string;
        enforceInvariants?: boolean;
    }): Promise<InstallationDto>;
    /**
     * Helper: Map Prisma Device record to DeviceDto
     */
    private mapDeviceToDto;
    /**
     * Register or update the local desktop Device linked to this installation.
     *
     * Invariant: Idempotent by persistent deviceId. Changing display name updates
     * the existing device record without creating duplicate devices.
     *
     * Authority: Installation owns device identity. If caller supplies an arbitrary
     * deviceId that does not match local authoritative identity, it is rejected.
     */
    registerDevice(options: {
        deviceName: string;
        deviceId?: string;
        platform?: string;
        osVersion?: string;
    }): Promise<DeviceDto>;
    /**
     * Revoke a device administratively.
     * Atomically sets Device to REVOKED, revokes all active sessions bound to this device,
     * and records a DEVICE_REVOKED audit event.
     */
    revokeDevice(deviceId: string, reason?: string): Promise<DeviceDto>;
    /**
     * Reactivate a previously revoked device.
     * Restores ACTIVE status and clears revokedAt, but explicitly preserves revoked session state
     * (old sessions remain revoked) and emits a DEVICE_REACTIVATED audit event.
     */
    reactivateDevice(deviceId: string): Promise<DeviceDto>;
    /**
     * Associate an ERP business user with this local installation.
     */
    associateUser(installationId: string, userId: string): Promise<InstallationUserDto>;
    /**
     * Disassociate an ERP business user from this local installation without deleting user or DB.
     */
    disassociateUser(installationId: string, userId: string): Promise<void>;
    /**
     * List all business users associated with this local installation.
     */
    getInstallationUsers(installationId: string): Promise<any[]>;
    /**
     * Public lifecycle status summary for client startup probes.
     */
    getLifecycleStatus(): Promise<LifecycleStatusResponse>;
}
export declare const installationService: InstallationService;
//# sourceMappingURL=installation.service.d.ts.map