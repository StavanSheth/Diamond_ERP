/**
 * Phase 7 — Authoritative Export Entity Registry.
 *
 * Single source of truth for which business entities get exported during
 * preservation / uninstall. Used by both ExportService and PreservationService.
 *
 * Rules:
 *  - BUSINESS: customer work-product data → always exported
 *  - REFERENCE: supporting lookups → exported
 *  - SYSTEM: internal config / audit → never exported
 *  - Sensitive columns (password, pin, hash, secret, token) filtered at query time
 */
export interface ExportEntityDefinition {
    entityName: string;
    /** Prisma model accessor name (client[tableName].findMany()) */
    tableName: string;
    category: 'BUSINESS' | 'REFERENCE' | 'SYSTEM';
    exportable: boolean;
    /** Column name patterns to strip from export rows */
    sensitiveColumns?: RegExp;
}
export declare const EXPORT_ENTITY_REGISTRY: ExportEntityDefinition[];
/** Column name patterns that must never appear in exports. */
export declare const SENSITIVE_COLUMN_PATTERN: RegExp;
/**
 * Returns only entities that should be exported (category BUSINESS or REFERENCE, exportable=true).
 */
export declare function getExportableEntities(): ExportEntityDefinition[];
/**
 * Builds a Prisma-compatible query array for a given PrismaClient.
 */
export declare function buildExportQueries(client: any): Array<{
    name: string;
    query: () => Promise<any[]>;
}>;
//# sourceMappingURL=export-entity-registry.d.ts.map