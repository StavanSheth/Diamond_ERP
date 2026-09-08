import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { AddCertificateModal } from '../domains/certificates/components/AddCertificateModal';
import { EditCertificateModal } from '../domains/certificates/components/EditCertificateModal';
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

export const CertificatesPage: React.FC = () => {
  const [certificates, setCertificates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editCertificate, setEditCertificate] = useState<any | null>(null);
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
  } = useEntityPage<{ stockId?: string; txnType?: string; certificateId?: string }>();

  // Filters
  const [labFilter, setLabFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [minCost, setMinCost] = useState<string>('');
  const [maxCost, setMaxCost] = useState<string>('');

  const navigate = useNavigate();

  const fetchCertificates = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getCertificates();
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
    fetchCertificates();
  }, []);

  const [stocksList, setStocksList] = useState<any[]>([]);

  useEffect(() => {
    api.getStocks().then((res: any) => {
      if (res.success && res.data) setStocksList(res.data);
    }).catch((err) => {
      console.error('Failed to load stocks for certificates:', err);
    });
  }, []);

  const getStockDisplayName = (c: any) => {
    if (c.stockName && c.stockName !== 'Standalone' && c.stockName !== 'Diamond Stock') return c.stockName;
    const sId = c.stockId || c.stockItemId || c.diamondItemId;
    if (sId) {
      const s = stocksList.find((st: any) => st.id === sId || st.stockCode === sId);
      if (s?.stockName || s?.name) return s.stockName || s.name;
    }
    return c.stockName || (c.stockItemId ? 'Diamond Stock' : 'Standalone');
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await api.deleteCertificate(deleteTargetId);
      setDeleteTargetId(null);
      fetchCertificates();
    } catch (err: any) {
      alert(err.message || 'Failed to delete certificate');
    }
  };

  const filteredCertificates = certificates.filter((cert) => {
    if (labFilter !== 'All' && cert.labType !== labFilter) return false;
    if (statusFilter !== 'All' && cert.certificateStatus !== statusFilter) return false;

    if (search) {
      const q = search.toLowerCase();
      const reportMatch = (cert.reportNumber || '').toLowerCase().includes(q);
      const stockDisplayName = getStockDisplayName(cert);
      const stockMatch = stockDisplayName.toLowerCase().includes(q) || (cert.stockItemId || cert.diamondItemId || '').toLowerCase().includes(q);
      const nameMatch = (cert.itemName || cert.name || '').toLowerCase().includes(q);
      const labMatch = (cert.labType || '').toLowerCase().includes(q);
      if (!reportMatch && !stockMatch && !nameMatch && !labMatch) return false;
    }

    const cost = cert.cost || 0;
    if (minCost !== '' && cost < parseFloat(minCost)) return false;
    if (maxCost !== '' && cost > parseFloat(maxCost)) return false;

    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ISSUED':
      case 'RECEIVED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/70';
      case 'SUBMITTED':
      case 'PENDING':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200/70';
      case 'REJECTED':
      case 'CANCELLED':
        return 'bg-rose-50 text-rose-700 border-rose-200/70';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200/70';
    }
  };

  const handleCertCardClick = (cert: any) => {
    const certId = cert.certificateId || cert.id;
    const stockCode = cert.stockItemId || cert.diamondItemId;
    const stockDisplayName = getStockDisplayName(cert);
    // Smart default: PENDING/SUBMITTED → CERTIFICATION (send out), ISSUED/RECEIVED → CERTIFICATION_IN (receive back)
    const smartTxnType = ['ISSUED', 'RECEIVED'].includes(cert.certificateStatus) ? 'CERTIFICATION_IN' : 'CERTIFICATION';
    
    handleOpenActionDialog(
      {
        entityType: 'CERTIFICATE',
        title: `${cert.labType || 'LAB'} — ${cert.reportNumber || 'No Report #'}`,
        subtitle: `${stockDisplayName} • Cost: ${cert.cost ? formatCurrency(cert.cost) : '—'}`,
        icon: 'verified',
        iconBg: 'bg-[#EDE7F6]',
        iconColor: 'text-[#4527A0]',
        status: cert.certificateStatus || 'REGISTERED',
        statusColor: getStatusColor(cert.certificateStatus),
        stockItemId: stockCode,
        certificateId: certId,
        defaultTxnType: smartTxnType,
      },
      { stockId: stockCode, txnType: smartTxnType, certificateId: certId }
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-bright overflow-hidden">
      <PaymentSummaryBanner />

      <PageHeader
        title="Certificates Registry"
        subtitle="Manage grading dossiers, lab certificates (GIA, IGI, HRD), and document uploads."
        icon="verified"
        badge={`${certificates.length} Registered`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search report #, stone, or lab..."
        actionButton={{
          label: 'Add Certificate',
          icon: 'add_circle',
          onClick: () => setAddModalOpen(true),
        }}
        secondaryActions={
          <div className="flex items-center gap-xs">
            <button
              id="btn-certificates-report"
              onClick={() => setReportModalOpen(true)}
              className="flex items-center gap-xs px-md py-sm rounded-lg border border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high font-body-md font-semibold transition-colors"
              title="Generate Lab Certification Report"
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
        {/* Lab Filter Pills */}
        <div className="flex items-center gap-sm flex-wrap pt-xs">
          <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">
            Lab:
          </span>
          {['All', 'GIA', 'IGI', 'HRD', 'AGS', 'EGL'].map((lab) => (
            <button
              key={lab}
              onClick={() => setLabFilter(lab)}
              className={`inline-flex items-center px-sm py-[3px] rounded-full font-caption text-caption transition-all font-semibold ${
                labFilter === lab
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'
              }`}
            >
              {lab === 'All' ? 'ALL LABS' : lab}
            </button>
          ))}
        </div>
      </PageHeader>

      {/* Advanced Filters Drawer */}
      {showAdvanced && (
        <div className="bg-surface-container-lowest border-b border-outline-variant p-md px-margin-page animate-fade-in shrink-0">
          <div className="flex flex-wrap gap-md max-w-4xl items-center">
            <div className="flex-1 min-w-[200px]">
              <label className="block font-caption text-caption font-bold text-on-surface-variant mb-xs uppercase">
                Status Filter
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-md py-sm bg-surface border border-outline-variant rounded-lg text-on-surface font-body-md"
              >
                <option value="All">All Statuses</option>
                <option value="PENDING">PENDING</option>
                <option value="SUBMITTED">SUBMITTED</option>
                <option value="ISSUED">ISSUED</option>
                <option value="RECEIVED">RECEIVED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block font-caption text-caption font-bold text-on-surface-variant mb-xs uppercase">
                Min Cost (₹)
              </label>
              <input
                type="number"
                value={minCost}
                onChange={(e) => setMinCost(e.target.value)}
                placeholder="Min ₹"
                className="w-full px-md py-sm bg-surface border border-outline-variant rounded-lg text-on-surface font-body-md"
              />
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block font-caption text-caption font-bold text-on-surface-variant mb-xs uppercase">
                Max Cost (₹)
              </label>
              <input
                type="number"
                value={maxCost}
                onChange={(e) => setMaxCost(e.target.value)}
                placeholder="Max ₹"
                className="w-full px-md py-sm bg-surface border border-outline-variant rounded-lg text-on-surface font-body-md"
              />
            </div>

            <div className="flex items-end self-end pb-1">
              <button
                type="button"
                onClick={() => {
                  setLabFilter('All');
                  setStatusFilter('All');
                  setMinCost('');
                  setMaxCost('');
                }}
                className="px-md py-sm font-caption text-caption font-bold text-primary hover:bg-primary-container/10 rounded-lg transition-colors"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 p-margin-page overflow-y-auto bg-surface-bright">
        {loading ? (
          <EntityPreloader viewMode={viewMode} count={8} tableColumns={8} />
        ) : error ? (
          <div className="bg-error-container text-on-error-container p-md rounded-xl border border-error/20 flex items-center gap-sm">
            <span className="material-symbols-outlined text-error">error</span>
            <span>{error}</span>
          </div>
        ) : filteredCertificates.length === 0 ? (
          <EmptyState
            icon="workspace_premium"
            title="No Certificates Found"
            description={
              search || labFilter !== 'All' || statusFilter !== 'All'
                ? "No certificates match the selected parameters. Try resetting your lab or status filter."
                : "No certificates are registered. Add your first certificate or link one to existing stock items."
            }
            actionLabel="Add Certificate"
            onAction={() => setAddModalOpen(true)}
            secondaryActionLabel={
              search || labFilter !== 'All' || statusFilter !== 'All' ? 'Clear Filters' : undefined
            }
            onSecondaryAction={() => {
              setSearch('');
              setLabFilter('All');
              setStatusFilter('All');
              setMinCost('');
              setMaxCost('');
            }}
          />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-lg pb-xl">
            {filteredCertificates.map((cert) => {
              const certId = cert.certificateId || cert.id;
              const isUnlinked = !cert.stockItemId && !cert.diamondItemId;
              const stockDisplayName = getStockDisplayName(cert);
              const floral = getFloralPalette(certId || cert.reportNumber || cert.name);

              return (
                <div
                  key={certId}
                  onClick={() => handleCertCardClick(cert)}
                  className={`bg-white rounded-xl flex flex-col justify-between shadow-xs hover:shadow-md transition-all group relative border-x border-b border-black/[0.08] ${floral.topBorder} border-t-[3.5px] overflow-hidden ${
                    isUnlinked ? 'border-dashed' : 'cursor-pointer'
                  } h-full min-h-[230px]`}
                >
                  {/* Header */}
                  <div className="p-4 border-b border-black/[0.06] bg-white flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-mono font-semibold text-slate-400 tracking-wider block mb-0.5 uppercase truncate" title={stockDisplayName}>
                        {stockDisplayName}
                      </span>
                      <h3 className={`text-sm font-bold text-slate-900 group-hover:${floral.accentText} transition-colors truncate leading-tight`}>
                        {cert.reportNumber || 'NO REPORT #'}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px] text-purple-500">diamond</span>
                        <span>{cert.itemName || cert.name || 'Stone Item'}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border tracking-wider flex items-center gap-1 ${floral.badgeBg}`}>
                        <span className="material-symbols-outlined text-[13px]">verified</span>
                        {cert.labType || 'LAB'}
                      </span>
                      {cert.pdfPath && (
                        <a
                          href={cert.pdfPath.startsWith('http') ? cert.pdfPath : `http://localhost:3002${cert.pdfPath}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Open Certificate PDF"
                        >
                          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Body KPI Grid */}
                  <div className="p-4 flex-1 grid grid-cols-2 gap-3 content-center bg-white text-xs">
                    <div>
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="material-symbols-outlined text-[14px] text-indigo-500">inventory_2</span>
                        <span className="text-[11px] font-medium text-slate-400">Stock Name</span>
                      </div>
                      <p className="text-sm font-bold text-slate-800 truncate" title={stockDisplayName}>
                        {stockDisplayName}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="material-symbols-outlined text-[14px] text-amber-500">stars</span>
                        <span className="text-[11px] font-medium text-slate-400">Polish / Sym</span>
                      </div>
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {cert.polish || '—'} / {cert.symmetry || '—'}
                      </p>
                    </div>
                    <div className="col-span-2 pt-2.5 mt-0.5 border-t border-black/[0.06] flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px] text-emerald-600">payments</span>
                        <span className="text-[11px] font-medium text-slate-400">Testing Fee / Cost</span>
                      </div>
                      <p className={`text-base font-bold tabular-nums ${floral.accentText}`}>
                        {cert.cost ? formatCurrency(cert.cost) : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="px-4 py-2.5 bg-slate-50/70 border-t border-black/[0.06] flex justify-between items-center text-xs mt-auto">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${getStatusColor(
                        cert.certificateStatus
                      )}`}
                    >
                      <span className="material-symbols-outlined text-[12px]">verified</span>
                      {cert.certificateStatus || 'REGISTERED'}
                    </span>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditCertificate(cert);
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Edit Certificate"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTargetId(certId);
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete Certificate"
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
                  <th className="px-lg py-md">Lab & Report</th>
                  <th className="px-lg py-md">Linked Stock</th>
                  <th className="px-lg py-md">Grading Specs</th>
                  <th className="px-lg py-md">Status</th>
                  <th className="px-lg py-md text-right">Cost</th>
                  <th className="px-lg py-md text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant font-body-md text-on-surface">
                {filteredCertificates.map((cert) => {
                  const certId = cert.certificateId || cert.id;
                  const stockDisplayName = getStockDisplayName(cert);

                  return (
                    <tr
                      key={certId}
                      className="hover:bg-surface-container-lowest transition-colors cursor-pointer"
                      onClick={() => handleCertCardClick(cert)}
                    >
                      <td className="px-lg py-md">
                        <div className="flex items-center gap-sm">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary-container text-on-primary-container">
                            {cert.labType || 'LAB'}
                          </span>
                          <span className="font-mono font-bold">{cert.reportNumber || '—'}</span>
                        </div>
                      </td>
                      <td className="px-lg py-md text-sm">
                        {cert.stockItemId || cert.diamondItemId ? (
                          <div>
                            <p className="font-semibold text-on-surface">{cert.itemName || cert.name || 'Stone'}</p>
                            <p className="text-xs text-slate-500 font-medium">{stockDisplayName}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-outline italic">Standalone / Unlinked</span>
                        )}
                      </td>
                      <td className="px-lg py-md text-xs text-on-surface-variant">
                        <div>
                          {cert.polish || '—'} / {cert.symmetry || '—'} • {cert.fluorescence || 'None'}
                        </div>
                        <div className="text-outline">{cert.measurements || ''}</div>
                      </td>
                      <td className="px-lg py-md">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${getStatusColor(
                            cert.certificateStatus
                          )}`}
                        >
                          {cert.certificateStatus || 'REGISTERED'}
                        </span>
                      </td>
                      <td className="px-lg py-md text-right font-bold tabular-nums">
                        {cert.cost ? formatCurrency(cert.cost) : '—'}
                      </td>
                      <td className="px-lg py-md text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {cert.pdfPath && (
                            <a
                              href={cert.pdfPath}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                              title="View PDF"
                            >
                              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditCertificate(cert)}
                            className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                            title="Edit"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTargetId(certId)}
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

      <AddCertificateModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={fetchCertificates}
      />

      <EditCertificateModal
        open={!!editCertificate}
        certificate={editCertificate}
        onClose={() => setEditCertificate(null)}
        onSuccess={fetchCertificates}
      />

      <ConfirmDialog
        open={!!deleteTargetId}
        title="Delete Certificate"
        message="Are you sure you want to delete this certificate report? The diamond item will remain in inventory."
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
          const cert = certificates.find(c => (c.certificateId || c.id) === actionContext?.certificateId);
          if (cert) {
            setEditCertificate(cert);
          }
        }}
        onAddTransaction={handleOpenTxnModal}
      />

      <TransactionModal
        open={txnModalOpen}
        stockId={txnDefaults.stockId || null}
        defaultTxnType={txnDefaults.txnType}
        defaultCertificateId={txnDefaults.certificateId}
        onClose={handleCloseTxnModal}
        onSubmit={async () => {
          handleCloseTxnModal();
          fetchCertificates();
        }}
      />

      {/* Dedicated Lab Certification Report Modal */}
      <EntityReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        entityType="CERTIFICATE"
        entityTitle="Lab Certification Pipeline Register"
      />
    </div>
  );
};
