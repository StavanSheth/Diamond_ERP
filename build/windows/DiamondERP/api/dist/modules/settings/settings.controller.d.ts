import { Request, Response, NextFunction } from 'express';
export declare class SettingsController {
    getSettings: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    updateSettings: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * Normal user-facing XLSX export.
     * Delegates to ExportService — the same engine used by preservation/uninstall.
     * Arrangement is retained for future presentation-layer grouping (does not change data).
     */
    exportExcel: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    exportCsv: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    getProfiles: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    createProfile: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    deleteProfile: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    switchProfile: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    factoryReset: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/settings/backup
     * Creates an atomic, consistent database snapshot.
     * Delegates to authoritative BackupService (SSOT).
     */
    backupDatabase: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/settings/checkpoint
     * Flushes SQLite Write-Ahead Log on the active business database file.
     */
    checkpointWAL: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/settings/users
     * Lists all business users with their assigned profiles and database paths.
     */
    listUsers: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/settings/users/:userId/deactivate
     * Deactivates a user, strictly preserving their database and registry.
     */
    deactivateUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * DELETE /api/settings/users/:userId
     * Soft-deletes a user, strictly preserving their database and registry.
     */
    deleteUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * PUT /api/settings/users/:userId
     * Update user details (displayName, role).
     */
    updateUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/settings/users
     * Creates a new business user, assigns optional profile, and binds to installation.
     */
    createUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/settings/databases
     * Lists all registered SQLite databases and profile mappings.
     */
    listDatabases: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * PUT /api/settings/databases/:profileId
     * Edit database display name / details.
     */
    updateDatabase: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/settings/users/:userId/link-database
     * Links a database / profile to a user.
     */
    linkDatabaseToUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/settings/users/:userId/unlink-database
     * Unlinks a database / profile from a user.
     */
    unlinkDatabaseFromUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/settings/backup/download-active
     * Flushes WAL and triggers browser file download for active SQLite DB.
     */
    downloadActiveDatabase: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/settings/backup/:backupId/download
     * Streams snapshot backup file.
     */
    downloadBackup: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/settings/data-health
     * Runs central database health inspection across all profiles and databases.
     */
    getDataHealth: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/settings/open-folder
     * Opens data, backup, export, or log directory in Windows Explorer (Section 70).
     */
    openFolder: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/settings/data-location/migrate
     * Executes safe data location migration workflow (Sections 7 & 8).
     */
    migrateDataLocation: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/settings/disk-space
     * Returns current disk space assessment across data directory (Section 25).
     */
    getDiskSpace: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=settings.controller.d.ts.map