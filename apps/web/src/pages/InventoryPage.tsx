import React, { useState, useMemo, useEffect } from 'react';
import { StockItem, CreateStockDTO, UpdateStockDTO } from '../types/stock';
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
import { InventoryFilterDrawer } from '../domains/inventory/components/InventoryFilterDrawer';

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

  const handleResetAllFilters = () => {
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
      <InventoryFilterDrawer
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
        activeFilterCount={activeFilterCount}
        selectedShapes={selectedShapes}
        setSelectedShapes={setSelectedShapes}
        selectedColors={selectedColors}
        setSelectedColors={setSelectedColors}
        selectedClarities={selectedClarities}
        setSelectedClarities={setSelectedClarities}
        selectedCuts={selectedCuts}
        setSelectedCuts={setSelectedCuts}
        selectedSymmetries={selectedSymmetries}
        setSelectedSymmetries={setSelectedSymmetries}
        selectedPolishes={selectedPolishes}
        setSelectedPolishes={setSelectedPolishes}
        paymentDirection={paymentDirection}
        setPaymentDirection={setPaymentDirection}
        agingDays={agingDays}
        setAgingDays={setAgingDays}
        locationFilter={locationFilter}
        setLocationFilter={setLocationFilter}
        minCarat={minCarat}
        setMinCarat={setMinCarat}
        maxCarat={maxCarat}
        setMaxCarat={setMaxCarat}
        minPrice={minPrice}
        setMinPrice={setMinPrice}
        maxPrice={maxPrice}
        setMaxPrice={setMaxPrice}
        hasRepairs={hasRepairs}
        setHasRepairs={setHasRepairs}
        hasCertificates={hasCertificates}
        setHasCertificates={setHasCertificates}
        category={category}
        setCategory={setCategory}
        transactionType={transactionType}
        setTransactionType={setTransactionType}
        onResetAll={handleResetAllFilters}
        onApply={applyAdvancedFilters}
        toggleMultiSelect={toggleMultiSelect}
      />

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
