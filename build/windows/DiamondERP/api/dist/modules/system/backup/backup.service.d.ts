import type { BackupRecordDto, CreateBackupRequest, BackupVerificationDto, BackupListResponseDto } from '@diamond-erp/contracts';
export declare class BackupService {
    private activeLocks;
    /**
     * Calculate SHA-256 hash of a file on disk.
     */
    private calculateSha256;
    /**
     * Creates a safe, verified atomic backup of a live profile database.
     */
    createBackup(reqBody?: CreateBackupRequest, performedBy?: string): Promise<BackupRecordDto>;
    /**
     * List all verified backups from database and directory.
     */
    listBackups(): Promise<BackupListResponseDto>;
    /**
     * Inspect a backup by backupId or file path.
     */
    inspectBackup(backupIdOrPath: string): Promise<any>;
    /**
     * Verify backup integrity and hash match.
     */
    verifyBackup(backupIdOrPath: string): Promise<BackupVerificationDto>;
    /**
     * Delete backup record (soft-delete, never touches live DB).
     */
    deleteBackupRecord(backupId: string): Promise<void>;
    /**
     * Clean up interrupted .partial files from backup directory.
     */
    cleanupPartialBackups(): void;
    /**
     * Safe backup retention enforcement (Section 34):
     * - Never deletes the latest verified backup
     * - Never deletes the only backup
     * - Keeps at least retainCount verified backups per profile
     */
    pruneBackups(profileId?: string, retainCount?: number): Promise<number>;
    private formatRecord;
}
export declare const backupService: BackupService;
//# sourceMappingURL=backup.service.d.ts.map