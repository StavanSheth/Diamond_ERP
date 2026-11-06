import type { RecoveryCandidateDiscoveryResponseDto, RecoveryInspectionPreviewDto, PrepareRestoreRequest, RestorePreviewDto, ConfirmRestoreRequest, RestoreOperationResponseDto, ReinstallDetectionDto } from '@diamond-erp/contracts';
export declare class RecoveryService {
    private activeRestoreLocks;
    /**
     * Resolves ownership status and previous owner metadata for recovery candidates.
     */
    private resolveOwnership;
    /**
     * Bounded discovery of recovery candidates from backups, databases, and registry.
     * NEVER walks whole drives recursively.
     */
    discoverCandidates(additionalDirectory?: string): Promise<RecoveryCandidateDiscoveryResponseDto>;
    /**
     * Detailed inspection of a recovery candidate.
     */
    inspectCandidate(candidatePath: string): Promise<RecoveryInspectionPreviewDto>;
    /**
     * Prepares a staged restore:
     * Copies candidate to staging directory, leaving original backup 100% immutable!
     */
    prepareRestore(req: PrepareRestoreRequest): Promise<RestorePreviewDto>;
    /**
     * Confirms and executes a staged restore with mandatory rollback backup and atomic activation.
     */
    confirmRestore(req: ConfirmRestoreRequest, performedBy?: string): Promise<RestoreOperationResponseDto>;
    /**
     * Startup reconciliation of interrupted restores or crashed replacement operations.
     */
    reconcileInterruptedRestores(): Promise<{
        reconciledCount: number;
        cleanedStagingCount: number;
    }>;
    /**
     * Reinstall & previous installation data detection.
     */
    detectReinstallState(): Promise<ReinstallDetectionDto>;
    /**
     * Start fresh installation:
     * Retires previous active installation(s); old database files, backups, and historical records remain 100% untouched on disk!
     */
    startFreshInstallation(): Promise<any>;
    /**
     * Continue existing installation:
     * Reconnects and verifies an existing installation state.
     */
    continueExistingInstallation(targetInstallationId?: string): Promise<any>;
    private computeSuitability;
}
export declare const recoveryService: RecoveryService;
//# sourceMappingURL=recovery.service.d.ts.map