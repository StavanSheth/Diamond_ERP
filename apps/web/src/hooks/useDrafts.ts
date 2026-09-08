import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { getActiveDrafts, type LocalDraft } from '../services/draftDb';

export interface DraftListItem {
  id: string;
  draftNumber: string;
  entityType: string;
  entityId?: string;
  status: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  ledgerId?: string;
  latestRevisionSummary?: string;
  /** Whether this draft exists only locally (not yet synced) */
  isLocalOnly: boolean;
  localId?: number;
}

/**
 * Hook for fetching and managing the list of drafts (both local and server).
 */
export function useDrafts() {
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch local-only drafts (not yet synced)
      const localDrafts = await getActiveDrafts();
      const localOnlyDrafts: DraftListItem[] = localDrafts
        .filter((ld: LocalDraft) => !ld.serverId) // No server ID = local only
        .map((ld: LocalDraft) => ({
          id: `local-${ld.id}`,
          draftNumber: `LOCAL-${ld.id}`,
          entityType: ld.entityType,
          entityId: ld.entityId,
          status: ld.status,
          updatedAt: ld.lastLocalSave,
          createdBy: ld.createdBy,
          updatedBy: ld.createdBy,
          ledgerId: ld.ledgerId,
          latestRevisionSummary: 'Saved locally (not yet synced)',
          isLocalOnly: true,
          localId: ld.id,
        }));

      setDrafts(localOnlyDrafts);
    } catch (err: any) {
      setError(err.message || 'Failed to load drafts');
      // Still try to show local drafts if server is unavailable
      try {
        const localDrafts = await getActiveDrafts();
        const localItems: DraftListItem[] = localDrafts.map((ld: LocalDraft) => ({
          id: `local-${ld.id}`,
          draftNumber: ld.draftNumber || `LOCAL-${ld.id}`,
          entityType: ld.entityType,
          entityId: ld.entityId,
          status: ld.status,
          updatedAt: ld.lastLocalSave,
          createdBy: ld.createdBy,
          updatedBy: ld.createdBy,
          ledgerId: ld.ledgerId,
          latestRevisionSummary: 'Offline — saved locally',
          isLocalOnly: !ld.serverId,
          localId: ld.id,
        }));
        setDrafts(localItems);
      } catch {
        // IndexedDB also failed
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  return {
    drafts,
    loading,
    error,
    refresh: fetchDrafts,
    activeDraftCount: drafts.filter((d) => d.status === 'ACTIVE' || d.status === 'SAVED').length,
  };
}
