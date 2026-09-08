import React, { useEffect, useState } from 'react';
import { api } from '../../../services/api';

interface ItemDetailDrawerProps {
  open: boolean;
  itemId: string | null;
  onClose: () => void;
}

import { formatCurrency } from '../../../utils/format';

const fmt = formatCurrency;

export const ItemDetailDrawer: React.FC<ItemDetailDrawerProps> = ({ open, itemId, onClose }) => {
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlinkedCerts, setUnlinkedCerts] = useState<any[]>([]);
  const [selectedCertId, setSelectedCertId] = useState('');
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (open && itemId) {
      setLoading(true);
      setError(null);
      // Fetch diamond API (needs to be added to api.ts, I will do that next)
      fetch(`/api/diamonds/${itemId}`)
        .then(res => res.json())
        .then(res => {
          if (res.success) setItem(res.data);
          else setError(res.error || 'Failed to fetch diamond');
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
        
      fetch('/api/certificates/unlinked')
        .then(r => r.json())
        .then(res => {
          if (res.success) setUnlinkedCerts(res.data);
        })
        .catch(console.error);
    } else {
      setItem(null);
      setSelectedCertId('');
    }
  }, [open, itemId]);

  const handleLinkCert = async () => {
    if (!selectedCertId) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/certificates/${selectedCertId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diamondItemId: item.id })
      });
      const data = await res.json();
      if (data.success) {
        // Refresh item
        const itemRes = await fetch(`/api/diamonds/${itemId}`);
        const itemData = await itemRes.json();
        if (itemData.success) setItem(itemData.data);
        
        // Remove from unlinked list
        setUnlinkedCerts(prev => prev.filter(c => c.certificateId !== selectedCertId));
        setSelectedCertId('');
      } else {
        setError(data.error || 'Failed to link certificate');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLinking(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div 
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-sm z-40 animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div 
        className={`fixed top-0 right-0 bottom-0 w-full max-w-md bg-surface border-l border-outline-variant shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant bg-surface-bright shrink-0">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">diamond</span>
              Item Details
            </h2>
            {itemId && (
              <p className="font-mono text-caption text-on-surface-variant mt-1">{itemId}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:bg-surface-container hover:text-on-surface p-sm rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-lg bg-background">
          {loading && (
            <div className="flex items-center justify-center py-huge">
              <span className="material-symbols-outlined text-primary animate-spin mr-md">sync</span>
              <span className="font-body-md text-on-surface-variant">Loading item...</span>
            </div>
          )}

          {error && (
            <div className="bg-error-container border border-error/20 rounded-lg px-md py-sm flex items-center gap-sm">
              <span className="material-symbols-outlined text-error text-[18px]">error</span>
              <span className="font-body-md text-on-error-container">{error}</span>
            </div>
          )}

          {!loading && item && (
            <div className="flex flex-col gap-lg animate-fade-in-up">
              
              {/* Core 4Cs & Hierarchy */}
              {item.category === 'MIX' && (
                <div className="flex gap-sm">
                  <span className="px-2 py-1 bg-surface-container-high rounded text-xs font-bold text-on-surface">Mix/Parcel</span>
                  {item.certificationState && (
                    <span className="px-2 py-1 bg-surface-container-high rounded text-xs font-bold text-on-surface">{item.certificationState.replace('_', ' ')}</span>
                  )}
                  {item.polishState && (
                    <span className="px-2 py-1 bg-surface-container-high rounded text-xs font-bold text-on-surface">{item.polishState}</span>
                  )}
                </div>
              )}
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-sm bg-surface-bright p-sm rounded-lg border border-outline-variant">
                <div className="flex flex-col p-xs">
                  <span className="font-caption text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Shape</span>
                  <span className="font-body-md text-on-surface font-semibold">{item.shape || '—'}</span>
                </div>
                <div className="flex flex-col p-xs">
                  <span className="font-caption text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Carat</span>
                  <span className="font-body-md text-primary font-bold">{item.carat ? `${item.carat} ct` : '—'}</span>
                </div>
                <div className="flex flex-col p-xs">
                  <span className="font-caption text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Color</span>
                  <span className="font-body-md text-on-surface font-semibold">{item.color || '—'}</span>
                </div>
                <div className="flex flex-col p-xs">
                  <span className="font-caption text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Clarity</span>
                  <span className="font-body-md text-on-surface font-semibold">{item.clarity || '—'}</span>
                </div>
              </div>

              {/* Status and Value */}
              <div className="grid grid-cols-2 gap-sm">
                <div className="bg-surface-bright p-md rounded-lg border border-outline-variant">
                  <span className="font-caption text-[10px] text-on-surface-variant uppercase tracking-wider font-bold block mb-1">Status</span>
                  <span className="inline-block px-2 py-1 bg-surface-container-high rounded text-xs font-bold text-on-surface">
                    {item.status}
                  </span>
                </div>
                <div className="bg-surface-bright p-md rounded-lg border border-outline-variant">
                  <span className="font-caption text-[10px] text-on-surface-variant uppercase tracking-wider font-bold block mb-1">Current Value</span>
                  <span className="font-body-lg text-on-surface font-bold">{fmt(item.currentValue)}</span>
                </div>
              </div>

              {/* Certificates */}
              {item.certifications && item.certifications.length > 0 && (
                <div>
                  <h3 className="font-title-sm text-title-sm text-on-surface font-bold mb-md border-b border-outline-variant pb-xs">
                    Certifications
                  </h3>
                  <div className="flex flex-col gap-sm">
                    {item.certifications.map((cert: any) => (
                      <div key={cert.id} className="bg-surface-bright p-sm rounded-lg border border-outline-variant flex justify-between items-center">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-primary-container text-on-primary-container rounded text-[10px] font-bold">
                              {cert.labType || 'LAB'}
                            </span>
                            <span className="font-bold text-sm text-on-surface">{cert.reportNumber || 'Pending Report #'}</span>
                          </div>
                          <span className="text-xs text-on-surface-variant">Cost: {fmt(Number(cert.cost || 0))}</span>
                        </div>
                        <div>
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                            cert.certificateStatus === 'PENDING' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-surface-container-high text-on-surface'
                          }`}>
                            {cert.certificateStatus}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Repairs */}
              {item.repairs && item.repairs.length > 0 && (
                <div>
                  <h3 className="font-title-sm text-title-sm text-on-surface font-bold mb-md border-b border-outline-variant pb-xs">
                    Repairs
                  </h3>
                  <div className="flex flex-col gap-sm">
                    {item.repairs.map((repair: any) => (
                      <div key={repair.id} className="bg-surface-bright p-sm rounded-lg border border-outline-variant flex justify-between items-center">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-tertiary-container text-on-tertiary-container rounded text-[10px] font-bold">
                              {repair.repairType}
                            </span>
                            <span className="font-bold text-sm text-on-surface">{repair.vendor?.name || 'Unknown Vendor'}</span>
                          </div>
                          <span className="text-xs text-on-surface-variant">Est. Cost: {fmt(Number(repair.cost || 0))}</span>
                        </div>
                        <div>
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                            repair.status === 'PENDING' || repair.status === 'IN PROGRESS' ? 'bg-[#FFF8E1] text-[#F9A825]' : 'bg-[#E8F5E9] text-[#2E7D32]'
                          }`}>
                            {repair.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Link Unlinked Certificates */}
              {unlinkedCerts.length > 0 && (
                <div className="bg-surface-bright p-md rounded-lg border border-outline-variant">
                  <h4 className="font-caption text-[10px] text-on-surface-variant uppercase tracking-wider font-bold mb-2">Link Existing Certificate</h4>
                  <div className="flex gap-2">
                    <select
                      value={selectedCertId}
                      onChange={(e) => setSelectedCertId(e.target.value)}
                      className="flex-1 p-2 border border-outline-variant rounded bg-white text-sm"
                    >
                      <option value="">Select unlinked cert...</option>
                      {unlinkedCerts.map(c => (
                        <option key={c.certificateId} value={c.certificateId}>{c.reportNumber || c.certificateId}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleLinkCert}
                      disabled={!selectedCertId || linking}
                      className="bg-primary text-white px-3 py-1 rounded font-bold text-sm disabled:opacity-50"
                    >
                      {linking ? 'Linking...' : 'Link'}
                    </button>
                  </div>
                </div>
              )}

              {/* Audit Trail */}
              <div>
                <h3 className="font-title-sm text-title-sm text-on-surface font-bold mb-md border-b border-outline-variant pb-xs">
                  Lifecycle Audit Trail
                </h3>
                
                {item.events?.length === 0 ? (
                  <p className="text-body-sm text-on-surface-variant">No lifecycle events recorded.</p>
                ) : (
                  <div className="flex flex-col relative pl-md border-l-2 border-surface-container-highest ml-sm">
                    {item.events?.map((ev: any, i: number) => (
                      <div key={ev.id} className="mb-md relative">
                        {/* Timeline dot */}
                        <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-primary ring-4 ring-background" />
                        
                        <div className="bg-surface-bright p-sm rounded-lg border border-outline-variant">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-label-md text-label-md font-bold text-on-surface">
                              {ev.eventType.replace(/_/g, ' ')}
                            </span>
                            <span className="font-caption text-caption text-on-surface-variant">
                              {new Date(ev.eventDate).toLocaleDateString()}
                            </span>
                          </div>
                          
                          <div className="text-body-sm text-on-surface-variant mt-1">
                            {ev.party && <p><strong>Party:</strong> {ev.party.name}</p>}
                            {ev.caratAfter && ev.caratBefore !== ev.caratAfter && (
                              <p><strong>Weight Change:</strong> {ev.caratBefore}ct → {ev.caratAfter}ct</p>
                            )}
                            {ev.statusAfter && ev.statusBefore !== ev.statusAfter && (
                              <p><strong>Status Change:</strong> {ev.statusBefore} → {ev.statusAfter}</p>
                            )}
                            {ev.remarks && <p className="italic mt-1">"{ev.remarks}"</p>}
                            {ev.createdBy && <p className="text-[10px] mt-2">By: {ev.createdBy}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
