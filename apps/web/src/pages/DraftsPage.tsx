import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDrafts, type DraftListItem } from '../hooks/useDrafts';
import { api } from '../services/api';
import { deleteLocalDraft } from '../services/draftDb';

export default function DraftsPage() {
  const { drafts, loading, error, refresh } = useDrafts();
  const navigate = useNavigate();

  const handleAbandon = async (draftId: string, isLocalOnly: boolean, localId?: number) => {
    if (!window.confirm('Are you sure you want to abandon this draft? This cannot be undone.')) return;
    
    try {
      if (isLocalOnly && localId) {
        await deleteLocalDraft(localId);
        refresh();
      } else {
        await api.abandonDraft(draftId);
        refresh();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to abandon draft');
    }
  };

  const handleResume = (draft: DraftListItem) => {
    if (draft.entityType === 'TRANSACTION') {
      navigate('/ledger', { state: { resumeDraft: draft } });
    } else {
      alert(`Resuming ${draft.entityType} is not implemented yet.`);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Drafts</h1>
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-gray-200 rounded w-full"></div>
          <div className="h-12 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Document Drafts</h1>
        <button 
          onClick={refresh}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6 border border-red-100">
          {error}
        </div>
      )}

      {drafts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No active drafts found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Draft Number
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Updated
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Summary
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {drafts.map((draft) => (
                <tr key={draft.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-blue-600">
                      {draft.draftNumber}
                    </div>
                    {draft.isLocalOnly && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 mt-1">
                        Local Only
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{draft.entityType}</div>
                    {draft.entityId && <div className="text-xs text-gray-500">Editing: {draft.entityId}</div>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      draft.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                      draft.status === 'SAVED' ? 'bg-blue-100 text-blue-800' :
                      draft.status === 'COMMITTED' ? 'bg-gray-100 text-gray-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {draft.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(draft.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {draft.latestRevisionSummary || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                    <button 
                      onClick={() => handleResume(draft)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      Resume
                    </button>
                    {(draft.status === 'ACTIVE' || draft.status === 'SAVED') && (
                      <button 
                        onClick={() => handleAbandon(draft.id, draft.isLocalOnly, draft.localId)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Abandon
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
