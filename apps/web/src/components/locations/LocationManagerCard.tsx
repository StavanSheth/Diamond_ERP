import React, { useState } from 'react';
import { useLocations, DEFAULT_LOCATION } from '../../hooks/useLocations';

export const LocationManagerCard: React.FC = () => {
  const { locations, addLocation, editLocation, removeLocation } = useLocations();
  const [newLocationName, setNewLocationName] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!newLocationName.trim()) return;

    const res = await addLocation(newLocationName);
    if (res.success) {
      setNewLocationName('');
      setIsAdding(false);
      setSuccessMsg(`Added location "${newLocationName.trim()}".`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setError(res.error || 'Failed to add location');
    }
  };

  const startEdit = (index: number, currentName: string) => {
    setEditingIndex(index);
    setEditingValue(currentName);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingValue('');
    setError(null);
  };

  const handleSaveEdit = async (oldName: string) => {
    setError(null);
    setSuccessMsg(null);
    if (!editingValue.trim()) return;

    const res = await editLocation(oldName, editingValue);
    if (res.success) {
      setEditingIndex(null);
      setEditingValue('');
      setSuccessMsg(`Updated location to "${editingValue.trim()}".`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setError(res.error || 'Failed to update location');
    }
  };

  const handleDelete = async (name: string) => {
    if (!window.confirm(`Are you sure you want to remove location "${name}"?`)) {
      return;
    }
    setError(null);
    setSuccessMsg(null);
    const res = await removeLocation(name);
    if (res.success) {
      setSuccessMsg(`Removed location "${name}".`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setError(res.error || 'Failed to remove location');
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-sm mb-md pb-sm border-b border-outline-variant">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-xs">
            <span className="material-symbols-outlined text-primary text-[22px]">location_on</span>
            Inventory Locations
          </h3>
          <p className="font-caption text-caption text-on-surface-variant mt-0.5">
            Manage your diamond vaults, offices, and centers. Default unselected: <strong>{DEFAULT_LOCATION}</strong>.
          </p>
        </div>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-xs px-sm py-xs bg-primary text-on-primary rounded-lg hover:bg-surface-tint transition-colors text-xs font-bold shadow-xs shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Add Location
          </button>
        )}
      </div>

      {error && (
        <div className="mb-md p-xs px-sm rounded-lg bg-error-container text-on-error-container text-xs font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-on-error-container font-bold ml-2">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="mb-md p-xs px-sm rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold flex items-center justify-between">
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-800 font-bold ml-2">✕</button>
        </div>
      )}

      {isAdding && (
        <form onSubmit={handleAdd} className="mb-md p-sm bg-surface-container-low rounded-lg border border-outline-variant/60 flex flex-col sm:flex-row items-center gap-sm animate-fade-in">
          <input
            type="text"
            value={newLocationName}
            onChange={(e) => setNewLocationName(e.target.value)}
            placeholder="e.g. Mumbai - BKC, Surat Office, Vault A..."
            className="flex-1 w-full px-sm py-xs border border-outline-variant rounded bg-white text-on-surface text-sm focus:outline-none focus:border-primary"
            autoFocus
          />
          <div className="flex items-center gap-xs w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewLocationName('');
                setError(null);
              }}
              className="px-sm py-xs text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newLocationName.trim()}
              className="px-md py-xs bg-primary text-on-primary rounded text-xs font-bold hover:bg-surface-tint transition-colors disabled:opacity-50"
            >
              Save Location
            </button>
          </div>
        </form>
      )}

      {/* Locations list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sm">
        {/* Not Specified System Tag */}
        <div className="flex items-center justify-between p-sm rounded-lg border border-dashed border-outline-variant/80 bg-surface-container/30">
          <div className="flex items-center gap-xs min-w-0">
            <span className="material-symbols-outlined text-[18px] text-outline">help_outline</span>
            <span className="text-sm font-semibold text-on-surface-variant italic truncate">{DEFAULT_LOCATION}</span>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant border border-outline-variant/50">
            Fallback
          </span>
        </div>

        {locations.map((loc, index) => {
          const isEditing = editingIndex === index;

          if (isEditing) {
            return (
              <div key={loc} className="flex items-center gap-xs p-xs rounded-lg border border-primary bg-primary/5 col-span-1 sm:col-span-2">
                <input
                  type="text"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  className="flex-1 px-sm py-xs border border-outline-variant rounded bg-white text-on-surface text-xs focus:outline-none focus:border-primary"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit(loc);
                    if (e.key === 'Escape') cancelEdit();
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleSaveEdit(loc)}
                  className="p-1 rounded bg-primary text-white hover:bg-surface-tint text-xs font-bold"
                  title="Save"
                >
                  <span className="material-symbols-outlined text-[16px]">check</span>
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="p-1 rounded bg-surface-container text-on-surface-variant hover:text-on-surface text-xs font-bold"
                  title="Cancel"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            );
          }

          return (
            <div
              key={loc}
              className="group flex items-center justify-between p-sm rounded-lg border border-outline-variant bg-surface hover:border-primary/50 hover:shadow-xs transition-all"
            >
              <div className="flex items-center gap-xs min-w-0">
                <span className="material-symbols-outlined text-[18px] text-primary">domain</span>
                <span className="text-sm font-bold text-on-surface truncate">{loc}</span>
              </div>
              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => startEdit(index, loc)}
                  className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors"
                  title="Edit Location"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(loc)}
                  className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-error-container/40 transition-colors"
                  title="Remove Location"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
