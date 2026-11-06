export interface ProfileDatabaseHealth {
    profileId: string;
    profileCode: string;
    profileName: string;
    databaseId: string;
    databasePath: string;
    exists: boolean;
    readable: boolean;
    sizeBytes: number;
    status: string;
    schemaVersion: number;
    integrityCheck: string;
    tablesFound: string[];
    missingTables: string[];
    walState: 'CLEAN' | 'WAL_ACTIVE' | 'ERROR';
    lastValidatedAt: string | null;
    lastBackupAt: string | null;
    lastVerifiedBackupAt: string | null;
    lastExportAt: string | null;
    isOrphaned: boolean;
    ownershipValid: boolean;
    issues: string[];
}
export interface SystemDataHealthReport {
    overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    dataRoot: string;
    diskSpace: {
        freeBytes: number;
        totalBytes: number;
        freeGb: number;
        totalGb: number;
        status: 'HEALTHY' | 'LOW' | 'CRITICAL' | 'INSUFFICIENT';
    };
    totalProfiles: number;
    healthyProfiles: number;
    orphanedDatabases: {
        path: string;
        sizeBytes: number;
    }[];
    profiles: ProfileDatabaseHealth[];
    generatedAt: string;
}
export declare class DatabaseHealthService {
    /**
     * Run comprehensive data health inspection across all ERP profiles and databases.
     */
    checkHealth(): Promise<SystemDataHealthReport>;
    checkProfile(profileIdOrCode: string): Promise<ProfileDatabaseHealth>;
    checkDatabase(databaseId: string): Promise<ProfileDatabaseHealth>;
    checkAllProfiles(): Promise<ProfileDatabaseHealth[]>;
}
export declare const databaseHealthService: DatabaseHealthService;
//# sourceMappingURL=database-health.service.d.ts.map