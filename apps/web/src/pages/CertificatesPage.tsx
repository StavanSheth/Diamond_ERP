import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { AddCertificateModal } from '../components/certificates/AddCertificateModal';
import { EditCertificateModal } from '../components/certificates/EditCertificateModal';
import { PaymentSummaryBanner } from '../components/common/PaymentSummaryBanner';
import { useNavigate } from 'react-router-dom';

export const CertificatesPage: React.FC = () => {
  const [certificates, setCertificates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editCertificate, setEditCertificate] = useState<any | null>(null);
  
  // Filters
  const [labFilter, setLabFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All Statuses');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [minCost, setMinCost] = useState<string>('');
  const [maxCost, setMaxCost] = useState<string>('');
  
  const [category, setCategory] = useState<string>('All');
  const [transactionType, setTransactionType] = useState<string>('All');
  const [shape, setShape] = useState<string>('All');
  const [color, setColor] = useState<string>('All');
  const [clarity, setClarity] = useState<string>('All');
  const [cut, setCut] = useState<string>('All');
  const [symmetry, setSymmetry] = useState<string>('All');
  const [polish, setPolish] = useState<string>('All');
  const [minCarat, setMinCarat] = useState<string>('');
  const [maxCarat, setMaxCarat] = useState<string>('');

  const [appliedFilters, setAppliedFilters] = useState({
    category: 'All', transactionType: 'All', shape: 'All', color: 'All', 
    clarity: 'All', cut: 'All', symmetry: 'All', polish: 'All',
    minCarat: '', maxCarat: '', minCost: '', maxCost: ''
  });
  
  const navigate = useNavigate();

  const fetchCertificates = async (filters = appliedFilters) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getCertificates(filters);
      if (res.success) {
        setCertificates(res.data);
      } else {
        setError('Failed to fetch certificates');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching certificates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCertificates(appliedFilters);
  }, [appliedFilters]);

  const filteredCertificates = certificates.filter(cert => {
    if (labFilter !== 'All' && cert.labType !== labFilter) return false;
    if (statusFilter !== 'All Statuses' && cert.certificateStatus !== statusFilter) return false;
    
    const cost = cert.cost || 0;
    if (minCost !== '' && cost < parseFloat(minCost)) return false;
    if (maxCost !== '' && cost > parseFloat(maxCost)) return false;
    
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface-container-lowest relative">
      <PaymentSummaryBanner />
      {/* Background visual element */}
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

      {/* Header */}
      <header className="px-page py-lg flex-shrink-0 relative z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-md mb-md">
          <div>
            <h1 className="font-display-sm text-display-sm text-on-surface">Certificates Registry</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              Manage lab reports and grading documents across all stocks.
            </p>
          </div>
          
          <div className="flex items-center gap-sm">
            <button
              onClick={() => fetchCertificates()}
              className="flex items-center justify-center w-10 h-10 rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors shadow-sm"
              title="Refresh"
            >
              <span className="material-symbols-outlined text-[20px]">refresh</span>
            </button>
            <button
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-xs px-lg py-sm bg-primary text-on-primary rounded-full hover:bg-surface-tint transition-all shadow-sm font-label-lg"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add Certificate
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex items-center gap-md border-b border-outline-variant pb-md">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">filter_list</span>
            <span className="font-label-md text-label-md text-on-surface-variant">Labs:</span>
          </div>
          <div className="flex items-center gap-xs">
            {['All', 'GIA', 'IGI', 'HRD'].map(lab => (
              <button
                key={lab}
                onClick={() => setLabFilter(lab)}
                className={`px-sm py-xs rounded-full font-label-sm text-label-sm border transition-colors ${
                  labFilter === lab 
                    ? 'bg-primary-container text-on-primary-container border-primary' 
                    : 'bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {lab}
              </button>
            ))}
          </div>
          
          <div className="h-6 w-px bg-outline-variant mx-sm"></div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-md py-xs bg-surface border border-outline-variant rounded-full text-sm outline-none focus:border-primary"
          >
            <option value="All Statuses">All Statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="RECEIVED">RECEIVED</option>
          </select>
          
          <div className="h-6 w-px bg-outline-variant mx-sm"></div>
          
          <button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-xs px-md py-xs rounded-full font-label-sm border transition-colors ${showAdvanced ? 'bg-primary-container text-on-primary-container border-primary' : 'bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            Advanced
          </button>
        </div>
        
        {/* Advanced Filters */}
        {showAdvanced && (
          <div className="mt-md bg-surface border border-outline-variant rounded-lg p-md">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md mt-md">
              <div>
                <label className="block font-caption text-caption text-on-surface-variant mb-xs">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-md py-sm border border-outline-variant rounded bg-surface">
                  <option value="All">All Categories</option>
                  <option value="SINGLE">Single</option>
                  <option value="PARCEL">Parcel / Mix</option>
                  <option value="ROUGH">Rough</option>
                </select>
              </div>
              <div>
                <label className="block font-caption text-caption text-on-surface-variant mb-xs">Type of Transaction</label>
                <select value={transactionType} onChange={(e) => setTransactionType(e.target.value)} className="w-full px-md py-sm border border-outline-variant rounded bg-surface">
                  <option value="All">Any Transaction</option>
                  <option value="PURCHASE">Purchase</option>
                  <option value="SALE">Sale</option>
                  <option value="REPAIR_OUT">Repair Sent</option>
                  <option value="REPAIR_IN">Repair Receive</option>
                  <option value="CERTIFICATION">Certificate Sent</option>
                  <option value="CERTIFICATION_IN">Certificate Receive</option>
                </select>
              </div>
              <div>
                <label className="block font-caption text-caption text-on-surface-variant mb-xs">Shape</label>
                <select value={shape} onChange={(e) => setShape(e.target.value)} className="w-full px-md py-sm border border-outline-variant rounded bg-surface">
                  <option value="All">Any Shape</option>
                  {['Round', 'Princess', 'Cushion', 'Emerald', 'Oval', 'Pear'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-caption text-caption text-on-surface-variant mb-xs">Color</label>
                <select value={color} onChange={(e) => setColor(e.target.value)} className="w-full px-md py-sm border border-outline-variant rounded bg-surface">
                  <option value="All">Any Color</option>
                  {['D', 'E', 'F', 'G', 'H', 'I', 'J'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-caption text-caption text-on-surface-variant mb-xs">Clarity</label>
                <select value={clarity} onChange={(e) => setClarity(e.target.value)} className="w-full px-md py-sm border border-outline-variant rounded bg-surface">
                  <option value="All">Any Clarity</option>
                  {['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-caption text-caption text-on-surface-variant mb-xs">Carat Range</label>
                <div className="flex items-center gap-2">
                  <input type="number" placeholder="Min" value={minCarat} onChange={(e) => setMinCarat(e.target.value)} className="w-1/2 px-sm py-sm border border-outline-variant rounded" />
                  <input type="number" placeholder="Max" value={maxCarat} onChange={(e) => setMaxCarat(e.target.value)} className="w-1/2 px-sm py-sm border border-outline-variant rounded" />
                </div>
              </div>
              <div>
                <label className="block font-caption text-caption text-on-surface-variant mb-xs">Est. Cost Range (₹)</label>
                <div className="flex items-center gap-2">
                  <input type="number" placeholder="Min" value={minCost} onChange={(e) => setMinCost(e.target.value)} className="w-1/2 px-sm py-sm border border-outline-variant rounded" />
                  <input type="number" placeholder="Max" value={maxCost} onChange={(e) => setMaxCost(e.target.value)} className="w-1/2 px-sm py-sm border border-outline-variant rounded" />
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-md gap-sm">
                <button
                onClick={() => {
                  setMinCost(''); setMaxCost('');
                  setCategory('All'); setTransactionType('All');
                  setShape('All'); setColor('All'); setClarity('All');
                  setCut('All'); setSymmetry('All'); setPolish('All');
                  setMinCarat(''); setMaxCarat('');
                  setAppliedFilters({
                    category: 'All', transactionType: 'All', shape: 'All', color: 'All', 
                    clarity: 'All', cut: 'All', symmetry: 'All', polish: 'All', 
                    minCarat: '', maxCarat: '', minCost: '', maxCost: ''
                  });
                }}
                className="px-md py-sm text-primary font-headline-sm hover:bg-surface-container rounded-md transition-colors"
              >
                Clear Filters
              </button>
              <button
                onClick={() => setAppliedFilters({
                  category, transactionType, shape, color, 
                  clarity, cut, symmetry, polish, minCarat, maxCarat, minCost, maxCost
                })}
                className="px-md py-sm bg-primary text-on-primary font-headline-sm rounded-md hover:bg-primary/90 transition-colors"
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 px-page pb-page overflow-auto relative z-10">
        
        {error && (
          <div className="bg-error-container border border-error/20 rounded-lg px-md py-sm mb-lg flex items-center gap-sm">
            <span className="material-symbols-outlined text-error text-[18px]">error</span>
            <span className="font-body-md text-body-md text-on-error-container">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-huge text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-[32px] mb-md block mx-auto">sync</span>
            <p>Loading certificates...</p>
          </div>
        ) : filteredCertificates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-huge text-center">
            <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-lg text-outline">
              <span className="material-symbols-outlined text-[32px]">workspace_premium</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-sm">No certificates match filters</h3>
            <p className="font-body-md text-body-md text-on-surface-variant mb-lg max-w-md">
              Try adjusting your Lab, Status, or Cost filters.
            </p>
            <button
              onClick={() => { setLabFilter('All'); setStatusFilter('All Statuses'); setMinCost(''); setMaxCost(''); }}
              className="px-xl py-sm bg-primary text-on-primary rounded-full hover:bg-surface-tint font-label-lg shadow-sm"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-md pb-xl">
            {filteredCertificates.map(cert => {
              const isUnlinked = !cert.stockItemId;
              
              return (
                <div 
                  key={cert.certificateId} 
                  onClick={() => { if (!isUnlinked) navigate(`/ledger?itemCode=${cert.stockItemId}`); }}
                  className={`bg-surface rounded-xl p-md flex flex-col relative group transition-shadow ${!isUnlinked ? 'cursor-pointer hover:border-primary hover:shadow-md' : 'hover:shadow-sm'} ${
                    isUnlinked 
                      ? 'border-2 border-dashed border-error/50 bg-error/5' 
                      : 'border border-outline-variant'
                  }`}
                >
                  {/* Action Menu / Edit Button (hover visible) */}
                  <div className="absolute top-sm right-sm opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditCertificate(cert); }}
                      className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/10 shadow-sm"
                      title="Edit Certificate"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm('Are you sure you want to delete this certificate?')) return;
                        try {
                          await api.deleteCertificate(cert.certificateId);
                          fetchCertificates();
                        } catch (err: any) {
                          alert(err.message || 'Failed to delete certificate');
                        }
                      }}
                      className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 shadow-sm"
                      title="Delete Certificate"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>

                  {/* Top Row: Lab & Report */}
                  <div className="flex items-center justify-between mb-lg pr-lg">
                    <div className="flex items-center gap-sm">
                      <span className="px-2 py-0.5 bg-surface-container-high rounded text-xs font-bold text-on-surface">
                        {cert.labType || 'LAB'}
                      </span>
                      <span className="font-mono font-bold text-on-surface text-sm">
                        {cert.reportNumber || 'NO REPORT'}
                      </span>
                    </div>
                    {cert.pdfPath && (
                      <a 
                        href={`http://localhost:3000${cert.pdfPath}`} // Hardcoded to backend for now, in prod use relative path or env
                        target="_blank" 
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-on-surface-variant hover:text-primary p-1"
                        title="View PDF"
                      >
                        <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                      </a>
                    )}
                  </div>

                  {/* Middle Row: Stock Details */}
                  {isUnlinked ? (
                    <div className="py-xl flex flex-col items-center justify-center flex-1 border-t border-b border-error/20 my-sm">
                      <span className="material-symbols-outlined text-error mb-1">link_off</span>
                      <span className="font-label-sm text-error">Not linked to inventory</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-md flex-1 border-t border-b border-outline-variant py-sm my-sm">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-on-surface-variant mb-1">Stock ID</span>
                        <span className="font-label-sm text-on-surface truncate" title={cert.stockItemId}>
                          {cert.stockItemId.split('-')[0] || cert.stockItemId}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-on-surface-variant mb-1">Name / Specific Item</span>
                        <span className="font-label-sm text-on-surface truncate">
                          {cert.itemName || cert.stockItemId}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Bottom Row: Date & Status */}
                  <div className="flex items-center justify-between mt-auto pt-sm">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-on-surface-variant">Last Updated</span>
                      <span className="font-label-sm text-on-surface-variant">
                        {cert.updatedAt ? new Date(cert.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown'}
                      </span>
                    </div>
                    
                    {isUnlinked ? (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditCertificate(cert); }}
                        className="text-primary font-label-sm hover:underline"
                      >
                        Link Now
                      </button>
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        cert.certificateStatus === 'PENDING' ? 'bg-tertiary-container text-on-tertiary-container' :
                        'bg-primary-container text-on-primary-container'
                      }`}>
                        {cert.certificateStatus || 'UNKNOWN'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            
            {/* Load More Button (Dummy) */}
            <div className="col-span-full flex justify-center mt-lg">
              <button className="flex items-center gap-sm px-xl py-sm rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container font-label-md">
                Load More Certificates
                <span className="material-symbols-outlined text-[18px]">expand_more</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <AddCertificateModal 
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {
          fetchCertificates();
        }}
      />

      <EditCertificateModal
        open={!!editCertificate}
        certificate={editCertificate}
        onClose={() => setEditCertificate(null)}
        onSuccess={() => {
          fetchCertificates();
        }}
      />
    </div>
  );
};
