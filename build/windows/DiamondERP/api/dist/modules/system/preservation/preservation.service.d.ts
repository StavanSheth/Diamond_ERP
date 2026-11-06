import type { CreatePreservationPackageRequest, PreservationPackageDto, PreservationVerificationDto } from '@diamond-erp/contracts';
export declare class PreservationService {
    /**
     * Authoritative validation of preservation destination directory according to Windows ERP safety rules:
     * 1. Not system root (e.g. C:\ or \)
     * 2. Not Windows system directory (e.g. C:\Windows or %WINDIR%)
     * 3. Not active database file or databases directory
     * 4. Not control database or template database
     * 5. Real writability test using .diamond-erp-write-test-<uuid>.tmp with fsync & delete
     */
    validateDestinationDirectory(destinationRoot: string, canonicalSource: string): void;
    private calculateSha256;
    /**
     * Creates a complete, verified uninstall preservation package:
     * 1. Verified SQLite database backup (database_backup.db + manifest)
     * 2. CSV exports for all authoritative business entities
     * 3. XLSX workbook (business_data.xlsx) with entity sheets
     * 4. export-manifest.json and preservation-manifest.json
     * All-or-nothing: aborts and cleans up temp bundle on any error.
     */
    /**
     * Creates a complete, verified uninstall preservation package:
     * 1. Verified SQLite database backups for ALL active customer databases (User A -> DB A, User B -> DB B...)
     * 2. CSV exports for all authoritative business entities per database with formula injection protection
     * 3. XLSX workbooks per database with entity sheets
     * 4. Comprehensive multi-database export-manifest.json and preservation-manifest.json
     * 5. All-or-nothing verification: aborts and cleans up staging on any failure.
     */
    createPreservationPackage(req: CreatePreservationPackageRequest, performedBy?: string): Promise<PreservationPackageDto>;
    /**
     * Repeatable, read-only verification of a preservation package supporting multi-database packages.
     */
    verifyPreservationPackage(packagePathOrId: string): Promise<PreservationVerificationDto>;
    /**
     * Reconciles preservation packages left in transient/in-progress states
     * (PENDING, BACKING_UP, EXPORTING, VERIFYING) due to crash, power loss, or service restart.
     * Marks them FAILED and cleans up incomplete staging.
     */
    reconcileInterruptedPreservations(): Promise<{
        reconciledCount: number;
    }>;
}
export declare const preservationService: PreservationService;
//# sourceMappingURL=preservation.service.d.ts.map