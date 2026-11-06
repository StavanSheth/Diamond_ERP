import type { OnboardingStatusDto, UserDiscoveryResponseDto, DatabaseDiscoveryResponseDto, DatabaseAttachmentPreviewDto, AttachDatabaseRequest, CreateDatabaseRequest } from '@diamond-erp/contracts';
export declare class OnboardingService {
    /**
     * Authoritative summary of the onboarding & lifecycle readiness state.
     * Never exposes secrets (passwords, hashes, tokens).
     */
    getOnboardingState(): Promise<OnboardingStatusDto>;
    /**
     * Initialize application environment.
     * Ensures data/config directories and advances NOT_INITIALIZED -> APP_SETUP.
     */
    initializeApplication(): Promise<OnboardingStatusDto>;
    /**
     * Set up application PIN during onboarding and advance state machine to DEVICE_SETUP.
     */
    setupPin(pin: string, meta?: any): Promise<OnboardingStatusDto>;
    /**
     * Register local workstation device during onboarding and advance state machine to USER_DISCOVERY.
     */
    registerDevice(deviceName: string): Promise<OnboardingStatusDto>;
    /**
     * Discover candidate ERP business users available in the Control DB.
     * Returns safe metadata, omitting passwords, hashes, and security tokens.
     */
    discoverUsers(): Promise<UserDiscoveryResponseDto>;
    /**
     * Associate an existing business user with the local installation.
     * Advances USER_DISCOVERY -> DATABASE_DISCOVERY if in discovery state.
     */
    selectExistingUser(userId: string): Promise<{
        success: boolean;
        user: any;
        status?: OnboardingStatusDto;
    }>;
    /**
     * Create a new business user during onboarding and link to installation.
     * Reuses authoritative authService.createUser().
     */
    createBusinessUser(input: {
        username: string;
        password: string;
        displayName: string;
        role?: string;
    }): Promise<{
        success: boolean;
        user: any;
        status?: OnboardingStatusDto;
        provisioningContext: {
            userId: string;
            installationId: string;
        };
    }>;
    /**
     * Bounded database discovery.
     * Scans registered databases, profile metadata, and local database folder.
     * Invariant: Never recursively scans arbitrary drives or system folders!
     */
    discoverDatabases(): Promise<DatabaseDiscoveryResponseDto>;
    /**
     * Inspect a candidate database path in a strictly READ-ONLY manner.
     * Classifies suitability: VALID, REQUIRES_CONFIRMATION, UNSUPPORTED, CORRUPTED, INVALID, CONFLICT, MISSING.
     */
    inspectDatabaseCandidate(candidatePath: string): Promise<DatabaseAttachmentPreviewDto>;
    /**
     * Explicitly attach an existing valid Diamond ERP database.
     * Invariant: Requires confirmAttachment = true. Never auto-attaches.
     * Failure compensation: Never mutates or deletes the physical file.
     */
    attachExistingDatabase(input: AttachDatabaseRequest): Promise<{
        success: boolean;
        registry: any;
        status?: OnboardingStatusDto;
    }>;
    /**
     * Provision a brand new profile database from immutable template.db.
     * Invariant: If template.db is missing, fails immediately without creating empty DB.
     * Delegated authoritatively to DatabaseProvisioningService for pristine validation & atomic compensation.
     */
    createNewDatabase(input: CreateDatabaseRequest): Promise<{
        success: boolean;
        registry: any;
        status?: OnboardingStatusDto;
    }>;
    /**
     * Authoritative verification gate before advancing to READY.
     * If silent is true, returns boolean; otherwise throws ConflictError detailing missing prerequisites.
     */
    assertReady(silent?: boolean): Promise<boolean>;
    /**
     * Finalize onboarding and advance to READY state.
     */
    completeOnboarding(): Promise<OnboardingStatusDto>;
    /**
     * Reset recoverable onboarding steps (e.g. database step retry)
     * without destroying PIN, device, or installation identity.
     */
    resetRecoverableOnboardingState(): Promise<OnboardingStatusDto>;
    /**
     * Finalize database setup step before entering READY.
     */
    completeDatabaseSetup(): Promise<OnboardingStatusDto>;
}
export declare const onboardingService: OnboardingService;
//# sourceMappingURL=onboarding.service.d.ts.map