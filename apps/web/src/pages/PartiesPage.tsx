import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { PartyModal } from '../components/parties/PartyModal';
import { useNavigate } from 'react-router-dom';
import { PaymentSummaryBanner } from '../components/common/PaymentSummaryBanner';
import { formatCurrency } from '../utils/format';

export const PartiesPage: React.FC = () => {
  const navigate = useNavigate();
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper to generate a consistent color based on string
  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 85%)`;
  };

  const getAvatarTextColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 80%, 25%)`;
  };
  
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<any>(null);
  
  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minBalance, setMinBalance] = useState<string>('');
  const [maxBalance, setMaxBalance] = useState<string>('');

  const fetchParties = async () => {
    try {
      setLoading(true);
      const res = await api.getParties();
      if (res.success) setParties(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load parties');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParties();
  }, []);

  const handleAdd = () => {
    setEditingParty(null);
    setModalOpen(true);
  };

  const handleEdit = (party: any) => {
    setEditingParty(party);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this party?')) return;
    try {
      await api.deleteParty(id);
      fetchParties();
    } catch (err: any) {
      alert(err.message || 'Failed to delete party');
    }
  };

  const handleModalSubmit = async (data: any, id?: string) => {
    try {
      if (id) {
        await api.updateParty(id, data);
      } else {
        await api.createParty(data);
      }
      setModalOpen(false);
      fetchParties();
    } catch (err: any) {
      alert(err.message || 'Failed to save party');
    }
  };

  const filteredParties = parties.filter(p => {
    const matchesSearch = p.partyName.toLowerCase().includes(search.toLowerCase()) || 
                          p.partyId.toLowerCase().includes(search.toLowerCase());
    const bal = p.outstandingBalance || 0;
    const meetsMin = minBalance === '' || bal >= parseFloat(minBalance);
    const meetsMax = maxBalance === '' || bal <= parseFloat(maxBalance);
    
    return matchesSearch && meetsMin && meetsMax;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-bright overflow-hidden">
      <PaymentSummaryBanner />
      <header className="px-margin-page py-lg bg-surface border-b border-outline-variant shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-gutter">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">Parties Registry</h2>
            <p className="font-body-md text-on-surface-variant mt-xs">Manage clients, brokers, and suppliers.</p>
          </div>
          
          <div className="flex items-center gap-md">
            <div className="relative w-64">
              <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
              <input
                type="text"
                placeholder="Search parties..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-xl pr-md py-sm border border-outline-variant rounded-full bg-surface-container-lowest focus:outline-none focus:border-primary font-body-md text-on-surface"
              />
            </div>
            
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`flex items-center gap-xs border rounded-md px-md py-sm font-body-md font-bold transition-colors ${showAdvanced ? 'bg-primary-container border-primary-container text-on-primary-container' : 'border-outline-variant text-on-surface hover:bg-surface-container'}`}
            >
              <span className="material-symbols-outlined text-[18px]">filter_list</span>
              Filter
            </button>
            
            <button 
              onClick={handleAdd}
              className="flex items-center gap-xs bg-[#1565C0] hover:bg-[#0D47A1] text-white rounded-md px-md py-sm font-body-md font-bold transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add Party
            </button>
          </div>
        </div>
      </header>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="bg-surface-container-lowest border-b border-outline-variant p-md">
          <div className="flex gap-md max-w-2xl">
            <div className="flex-1">
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Min Balance (₹)</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="-10000000"
                  max="10000000"
                  step="10000"
                  value={minBalance || 0}
                  onChange={(e) => setMinBalance(e.target.value)}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={minBalance}
                  onChange={(e) => setMinBalance(e.target.value)}
                  placeholder="Min"
                  className="w-24 px-sm py-xs bg-surface border border-outline-variant rounded focus:border-primary"
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Max Balance (₹)</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="-10000000"
                  max="10000000"
                  step="10000"
                  value={maxBalance || 10000000}
                  onChange={(e) => setMaxBalance(e.target.value)}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={maxBalance}
                  onChange={(e) => setMaxBalance(e.target.value)}
                  placeholder="Max"
                  className="w-24 px-sm py-xs bg-surface border border-outline-variant rounded focus:border-primary"
                />
              </div>
            </div>
            <div className="flex items-end pb-xs">
              <button
                onClick={() => { setMinBalance(''); setMaxBalance(''); }}
                className="text-primary font-caption text-caption hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 p-margin-page overflow-y-auto bg-surface-bright">
        {loading ? (
          <div className="flex justify-center items-center h-64 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-[32px]">progress_activity</span>
          </div>
        ) : error ? (
          <div className="bg-error-container text-on-error-container p-md rounded-md">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg">
            {filteredParties.map(party => (
              <div 
                key={party.partyId} 
                className={`relative bg-surface border rounded-xl p-md flex flex-col justify-between shadow-sm cursor-pointer hover:border-primary hover:shadow-md transition-all ${(party.outstandingBalance || 0) > 0 ? (party.type === 'SUPPLIER' ? 'border-[#388E3C]/20' : 'border-[#D32F2F]/20') : 'border-outline-variant'}`}
                onClick={() => navigate(`/ledger?party=${party.partyId}`)}
              >
                {party.notes && (
                  <div className="absolute top-0 right-0 bg-[#FFF8E1] text-[#F9A825] px-sm py-xs text-xs font-bold rounded-bl-md rounded-tr-xl flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    {party.notes}
                  </div>
                )}
                <div className="flex items-start gap-md mb-xl">
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center font-headline-sm font-bold shrink-0 shadow-sm"
                    style={{ 
                      backgroundColor: getAvatarColor(party.partyName || party.partyId || 'U'),
                      color: getAvatarTextColor(party.partyName || party.partyId || 'U')
                    }}
                  >
                    {(party.partyName || 'UN').substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-title-md font-bold text-on-surface truncate pr-8" title={party.partyName}>{party.partyName || 'Unknown Party'}</h3>
                    <span className={`inline-block px-xs py-0.5 rounded text-[10px] font-bold uppercase mt-1 ${party.type === 'SUPPLIER' ? 'bg-[#F3E5F5] text-[#AB47BC]' : 'bg-[#E0F7FA] text-[#00838F]'}`}>
                      {party.type}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-end justify-between border-t border-outline-variant pt-md mt-auto">
                  <div>
                    <p className="font-caption text-caption text-on-surface-variant mb-1">Outstanding Balance</p>
                    <div className="flex items-center gap-xs font-caption text-caption text-on-surface-variant mt-2">
                      <span className="material-symbols-outlined text-[14px]">history</span>
                      Last Tx: {party.lastTxDate ? new Date(party.lastTxDate).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-headline-md font-bold ${!party.outstandingBalance ? 'text-on-surface' : (party.type === 'SUPPLIER' ? 'text-[#388E3C]' : 'text-[#D32F2F]')}`}>
                      {!party.outstandingBalance ? formatCurrency(0) : `${party.type === 'SUPPLIER' ? '+' : ''}${formatCurrency(party.outstandingBalance || 0)}`}
                    </p>
                    <div className="flex gap-2 justify-end mt-2">
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/ledger?party=${party.partyId}`); }} className="text-[#1565C0] hover:text-[#0D47A1] text-xs font-bold transition-colors mr-2">
                        VIEW LEDGER
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(party); }} className="text-on-surface-variant hover:text-[#1565C0] transition-colors">
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(party.partyId); }} className="text-on-surface-variant hover:text-error transition-colors">
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PartyModal 
        open={modalOpen} 
        party={editingParty} 
        onClose={() => setModalOpen(false)} 
        onSubmit={handleModalSubmit} 
      />
    </div>
  );
};
