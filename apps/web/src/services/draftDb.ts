import Dexie, { type Table } from 'dexie';

// ──────────────────────────────────────────────────────────
// Types for the local IndexedDB draft store
// ──────────────────────────────────────────────────────────

export interface LocalDraft {
  /** Local auto-incremented ID */
  id?: number;
  /** Server-assigned draft ID (null until first server sync) */
  serverId?: string;
  /** Draft number from server (e.g. DR-000145) */
  draftNumber?: string;

  entityType: string; // TRANSACTION, STOCK, CERTIFICATION, REPAIR
  entityId?: string;  // null for new, populated when editing existing

  ledgerId?: string;

  /** The full current payload state */
  payload: Record<string, unknown>;

  /** Local revision counter */
  localRevision: number;

  status: 'ACTIVE' | 'SAVED' | 'SUBMITTED' | 'COMMITTED' | 'ABANDONED';

  /** Sync state with server */
  syncStatus: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

  lastLocalSave: string;   // ISO timestamp
  lastServerSync?: string; // ISO timestamp

  createdBy: string;
  createdAt: string; // ISO timestamp
}

export interface LocalDraftRevision {
  id?: number;
  /** References LocalDraft.id */
  draftLocalId: number;
  revisionNumber: number;
  snapshot: string;       // JSON stringified payload
  changeSet?: string;     // JSON stringified diff
  changeSummary?: string;
  createdAt: string;
}

export interface PendingSyncItem {
  id?: number;
  draftLocalId: number;
  action: 'CREATE' | 'SAVE_REVISION' | 'COMMIT' | 'ABANDON';
  payload: string;  // JSON
  retryCount: number;
  createdAt: string;
}

export interface DraftMetadata {
  key: string;
  value: string;
}

// ──────────────────────────────────────────────────────────
// Dexie Database
// ──────────────────────────────────────────────────────────

class DiamondERPDraftDB extends Dexie {
  drafts!: Table<LocalDraft, number>;
  draftRevisions!: Table<LocalDraftRevision, number>;
  pendingSync!: Table<PendingSyncItem, number>;
  metadata!: Table<DraftMetadata, string>;

  constructor() {
    super('diamond-erp');

    this.version(1).stores({
      drafts: '++id, serverId, entityType, status, syncStatus, createdAt',
      draftRevisions: '++id, draftLocalId, revisionNumber',
      pendingSync: '++id, draftLocalId, action, createdAt',
      metadata: 'key',
    });
  }
}

export const draftDb = new DiamondERPDraftDB();

// ──────────────────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────────────────

/** Save a draft locally (Level A — Local AutoSave) */
export async function saveLocalDraft(draft: LocalDraft): Promise<number> {
  const now = new Date().toISOString();
  draft.lastLocalSave = now;
  draft.syncStatus = 'PENDING';

  if (draft.id) {
    await draftDb.drafts.update(draft.id, {
      payload: draft.payload,
      localRevision: draft.localRevision,
      lastLocalSave: now,
      syncStatus: 'PENDING',
      status: draft.status,
    });
    return draft.id;
  } else {
    draft.createdAt = now;
    return draftDb.drafts.add(draft);
  }
}

/** Create a local revision snapshot */
export async function createLocalRevision(
  draftLocalId: number,
  revisionNumber: number,
  payload: Record<string, unknown>,
  changeSummary?: string,
): Promise<number> {
  return draftDb.draftRevisions.add({
    draftLocalId,
    revisionNumber,
    snapshot: JSON.stringify(payload),
    changeSummary,
    createdAt: new Date().toISOString(),
  });
}

/** Queue a sync action for background processing */
export async function queueSyncAction(
  draftLocalId: number,
  action: PendingSyncItem['action'],
  payload: Record<string, unknown>,
): Promise<number> {
  return draftDb.pendingSync.add({
    draftLocalId,
    action,
    payload: JSON.stringify(payload),
    retryCount: 0,
    createdAt: new Date().toISOString(),
  });
}

/** Get all active local drafts */
export async function getActiveDrafts(): Promise<LocalDraft[]> {
  return draftDb.drafts
    .where('status')
    .anyOf(['ACTIVE', 'SAVED'])
    .toArray();
}

/** Mark a draft as synced */
export async function markDraftSynced(localId: number, serverId: string, draftNumber: string): Promise<void> {
  await draftDb.drafts.update(localId, {
    serverId,
    draftNumber,
    syncStatus: 'SYNCED',
    lastServerSync: new Date().toISOString(),
  });
}

/** Delete a local draft and its revisions */
export async function deleteLocalDraft(localId: number): Promise<void> {
  await draftDb.transaction('rw', [draftDb.drafts, draftDb.draftRevisions, draftDb.pendingSync], async () => {
    await draftDb.draftRevisions.where('draftLocalId').equals(localId).delete();
    await draftDb.pendingSync.where('draftLocalId').equals(localId).delete();
    await draftDb.drafts.delete(localId);
  });
}
