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

// ponytail: one array, two consumers. Add new business tables here only.
export const EXPORT_ENTITY_REGISTRY: ExportEntityDefinition[] = [
  // ── Core Business Entities ─────────────────────────────────────────
  { entityName: 'Stock',          tableName: 'stock',          category: 'BUSINESS',   exportable: true },
  { entityName: 'Ledger',         tableName: 'ledger',         category: 'BUSINESS',   exportable: true },
  { entityName: 'Party',          tableName: 'party',          category: 'BUSINESS',   exportable: true },
  { entityName: 'DiamondItem',    tableName: 'diamondItem',    category: 'BUSINESS',   exportable: true },
  { entityName: 'Certification',  tableName: 'certification',  category: 'BUSINESS',   exportable: true },
  { entityName: 'Repair',         tableName: 'repair',         category: 'BUSINESS',   exportable: true },
  { entityName: 'Transaction',    tableName: 'transaction',    category: 'BUSINESS',   exportable: true },
  { entityName: 'TransactionItem',tableName: 'transactionItem',category: 'BUSINESS',   exportable: true },
  { entityName: 'Location',       tableName: 'location',       category: 'REFERENCE',  exportable: true },

  // ── Extended Business Entities (previously missing) ────────────────
  { entityName: 'ItemEvent',                tableName: 'itemEvent',                category: 'BUSINESS',  exportable: true },
  { entityName: 'InventoryMovement',        tableName: 'inventoryMovement',        category: 'BUSINESS',  exportable: true },
  { entityName: 'FinancialEntry',           tableName: 'financialEntry',           category: 'BUSINESS',  exportable: true },
  { entityName: 'ItemTransformation',       tableName: 'itemTransformation',       category: 'BUSINESS',  exportable: true },
  { entityName: 'TransformationProvenance', tableName: 'transformationProvenance', category: 'BUSINESS',  exportable: true },
  { entityName: 'DocumentDraft',            tableName: 'documentDraft',            category: 'BUSINESS',  exportable: true },
  { entityName: 'DraftRevision',            tableName: 'draftRevision',            category: 'BUSINESS',  exportable: true },

  // ── System / Non-Exportable ────────────────────────────────────────
  { entityName: 'Setting',          tableName: 'setting',          category: 'SYSTEM',    exportable: false },
  { entityName: 'RecordVersion',    tableName: 'recordVersion',    category: 'SYSTEM',    exportable: false },
  { entityName: 'VersionChange',    tableName: 'versionChange',    category: 'SYSTEM',    exportable: false },
  { entityName: 'AuditEvent',       tableName: 'auditEvent',       category: 'SYSTEM',    exportable: false },
  { entityName: 'Sequence',         tableName: 'sequence',         category: 'SYSTEM',    exportable: false },
  { entityName: 'IdempotencyKey',   tableName: 'idempotencyKey',   category: 'SYSTEM',    exportable: false },
];

/** Column name patterns that must never appear in exports. */
export const SENSITIVE_COLUMN_PATTERN = /password|pin|hash|secret|token|refreshToken/i;

/**
 * Returns only entities that should be exported (category BUSINESS or REFERENCE, exportable=true).
 */
export function getExportableEntities(): ExportEntityDefinition[] {
  return EXPORT_ENTITY_REGISTRY.filter((e) => e.exportable);
}

/**
 * Builds a Prisma-compatible query array for a given PrismaClient.
 */
export function buildExportQueries(client: any): Array<{ name: string; query: () => Promise<any[]> }> {
  return getExportableEntities().map((entity) => ({
    name: entity.entityName,
    query: () => client[entity.tableName].findMany(),
  }));
}
