import React from 'react';
import type { SyncState } from '../../hooks/useDraftAutoSave';

interface DraftSyncStatusProps {
  syncState: SyncState;
  lastSavedAgo: number | null;
  activeDraftCount?: number;
}

export const DraftSyncStatus: React.FC<DraftSyncStatusProps> = ({ 
  syncState, 
  lastSavedAgo,
  activeDraftCount = 0
}) => {
  const getStatusDisplay = () => {
    switch (syncState) {
      case 'SAVING_LOCAL':
        return { icon: 'save', text: 'Saving locally...', color: 'text-blue-600', spin: false };
      case 'SYNCING':
        return { icon: 'sync', text: 'Syncing to cloud...', color: 'text-indigo-600', spin: true };
      case 'SYNCED':
        return { icon: 'cloud_done', text: 'All changes saved', color: 'text-green-600', spin: false };
      case 'OFFLINE':
        return { icon: 'cloud_off', text: 'Offline (Saved locally)', color: 'text-yellow-600', spin: false };
      case 'SYNC_FAILED':
        return { icon: 'error', text: 'Sync failed', color: 'text-red-600', spin: false };
      case 'IDLE':
      default:
        return { icon: 'cloud_done', text: 'Up to date', color: 'text-gray-500', spin: false };
    }
  };

  const { icon, text, color, spin } = getStatusDisplay();

  const formatAgo = (seconds: number | null) => {
    if (seconds === null) return '';
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m ago`;
    return 'Over an hour ago';
  };

  return (
    <div className="flex flex-col gap-1 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined text-[18px] ${color} ${spin ? 'animate-spin' : ''}`}>
            {icon}
          </span>
          <span className={`text-xs font-medium ${color}`}>
            {text}
          </span>
        </div>
        {activeDraftCount > 0 && (
          <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {activeDraftCount} DRAFTS
          </span>
        )}
      </div>
      
      {lastSavedAgo !== null && syncState !== 'SYNCING' && syncState !== 'SAVING_LOCAL' && (
        <div className="text-[10px] text-gray-500 pl-6">
          Last saved: {formatAgo(lastSavedAgo)}
        </div>
      )}
    </div>
  );
};
