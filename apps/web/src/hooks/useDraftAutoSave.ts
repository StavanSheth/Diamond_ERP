import { useState, useEffect, useRef, useCallback } from 'react';
import { saveLocalDraft, markDraftSynced, type LocalDraft } from '../services/draftDb';
import { api } from '../services/api';

export type SyncState = 'IDLE' | 'SAVING_LOCAL' | 'SYNCING' | 'SYNCED' | 'OFFLINE' | 'SYNC_FAILED';

interface UseDraftAutoSaveOptions {
  entityType: string;
  entityId?: string;
  ledgerId?: string;
  createdBy?: string;
  /** Debounce for local autosave (Level A), default 1000ms */
  localDebounceMs?: number;
  /** Interval for server draft sync (Level B), default 10000ms */
  serverSyncIntervalMs?: number;
  /** Pass an initial draft ID if resuming an existing server draft */
  initialDraftId?: string;
  /** Pass an initial draft number if resuming an existing server draft */
  initialDraftNumber?: string;
  /** Pass an initial local draft ID if resuming a local-only draft */
  initialLocalId?: number;
}

interface UseDraftAutoSaveReturn {
  /** Current sync state for the UI indicator */
  syncState: SyncState;
  /** Server-assigned draft ID (null until first sync) */
  draftId: string | null;
  /** Server-assigned draft number */
  draftNumber: string | null;
  /** Current local revision number */
  localRevision: number;
  /** Seconds since last save */
  lastSavedAgo: number | null;
  /** Call this whenever the form payload changes */
  onPayloadChange: (payload: Record<string, unknown>, changeSummary?: string) => void;
  /** Force a server sync immediately */
  forceServerSync: () => Promise<void>;
}

/**
 * Hook implementing the 3-level autosave architecture:
 * Level A — Local AutoSave (IndexedDB, debounced 1s)
 * Level B — Server Draft Save (every 10s or on major change)
 */
export function useDraftAutoSave(options: UseDraftAutoSaveOptions): UseDraftAutoSaveReturn {
  const {
    entityType,
    entityId,
    ledgerId,
    createdBy = 'system',
    localDebounceMs = 1000,
    serverSyncIntervalMs = 10000,
    initialDraftId = null,
    initialDraftNumber = null,
    initialLocalId = undefined
  } = options;

  const [syncState, setSyncState] = useState<SyncState>('IDLE');
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [draftNumber, setDraftNumber] = useState<string | null>(initialDraftNumber);
  const [localRevision, setLocalRevision] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastSavedAgo, setLastSavedAgo] = useState<number | null>(null);

  const localDraftRef = useRef<LocalDraft | null>(initialLocalId ? { id: initialLocalId } as any : null);
  const pendingPayloadRef = useRef<Record<string, unknown> | null>(null);
  const pendingSummaryRef = useRef<string | undefined>(undefined);
  const localDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverSyncTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasUnsyncedChanges = useRef(false);

  // "X seconds ago" ticker
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastSavedAt) {
        setLastSavedAgo(Math.round((Date.now() - lastSavedAt.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  // ── Level A: Local AutoSave ──
  const saveLocally = useCallback(async (payload: Record<string, unknown>) => {
    setSyncState('SAVING_LOCAL');

    const nextRevision = (localDraftRef.current?.localRevision ?? 0) + 1;
    const draft: LocalDraft = {
      ...(localDraftRef.current || {}),
      id: localDraftRef.current?.id,
      entityType,
      entityId,
      ledgerId,
      payload,
      localRevision: nextRevision,
      status: 'ACTIVE',
      syncStatus: 'PENDING',
      createdBy,
      lastLocalSave: new Date().toISOString(),
      createdAt: localDraftRef.current?.createdAt || new Date().toISOString(),
    };

    const localId = await saveLocalDraft(draft);
    draft.id = localId;
    localDraftRef.current = draft;
    setLocalRevision(nextRevision);
    setLastSavedAt(new Date());
    setLastSavedAgo(0);
    hasUnsyncedChanges.current = true;

    // Show synced locally if we don't have server sync yet
    if (!draftId) {
      setSyncState('IDLE');
    }
  }, [entityType, entityId, ledgerId, createdBy, draftId]);

  // ── Level B: Server Draft Sync ──
  const syncToServer = useCallback(async () => {
    if (!hasUnsyncedChanges.current || !localDraftRef.current) return;

    const payload = localDraftRef.current.payload;
    setSyncState('SYNCING');

    try {
      if (!draftId) {
        // First sync: create draft on server
        const res = await api.createDraft({
          entityType,
          entityId,
          ledgerId,
          payload,
          createdBy,
        });
        const serverDraft = res.data;
        setDraftId(serverDraft.id);
        setDraftNumber(serverDraft.draftNumber);
        if (localDraftRef.current?.id) {
          await markDraftSynced(localDraftRef.current.id, serverDraft.id, serverDraft.draftNumber);
        }
      } else {
        // Subsequent syncs: save revision
        await api.saveDraftRevision(draftId, {
          payload,
          changeSummary: pendingSummaryRef.current,
          updatedBy: createdBy,
        });
        if (localDraftRef.current?.id) {
          await markDraftSynced(localDraftRef.current.id, draftId, draftNumber || '');
        }
      }

      hasUnsyncedChanges.current = false;
      pendingSummaryRef.current = undefined;
      setSyncState('SYNCED');
    } catch (err) {
      console.error('Server sync failed:', err);
      // Check if it's a network error
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setSyncState('OFFLINE');
      } else {
        setSyncState('SYNC_FAILED');
      }
    }
  }, [draftId, draftNumber, entityType, entityId, ledgerId, createdBy]);

  // Server sync interval
  useEffect(() => {
    serverSyncTimer.current = setInterval(() => {
      syncToServer();
    }, serverSyncIntervalMs);

    return () => {
      if (serverSyncTimer.current) clearInterval(serverSyncTimer.current);
    };
  }, [syncToServer, serverSyncIntervalMs]);

  // ── Public: onPayloadChange ──
  const onPayloadChange = useCallback(
    (payload: Record<string, unknown>, changeSummary?: string) => {
      pendingPayloadRef.current = payload;
      if (changeSummary) pendingSummaryRef.current = changeSummary;

      // Debounce Level A
      if (localDebounceTimer.current) clearTimeout(localDebounceTimer.current);
      localDebounceTimer.current = setTimeout(() => {
        saveLocally(payload);
      }, localDebounceMs);
    },
    [saveLocally, localDebounceMs],
  );

  // ── Public: forceServerSync ──
  const forceServerSync = useCallback(async () => {
    // First save locally if there's pending data
    if (pendingPayloadRef.current) {
      await saveLocally(pendingPayloadRef.current);
    }
    await syncToServer();
  }, [saveLocally, syncToServer]);

  // Cleanup on unmount and listen to network status
  useEffect(() => {
    const handleOnline = () => setSyncState('IDLE');
    const handleOffline = () => setSyncState('OFFLINE');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (!navigator.onLine) {
      setSyncState('OFFLINE');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (localDebounceTimer.current) clearTimeout(localDebounceTimer.current);
      if (serverSyncTimer.current) clearInterval(serverSyncTimer.current);
    };
  }, []);

  return {
    syncState,
    draftId,
    draftNumber,
    localRevision,
    lastSavedAgo,
    onPayloadChange,
    forceServerSync,
  };
}
