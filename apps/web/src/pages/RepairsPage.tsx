import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { RepairModal } from '../components/repairs/RepairModal';
import { PaymentSummaryBanner } from '../components/common/PaymentSummaryBanner';
import { formatCurrency } from '../utils/format';
import { useNavigate } from 'react-router-dom';

export const RepairsPage: React.FC = () => {
  const [repairs, setRepairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  
  // Advanced backend filters
  const [showAdvanced, setShowAdvanced] = useState(false);
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
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRepair, setEditingRepair] = useState<any>(null);

  const fetchRepairs = async (filters = appliedFilters) => {
    try {
      setLoading(true);
      const res = await api.getRepairs(filters);
      if (res.success) setRepairs(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load repairs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepairs(appliedFilters);
  }, [appliedFilters]);

  const handleAdd = () => {
    setEditingRepair(null);
    setModalOpen(true);
  };

  const handleEdit = (repair: any) => {
    setEditingRepair(repair);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this repair record?')) return;
    try {
      await api.deleteRepair(id);
      fetchRepairs();
    } catch (err: any) {
      alert(err.message || 'Failed to delete repair');
    }
  };

  const handleModalSubmit = async (data: any, id?: string) => {
    try {
      if (id) {
        await api.updateRepair(id, data);
      } else {
        await api.createRepair(data);
      }
      setModalOpen(false);
      fetchRepairs();
    } catch (err: any) {
      alert(err.message || 'Failed to save repair');
    }
  };

  const filteredRepairs = repairs.filter(r => {
    if (filterStatus !== 'All' && r.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(
        r.itemName.toLowerCase().includes(q) || 
        r.stockItemId.toLowerCase().includes(q) ||
        r.vendor.toLowerCase().includes(q)
      )) {
        return false;
      }
    }
    
    const cost = r.cost || 0;
    if (minCost !== '' && cost < parseFloat(minCost)) return false;
    if (maxCost !== '' && cost > parseFloat(maxCost)) return false;
    
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'IN PROGRESS': return 'bg-[#FFF8E1] text-[#F9A825] border-[#F9A825]';
      case 'PENDING': return 'bg-[#F5F5F5] text-[#616161] border-[#9E9E9E]';
      case 'COMPLETED': return 'bg-[#E8F5E9] text-[#2E7D32] border-[#2E7D32]';
      default: return 'bg-surface-container text-on-surface-variant border-outline';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'IN PROGRESS': return 'build';
      case 'PENDING': return 'schedule';
      case 'COMPLETED': return 'check';
      default: return 'info';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-bright overflow-hidden">
      <PaymentSummaryBanner />
      <header className="px-margin-page py-lg bg-surface border-b border-outline-variant shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-gutter">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">Repair Ledger</h2>
            <p className="font-body-md text-on-surface-variant mt-xs">Manage item repairs, vendor tracking, and status reversions.</p>
          </div>
          
          <div className="flex items-center gap-md">
            <div className="relative w-64">
              <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
              <input
                type="text"
                placeholder="Search repairs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-xl pr-md py-sm border border-outline-variant rounded-full bg-surface-container-lowest focus:outline-none focus:border-primary font-body-md text-on-surface"
              />
            </div>
            
            <div className="flex bg-surface-container-lowest border border-outline-variant rounded-md overflow-hidden p-1">
              {['All', 'In Progress', 'Pending', 'Completed'].map(status => (
                <button 
                  key={status}
                  onClick={() => setFilterStatus(status === 'In Progress' ? 'IN PROGRESS' : status.toUpperCase() === 'ALL' ? 'All' : status.toUpperCase())}
                  className={`px-sm py-1 font-body-sm font-bold rounded ${
                    (filterStatus === status || (filterStatus === 'IN PROGRESS' && status === 'In Progress') || (filterStatus === status.toUpperCase() && status !== 'All' && status !== 'In Progress')) 
                    ? 'bg-[#1565C0] text-white' 
                    : 'text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {status}
                </button>
              ))}
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
              Add Repair
            </button>
          </div>
        </div>
      </header>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="bg-surface-container-lowest border-b border-outline-variant p-md">
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
                setMinCost('');
                setMaxCost('');
                setCategory('All');
                setTransactionType('All');
                setShape('All');
                setColor('All');
                setClarity('All');
                setCut('All');
                setSymmetry('All');
                setPolish('All');
                setMinCarat('');
                setMaxCarat('');
                setAppliedFilters({
                  category: 'All', transactionType: 'All', shape: 'All', color: 'All', 
                  clarity: 'All', cut: 'All', symmetry: 'All', polish: 'All', minCarat: '', maxCarat: '', minCost: '', maxCost: ''
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
            {filteredRepairs.map(repair => (
              <div 
                key={repair.repairId} 
                className="bg-surface border border-outline-variant rounded-xl p-md flex flex-col shadow-sm cursor-pointer hover:border-primary hover:shadow-md transition-all"
                onClick={() => navigate(`/ledger?itemCode=${repair.stockItemId}`)}
              >
                
                <div className="flex justify-between items-start mb-md">
                  <div>
                    <p className="font-caption text-caption text-on-surface-variant mb-1">Item: {repair.stockItemId}</p>
                    <h3 className="font-title-md font-bold text-on-surface uppercase">{repair.weight}ct {repair.itemName}</h3>
                  </div>
                  <div className={`flex items-center gap-1 px-sm py-1 rounded text-xs font-bold border ${getStatusColor(repair.status)}`}>
                    <span className="material-symbols-outlined text-[14px]">{getStatusIcon(repair.status)}</span>
                    {repair.status}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-md mb-md">
                  <div>
                    <p className="font-caption text-caption text-on-surface-variant">Repair Type</p>
                    <p className="font-body-md text-on-surface">{repair.repairType || '-'}</p>
                  </div>
                  <div>
                    <p className="font-caption text-caption text-on-surface-variant">Vendor</p>
                    <p className="font-body-md text-on-surface">{repair.vendor || '-'}</p>
                  </div>
                  <div>
                    <p className="font-caption text-caption text-on-surface-variant">Est. Cost</p>
                    <p className="font-body-md text-[#D32F2F]">
                      {repair.cost > 0 ? formatCurrency(repair.cost) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="font-caption text-caption text-on-surface-variant">Due Date</p>
                    <p className={`font-body-md ${repair.dueDate ? 'text-[#F9A825]' : 'text-on-surface'}`}>
                      {repair.dueDate ? new Date(repair.dueDate).toLocaleDateString() : 'TBD'}
                    </p>
                  </div>
                  {repair.status === 'COMPLETED' && (
                    <>
                      <div>
                        <p className="font-caption text-caption text-on-surface-variant">Final Cost</p>
                        <p className="font-body-md text-on-surface">
                          {repair.finalCost > 0 ? formatCurrency(repair.finalCost) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="font-caption text-caption text-on-surface-variant">Completed On</p>
                        <p className="font-body-md text-on-surface">
                          {repair.completedOn ? new Date(repair.completedOn).toLocaleDateString() : '-'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="border-t border-outline-variant pt-md mt-auto flex justify-between items-center">
                  <p className="font-caption text-caption font-bold text-[#1565C0]">
                    Restores to: {repair.restoresTo}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/ledger?itemCode=${repair.stockItemId}`); }} className="text-[#1565C0] hover:text-[#0D47A1] text-xs font-bold transition-colors mr-2">
                      VIEW LEDGER
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(repair); }} className="text-on-surface-variant hover:text-[#1565C0] transition-colors">
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(repair.repairId); }} className="text-on-surface-variant hover:text-error transition-colors">
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
                
              </div>
            ))}
          </div>
        )}
      </div>
      
      <RepairModal 
        open={modalOpen} 
        repair={editingRepair} 
        onClose={() => setModalOpen(false)} 
        onSubmit={handleModalSubmit} 
      />
    </div>
  );
};
