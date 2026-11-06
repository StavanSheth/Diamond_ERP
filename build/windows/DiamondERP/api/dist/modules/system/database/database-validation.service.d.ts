import type { DatabaseValidationResultDto } from '@diamond-erp/contracts';
export declare class DatabaseValidationService {
    /**
     * Validate a candidate SQLite database in a strictly READ-ONLY manner.
     *
     * Security Invariant:
     * Validation NEVER modifies, copies, migrates, renames, or deletes the target file.
     */
    validateDatabase(candidatePath: string, options?: {
        allowTemplate?: boolean;
    }): Promise<DatabaseValidationResultDto>;
}
export declare const databaseValidationService: DatabaseValidationService;
//# sourceMappingURL=database-validation.service.d.ts.map