export interface DetectedDatabaseInfo {
    databaseId: string;
    displayName: string;
    canonicalPath: string;
    sizeBytes: number;
    hasRecentBackup: boolean;
    latestBackupAt?: string | null;
}
export interface DetectedExportBundleInfo {
    bundleDirName: string;
    fullPath: string;
    format?: string;
    sizeBytes: number;
    createdAt: string;
}
export interface DetectedPreservationPackageInfo {
    packageId: string;
    status: string;
    destinationPath: string;
    verifiedAt?: string | null;
}
export interface CustomerDataDetectionResult {
    hasCustomerData: boolean;
    databases: DetectedDatabaseInfo[];
    exportBundles: DetectedExportBundleInfo[];
    preservationPackages: DetectedPreservationPackageInfo[];
    activeUserCount: number;
    deletedUserCount: number;
    statusFilePath: string;
    inspectedAt: string;
}
export declare class CustomerDataDetectionService {
    /**
     * Unified authoritative customer data detection across physical files,
     * database registrations, export bundles, and user profiles.
     * Also writes customer-data-status.json to AppData for offline uninstaller gating.
     */
    detectCustomerData(): Promise<CustomerDataDetectionResult>;
}
export declare const customerDataDetectionService: CustomerDataDetectionService;
//# sourceMappingURL=customer-data-detection.service.d.ts.map