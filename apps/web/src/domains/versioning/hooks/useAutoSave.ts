import { useEffect, useRef, useState } from 'react';
import { useTransactionDraft } from '../transactions/hooks/useTransactionDraft';
import { autosaveService } from '../services/autosave.service';
import { VERSION_CHECKPOINT_EVENTS } from './types/versioning';

export function useAutoSave() {
  const { draft, saveLocal } = useTransactionDraft();
  const [saveStatus, setSaveStatus] = useState<'Saving...' | 'Saved locally' | 'Saved' | 'Error'>('Saved');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const serverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Pipeline: Debounce 750ms -> IndexedDB -> UI: "Saved locally" -> 5-15 sec server debounce -> POST /drafts/:id/revisions -> UI: "Saved"
    if (!draft) return;

    setSaveStatus('Saving...');

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (serverTimeoutRef.current) clearTimeout(serverTimeoutRef.current);

    // 1. Local Save Debounce
    timeoutRef.current = setTimeout(async () => {
      try {
        await saveLocal(draft);
        setSaveStatus('Saved locally');

        // 2. Server Save Debounce
        serverTimeoutRef.current = setTimeout(async () => {
          try {
            await autosaveService.syncToServer(draft);
            setSaveStatus('Saved');
          } catch (error) {
            setSaveStatus('Error');
          }
        }, 10000); // 10 second server debounce as recommended (5-15s)

      } catch (error) {
        setSaveStatus('Error');
      }
    }, 750); // 750ms typing debounce

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (serverTimeoutRef.current) clearTimeout(serverTimeoutRef.current);
    };
  }, [draft, saveLocal]);

  const triggerCheckpoint = async (event: VERSION_CHECKPOINT_EVENTS) => {
    // If a major event occurs, trigger an immediate checkpoint.
    if (draft) {
      setSaveStatus('Saving...');
      await autosaveService.createCheckpoint(draft, event);
      setSaveStatus('Saved');
    }
  };

  return { saveStatus, triggerCheckpoint };
}
