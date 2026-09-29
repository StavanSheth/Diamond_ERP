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
  keyColumns: string[];
  expectedColumns?: string[];
  excludedColumns?: string[];
  /** Column name patterns to strip from export rows */
  sensitiveColumns?: RegExp;
}

// ponytail: one array, two consumers. Add new business tables here only.
export const EXPORT_ENTITY_REGISTRY: ExportEntityDefinition[] = [
  // ── Core Business Entities ─────────────────────────────────────────
  {
    entityName: 'Stock',
    tableName: 'stock',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id', 'stockCode'],
    expectedColumns: ['id', 'stockCode', 'name', 'description', 'currency', 'isActive', 'createdAt', 'updatedAt'],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'Ledger',
    tableName: 'ledger',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id'],
    expectedColumns: ['id', 'stockId', 'ledgerType', 'name', 'openingCarat', 'openingValue', 'createdAt', 'updatedAt'],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'Party',
    tableName: 'party',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id', 'partyCode'],
    expectedColumns: ['id', 'partyCode', 'name', 'partyType', 'phone', 'email', 'address', 'gstin', 'notes', 'brokeragePercentage', 'createdAt', 'updatedAt'],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'DiamondItem',
    tableName: 'diamondItem',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id', 'itemCode'],
    expectedColumns: [
      'id', 'itemCode', 'stockId', 'displayName', 'carat', 'color', 'clarity', 'cut', 'shape',
      'polish', 'symmetry', 'fluorescence', 'category', 'lengthMm', 'widthMm', 'depthMm',
      'ratePerCarat', 'currentValue', 'status', 'version', 'locationId', 'certificateStatus',
      'currentCertificateId', 'createdAt', 'updatedAt'
    ],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'Certification',
    tableName: 'certification',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id'],
    expectedColumns: [
      'id', 'name', 'diamondItemId', 'transactionId', 'labType', 'reportNumber', 'certificateStatus',
      'cost', 'measurements', 'polish', 'symmetry', 'fluorescence', 'laserInscription',
      'naturalOrLabGrown', 'pdfPath', 'proportionDiagramPath', 'inclusionPlotPath', 'createdAt', 'updatedAt'
    ],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'Repair',
    tableName: 'repair',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id'],
    expectedColumns: [
      'id', 'name', 'diamondItemId', 'transactionId', 'repairType', 'vendorPartyId',
      'dateSent', 'dateCompleted', 'caratBefore', 'caratAfter', 'cost', 'status', 'remarks', 'createdAt', 'updatedAt'
    ],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'Transaction',
    tableName: 'transaction',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id', 'transactionNo'],
    expectedColumns: [
      'id', 'ledgerId', 'transactionNo', 'transactionDate', 'transactionType', 'status',
      'authorizedBy', 'authorizedAt', 'authorizationReason', 'version', 'sequenceNumber',
      'partyId', 'remarks', 'referenceNo', 'paymentType', 'paymentStatus', 'paymentDone',
      'paymentDue', 'brokeragePercentage', 'brokerageAmount', 'brokerageType', 'createdBy', 'createdAt', 'updatedAt'
    ],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'TransactionItem',
    tableName: 'transactionItem',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id'],
    expectedColumns: ['id', 'transactionId', 'diamondItemId', 'name', 'quantity', 'carat', 'ratePerCarat', 'totalValue', 'itemAction', 'createdAt'],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'Location',
    tableName: 'location',
    category: 'REFERENCE',
    exportable: true,
    keyColumns: ['id'],
    expectedColumns: ['id', 'stockId', 'name', 'locationType', 'parentLocationId'],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },

  // ── Extended Business Entities ─────────────────────────────────────
  {
    entityName: 'ItemEvent',
    tableName: 'itemEvent',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id'],
    expectedColumns: [
      'id', 'diamondItemId', 'transactionId', 'eventType', 'eventDate', 'partyId',
      'caratBefore', 'caratAfter', 'rateBefore', 'rateAfter', 'valueBefore', 'valueAfter',
      'statusBefore', 'statusAfter', 'stockBeforeId', 'stockAfterId', 'locationBeforeId',
      'locationAfterId', 'certificateBeforeId', 'certificateAfterId', 'polishBefore', 'polishAfter',
      'symmetryBefore', 'symmetryAfter', 'colorBefore', 'colorAfter', 'clarityBefore', 'clarityAfter',
      'cutBefore', 'cutAfter', 'remarks', 'createdBy', 'createdAt'
    ],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'InventoryMovement',
    tableName: 'inventoryMovement',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id'],
    expectedColumns: ['id', 'diamondItemId', 'transactionId', 'movementType', 'fromLocationId', 'toLocationId', 'timestamp', 'performedBy'],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'FinancialEntry',
    tableName: 'financialEntry',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id'],
    expectedColumns: ['id', 'transactionId', 'partyId', 'entryType', 'amount', 'currency', 'dueDate', 'paidDate', 'status', 'createdAt', 'updatedAt'],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'ItemTransformation',
    tableName: 'itemTransformation',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id'],
    expectedColumns: ['id', 'transactionId', 'partyId', 'transformationType', 'status', 'inputCarats', 'outputCarats', 'yieldPercentage', 'lossCarats', 'cost', 'createdAt', 'updatedAt'],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'TransformationProvenance',
    tableName: 'transformationProvenance',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id'],
    expectedColumns: ['id', 'transformationId', 'inputItemId', 'outputItemId', 'caratsAllocated', 'valueAllocated'],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'DocumentDraft',
    tableName: 'documentDraft',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id'],
    expectedColumns: ['id', 'draftNumber', 'entityType', 'entityId', 'status', 'ledgerId', 'metadata', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt'],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },
  {
    entityName: 'DraftRevision',
    tableName: 'draftRevision',
    category: 'BUSINESS',
    exportable: true,
    keyColumns: ['id'],
    expectedColumns: ['id', 'draftId', 'revisionNumber', 'payload', 'changeSummary', 'author', 'createdAt'],
    excludedColumns: ['password', 'pin', 'hash', 'secret', 'token'],
  },

  // ── System / Non-Exportable ────────────────────────────────────────
  { entityName: 'Setting',          tableName: 'setting',          category: 'SYSTEM',    exportable: false, keyColumns: ['key'] },
  { entityName: 'RecordVersion',    tableName: 'recordVersion',    category: 'SYSTEM',    exportable: false, keyColumns: ['id'] },
  { entityName: 'VersionChange',    tableName: 'versionChange',    category: 'SYSTEM',    exportable: false, keyColumns: ['id'] },
  { entityName: 'AuditEvent',       tableName: 'auditEvent',       category: 'SYSTEM',    exportable: false, keyColumns: ['id'] },
  { entityName: 'Sequence',         tableName: 'sequence',         category: 'SYSTEM',    exportable: false, keyColumns: ['id'] },
  { entityName: 'IdempotencyKey',   tableName: 'idempotencyKey',   category: 'SYSTEM',    exportable: false, keyColumns: ['id'] },
  { entityName: 'Session',          tableName: 'session',          category: 'SYSTEM',    exportable: false, keyColumns: ['id'] },
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
