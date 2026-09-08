import React, { useState, useMemo, useEffect } from 'react';
import { StockItem, CreateStockDTO, UpdateStockDTO, SHAPES, CUTS, CLARITIES, COLORS, SYMMETRIES, POLISHES } from '../types/stock';
import { api } from '../services/api';
import { StockCard } from '../domains/inventory/components/StockCard';
import { StockModal } from '../domains/inventory/components/StockModal';
import { ConfirmDialog } from '../domains/common/components/ConfirmDialog';
import { StatusBadge } from '../domains/common/components/StatusBadge';
import { StockActionDialog } from '../domains/inventory/components/StockActionDialog';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PaymentSummaryBanner } from '../domains/common/components/PaymentSummaryBanner';
import { formatCurrency, formatNumber } from '../utils/format';
import { EntityReportModal } from '../components/reports/EntityReportModal';
import { EntityPreloader } from '../domains/common/components/EntityPreloader';

interface InventoryPageProps {
  stocks: StockItem[];
  loading: boolean;
  error: string | null;
  createStock: (dto: CreateStockDTO) => Promise<void>;
  updateStock: (id: string, dto: UpdateStockDTO) => Promise<void>;
  deleteStock: (id: string) => Promise<void>;
}

// Aliases for backward compatibility within this file
const SHAPE_OPTIONS = SHAPES;
const COLOR_OPTIONS = COLORS;
const CLARITY_OPTIONS = CLARITIES;
const CUT_OPTIONS = CUTS;
const SYMMETRY_OPTIONS = SYMMETRIES;
const POLISH_OPTIONS = POLISHES;

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

  // Report Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedStockForReport, setSelectedStockForReport] = useState<any>(null);
  
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
  
  // Multi-select specs
  const [selectedShapes, setSelectedShapes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedClarities, setSelectedClarities] = useState<string[]>([]);
  const [selectedCuts, setSelectedCuts] = useState<string[]>([]);
  const [selectedSymmetries, setSelectedSymmetries] = useState<string[]>([]);
  const [selectedPolishes, setSelectedPolishes] = useState<string[]>([]);

  // Payment Aging filter
  const [paymentDirection, setPaymentDirection] = useState<string>('All');
  const [agingDays, setAgingDays] = useState<string>('All');

  // Classification & Transaction
  const [category, setCategory] = useState<string>('All');
  const [transactionType, setTransactionType] = useState<string>('All');

  // Staged filters for 'Apply Filters' button
  const [appliedFilters, setAppliedFilters] = useState({
    minCarat: '', maxCarat: '', minPrice: '', maxPrice: '', locationFilter: '',
    hasRepairs: false, hasCertificates: false,
    category: 'All', transactionType: 'All',
    shape: 'All', color: 'All', clarity: 'All', cut: 'All', symmetry: 'All', polish: 'All',
    paymentDirection: 'All', agingDays: 'All',
  });

  // Local state for backend filtered stocks
  const [localStocks, setLocalStocks] = useState<StockItem[] | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);

  useEffect(() => {
    const hasAdvanced = (appliedFilters.category && appliedFilters.category !== 'All') || 
                        (appliedFilters.transactionType && appliedFilters.transactionType !== 'All') || 
                        (appliedFilters.shape && appliedFilters.shape !== 'All') || 
                        (appliedFilters.color && appliedFilters.color !== 'All') || 
                        (appliedFilters.clarity && appliedFilters.clarity !== 'All') || 
                        (appliedFilters.cut && appliedFilters.cut !== 'All') || 
                        (appliedFilters.symmetry && appliedFilters.symmetry !== 'All') || 
                        (appliedFilters.polish && appliedFilters.polish !== 'All') || 
                        (appliedFilters.paymentDirection && appliedFilters.paymentDirection !== 'All') ||
                        (appliedFilters.agingDays && appliedFilters.agingDays !== 'All') ||
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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedShapes.length > 0) count++;
    if (selectedColors.length > 0) count++;
    if (selectedClarities.length > 0) count++;
    if (selectedCuts.length > 0) count++;
    if (selectedSymmetries.length > 0) count++;
    if (selectedPolishes.length > 0) count++;
    if (paymentDirection !== 'All') count++;
    if (agingDays !== 'All') count++;
    if (category !== 'All') count++;
    if (transactionType !== 'All') count++;
    if (minCarat || maxCarat) count++;
    if (minPrice || maxPrice) count++;
    if (locationFilter) count++;
    if (hasRepairs) count++;
    if (hasCertificates) count++;
    return count;
  }, [
    selectedShapes, selectedColors, selectedClarities, selectedCuts, selectedSymmetries, selectedPolishes,
    paymentDirection, agingDays, category, transactionType, minCarat, maxCarat, minPrice, maxPrice,
    locationFilter, hasRepairs, hasCertificates
  ]);

  const toggleMultiSelect = (item: string, current: string[], setter: (val: string[]) => void) => {
    setter(current.includes(item) ? current.filter((x) => x !== item) : [...current, item]);
  };

  const applyAdvancedFilters = () => {
    setAppliedFilters({
      minCarat, maxCarat, minPrice, maxPrice, locationFilter, hasRepairs, hasCertificates,
      category, transactionType,
      shape: selectedShapes.length > 0 ? selectedShapes.join(',') : 'All',
      color: selectedColors.length > 0 ? selectedColors.join(',') : 'All',
      clarity: selectedClarities.length > 0 ? selectedClarities.join(',') : 'All',
      cut: selectedCuts.length > 0 ? selectedCuts.join(',') : 'All',
      symmetry: selectedSymmetries.length > 0 ? selectedSymmetries.join(',') : 'All',
      polish: selectedPolishes.length > 0 ? selectedPolishes.join(',') : 'All',
      paymentDirection,
      agingDays,
    });
  };

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [modalOpen, setModalOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [editStock, setEditStock] = useState<StockItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StockItem | null>(null);
  
  const navigate = useNavigate();

  // Filtered stocks (client side applied on top of backend)
  const filteredStocks = useMemo(() => {
    const rawStocks = localStocks !== null ? localStocks : stocks;
    const baseStocks = Array.isArray(rawStocks) ? rawStocks : [];
    return baseStocks.filter((s) => {
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
    const list = Array.isArray(stocks) ? stocks : [];
    list.forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1; });
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
            className={`flex items-center gap-xs px-md py-sm rounded-lg border transition-all font-headline-sm text-headline-sm ${
              showAdvanced || activeFilterCount > 0
                ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                : 'bg-surface-container-low border-outline-variant text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-emerald-600 text-white leading-none">
                {activeFilterCount}
              </span>
            )}
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

          {/* Report button */}
          <button
            id="btn-inventory-report"
            onClick={() => {
              setSelectedStockForReport(null);
              setReportModalOpen(true);
            }}
            className="flex items-center gap-xs px-md py-sm bg-white border border-outline-variant text-on-surface hover:bg-surface-container-high rounded-lg transition-colors font-headline-sm text-headline-sm shadow-xs"
            title="Generate Inventory Valuation & Stock Report"
          >
            <span className="material-symbols-outlined text-[20px] text-indigo-600">summarize</span>
            Report
          </button>

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
        <div className="bg-white border border-slate-200/90 rounded-2xl p-lg mb-xl shadow-sm animate-in fade-in slide-in-from-top-4 duration-200 space-y-5">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-sm border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-[20px]">tune</span>
              </span>
              <div>
                <h3 className="font-headline-sm text-headline-sm text-slate-900 font-bold">
                  Advanced Filters & Diamond Specs
                </h3>
                <p className="text-xs text-slate-500">
                  Select multiple specifications, aging periods, or price and carat ranges
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {activeFilterCount} Active {activeFilterCount === 1 ? 'Filter' : 'Filters'}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedShapes([]);
                  setSelectedColors([]);
                  setSelectedClarities([]);
                  setSelectedCuts([]);
                  setSelectedSymmetries([]);
                  setSelectedPolishes([]);
                  setPaymentDirection('All');
                  setAgingDays('All');
                  setLocationFilter('');
                  setMinCarat('');
                  setMaxCarat('');
                  setMinPrice('');
                  setMaxPrice('');
                  setHasRepairs(false);
                  setHasCertificates(false);
                  setCategory('All');
                  setTransactionType('All');
                  setAppliedFilters({
                    minCarat: '', maxCarat: '', minPrice: '', maxPrice: '', locationFilter: '',
                    hasRepairs: false, hasCertificates: false, category: 'All', transactionType: 'All',
                    shape: 'All', color: 'All', clarity: 'All', cut: 'All', symmetry: 'All', polish: 'All',
                    paymentDirection: 'All', agingDays: 'All'
                  });
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
              >
                Reset All
              </button>
            </div>
          </div>

          {/* Section 1: Multi-Select Diamond Specs */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[18px] text-emerald-600">diamond</span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Diamond Grading Specifications (Multi-Select)
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/60 p-3.5 rounded-xl border border-slate-100">
              {/* Shape Multi-Select */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Shape {selectedShapes.length > 0 && <span className="text-emerald-600">({selectedShapes.length})</span>}
                  </span>
                  {selectedShapes.length > 0 && (
                    <button type="button" onClick={() => setSelectedShapes([])} className="text-[11px] font-semibold text-emerald-600 hover:underline">Clear</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {SHAPE_OPTIONS.map((s) => {
                    const active = selectedShapes.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleMultiSelect(s, selectedShapes, setSelectedShapes)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all ${
                          active
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-500 font-semibold shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded flex items-center justify-center text-[9px] border ${active ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {active && '✓'}
                        </span>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color Multi-Select */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Color {selectedColors.length > 0 && <span className="text-emerald-600">({selectedColors.length})</span>}
                  </span>
                  {selectedColors.length > 0 && (
                    <button type="button" onClick={() => setSelectedColors([])} className="text-[11px] font-semibold text-emerald-600 hover:underline">Clear</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {COLOR_OPTIONS.map((c) => {
                    const active = selectedColors.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleMultiSelect(c, selectedColors, setSelectedColors)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all ${
                          active
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-500 font-semibold shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded flex items-center justify-center text-[9px] border ${active ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {active && '✓'}
                        </span>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Clarity Multi-Select */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Clarity {selectedClarities.length > 0 && <span className="text-emerald-600">({selectedClarities.length})</span>}
                  </span>
                  {selectedClarities.length > 0 && (
                    <button type="button" onClick={() => setSelectedClarities([])} className="text-[11px] font-semibold text-emerald-600 hover:underline">Clear</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {CLARITY_OPTIONS.map((cl) => {
                    const active = selectedClarities.includes(cl);
                    return (
                      <button
                        key={cl}
                        type="button"
                        onClick={() => toggleMultiSelect(cl, selectedClarities, setSelectedClarities)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all ${
                          active
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-500 font-semibold shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded flex items-center justify-center text-[9px] border ${active ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {active && '✓'}
                        </span>
                        {cl}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cut Multi-Select */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Cut {selectedCuts.length > 0 && <span className="text-emerald-600">({selectedCuts.length})</span>}
                  </span>
                  {selectedCuts.length > 0 && (
                    <button type="button" onClick={() => setSelectedCuts([])} className="text-[11px] font-semibold text-emerald-600 hover:underline">Clear</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {CUT_OPTIONS.map((ct) => {
                    const active = selectedCuts.includes(ct);
                    return (
                      <button
                        key={ct}
                        type="button"
                        onClick={() => toggleMultiSelect(ct, selectedCuts, setSelectedCuts)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all ${
                          active
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-500 font-semibold shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded flex items-center justify-center text-[9px] border ${active ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {active && '✓'}
                        </span>
                        {ct}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Symmetry Multi-Select */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Symmetry {selectedSymmetries.length > 0 && <span className="text-emerald-600">({selectedSymmetries.length})</span>}
                  </span>
                  {selectedSymmetries.length > 0 && (
                    <button type="button" onClick={() => setSelectedSymmetries([])} className="text-[11px] font-semibold text-emerald-600 hover:underline">Clear</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {SYMMETRY_OPTIONS.map((sym) => {
                    const active = selectedSymmetries.includes(sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => toggleMultiSelect(sym, selectedSymmetries, setSelectedSymmetries)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all ${
                          active
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-500 font-semibold shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded flex items-center justify-center text-[9px] border ${active ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {active && '✓'}
                        </span>
                        {sym}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Polish Multi-Select */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Polish {selectedPolishes.length > 0 && <span className="text-emerald-600">({selectedPolishes.length})</span>}
                  </span>
                  {selectedPolishes.length > 0 && (
                    <button type="button" onClick={() => setSelectedPolishes([])} className="text-[11px] font-semibold text-emerald-600 hover:underline">Clear</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {POLISH_OPTIONS.map((p) => {
                    const active = selectedPolishes.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggleMultiSelect(p, selectedPolishes, setSelectedPolishes)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all ${
                          active
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-500 font-semibold shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded flex items-center justify-center text-[9px] border ${active ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {active && '✓'}
                        </span>
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Payment Due & Aging Filter */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[18px] text-amber-600">payments</span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Payment Due & Aging Filter
              </h4>
              <span className="text-xs text-slate-400 font-normal">
                (Filter client balances to receive or vendor balances to pay across aging buckets)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-amber-50/40 p-3.5 rounded-xl border border-amber-100/80">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Payment Direction
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'All', label: 'All Directions' },
                    { id: 'RECEIVABLE', label: 'Clients Due (To Receive)' },
                    { id: 'PAYABLE', label: 'Vendors Due (To Pay)' },
                  ].map((dir) => (
                    <button
                      key={dir.id}
                      type="button"
                      onClick={() => setPaymentDirection(dir.id)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all text-center ${
                        paymentDirection === dir.id
                          ? 'bg-amber-100 text-amber-900 border-amber-400 shadow-2xs font-bold'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {dir.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Overdue Aging Period
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { id: 'All', label: 'Any Due' },
                    { id: '15', label: '> 15d' },
                    { id: '30', label: '> 30d' },
                    { id: '45', label: '> 45d' },
                    { id: '60', label: '> 60d' },
                  ].map((age) => (
                    <button
                      key={age.id}
                      type="button"
                      onClick={() => setAgingDays(age.id)}
                      className={`py-1.5 px-1 rounded-lg text-xs font-semibold border transition-all text-center ${
                        agingDays === age.id
                          ? 'bg-amber-100 text-amber-900 border-amber-400 shadow-2xs font-bold'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {age.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Ranges & Categories */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[18px] text-slate-500">category</span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Classification & Price / Weight Ranges
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="All">All Categories</option>
                  <option value="SINGLE">Single Stone</option>
                  <option value="PARCEL">Parcel / Mix</option>
                  <option value="ROUGH">Rough</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Transaction Type</label>
                <select
                  value={transactionType}
                  onChange={(e) => setTransactionType(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:ring-1 focus:ring-emerald-500"
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Location</label>
                <input
                  type="text"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  placeholder="e.g. Vault, Mumbai"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Carat Weight</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={minCarat}
                    onChange={(e) => setMinCarat(e.target.value)}
                    placeholder="Min"
                    className="w-1/2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm"
                  />
                  <span className="text-slate-400">–</span>
                  <input
                    type="number"
                    value={maxCarat}
                    onChange={(e) => setMaxCarat(e.target.value)}
                    placeholder="Max"
                    className="w-1/2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm"
                  />
                </div>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Price Range (₹)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="Min ₹"
                    className="w-1/2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm"
                  />
                  <span className="text-slate-400">–</span>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="Max ₹"
                    className="w-1/2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm"
                  />
                </div>
              </div>

              <div className="lg:col-span-2 flex items-center gap-4 pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasRepairs}
                    onChange={(e) => setHasRepairs(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-slate-700">Has Items in Repair</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasCertificates}
                    onChange={(e) => setHasCertificates(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-slate-700">Has Certified Items</span>
                </label>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                setSelectedShapes([]);
                setSelectedColors([]);
                setSelectedClarities([]);
                setSelectedCuts([]);
                setSelectedSymmetries([]);
                setSelectedPolishes([]);
                setPaymentDirection('All');
                setAgingDays('All');
                setLocationFilter('');
                setMinCarat('');
                setMaxCarat('');
                setMinPrice('');
                setMaxPrice('');
                setHasRepairs(false);
                setHasCertificates(false);
                setCategory('All');
                setTransactionType('All');
                setAppliedFilters({
                  minCarat: '', maxCarat: '', minPrice: '', maxPrice: '', locationFilter: '',
                  hasRepairs: false, hasCertificates: false, category: 'All', transactionType: 'All',
                  shape: 'All', color: 'All', clarity: 'All', cut: 'All', symmetry: 'All', polish: 'All',
                  paymentDirection: 'All', agingDays: 'All'
                });
              }}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Clear All Filters
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={applyAdvancedFilters}
                className="px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 shadow-sm transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">check</span>
                Apply Filters
              </button>
            </div>
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
        <EntityPreloader viewMode={viewMode} count={8} tableColumns={8} />
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
                        <p className="font-caption text-caption text-outline">{stock.reportGroup || 'PARCEL'}</p>
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
        onToggleArchive={async (stockToToggle) => {
          const isCurrentlyArchived = stockToToggle.status === 'ARCHIVED';
          await updateStock(stockToToggle.id, {
            ...stockToToggle,
            isActive: isCurrentlyArchived,
            status: isCurrentlyArchived ? 'ACTIVE' : 'ARCHIVED',
            version: stockToToggle.version || 1,
          });
        }}
      />

      {/* Dedicated Stock & Inventory Valuation Report Modal */}
      <EntityReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        entityType="STOCK"
        entityId={selectedStockForReport?.id}
        entityTitle={selectedStockForReport ? `Stock Valuation Report: ${selectedStockForReport.name}` : 'Comprehensive Inventory Valuation & Stock Master'}
      />
    </div>
  );
};
