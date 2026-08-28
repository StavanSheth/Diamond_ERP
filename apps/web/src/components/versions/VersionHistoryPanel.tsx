import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { VersionDiffView } from './VersionDiffView';

interface VersionHistoryPanelProps {
  entityType: string;
  entityId: string;
  onClose?: () => void;
}

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({ entityType, entityId, onClose }) => {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  useEffect(() => {
    const fetchVersions = async () => {
      try {
        const res = await api.getVersionHistory(entityType, entityId);
        setVersions(res.data || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load version history');
      } finally {
        setLoading(false);
      }
    };
    
    if (entityId) {
      fetchVersions();
    }
  }, [entityType, entityId]);

  const handleRestore = async (versionId: string) => {
    if (!window.confirm('Are you sure you want to restore this version? This will create a new version entry.')) return;
    try {
      await api.restoreVersion(versionId);
      // Refresh the list after restore
      const res = await api.getVersionHistory(entityType, entityId);
      setVersions(res.data || []);
    } catch (err: any) {
      alert(err.message || 'Failed to restore version');
    }
  };

  if (loading) return <div className="p-4 text-gray-500">Loading history...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;

  return (
    <div className="flex flex-col h-full bg-white shadow-lg border-l border-gray-200 w-96">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h3 className="font-semibold text-gray-800">Version History</h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {versions.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No version history available.</p>
        ) : (
          versions.map((v, index) => {
            const isLatest = index === 0;
            const date = new Date(v.createdAt).toLocaleString();
            
            return (
              <div key={v.id} className="relative pl-6 border-l-2 border-gray-200 last:border-0 pb-4">
                {/* Timeline dot */}
                <div className={`absolute left-[-5px] top-1 w-2 h-2 rounded-full ${isLatest ? 'bg-indigo-600 ring-4 ring-indigo-100' : 'bg-gray-400'}`} />
                
                <div className={`p-3 rounded-lg border ${isLatest ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-semibold text-gray-500">
                      Version {v.versionNumber}
                    </span>
                    <span className="text-[10px] text-gray-400">{date}</span>
                  </div>
                  
                  <div className="text-sm font-medium text-gray-900 mb-1">
                    {v.versionType}
                  </div>
                  
                  {v.changeSummary && (
                    <div className="text-xs text-gray-600 mb-2">
                      {v.changeSummary}
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-100">
                    <div className="text-[10px] text-gray-500">By {v.createdBy} via {v.source}</div>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSelectedVersionId(selectedVersionId === v.id ? null : v.id)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        {selectedVersionId === v.id ? 'Hide Diff' : 'View Diff'}
                      </button>
                      
                      {!isLatest && (
                        <button 
                          onClick={() => handleRestore(v.id)}
                          className="text-xs text-amber-600 hover:text-amber-800 font-medium ml-2"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {selectedVersionId === v.id && (
                    <div className="mt-3">
                      <VersionDiffView 
                        changes={v.changes || []} 
                        snapshot={v.snapshot} 
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
