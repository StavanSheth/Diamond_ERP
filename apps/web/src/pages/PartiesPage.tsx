import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { PartyModal } from '../domains/parties/components/PartyModal';
import { useNavigate } from 'react-router-dom';
import { PaymentSummaryBanner } from '../domains/common/components/PaymentSummaryBanner';
import { PageHeader } from '../domains/common/components/PageHeader';
import { EmptyState } from '../domains/common/components/EmptyState';
import { EntityPreloader } from '../domains/common/components/EntityPreloader';
import { ConfirmDialog } from '../domains/common/components/ConfirmDialog';
import { EntityActionDialog, EntityActionContext } from '../domains/common/components/EntityActionDialog';
import { TransactionModal } from '../domains/transactions/components/TransactionModal';
import { useEntityPage } from '../domains/common/hooks/useEntityPage';
import { formatCurrency } from '../utils/format';
import { PARTY_TYPES, getPartyTypeConfig, isBrokerType } from '../domains/parties/types/partyTypes';
import { EntityReportModal } from '../components/reports/EntityReportModal';

export const PartiesPage: React.FC = () => {
  const navigate = useNavigate();
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<any>(null);

  // Dedicated Party Report Modal
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedPartyForReport, setSelectedPartyForReport] = useState<any>(null);

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
  } = useEntityPage<{ partyId?: string }>();

  // Custom View State
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('All');
  const [minBalance, setMinBalance] = useState<string>('');
  const [maxBalance, setMaxBalance] = useState<string>('');

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

  const fetchParties = async () => {
    try {
      setLoading(true);
      setError(null);
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

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await api.deleteParty(deleteTargetId);
      setDeleteTargetId(null);
      fetchParties();
    } catch (err: any) {
      alert(err.message || 'Failed to delete party');
    }
  };

  const handleModalSubmit = async (data: any, id?: string) => {
    if (id) {
      await api.updateParty(id, data);
    } else {
      await api.createParty(data);
    }
    setModalOpen(false);
    fetchParties();
  };

  const filteredParties = parties.filter((p) => {
    const pName = p.partyName || p.name || '';
    const pId = p.partyId || p.id || '';
    const pType = p.type || p.partyType || '';
    
    if (selectedTypeFilter !== 'All' && pType !== selectedTypeFilter) return false;

    const matchesSearch =
      !search ||
      pName.toLowerCase().includes(search.toLowerCase()) ||
      pId.toLowerCase().includes(search.toLowerCase());

    const bal = p.outstandingBalance || 0;
    const meetsMin = minBalance === '' || bal >= parseFloat(minBalance);
    const meetsMax = maxBalance === '' || bal <= parseFloat(maxBalance);

    return matchesSearch && meetsMin && meetsMax;
  });

  const partyTypeOptions = ['All', 'CUSTOMER', 'SUPPLIER', 'BROKER', 'BROKER_CLIENT', 'WORKSHOP', 'CERTIFICATION_LAB', 'OTHER'];

  const handlePartyCardClick = (party: any) => {
    handleOpenActionDialog(
      {
        entityType: 'PARTY',
        title: party.partyName,
        subtitle: `${party.type || 'Unknown Type'} • Balance: ${formatCurrency(party.outstandingBalance || 0)}`,
        icon: 'storefront',
        iconBg: 'bg-[#E1F5FE]',
        iconColor: 'text-[#0277BD]',
        partyId: party.partyId,
      },
      { partyId: party.partyId }
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-bright overflow-hidden">
      <PaymentSummaryBanner />

      <PageHeader
        title="Parties & Entities"
        subtitle="Manage customers, suppliers, brokers, cutting workshops, and testing laboratories."
        icon="domain"
        badge={`${parties.length} Total`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search party name or ID..."
        actionButton={{
          label: 'Add Party',
          icon: 'person_add',
          onClick: handleAdd,
        }}
        secondaryActions={
          <div className="flex items-center gap-xs">
            <button
              id="btn-parties-report"
              onClick={() => {
                setSelectedPartyForReport(null);
                setReportModalOpen(true);
              }}
              className="flex items-center gap-xs px-md py-sm rounded-lg border border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high font-body-md font-semibold transition-colors"
              title="Generate Parties & Ledger Report"
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
        {/* Type Filter Pills */}
        <div className="flex items-center gap-sm flex-wrap pt-xs">
          <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">
            Type:
          </span>
          {partyTypeOptions.map((type) => {
            const cfg = type === 'All' ? null : getPartyTypeConfig(type);
            return (
              <button
                key={type}
                onClick={() => setSelectedTypeFilter(type)}
                className={`inline-flex items-center gap-1 px-sm py-[3px] rounded-full font-caption text-caption transition-all font-semibold ${
                  selectedTypeFilter === type
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'
                }`}
              >
                {cfg && <span className="material-symbols-outlined text-[13px]">{cfg.icon}</span>}
                {type === 'All' ? 'ALL PARTIES' : cfg?.badgeText || type}
              </button>
            );
          })}
        </div>
      </PageHeader>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="bg-surface-container-lowest border-b border-outline-variant p-md px-margin-page animate-fade-in shrink-0">
          <div className="flex flex-wrap gap-md max-w-4xl items-center">
            <div className="flex-1 min-w-[240px]">
              <label className="block font-caption text-caption font-bold text-on-surface-variant mb-xs uppercase">
                Min Balance (₹)
              </label>
              <input
                type="number"
                value={minBalance}
                onChange={(e) => setMinBalance(e.target.value)}
                placeholder="Min ₹"
                className="w-full px-md py-sm bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
              />
            </div>
            <div className="flex-1 min-w-[240px]">
              <label className="block font-caption text-caption font-bold text-on-surface-variant mb-xs uppercase">
                Max Balance (₹)
              </label>
              <input
                type="number"
                value={maxBalance}
                onChange={(e) => setMaxBalance(e.target.value)}
                placeholder="Max ₹"
                className="w-full px-md py-sm bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
              />
            </div>
            <div className="flex items-end self-end pb-1">
              <button
                type="button"
                onClick={() => {
                  setMinBalance('');
                  setMaxBalance('');
                }}
                className="px-md py-sm text-primary font-caption text-caption font-bold hover:bg-primary-container/10 rounded-lg transition-colors"
              >
                Reset Balance Filter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 p-margin-page overflow-y-auto bg-surface-bright">
        {loading ? (
          <EntityPreloader viewMode={viewMode} count={8} tableColumns={7} />
        ) : error ? (
          <div className="bg-error-container text-on-error-container p-md rounded-xl border border-error/20 flex items-center gap-sm">
            <span className="material-symbols-outlined text-error">error</span>
            <span>{error}</span>
          </div>
        ) : filteredParties.length === 0 ? (
          <EmptyState
            icon="group_off"
            title="No Parties Found"
            description={
              search || minBalance || maxBalance || selectedTypeFilter !== 'All'
                ? "No party records match the specified filters. Try clearing your search or filters."
                : "No parties or counterparties registered yet. Create your first customer, supplier, or workshop."
            }
            actionLabel="Add Party"
            onAction={handleAdd}
            secondaryActionLabel={
              search || minBalance || maxBalance || selectedTypeFilter !== 'All' ? 'Clear Filters' : undefined
            }
            onSecondaryAction={() => {
              setSearch('');
              setMinBalance('');
              setMaxBalance('');
              setSelectedTypeFilter('All');
            }}
          />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-lg pb-xl">
            {filteredParties.map((party) => {
              const partyId = party.partyId || party.id;
              const partyName = party.partyName || party.name || 'Unnamed Party';
              const pType = party.type || party.partyType || 'CUSTOMER';
              const balance = party.outstandingBalance || 0;

              return (
                <div
                  key={partyId}
                  className={`bg-surface border rounded-2xl p-lg flex flex-col justify-between shadow-xs hover:border-primary hover:shadow-md transition-all cursor-pointer relative group ${
                    balance > 0
                      ? pType === 'SUPPLIER'
                        ? 'border-[#388E3C]/30'
                        : 'border-[#D32F2F]/30'
                      : 'border-outline-variant'
                  }`}
                  onClick={() => handlePartyCardClick(party)}
                >
                  {party.notes && (
                    <div className="absolute top-0 right-0 bg-[#FFF8E1] text-[#F9A825] px-sm py-xs text-[11px] font-bold rounded-bl-xl rounded-tr-2xl flex items-center gap-1 border-l border-b border-[#F9A825]/20">
                      <span className="material-symbols-outlined text-[14px]">warning</span>
                      <span className="truncate max-w-[120px]">{party.notes}</span>
                    </div>
                  )}

                  <div>
                    {/* Avatar & Name */}
                    <div className="flex items-start gap-md mb-md">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center font-headline-sm font-bold shrink-0 shadow-xs border border-outline-variant/30"
                        style={{
                          backgroundColor: getAvatarColor(partyName),
                          color: getAvatarTextColor(partyName),
                        }}
                      >
                        {partyName.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0 pr-6">
                        <h3 className="font-title-md font-bold text-on-surface truncate" title={partyName}>
                          {partyName}
                        </h3>
                        {(() => {
                          const cfg = getPartyTypeConfig(pType);
                          return (
                            <div className="flex items-center gap-1 flex-wrap mt-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${cfg.badgeClass}`}>
                                <span className="material-symbols-outlined text-[12px]">{cfg.icon}</span>
                                {cfg.badgeText}
                              </span>
                              {party.brokeragePercentage > 0 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  Comm: {party.brokeragePercentage}%
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Contact details */}
                    {(party.phone || party.email) && (
                      <div className="flex flex-col gap-1 text-xs text-on-surface-variant mb-md">
                        {party.phone && (
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px] text-outline">call</span>
                            <span>{party.phone}</span>
                          </div>
                        )}
                        {party.email && (
                          <div className="flex items-center gap-1 truncate">
                            <span className="material-symbols-outlined text-[14px] text-outline">mail</span>
                            <span className="truncate">{party.email}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Financial Footer */}
                  <div className="border-t border-outline-variant pt-md mt-auto">
                    <div className="flex items-baseline justify-between mb-sm">
                      <span className="font-caption text-caption text-on-surface-variant">Outstanding:</span>
                      <span
                        className={`font-title-md font-bold tabular-nums ${
                          balance > 0 ? (pType === 'SUPPLIER' ? 'text-[#388E3C]' : 'text-[#D32F2F]') : 'text-on-surface'
                        }`}
                      >
                        {formatCurrency(balance)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-xs">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/ledger?party=${partyId}`);
                          }}
                          className="text-xs font-bold text-primary hover:underline flex items-center gap-0.5"
                        >
                          <span>Ledger</span>
                          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPartyForReport(party);
                            setReportModalOpen(true);
                          }}
                          className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-0.5"
                          title="View Statement of Account & Ledger Report"
                        >
                          <span className="material-symbols-outlined text-[14px]">summarize</span>
                          <span>Report</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(party);
                          }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                          title="Edit Party"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTargetId(partyId);
                          }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors"
                          title="Delete Party"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
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
                  <th className="px-lg py-md">Party</th>
                  <th className="px-lg py-md">Type</th>
                  <th className="px-lg py-md">Contact</th>
                  <th className="px-lg py-md text-right">Balance</th>
                  <th className="px-lg py-md text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant font-body-md text-on-surface">
                {filteredParties.map((party) => {
                  const partyId = party.partyId || party.id;
                  const partyName = party.partyName || party.name || 'Unnamed Party';
                  const pType = party.type || party.partyType || 'CUSTOMER';
                  const balance = party.outstandingBalance || 0;

                  return (
                    <tr
                      key={partyId}
                      className="hover:bg-surface-container-lowest transition-colors cursor-pointer"
                      onClick={() => handlePartyCardClick(party)}
                    >
                      <td className="px-lg py-md font-semibold text-on-surface flex items-center gap-md">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0"
                          style={{
                            backgroundColor: getAvatarColor(partyName),
                            color: getAvatarTextColor(partyName),
                          }}
                        >
                          {partyName.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold leading-tight">{partyName}</p>
                          <p className="text-xs text-outline font-mono">{partyId.substring(0, 8)}</p>
                        </div>
                      </td>
                      <td className="px-lg py-md">
                        {(() => {
                          const cfg = getPartyTypeConfig(pType);
                          return (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.badgeClass}`}>
                                <span className="material-symbols-outlined text-[12px]">{cfg.icon}</span>
                                {cfg.badgeText}
                              </span>
                              {party.brokeragePercentage > 0 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  {party.brokeragePercentage}%
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-lg py-md text-xs text-on-surface-variant">
                        <div>{party.phone || '—'}</div>
                        <div className="text-outline">{party.email || ''}</div>
                      </td>
                      <td className="px-lg py-md text-right font-bold tabular-nums">
                        <span
                          className={
                            balance > 0 ? (pType === 'SUPPLIER' ? 'text-[#388E3C]' : 'text-[#D32F2F]') : 'text-on-surface'
                          }
                        >
                          {formatCurrency(balance)}
                        </span>
                      </td>
                      <td className="px-lg py-md text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleEdit(party)}
                            className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                            title="Edit"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTargetId(partyId)}
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

      <PartyModal
        open={modalOpen}
        party={editingParty}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
      />

      <ConfirmDialog
        open={!!deleteTargetId}
        title="Delete Party"
        message="Are you sure you want to delete this party? All related historical transactions in ledger will remain intact."
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
          const party = parties.find(p => p.partyId === actionContext?.partyId);
          if (party) handleEdit(party);
        }}
        onAddTransaction={handleOpenTxnModal}
      />

      <TransactionModal
        open={txnModalOpen}
        stockId={null}
        defaultPartyId={txnDefaults.partyId}
        onClose={handleCloseTxnModal}
        onSubmit={async () => {
          handleCloseTxnModal();
          fetchParties();
        }}
      />

      {/* Dedicated Parties Statement & Ledger Report Modal */}
      <EntityReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        entityType="PARTY"
        entityId={selectedPartyForReport?.partyId || selectedPartyForReport?.id}
        entityTitle={selectedPartyForReport ? `Statement of Account: ${selectedPartyForReport.partyName || selectedPartyForReport.name}` : 'Comprehensive Parties Statement & Ledger'}
      />
    </div>
  );
};
