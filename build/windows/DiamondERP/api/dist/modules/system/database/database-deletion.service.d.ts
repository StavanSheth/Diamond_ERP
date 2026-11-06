export interface DeleteDatabaseResult {
    success: boolean;
    profileCode: string;
    databaseDeleted: boolean;
    backupId?: string;
    backupPath?: string;
    deletedFiles: string[];
    message: string;
}
export declare class DatabaseDeletionService {
    private deletionLocks;
    /**
     * Authoritative, unified physical database deletion safety gate (Phase 4 / Section 3).
     *
     * Enforces:
     * 1. Resolution of exact DB from DatabaseRegistry (no guessing or bypassing)
     * 2. Validation of ownership & guards against system.db, template.db, and stavan.db
     * 3. Verified PROFILE_DELETE backup BEFORE any destructive action
     * 4. Complete backup verification required — aborts on any failure
     * 5. Closing active database handles
     * 6. Physical deletion of .db, -wal, -shm files
     * 7. Verification that files no longer exist on disk
     * 8. DatabaseRegistry removal or update to ORPHANED
     */
    deletePhysicalDatabaseSafely(options: {
        profileCode?: string;
        profileIdOrCode?: string;
        deleteDatabaseFile?: boolean;
        deleteMode?: 'DELETE_DATABASE' | 'RETAIN_DATABASE';
        reason?: string;
        performedBy?: string;
    }): Promise<DeleteDatabaseResult>;
}
export declare const databaseDeletionService: DatabaseDeletionService;
//# sourceMappingURL=database-deletion.service.d.ts.map