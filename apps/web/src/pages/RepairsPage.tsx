import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { RepairModal } from '../domains/repairs/components/RepairModal';
import { PaymentSummaryBanner } from '../domains/common/components/PaymentSummaryBanner';
import { PageHeader } from '../domains/common/components/PageHeader';
import { EmptyState } from '../domains/common/components/EmptyState';
import { EntityPreloader } from '../domains/common/components/EntityPreloader';
import { ConfirmDialog } from '../domains/common/components/ConfirmDialog';
import { EntityActionDialog, EntityActionContext } from '../domains/common/components/EntityActionDialog';
import { TransactionModal } from '../domains/transactions/components/TransactionModal';
import { useEntityPage } from '../domains/common/hooks/useEntityPage';
import { formatCurrency } from '../utils/format';
import { useNavigate } from 'react-router-dom';
import { getFloralPalette } from '../utils/floralColors';
import { EntityReportModal } from '../components/reports/EntityReportModal';

export const RepairsPage: React.FC = () => {
  const [repairs, setRepairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState('All');
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const {
    viewMode,
    setViewMode,
    search,
    setSearch,
    showAdvanced,
    setShowAdvanced,
    deleteTargetId,
    setDeleteTargetId,
    actionContext,
    actionDialogOpen,
    txnModalOpen,
    txnDefaults,
    handleOpenActionDialog,
    handleCloseActionDialog,
    handleCloseTxnModal,
    handleOpenTxnModal,
  } = useEntityPage<{ stockId?: string; txnType?: string; repairId?: string }>();

  // Advanced backend filters
  const [minCost, setMinCost] = useState<string>('');
  const [maxCost, setMaxCost] = useState<string>('');
  const [category, setCategory] = useState<string>('All');
  const [shape, setShape] = useState<string>('All');
  const [color, setColor] = useState<string>('All');
  const [clarity, setClarity] = useState<string>('All');
  const [minCarat, setMinCarat] = useState<string>('');
  const [maxCarat, setMaxCarat] = useState<string>('');

  const [appliedFilters, setAppliedFilters] = useState({
    category: 'All',
    shape: 'All',
    color: 'All',
    clarity: 'All',
    minCarat: '',
    maxCarat: '',
    minCost: '',
    maxCost: '',
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRepair, setEditingRepair] = useState<any>(null);

  const fetchRepairs = async (filters = appliedFilters) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getRepairs(filters as any);
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

  const [stocksList, setStocksList] = useState<any[]>([]);

  useEffect(() => {
    api.getStocks().then((res: any) => {
      if (res.success && res.data) setStocksList(res.data);
    }).catch((err) => {
      console.error('Failed to load stocks for repairs:', err);
    });
  }, []);

  const getStockDisplayName = (r: any) => {
    if (r.stockName && r.stockName !== 'UNLINKED' && r.stockName !== 'Diamond Stock') return r.stockName;
    const sId = r.stockId || r.stockItemId || r.diamondItemId;
    if (sId) {
      const s = stocksList.find((st: any) => st.id === sId || st.stockCode === sId);
      if (s?.stockName || s?.name) return s.stockName || s.name;
    }
    return r.stockName || r.name || 'Diamond Stock';
  };

  const handleAdd = () => {
    setEditingRepair(null);
    setModalOpen(true);
  };

  const handleEdit = (repair: any) => {
    setEditingRepair(repair);
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await api.deleteRepair(deleteTargetId);
      setDeleteTargetId(null);
      fetchRepairs();
    } catch (err: any) {
      alert(err.message || 'Failed to delete repair record');
    }
  };

  const handleModalSubmit = async (data: any, id?: string) => {
    if (id) {
      await api.updateRepair(id, data);
    } else {
      await api.createRepair(data);
    }
    setModalOpen(false);
    fetchRepairs();
  };

  const filteredRepairs = repairs.filter((r) => {
    const normalizeStatus = (s: string) => (s || '').replace(/\s+/g, '_');
    if (filterStatus !== 'All' && normalizeStatus(r.status) !== normalizeStatus(filterStatus)) return false;
    if (search) {
      const q = search.toLowerCase();
      const nameMatch = (r.itemName || r.name || '').toLowerCase().includes(q);
      const stockMatch = (r.stockItemId || r.diamondItemId || '').toLowerCase().includes(q);
      const vendorMatch = (r.vendor || '').toLowerCase().includes(q);
      const typeMatch = (r.repairType || '').toLowerCase().includes(q);
      if (!nameMatch && !stockMatch && !vendorMatch && !typeMatch) return false;
    }
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/70';
      case 'IN PROGRESS':
        return 'bg-sky-50 text-sky-700 border-sky-200/70';
      case 'CANCELLED':
        return 'bg-rose-50 text-rose-700 border-rose-200/70';
      case 'PENDING':
      default:
        return 'bg-amber-50 text-amber-800 border-amber-200/70';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'check_circle';
      case 'IN PROGRESS':
        return 'sync';
      case 'CANCELLED':
        return 'cancel';
      case 'PENDING':
      default:
        return 'schedule';
    }
  };

  const handleRepairCardClick = (repair: any) => {
    const repairId = repair.repairId || repair.id;
    const stockCode = repair.stockItemId || repair.diamondItemId;
    const stockName = getStockDisplayName(repair);
    // Smart default: PENDING → REPAIR_OUT, IN PROGRESS/COMPLETED → REPAIR_IN
    const smartTxnType = ['IN_PROGRESS', 'COMPLETED'].includes(repair.repairStatus) ? 'REPAIR_IN' : 'REPAIR_OUT';
    
    handleOpenActionDialog(
      {
        entityType: 'REPAIR',
        title: repair.repairType,
        subtitle: `${stockName} • Cost: ${repair.repairCost || repair.estCost || repair.cost ? formatCurrency(repair.repairCost || repair.estCost || repair.cost) : '—'}`,
        icon: 'build',
        iconBg: 'bg-[#FFF8E1]',
        iconColor: 'text-[#F9A825]',
        status: repair.repairStatus,
        statusColor: getStatusColor(repair.repairStatus),
        stockItemId: stockCode,
        repairId: repairId,
        defaultTxnType: smartTxnType,
      },
      { stockId: stockCode, txnType: smartTxnType, repairId: repairId }
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-bright overflow-hidden">
      <PaymentSummaryBanner />

      <PageHeader
        title="Repairs & Processing"
        subtitle="Manage diamond cutting, polishing, chip repair, and workshop jobs."
        icon="build"
        badge={`${repairs.length} Total`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search repair, item, or vendor..."
        actionButton={{
          label: 'Add Repair',
          icon: 'add_circle',
          onClick: handleAdd,
        }}
        secondaryActions={
          <div className="flex items-center gap-xs">
            <button
              id="btn-repairs-report"
              onClick={() => setReportModalOpen(true)}
              className="flex items-center gap-xs px-md py-sm rounded-lg border border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high font-body-md font-semibold transition-colors"
              title="Generate Workshop Repairs & Polishing Report"
            >
              <span className="material-symbols-outlined text-[20px] text-indigo-600">summarize</span>
              Report
            </button>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`flex items-center gap-xs px-md py-sm rounded-lg border transition-colors font-body-md font-semibold ${
                showAdvanced
                  ? 'bg-primary-container border-primary-container text-on-primary-container'
                  : 'bg-surface-container-low border-outline-variant text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">tune</span>
              Filters
            </button>

            <div className="bg-surface-container-low rounded-lg p-xs flex border border-outline-variant">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-xs rounded transition-all ${
                  viewMode === 'grid'
                    ? 'bg-surface shadow-xs text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
                title="Grid View"
              >
                <span className="material-symbols-outlined text-[20px]">grid_view</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-xs rounded transition-all ${
                  viewMode === 'table'
                    ? 'bg-surface shadow-xs text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
                title="Table View"
              >
                <span className="material-symbols-outlined text-[20px]">table_rows</span>
              </button>
            </div>
          </div>
        }
      >
        {/* Status Filter Pills */}
        <div className="flex items-center gap-sm flex-wrap pt-xs">
          <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">
            Status:
          </span>
          {['All', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`inline-flex items-center px-sm py-[3px] rounded-full font-caption text-caption transition-all font-semibold ${
                filterStatus === st || (st === 'IN_PROGRESS' && filterStatus === 'IN PROGRESS')
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'
              }`}
            >
              {st === 'All' ? 'ALL REPAIRS' : st.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </PageHeader>

      {/* Advanced Filters Drawer */}
      {showAdvanced && (
        <div className="bg-surface-container-lowest border-b border-outline-variant p-md px-margin-page animate-fade-in shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
            <div>
              <label className="block font-caption text-caption font-bold text-on-surface-variant mb-xs uppercase">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-md py-sm border border-outline-variant rounded-lg bg-surface text-on-surface font-body-md"
              >
                <option value="All">All Categories</option>
                <option value="SINGLE">Single Stone</option>
                <option value="PARCEL">Parcel / Mix</option>
                <option value="ROUGH">Rough</option>
              </select>
            </div>

            <div>
              <label className="block font-caption text-caption font-bold text-on-surface-variant mb-xs uppercase">
                Shape
              </label>
              <select
                value={shape}
                onChange={(e) => setShape(e.target.value)}
                className="w-full px-md py-sm border border-outline-variant rounded-lg bg-surface text-on-surface font-body-md"
              >
                <option value="All">Any Shape</option>
                {['Round', 'Princess', 'Cushion', 'Emerald', 'Oval', 'Pear', 'Marquise'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-caption text-caption font-bold text-on-surface-variant mb-xs uppercase">
                Carat Range
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={minCarat}
                  onChange={(e) => setMinCarat(e.target.value)}
                  className="w-1/2 px-sm py-sm border border-outline-variant rounded-lg bg-surface text-on-surface"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={maxCarat}
                  onChange={(e) => setMaxCarat(e.target.value)}
                  className="w-1/2 px-sm py-sm border border-outline-variant rounded-lg bg-surface text-on-surface"
                />
              </div>
            </div>

            <div>
              <label className="block font-caption text-caption font-bold text-on-surface-variant mb-xs uppercase">
                Cost Range (₹)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={minCost}
                  onChange={(e) => setMinCost(e.target.value)}
                  className="w-1/2 px-sm py-sm border border-outline-variant rounded-lg bg-surface text-on-surface"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={maxCost}
                  onChange={(e) => setMaxCost(e.target.value)}
                  className="w-1/2 px-sm py-sm border border-outline-variant rounded-lg bg-surface text-on-surface"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-md gap-sm">
            <button
              onClick={() => {
                setMinCost('');
                setMaxCost('');
                setMinCarat('');
                setMaxCarat('');
                setCategory('All');
                setShape('All');
                setColor('All');
                setClarity('All');
                setAppliedFilters({
                  category: 'All',
                  shape: 'All',
                  color: 'All',
                  clarity: 'All',
                  minCarat: '',
                  maxCarat: '',
                  minCost: '',
                  maxCost: '',
                });
              }}
              className="px-md py-sm font-caption text-caption font-bold text-primary hover:bg-primary-container/10 rounded-lg transition-colors"
            >
              Reset Filters
            </button>
            <button
              onClick={() =>
                setAppliedFilters({
                  category,
                  shape,
                  color,
                  clarity,
                  minCarat,
                  maxCarat,
                  minCost,
                  maxCost,
                })
              }
              className="px-md py-sm bg-primary text-on-primary font-headline-sm rounded-lg hover:bg-surface-tint shadow-xs transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 p-margin-page overflow-y-auto bg-surface-bright">
        {loading ? (
          <EntityPreloader viewMode={viewMode} count={8} tableColumns={8} />
        ) : error ? (
          <div className="bg-error-container text-on-error-container p-md rounded-xl border border-error/20 flex items-center gap-sm">
            <span className="material-symbols-outlined text-error">error</span>
            <span>{error}</span>
          </div>
        ) : filteredRepairs.length === 0 ? (
          <EmptyState
            icon="construction"
            title="No Repairs Found"
            description={
              search || filterStatus !== 'All'
                ? 'No repair jobs matched your active filters. Try resetting the status or query.'
                : 'No items are currently out for polishing, recutting, or setting repair.'
            }
            actionLabel="Add Repair"
            onAction={handleAdd}
            secondaryActionLabel={search || filterStatus !== 'All' ? 'Clear Filters' : undefined}
            onSecondaryAction={() => {
              setSearch('');
              setFilterStatus('All');
            }}
          />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-lg pb-xl">
            {filteredRepairs.map((repair) => {
              const repairId = repair.repairId || repair.id;
              const stockDisplayName = getStockDisplayName(repair);
              const titleName = repair.itemName || repair.name || 'Diamond Item';
              const floral = getFloralPalette(repairId || titleName);

              return (
                <div
                  key={repairId}
                  className={`bg-white border-x border-b border-black/[0.08] ${floral.topBorder} border-t-[3.5px] rounded-xl overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-md transition-all cursor-pointer group relative h-full min-h-[230px]`}
                  onClick={() => handleRepairCardClick(repair)}
                >
                  {/* Header */}
                  <div className="p-4 border-b border-black/[0.06] bg-white flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-mono font-semibold text-slate-400 tracking-wider block mb-0.5 uppercase truncate" title={stockDisplayName}>
                        {stockDisplayName}
                      </span>
                      <h3 className={`text-sm font-bold text-slate-900 group-hover:${floral.accentText} transition-colors truncate leading-tight flex items-center gap-1.5`}>
                        {repair.weight && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 shrink-0">
                            <span className="material-symbols-outlined text-[11px]">diamond</span>
                            {repair.weight}ct
                          </span>
                        )}
                        <span className="truncate">{titleName}</span>
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px] text-slate-400">storefront</span>
                        <span>{repair.vendor || 'In-House Workshop'}</span>
                      </p>
                    </div>
                    <div
                      className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border shrink-0 ${getStatusColor(
                        repair.status
                      )}`}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {getStatusIcon(repair.status)}
                      </span>
                      {repair.status}
                    </div>
                  </div>

                  {/* Body KPI Grid */}
                  <div className="p-4 flex-1 grid grid-cols-2 gap-3 content-center bg-white text-xs">
                    <div>
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="material-symbols-outlined text-[14px] text-amber-500">handyman</span>
                        <span className="text-[11px] font-medium text-slate-400">Repair Type</span>
                      </div>
                      <p className="text-sm font-bold text-slate-800 truncate">{repair.repairType || 'Standard'}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="material-symbols-outlined text-[14px] text-sky-500">calendar_today</span>
                        <span className="text-[11px] font-medium text-slate-400">Due Date</span>
                      </div>
                      <p className="text-sm font-bold text-slate-800">
                        {repair.dueDate ? new Date(repair.dueDate).toLocaleDateString() : 'TBD'}
                      </p>
                    </div>
                    <div className="col-span-2 pt-2.5 mt-0.5 border-t border-black/[0.06] flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px] text-emerald-600">payments</span>
                        <span className="text-[11px] font-medium text-slate-400">Est. Repair Cost</span>
                      </div>
                      <p className={`text-base font-bold tabular-nums ${floral.accentText}`}>
                        {repair.estCost || repair.cost ? formatCurrency(repair.estCost || repair.cost) : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="px-4 py-2.5 bg-slate-50/70 border-t border-black/[0.06] flex justify-between items-center text-xs mt-auto">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white text-slate-700 text-[11px] font-medium border border-black/[0.06] shadow-2xs">
                      <span className="material-symbols-outlined text-[13px] text-slate-500">sync_alt</span>
                      <span>Restores: <strong className={floral.accentText}>{repair.restoresTo || 'ACTIVE'}</strong></span>
                    </span>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(repair);
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        title="Edit Repair"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTargetId(repairId);
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete Repair"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  <th className="px-lg py-md">Item / Job</th>
                  <th className="px-lg py-md">Type</th>
                  <th className="px-lg py-md">Workshop</th>
                  <th className="px-lg py-md">Status</th>
                  <th className="px-lg py-md text-right">Est. Cost</th>
                  <th className="px-lg py-md text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant font-body-md text-on-surface">
                {filteredRepairs.map((repair) => {
                  const repairId = repair.repairId || repair.id;
                  const stockDisplayName = getStockDisplayName(repair);

                  return (
                    <tr
                      key={repairId}
                      className="hover:bg-surface-container-lowest transition-colors cursor-pointer"
                      onClick={() => handleRepairCardClick(repair)}
                    >
                      <td className="px-lg py-md">
                        <div className="font-semibold text-on-surface">{repair.itemName || repair.name || 'Repair Job'}</div>
                        <div className="text-xs text-slate-500 font-medium">{stockDisplayName}</div>
                      </td>
                      <td className="px-lg py-md font-medium text-sm">{repair.repairType || 'Standard'}</td>
                      <td className="px-lg py-md text-sm">{repair.vendor || 'In-House'}</td>
                      <td className="px-lg py-md">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusColor(
                            repair.status
                          )}`}
                        >
                          <span className="material-symbols-outlined text-[12px]">
                            {getStatusIcon(repair.status)}
                          </span>
                          {repair.status}
                        </span>
                      </td>
                      <td className="px-lg py-md text-right font-bold tabular-nums">
                        {repair.estCost || repair.cost ? formatCurrency(repair.estCost || repair.cost) : '—'}
                      </td>
                      <td className="px-lg py-md text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleEdit(repair)}
                            className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                            title="Edit"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTargetId(repairId)}
                            className="p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors"
                            title="Delete"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RepairModal
        open={modalOpen}
        repair={editingRepair}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
      />

      <ConfirmDialog
        open={!!deleteTargetId}
        title="Delete Repair Record"
        message="Are you sure you want to delete this repair record? The associated stock item will not be deleted."
        danger
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTargetId(null)}
      />

      <EntityActionDialog
        open={actionDialogOpen}
        context={actionContext}
        onClose={handleCloseActionDialog}
        onEdit={() => {
          const repair = repairs.find(r => (r.repairId || r.id) === actionContext?.repairId);
          if (repair) handleEdit(repair);
        }}
        onAddTransaction={handleOpenTxnModal}
      />

      <TransactionModal
        open={txnModalOpen}
        stockId={txnDefaults.stockId || null}
        defaultTxnType={txnDefaults.txnType}
        defaultRepairId={txnDefaults.repairId}
        onClose={handleCloseTxnModal}
        onSubmit={async () => {
          handleCloseTxnModal();
          fetchRepairs();
        }}
      />

      {/* Dedicated Workshop Repairs Report Modal */}
      <EntityReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        entityType="REPAIR"
        entityTitle="Workshop Repairs & Polishing Register"
      />
    </div>
  );
};
