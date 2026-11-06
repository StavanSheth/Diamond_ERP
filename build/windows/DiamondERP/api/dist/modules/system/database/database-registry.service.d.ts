import type { DatabaseRegistryDto, DatabaseStatus } from '@diamond-erp/contracts';
export interface RegisterDatabaseInput {
    rawPath: string;
    displayName?: string;
    databaseType?: string;
    profileId?: string;
    installationId?: string;
}
export declare class DatabaseRegistryService {
    /**
     * Register a database file in the control registry.
     *
     * Invariants:
     * - Deduplication: If the canonical path is already registered, returns the existing record
     *   with its stable logical databaseId (never creates duplicate logical IDs for same file).
     * - Never renames or moves external databases.
     */
    registerDatabase(input: RegisterDatabaseInput): Promise<DatabaseRegistryDto>;
    /**
     * Look up a database by its logical databaseId.
     */
    getDatabase(databaseId: string): Promise<DatabaseRegistryDto>;
    /**
     * Look up a database by its canonical filesystem path.
     */
    getDatabaseByPath(rawPath: string): Promise<DatabaseRegistryDto | null>;
    /**
     * List all registered databases for an installation.
     */
    listDatabases(installationId?: string): Promise<DatabaseRegistryDto[]>;
    /**
     * Update status of a registered database.
     */
    updateDatabaseStatus(databaseId: string, status: DatabaseStatus): Promise<DatabaseRegistryDto>;
    /**
     * Associate a registered database with an ERP profile.
     * Maintains referential safety: validates profile existence or accepts null to disassociate.
     */
    associateWithProfile(databaseId: string, profileId: string | null): Promise<DatabaseRegistryDto>;
    /**
     * Update the canonical path of an existing registered database (e.g. after a file move/rename).
     * Invariant: Logical databaseId remains completely independent of filesystem path changes.
     */
    updateDatabasePath(databaseId: string, newRawPath: string): Promise<DatabaseRegistryDto>;
    /**
     * Provision a new profile database with filesystem + Control DB compensation.
     * Workflow:
     * 1. Register with status PENDING in Control DB.
     * 2. Provision physical file on disk from template.db.
     * 3. Validate physical database structure.
     * 4. Update status to ACTIVE if valid, or compensate/mark INVALID.
     * 5. If DB registration fails, roll back newly created physical file.
     */
    provisionDatabase(input: {
        rawPath: string;
        displayName?: string;
        profileId?: string;
        installationId: string;
    }): Promise<DatabaseRegistryDto>;
    private mapToDto;
}
export declare const databaseRegistryService: DatabaseRegistryService;
//# sourceMappingURL=database-registry.service.d.ts.map