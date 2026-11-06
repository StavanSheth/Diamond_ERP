import type { ProvisionDatabaseResultDto } from '@diamond-erp/contracts';
export declare enum TableCategory {
    SCHEMA_METADATA = "SCHEMA_METADATA",
    SYSTEM_CONFIGURATION = "SYSTEM_CONFIGURATION",
    REFERENCE_DATA = "REFERENCE_DATA",
    BUSINESS_DATA = "BUSINESS_DATA",
    AUDIT_DATA = "AUDIT_DATA"
}
/**
 * Authoritative Classification of every known table in the Diamond ERP Schema.
 * Fix #4: Prevents unclassified business tables from bypassing pristine validation.
 */
export declare const PRISTINE_TABLE_CLASSIFICATION: Record<string, TableCategory>;
export interface ProvisionDatabaseInput {
    displayName: string;
    profileCode?: string;
    profileName?: string;
    userId: string;
    installationId?: string;
    provisioningOperationId?: string;
}
export declare class DatabaseProvisioningService {
    private activeProvisioningPaths;
    /**
     * Determine and validate the destination filesystem path for a new database.
     * Invariants:
     * - Must reside under databases directory.
     * - Must not collide with control DB (system.db) or template DB (template.db).
     * - Must not collide with an existing file on disk.
     */
    determineDestination(profileCode: string, databasesDir?: string): {
        canonicalPath: string;
        isExternal: boolean;
    };
    /**
     * Validate that the newly cloned database is truly pristine.
     * Authoritative Policy (Fix #4):
     * 1. Detects and fails closed on unclassified tables (PRISTINE_VALIDATION_UNCLASSIFIED).
     * 2. Asserts strictly 0 business records across all classified BUSINESS_DATA tables.
     */
    validatePristineState(canonicalPath: string): Promise<{
        isPristine: boolean;
        recordCounts: Record<string, number>;
    }>;
    /**
     * Validate the approved immutable template before copying.
     * Invariants:
     * - Template exists and is readable.
     * - Passes structural and schema integrity check.
     * - Satisfies pristine policy (zero business records).
     */
    validateTemplate(): Promise<string>;
    /**
     * Reconcile interrupted or in-flight provisioning operations (Crash Recovery / Fix #3).
     * Finds operations in transient states and safely reconciles or compensates them without deleting customer data.
     */
    reconcileInterruptedOperations(installationId?: string): Promise<{
        reconciled: number;
        compensated: number;
    }>;
    /**
     * Provision a brand-new blank database from the immutable template.
     * Full Phase 6 lifecycle:
     * 1. Validate target user existence and installation association (Strict User-DB Isolation / Fix #1)
     * 2. Check durable operation identity & deterministic request hash (Durable Idempotency / Fix #2)
     * 3. Validate approved template before copying (Fix #4)
     * 4. Clone template to destination path
     * 5. Validate SQLite structure, schema, and SQLite integrity
     * 6. Validate pristine state with authoritative classification (Fix #4)
     * 7. Register Profile, DatabaseRegistry, and UserProfile in Control DB transaction for TARGET USER ONLY
     * 8. Emit audit events
     * 9. Register profile in runtime client pool
     * 10. Mark operation COMPLETED; compensate filesystem artifacts on failure (Crash Recovery / Fix #3)
     */
    provisionBlankDatabase(input: ProvisionDatabaseInput): Promise<ProvisionDatabaseResultDto>;
}
export declare const databaseProvisioningService: DatabaseProvisioningService;
//# sourceMappingURL=database-provisioning.service.d.ts.map