import type { UninstallPreflightDto, UninstallExportRequest, UninstallExportResponseDto, UninstallAuthorizationDto, ValidateDestinationResponseDto, BrowseDestinationResponseDto } from '@diamond-erp/contracts';
export declare class UninstallPreflightService {
    /**
     * Authoritative preflight inspection scanning active and deleted users, registered databases,
     * un-registered physical customer DBs, and verification state.
     */
    getPreflightStatus(): Promise<UninstallPreflightDto>;
    /**
     * Issues a short-lived, one-time cryptographic uninstall authorization token.
     * Can ONLY be issued if the preservation package is 100% verified.
     */
    issueUninstallAuthorization(packageId: string): Promise<UninstallAuthorizationDto>;
    /**
     * Validates the machine-readable authorization token.
     * Performs deep independent verification:
     * - Token exists and valid JSON
     * - Not consumed, not expired, status == 'ISSUED'
     * - installationId matches current installation
     * - Destination directory exists
     * - preservation-manifest.json exists and SHA256 checksum matches
     * - PackageId in manifest matches authorization
     * - Control DB authorization record (if present) is not CONSUMED/REVOKED
     */
    checkAuthorizationToken(): Promise<{
        valid: boolean;
        token?: any;
        reason?: string;
        error?: string;
    }>;
    /**
     * Consumes the authorization token atomically so it can never be re-used.
     */
    consumeAuthorizationToken(authorizationId?: string): Promise<boolean>;
    /**
     * Legacy pre-uninstall backup bundle backward compatibility.
     */
    createUninstallBackup(req: UninstallExportRequest, performedBy?: string): Promise<UninstallExportResponseDto>;
    /**
     * Dedicated preservation destination validator
     */
    validateDestination(destinationDir: string): Promise<ValidateDestinationResponseDto>;
    /**
     * Native Windows destination selection / directory picker helper.
     */
    browseDestination(): Promise<BrowseDestinationResponseDto>;
    /**
     * Section 12: Automated Uninstall Flow.
     * Detects customer data -> Creates preservation package across all profiles -> Verifies package -> Issues authorization token.
     * If any step fails, fails closed and customer data is NOT deleted.
     */
    runAutomatedUninstallPreservation(options?: {
        destinationDir?: string;
        performedBy?: string;
    }): Promise<{
        success: boolean;
        preservationPackage: any;
        authorization: any;
    }>;
}
export declare const uninstallPreflightService: UninstallPreflightService;
//# sourceMappingURL=uninstall-preflight.service.d.ts.map