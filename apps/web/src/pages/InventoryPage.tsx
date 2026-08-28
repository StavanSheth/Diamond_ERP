import React, { useState, useMemo, useEffect } from 'react';
import { StockItem, CreateStockDTO, UpdateStockDTO } from '../types/stock';
import { api } from '../services/api';
import { StockCard } from '../components/inventory/StockCard';
import { StockModal } from '../components/inventory/StockModal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { StatusBadge } from '../components/common/StatusBadge';
import { StockActionDialog } from '../components/inventory/StockActionDialog';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PaymentSummaryBanner } from '../components/common/PaymentSummaryBanner';
import { formatCurrency, formatNumber } from '../utils/format';

interface InventoryPageProps {
  stocks: StockItem[];
  loading: boolean;
  error: string | null;
  createStock: (dto: CreateStockDTO) => Promise<void>;
  updateStock: (id: string, dto: UpdateStockDTO) => Promise<void>;
  deleteStock: (id: string) => Promise<void>;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({
  stocks,
  loading,
  error,
  createStock,
  updateStock,
  deleteStock,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  
  // Initialize status from URL if present
  const initialStatus = searchParams.get('status');
  const [statusFilter, setStatusFilter] = useState<string[]>(initialStatus ? [initialStatus] : []);
  
  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minCarat, setMinCarat] = useState<string>('');
  const [maxCarat, setMaxCarat] = useState<string>('');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [hasRepairs, setHasRepairs] = useState<boolean>(false);
  const [hasCertificates, setHasCertificates] = useState<boolean>(false);
  
  // New backend filters
  const [category, setCategory] = useState<string>('All');
  const [transactionType, setTransactionType] = useState<string>('All');
  const [shape, setShape] = useState<string>('All');
  const [color, setColor] = useState<string>('All');
  const [clarity, setClarity] = useState<string>('All');
  const [cut, setCut] = useState<string>('All');
  const [symmetry, setSymmetry] = useState<string>('All');
  const [polish, setPolish] = useState<string>('All');

  // Staged filters for 'Apply Filters' button
  const [appliedFilters, setAppliedFilters] = useState({
    minCarat: '', maxCarat: '', minPrice: '', maxPrice: '', locationFilter: '',
    hasRepairs: false, hasCertificates: false,
    category: 'All', transactionType: 'All', shape: 'All', color: 'All', 
    clarity: 'All', cut: 'All', symmetry: 'All', polish: 'All'
  });

  // Local state for backend filtered stocks
  const [localStocks, setLocalStocks] = useState<StockItem[] | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);

  useEffect(() => {
    const hasAdvanced = appliedFilters.category !== 'All' || 
                        appliedFilters.transactionType !== 'All' || 
                        appliedFilters.shape !== 'All' || 
                        appliedFilters.color !== 'All' || 
                        appliedFilters.clarity !== 'All' || 
                        appliedFilters.cut !== 'All' || 
                        appliedFilters.symmetry !== 'All' || 
                        appliedFilters.polish !== 'All' || 
                        appliedFilters.minCarat !== '' || 
                        appliedFilters.maxCarat !== '' || 
                        appliedFilters.minPrice !== '' || 
                        appliedFilters.maxPrice !== '';
    if (hasAdvanced) {
      setIsFiltering(true);
      api.getStocks(appliedFilters).then(res => {
        setLocalStocks(res.data);
      }).catch(err => {
        console.error('Filter error', err);
      }).finally(() => setIsFiltering(false));
    } else {
      setLocalStocks(null);
    }
  }, [appliedFilters]);

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [modalOpen, setModalOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [editStock, setEditStock] = useState<StockItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StockItem | null>(null);
  
  const navigate = useNavigate();

  // Filtered stocks (client side applied on top of backend)
  const filteredStocks = useMemo(() => {
    const baseStocks = localStocks !== null ? localStocks : stocks;
    return (baseStocks || []).filter((s) => {
      const matchesSearch = !search || 
        s.stockName.toLowerCase().includes(search.toLowerCase()) ||
        s.id.toLowerCase().includes(search.toLowerCase()) ||
        s.location.toLowerCase().includes(search.toLowerCase());
      
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(s.status);
      const matchesLocation = !appliedFilters.locationFilter || s.location.toLowerCase().includes(appliedFilters.locationFilter.toLowerCase());
      const meetsRepairs = !appliedFilters.hasRepairs || (s.repairCount && s.repairCount > 0);
      const meetsCertificates = !appliedFilters.hasCertificates || (s.certifiedCount && s.certifiedCount > 0);

      return matchesSearch && matchesStatus && matchesLocation && meetsRepairs && meetsCertificates;
    });
  }, [stocks, localStocks, search, statusFilter, appliedFilters]);

  const applyAdvancedFilters = () => {
    setAppliedFilters({
      minCarat, maxCarat, minPrice, maxPrice, locationFilter, hasRepairs, hasCertificates,
      category, transactionType, shape, color, clarity, cut, symmetry, polish
    });
  };

  const toggleStatusFilter = (status: string) => {
    setStatusFilter((prev) => {
      const next = prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status];
      if (next.length > 0) {
        searchParams.set('status', next[0]); // Simplification for URL
      } else {
        searchParams.delete('status');
      }
      setSearchParams(searchParams);
      return next;
    });
  };

  const handleCreateClick = () => {
    setEditStock(null);
    setModalOpen(true);
  };

  const handleCardClick = (stock: StockItem) => {
    setEditStock(stock);
    setActionDialogOpen(true);
  };

  const handleModalSubmit = async (data: CreateStockDTO | UpdateStockDTO, id?: string) => {
    if (id) {
      await updateStock(id, data as UpdateStockDTO);
    } else {
      await createStock(data as CreateStockDTO);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget) {
      await deleteStock(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (stocks || []).forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1; });
    return counts;
  }, [stocks]);

  return (
    <div className="flex-1 overflow-y-auto bg-surface-bright flex flex-col">
      <PaymentSummaryBanner />
      <div className="p-margin-page">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-gutter mb-xl">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface mb-xs">Inventory</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Manage stock parcels and items across all active partitions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-sm w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:w-64">
            <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-outline">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Name, ID, Spec..."
              className="w-full pl-xl pr-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface focus:ring-2 focus:ring-primary focus:border-primary font-body-md text-body-md transition-shadow"
            />
          </div>
          
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-xs px-md py-sm rounded-lg border transition-colors font-headline-sm text-headline-sm ${showAdvanced ? 'bg-primary-container border-primary-container text-on-primary-container' : 'bg-surface-container-low border-outline-variant text-on-surface hover:bg-surface-container-high'}`}
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
            Filters
          </button>

          <div className="h-8 w-px bg-outline-variant mx-sm hidden md:block" />

          {/* View toggle */}
          <div className="bg-surface-container-low rounded-lg p-xs flex border border-outline-variant">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-xs rounded transition-all ${viewMode === 'grid' ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined">grid_view</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-xs rounded transition-all ${viewMode === 'table' ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined">table_rows</span>
            </button>
          </div>

          {/* Add Stock button */}
          <button
            onClick={handleCreateClick}
            className="flex items-center gap-xs px-md py-sm bg-primary text-on-primary rounded-lg hover:bg-surface-tint transition-colors font-headline-sm text-headline-sm shadow-sm ml-auto md:ml-0"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Add Stock
          </button>
        </div>
      </div>

      {/* Active Filters */}
      <div className="flex items-center gap-sm mb-lg flex-wrap">
        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Status:</span>
        {['ACTIVE', 'PARTIAL', 'SOLD_OUT', 'ARCHIVED'].map((status) => (
          <button
            key={status}
            onClick={() => toggleStatusFilter(status)}
            className={`inline-flex items-center gap-xs px-sm py-[2px] rounded-full font-caption text-caption transition-all ${
              statusFilter.includes(status)
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {status.replace('_', ' ')} ({statusCounts[status] || 0})
          </button>
        ))}
        {statusFilter.length > 0 && (
          <button
            onClick={() => setStatusFilter([])}
            className="text-primary font-caption text-caption hover:underline ml-sm"
          >
            Clear All
          </button>
        )}
      </div>
      
      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg mb-xl shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-md">Advanced Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
            <div>
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Location</label>
              <input
                type="text"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="e.g. Vault"
                className="w-full px-md py-sm bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md"
              />
            </div>
            <div>
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Min Carat</label>
              <input
                type="number"
                value={minCarat}
                onChange={(e) => setMinCarat(e.target.value)}
                placeholder="e.g. 10.5"
                className="w-full px-md py-sm bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md"
              />
            </div>
            <div>
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Max Carat</label>
              <input
                type="number"
                value={maxCarat}
                onChange={(e) => setMaxCarat(e.target.value)}
                placeholder="e.g. 50.0"
                className="w-full px-md py-sm bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md"
              />
            </div>
            <div>
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Min Price (₹)</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="10000000"
                  step="10000"
                  value={minPrice || 0}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="Min"
                  className="w-24 px-sm py-xs bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md text-right"
                />
              </div>
            </div>
            <div>
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Max Price (₹)</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100000000"
                  step="100000"
                  value={maxPrice || 100000000}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="Max"
                  className="w-24 px-sm py-xs bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md text-right"
                />
              </div>
            </div>
            <div className="flex flex-col gap-sm justify-center pt-md">
              <label className="flex items-center gap-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasRepairs}
                  onChange={(e) => setHasRepairs(e.target.checked)}
                  className="w-4 h-4 text-primary rounded border-outline-variant focus:ring-primary"
                />
                <span className="font-body-md text-body-md text-on-surface">Has Items in Repair</span>
              </label>
              <label className="flex items-center gap-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasCertificates}
                  onChange={(e) => setHasCertificates(e.target.checked)}
                  className="w-4 h-4 text-primary rounded border-outline-variant focus:ring-primary"
                />
                <span className="font-body-md text-body-md text-on-surface">Has Certified Items</span>
              </label>
            </div>
            
            <div>
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-md py-sm bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md"
              >
                <option value="All">All Categories</option>
                <option value="SINGLE">Single</option>
                <option value="PARCEL">Parcel / Mix</option>
                <option value="ROUGH">Rough</option>
              </select>
            </div>
            
            <div>
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Type of Transaction</label>
              <select
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value)}
                className="w-full px-md py-sm bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md"
              >
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
              <select value={shape} onChange={(e) => setShape(e.target.value)} className="w-full px-md py-sm bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md">
                <option value="All">Any Shape</option>
                {['Round', 'Princess', 'Cushion', 'Emerald', 'Oval', 'Pear'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Color</label>
              <select value={color} onChange={(e) => setColor(e.target.value)} className="w-full px-md py-sm bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md">
                <option value="All">Any Color</option>
                {['D', 'E', 'F', 'G', 'H', 'I', 'J'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Clarity</label>
              <select value={clarity} onChange={(e) => setClarity(e.target.value)} className="w-full px-md py-sm bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md">
                <option value="All">Any Clarity</option>
                {['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Cut</label>
              <select value={cut} onChange={(e) => setCut(e.target.value)} className="w-full px-md py-sm bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md">
                <option value="All">Any</option>
                {['EX', 'VG', 'G', 'F', 'P'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Sym.</label>
              <select value={symmetry} onChange={(e) => setSymmetry(e.target.value)} className="w-full px-md py-sm bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md">
                <option value="All">Any</option>
                {['EX', 'VG', 'G', 'F', 'P'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block font-caption text-caption text-on-surface-variant mb-xs">Pol.</label>
              <select value={polish} onChange={(e) => setPolish(e.target.value)} className="w-full px-md py-sm bg-surface border border-outline-variant rounded text-on-surface focus:ring-1 focus:ring-primary focus:border-primary font-body-md text-body-md">
                <option value="All">Any</option>
                {['EX', 'VG', 'G', 'F', 'P'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-sm mt-md">
             <button
               onClick={() => {
                 setLocationFilter('');
                 setMinCarat('');
                 setMaxCarat('');
                 setMinPrice('');
                 setMaxPrice('');
                 setHasRepairs(false);
                 setHasCertificates(false);
                 setCategory('All');
                 setTransactionType('All');
                 setShape('All');
                 setColor('All');
                 setClarity('All');
                 setCut('All');
                 setSymmetry('All');
                 setPolish('All');
                 setAppliedFilters({
                   minCarat: '', maxCarat: '', minPrice: '', maxPrice: '', locationFilter: '',
                   hasRepairs: false, hasCertificates: false, category: 'All', transactionType: 'All',
                   shape: 'All', color: 'All', clarity: 'All', cut: 'All', symmetry: 'All', polish: 'All'
                 });
               }}
               className="px-md py-sm text-primary font-headline-sm text-headline-sm hover:bg-surface-container-low rounded-lg transition-colors"
             >
               Clear Filters
             </button>
             <button
               onClick={applyAdvancedFilters}
               className="px-md py-sm bg-primary text-on-primary font-headline-sm text-headline-sm rounded-lg hover:bg-surface-tint transition-colors shadow-sm"
             >
               Apply Filters
             </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-error-container border border-error/20 rounded-lg px-md py-sm mb-lg flex items-center gap-sm">
          <span className="material-symbols-outlined text-error text-[18px]">error</span>
          <span className="font-body-md text-body-md text-on-error-container">{error}</span>
        </div>
      )}

      {/* Loading state */}
      {(loading || isFiltering) && (stocks || []).length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-gutter">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm h-[220px] flex flex-col">
              <div className="h-1 skeleton rounded-t-xl" />
              <div className="p-md flex-1 flex flex-col gap-md">
                <div className="h-5 skeleton rounded w-2/3" />
                <div className="h-3 skeleton rounded w-1/2" />
                <div className="flex-1" />
                <div className="h-8 skeleton rounded w-full" />
                <div className="h-6 skeleton rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!(loading || isFiltering) && filteredStocks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-huge text-center">
          <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-lg">
            <span className="material-symbols-outlined text-outline text-[32px]">inventory_2</span>
          </div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-sm">
            {(stocks || []).length === 0 ? 'No stock parcels yet' : 'No matching results'}
          </h3>
          <p className="font-body-md text-body-md text-on-surface-variant mb-lg max-w-md">
            {(stocks || []).length === 0
              ? 'Get started by adding your first diamond stock parcel. It will be synced to Google Sheets automatically.'
              : 'Try adjusting your search or filters to find what you\'re looking for.'
            }
          </p>
          {(stocks || []).length === 0 && (
            <button
              onClick={handleCreateClick}
              className="flex items-center gap-xs px-xl py-sm bg-primary text-on-primary rounded-lg hover:bg-surface-tint transition-colors font-headline-sm text-headline-sm shadow-sm"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              Add First Stock
            </button>
          )}
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && filteredStocks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-gutter pb-xxl">
          {filteredStocks.map((stock) => (
            <StockCard
              key={stock.id}
              stock={stock}
              onClick={handleCardClick}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && filteredStocks.length > 0 && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-sm overflow-hidden mb-xxl">
          <PaymentSummaryBanner />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-container border-b border-outline-variant">
                <tr>
                  <th className="font-caption text-caption text-on-surface-variant uppercase tracking-wider text-left px-md py-sm">Name</th>
                  <th className="font-caption text-caption text-on-surface-variant uppercase tracking-wider text-left px-md py-sm">Spec</th>
                  <th className="font-caption text-caption text-on-surface-variant uppercase tracking-wider text-right px-md py-sm">Carats</th>
                  <th className="font-caption text-caption text-on-surface-variant uppercase tracking-wider text-right px-md py-sm">Rate/Ct</th>
                  <th className="font-caption text-caption text-on-surface-variant uppercase tracking-wider text-right px-md py-sm">Total Value</th>
                  <th className="font-caption text-caption text-on-surface-variant uppercase tracking-wider text-center px-md py-sm">Status</th>
                  <th className="font-caption text-caption text-on-surface-variant uppercase tracking-wider text-left px-md py-sm">Location</th>
                  <th className="font-caption text-caption text-on-surface-variant uppercase tracking-wider text-center px-md py-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.map((stock) => (
                  <tr
                    key={stock.id}
                    className="border-b border-surface-container hover:bg-surface-container-low transition-colors cursor-pointer"
                    onClick={() => handleCardClick(stock)}
                  >
                    <td className="px-md py-sm">
                      <div>
                        <p className="font-body-md text-body-md text-on-surface font-semibold">{stock.stockName}</p>
                        <p className="font-caption text-caption text-outline">ID: {stock.id}</p>
                      </div>
                    </td>
                    <td className="px-md py-sm font-body-md text-body-md text-on-surface-variant">
                      {stock.reportGroup}
                    </td>
                    <td className="px-md py-sm font-body-md text-body-md text-on-surface text-right tabular-nums">
                      {formatNumber(stock.caratWeight)}
                    </td>
                    <td className="px-md py-sm font-body-md text-body-md text-on-surface text-right tabular-nums">
                      {formatCurrency(stock.caratRate)}
                    </td>
                    <td className="px-md py-sm font-body-md text-body-md text-on-surface text-right tabular-nums font-semibold">
                      {formatCurrency(stock.totalValue)}
                    </td>
                    <td className="px-md py-sm text-center">
                      <StatusBadge status={stock.status} size="sm" />
                    </td>
                    <td className="px-md py-sm font-body-md text-body-md text-on-surface-variant">
                      {stock.location?.split(' - ')[0]}
                    </td>
                    <td className="px-md py-sm text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(stock); }}
                        className="p-xs rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>

      {/* Add/Edit Modal */}
      <StockModal
        open={modalOpen}
        stock={editStock}
        onClose={() => { setModalOpen(false); setEditStock(null); }}
        onSubmit={handleModalSubmit}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Stock"
        message={`Are you sure you want to delete ${deleteTarget?.stockName}? This cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Action Dialog */}
      <StockActionDialog
        open={actionDialogOpen}
        stock={editStock}
        filters={appliedFilters} // Pass filters so ItemDetailDrawer shows only matched diamonds
        onClose={() => { setActionDialogOpen(false); setEditStock(null); }}
        onEditStock={() => setModalOpen(true)}
        onManageLedger={(qs?: string) => {
          if (editStock) {
            navigate(`/ledger?${qs || `stock=${editStock.id}`}`);
          }
        }}
      />
    </div>
  );
};
