/**
 * Authoritative Centralized Database Schema Compatibility Policy
 * Defines supported, older/migratable, and newer/unsupported version bounds
 * shared by DatabaseValidationService, RecoveryService, and Onboarding.
 */
export type SchemaCompatibilityStatus = 'SUPPORTED' | 'OLDER_MIGRATABLE' | 'NEWER_UNSUPPORTED' | 'INVALID' | 'UNKNOWN';
export interface SchemaCompatibilityResult {
    status: SchemaCompatibilityStatus;
    candidateVersion: number;
    currentVersion: number;
    minSupportedVersion: number;
    maxSupportedVersion: number;
    isCompatible: boolean;
    canMigrate: boolean;
    conflictReason: string | null;
    details: string;
}
export declare class SchemaCompatibilityService {
    static readonly CURRENT_SCHEMA_VERSION = 1;
    static readonly MIN_SUPPORTED_VERSION = 1;
    static readonly MAX_SUPPORTED_VERSION = 10;
    /**
     * Evaluates a database schema version against authoritative application support bounds.
     */
    check(candidateVersion: number | null | undefined): SchemaCompatibilityResult;
    isCompatible(candidateVersion: number | null | undefined): boolean;
    canMigrate(candidateVersion: number | null | undefined): boolean;
}
export declare const schemaCompatibilityService: SchemaCompatibilityService;
//# sourceMappingURL=schema-compatibility.service.d.ts.map