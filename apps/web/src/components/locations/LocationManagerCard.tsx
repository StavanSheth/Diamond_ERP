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
    <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
      <div className="h-1 bg-sky-600" />
      <div className="p-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-sm mb-md pb-sm border-b border-outline-variant/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center shrink-0 shadow-2xs">
              <span className="material-symbols-outlined text-[18px]">location_on</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                Inventory Locations &amp; Vaults
              </h3>
              <p className="text-[11px] text-on-surface-variant m-0">
                Manage your diamond vaults, offices, and centers. Default unselected: <strong className="text-on-surface">{DEFAULT_LOCATION}</strong>.
              </p>
            </div>
          </div>
          {!isAdding && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1.5 px-sm py-1.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors text-xs font-bold shadow-xs shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add Location
            </button>
          )}
        </div>

        {error && (
          <div className="mb-md p-xs px-sm rounded-lg bg-error-container text-on-error-container text-xs font-semibold flex items-center justify-between border border-error/20">
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
          <form onSubmit={handleAdd} className="mb-md p-sm bg-white rounded-xl border border-sky-200 shadow-2xs flex flex-col sm:flex-row items-center gap-sm animate-fade-in">
            <input
              type="text"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              placeholder="e.g. Mumbai - BKC, Surat Office, Vault A..."
              className="flex-1 w-full px-sm py-1.5 border border-outline-variant rounded-lg bg-surface-container-lowest text-on-surface text-sm focus:outline-none focus:border-sky-600"
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
                className="px-sm py-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newLocationName.trim()}
                className="px-md py-1.5 bg-sky-600 text-white rounded-lg text-xs font-bold hover:bg-sky-700 transition-colors disabled:opacity-50 shadow-xs"
              >
                Save Location
              </button>
            </div>
          </form>
        )}

        {/* Locations list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sm">
          {/* Not Specified System Tag */}
          <div className="flex items-center justify-between p-sm rounded-xl border border-dashed border-outline-variant/80 bg-white shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-[18px] text-outline">help_outline</span>
              <span className="text-xs font-semibold text-on-surface-variant italic truncate">{DEFAULT_LOCATION}</span>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Default
            </span>
          </div>

          {locations.map((loc, index) => {
            const isEditing = editingIndex === index;

            if (isEditing) {
              return (
                <div key={loc} className="flex items-center gap-xs p-xs rounded-xl border border-sky-600 bg-sky-50/50 col-span-1 sm:col-span-2">
                  <input
                    type="text"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    className="flex-1 px-sm py-1 border border-outline-variant rounded-lg bg-white text-on-surface text-xs focus:outline-none focus:border-sky-600"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(loc);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(loc)}
                    className="p-1 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-xs font-bold"
                    title="Save"
                  >
                    <span className="material-symbols-outlined text-[16px]">check</span>
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="p-1 rounded-lg bg-white text-on-surface-variant hover:text-on-surface text-xs font-bold border border-outline-variant"
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
                className="group flex items-center justify-between p-sm rounded-xl border border-outline-variant bg-white hover:border-sky-400 hover:shadow-xs transition-all"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[14px]">domain</span>
                  </div>
                  <span className="text-xs font-bold text-on-surface truncate">{loc}</span>
                </div>
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => startEdit(index, loc)}
                    className="p-1 rounded-md text-on-surface-variant hover:text-sky-700 hover:bg-sky-50 transition-colors"
                    title="Edit Location"
                  >
                    <span className="material-symbols-outlined text-[15px]">edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(loc)}
                    className="p-1 rounded-md text-on-surface-variant hover:text-error hover:bg-rose-50 transition-colors"
                    title="Remove Location"
                  >
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
