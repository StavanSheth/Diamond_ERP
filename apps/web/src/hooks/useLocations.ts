import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { LOCATIONS as BASE_LOCATIONS, DEFAULT_LOCATION } from '@diamond-erp/contracts';

const STORAGE_KEY = 'diamond_erp_locations';
const OBSOLETE_LOCATIONS = new Set([
  'Mumbai - Main Office',
  'Surat - Cutting Unit',
  'Hong Kong - Sales Office',
  'Dubai - Vault',
  'Antwerp - Grading',
]);

export { DEFAULT_LOCATION };

/**
 * Normalizes and filters a list of locations:
 * - Excludes obsolete legacy locations
 * - Deduplicates case-insensitively
 * - Always ensures 'Mumbai - BKC' is preserved if the list becomes empty
 */
function sanitizeLocations(list: string[]): string[] {
  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const loc of list) {
    if (!loc || typeof loc !== 'string') continue;
    const trimmed = loc.trim();
    if (!trimmed || trimmed === DEFAULT_LOCATION || OBSOLETE_LOCATIONS.has(trimmed)) {
      continue;
    }
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      sanitized.push(trimmed);
    }
  }

  // Ensure 'Mumbai - BKC' is present if nothing else exists
  if (sanitized.length === 0) {
    sanitized.push('Mumbai - BKC');
  }

  return sanitized;
}

function getInitialLocations(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return sanitizeLocations(parsed);
      }
    }
  } catch {
    // Ignore storage parse errors
  }
  return sanitizeLocations([...BASE_LOCATIONS]);
}

export function useLocations() {
  const [locations, setLocations] = useState<string[]>(getInitialLocations);
  const [loading, setLoading] = useState(false);

  // Sync state on external window event (e.g. from another tab or component)
  useEffect(() => {
    const handleLocationsChanged = (e: Event) => {
      const custom = e as CustomEvent;
      if (Array.isArray(custom.detail?.locations)) {
        setLocations(custom.detail.locations);
      }
    };
    window.addEventListener('locationsChanged', handleLocationsChanged);
    return () => window.removeEventListener('locationsChanged', handleLocationsChanged);
  }, []);

  // Fetch settings from server on mount to sync with persisted DB settings
  useEffect(() => {
    let active = true;
    const fetchRemote = async () => {
      try {
        setLoading(true);
        const res = await api.getSettings();
        if (active && res.success && res.data?.CUSTOM_LOCATIONS) {
          const parsed = JSON.parse(res.data.CUSTOM_LOCATIONS);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const sanitized = sanitizeLocations(parsed);
            setLocations(sanitized);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
          }
        }
      } catch (err) {
        console.warn('[useLocations] Failed to sync locations from server:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchRemote();
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (updated: string[]) => {
    const sanitized = sanitizeLocations(updated);
    setLocations(sanitized);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // ignore
    }

    window.dispatchEvent(
      new CustomEvent('locationsChanged', { detail: { locations: sanitized } })
    );

    try {
      await api.updateSettings({
        CUSTOM_LOCATIONS: JSON.stringify(sanitized),
      });
    } catch (err) {
      console.warn('[useLocations] Failed to persist locations to database:', err);
    }
  }, []);

  const addLocation = useCallback(
    async (rawName: string): Promise<{ success: boolean; error?: string }> => {
      const name = rawName.trim();
      if (!name) {
        return { success: false, error: 'Location name cannot be empty' };
      }
      if (name.toLowerCase() === DEFAULT_LOCATION.toLowerCase()) {
        return { success: false, error: '"Not Specified" is a reserved system default.' };
      }
      if (locations.some((l) => l.toLowerCase() === name.toLowerCase())) {
        return { success: false, error: `Location "${name}" already exists.` };
      }

      const updated = [...locations, name];
      await persist(updated);
      return { success: true };
    },
    [locations, persist]
  );

  const editLocation = useCallback(
    async (oldName: string, rawNewName: string): Promise<{ success: boolean; error?: string }> => {
      const newName = rawNewName.trim();
      if (!newName) {
        return { success: false, error: 'Location name cannot be empty' };
      }
      if (newName.toLowerCase() === DEFAULT_LOCATION.toLowerCase()) {
        return { success: false, error: '"Not Specified" is a reserved system default.' };
      }
      if (
        oldName.toLowerCase() !== newName.toLowerCase() &&
        locations.some((l) => l.toLowerCase() === newName.toLowerCase())
      ) {
        return { success: false, error: `Location "${newName}" already exists.` };
      }

      const updated = locations.map((loc) => (loc === oldName ? newName : loc));
      await persist(updated);
      return { success: true };
    },
    [locations, persist]
  );

  const removeLocation = useCallback(
    async (name: string): Promise<{ success: boolean; error?: string }> => {
      const trimmed = name.trim();
      const updated = locations.filter((loc) => loc.toLowerCase() !== trimmed.toLowerCase());
      
      // Ensure at least one location remains if all are deleted
      const finalLocations = updated.length > 0 ? updated : ['Mumbai - BKC'];
      await persist(finalLocations);
      return { success: true };
    },
    [locations, persist]
  );

  return {
    locations,
    loading,
    addLocation,
    editLocation,
    removeLocation,
    defaultLocation: DEFAULT_LOCATION,
  };
}
