export interface DiskSpaceAssessment {
    path: string;
    freeBytes: number;
    totalBytes: number;
    freeGb: number;
    totalGb: number;
    status: 'HEALTHY' | 'LOW' | 'CRITICAL' | 'INSUFFICIENT';
    checkedAt: string;
}
export interface DataLocationMigrationResult {
    success: boolean;
    previousDataRoot: string;
    newDataRoot: string;
    databasesMigrated: number;
    safetyBackupsCreated: string[];
    integrityCheckPassed: boolean;
    migratedAt: string;
    error?: string;
}
export type MigrationState = 'IDLE' | 'PREPARING' | 'BACKING_UP' | 'COPYING' | 'VERIFYING' | 'COMMITTING' | 'COMPLETED' | 'ROLLING_BACK' | 'FAILED';
export interface MigrationStateRecord {
    state: MigrationState;
    sourceDataRoot: string;
    targetDataRoot: string;
    startedAt: string;
    updatedAt: string;
    originalRegistryPaths: Record<string, string>;
    error?: string;
}
declare class DataLocationService {
    private isMigrationLocked;
    isLocked(): boolean;
    setLock(locked: boolean): void;
    private writeMigrationState;
    private clearMigrationState;
    readMigrationState(): MigrationStateRecord | null;
    checkDiskSpace(targetPath?: string): DiskSpaceAssessment;
    assertDiskSpaceAvailable(requiredBytes: number, targetPath?: string): void;
    getDirectorySize(dirPath: string): number;
    /**
     * Safe Data Location Migration with explicit state machine (Phase 25).
     * Rollback restores both runtime config AND DatabaseRegistry paths (Phase 24).
     */
    migrateDataLocation(newTargetDataDir: string): Promise<DataLocationMigrationResult>;
    /**
     * Real SQLite integrity verification using PRAGMA integrity_check and PRAGMA foreign_key_check.
     * Section 14: Migration MUST FAIL if actual SQLite integrity verification cannot execute.
     */
    private verifySqliteFile;
    private copyDirectoryRecursive;
    openFolder(folderPath: string): Promise<boolean>;
    openDataFolder(): Promise<boolean>;
    openBackupFolder(): Promise<boolean>;
    openExportFolder(): Promise<boolean>;
    openLogsFolder(): Promise<boolean>;
}
export declare const dataLocationService: DataLocationService;
export {};
//# sourceMappingURL=data-location.service.d.ts.map