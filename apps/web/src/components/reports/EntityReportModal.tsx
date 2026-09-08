import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { formatCurrency } from '../../utils/format';

export interface EntityReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'PARTY' | 'STOCK' | 'REPAIR' | 'CERTIFICATE';
  entityId?: string;
  entityTitle?: string;
}

export const EntityReportModal: React.FC<EntityReportModalProps> = ({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityTitle
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [reportData, setReportData] = useState<{
    title: string;
    subtitle: string;
    columns: Array<{ key: string; header: string; align?: 'left' | 'center' | 'right'; width?: number }>;
    rows: any[];
    kpis: Array<{ label: string; value: string | number; color?: string }>;
    entityProfile?: any;
  } | null>(null);

  // Selected row keys for export
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;

    const fetchReport = async () => {
      setLoading(true);
      try {
        let reportType = 'PARTY_STATEMENT';
        let queryParams: Record<string, any> = {};

        if (entityType === 'PARTY') {
          reportType = entityId ? 'PARTY_ENTITY' : 'PARTY_STATEMENT';
          if (entityId) queryParams.partyId = entityId;
        } else if (entityType === 'STOCK') {
          reportType = entityId ? 'STOCK_ENTITY' : 'INVENTORY_SUMMARY';
          if (entityId) queryParams.stockId = entityId;
        } else if (entityType === 'REPAIR') {
          reportType = 'REPAIRS';
        } else if (entityType === 'CERTIFICATE') {
          reportType = 'CERTIFICATES';
        }

        const res = await api.getReportPreview({ reportType, ...queryParams });
        if (res?.success) {
          setReportData(res);
          // By default, select all rows
          setSelectedRowKeys(new Set((res.rows || []).map((r: any) => String(r.id || r.rowKey))));
        }
      } catch (err) {
        console.error('Failed to load entity report', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [isOpen, entityType, entityId]);

  // Filtered rows by local search
  const filteredRows = useMemo(() => {
    if (!reportData?.rows) return [];
    if (!search.trim()) return reportData.rows;
    const q = search.toLowerCase().trim();
    return reportData.rows.filter(row =>
      Object.values(row).some(val => String(val ?? '').toLowerCase().includes(q))
    );
  }, [reportData?.rows, search]);

  const toggleSelectAll = () => {
    if (selectedRowKeys.size === filteredRows.length) {
      setSelectedRowKeys(new Set());
    } else {
      setSelectedRowKeys(new Set(filteredRows.map((r: any) => String(r.id || r.rowKey))));
    }
  };

  const toggleRow = (key: string) => {
    const next = new Set(selectedRowKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedRowKeys(next);
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      let reportType = 'PARTY_STATEMENT';
      let queryParams: Record<string, any> = {};

      if (entityType === 'PARTY') {
        reportType = entityId ? 'PARTY_ENTITY' : 'PARTY_STATEMENT';
        if (entityId) queryParams.partyId = entityId;
      } else if (entityType === 'STOCK') {
        reportType = entityId ? 'STOCK_ENTITY' : 'INVENTORY_SUMMARY';
        if (entityId) queryParams.stockId = entityId;
      } else if (entityType === 'REPAIR') {
        reportType = 'REPAIRS';
      } else if (entityType === 'CERTIFICATE') {
        reportType = 'CERTIFICATES';
      }

      if (selectedRowKeys.size > 0 && selectedRowKeys.size < (reportData?.rows?.length || 0)) {
        queryParams.selectedRowKeys = Array.from(selectedRowKeys).join(',');
      }

      const filename = `DiamondERP_${entityType}_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      await api.downloadReportExcel({ reportType, ...queryParams }, filename);
    } catch (err) {
      console.error('Failed to export Excel', err);
      alert('Failed to export Excel report.');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const profile = reportData?.entityProfile;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto no-print">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-fade-in-up">
        
        {/* Header Bar */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 material-symbols-outlined text-[22px]">
              {entityType === 'PARTY' ? 'contacts' : entityType === 'STOCK' ? 'inventory_2' : entityType === 'REPAIR' ? 'build' : 'verified'}
            </span>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                {entityTitle || reportData?.title || `${entityType} Report & Ledger`}
              </h3>
              <p className="text-xs text-slate-400">
                {reportData?.subtitle || t('Official statement & activity register')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <span className="material-symbols-outlined text-[16px] text-rose-400">print</span>
              {t('Print / PDF')}
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition-all disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[16px] ${exporting ? 'animate-spin' : ''}`}>
                {exporting ? 'refresh' : 'table_view'}
              </span>
              {exporting ? t('Exporting...') : t('Export Excel')}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500">
              <span className="material-symbols-outlined animate-spin text-[32px] text-indigo-600">
                progress_activity
              </span>
              <span className="text-xs font-medium mt-2">{t('Generating statement & ledger...')}</span>
            </div>
          ) : (
            <>
              {/* Top Profile Summary Card (if specific entity) */}
              {profile && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-slate-900">{profile.name}</h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {profile.partyType || 'CLIENT'}
                        </span>
                        {profile.brokeragePercentage > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            Brokerage: {profile.brokeragePercentage}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">Code: {profile.code}</p>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-600">
                      {profile.phone && profile.phone !== '—' && (
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px] text-slate-400">call</span>
                          <span>{profile.phone}</span>
                        </div>
                      )}
                      {profile.email && profile.email !== '—' && (
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px] text-slate-400">mail</span>
                          <span>{profile.email}</span>
                        </div>
                      )}
                      {profile.address && profile.address !== '—' && (
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px] text-slate-400">location_on</span>
                          <span>{profile.address}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Financial Balance Counters */}
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200">
                      <span className="text-[10px] uppercase font-bold text-emerald-700 block">Total Sales (Cr)</span>
                      <span className="text-sm font-bold text-slate-900 block mt-0.5">
                        {formatCurrency(profile.totalSales || 0)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-200">
                      <span className="text-[10px] uppercase font-bold text-blue-700 block">Total Purchases (Dr)</span>
                      <span className="text-sm font-bold text-slate-900 block mt-0.5">
                        {formatCurrency(profile.totalPurchases || 0)}
                      </span>
                    </div>
                    <div className={`p-2.5 rounded-lg border ${
                      (profile.netBalance || 0) >= 0
                        ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50/60 border-rose-200 text-rose-800'
                    }`}>
                      <span className="text-[10px] uppercase font-bold block">Closing Ledger Balance</span>
                      <span className="text-sm font-bold block mt-0.5">
                        {formatCurrency(profile.netBalance || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* General KPIs (if section wide report) */}
              {!profile && reportData?.kpis && reportData.kpis.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {reportData.kpis.map((kpi, idx) => (
                    <div key={idx} className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">{kpi.label}</span>
                      <span className="text-sm font-bold text-slate-900 block mt-0.5">{kpi.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom Ledger Table */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                <div className="p-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px] text-indigo-600">receipt_long</span>
                      {t('Transaction Ledger & Register Entries')}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {selectedRowKeys.size} {t('selected')} / {filteredRows.length} {t('total')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                        search
                      </span>
                      <input
                        type="text"
                        placeholder={t('Search in entries...')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-7 pr-3 py-1 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-44"
                      />
                    </div>
                    <button
                      onClick={toggleSelectAll}
                      className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-[11px] font-semibold text-slate-700"
                    >
                      {selectedRowKeys.size === filteredRows.length ? t('Deselect All') : t('Select All')}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={filteredRows.length > 0 && selectedRowKeys.size === filteredRows.length}
                            onChange={toggleSelectAll}
                            className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </th>
                        <th className="py-2.5 px-2 w-10 text-center text-slate-400">#</th>
                        {reportData?.columns.map((col) => (
                          <th
                            key={col.key}
                            className={`py-2.5 px-3 ${
                              col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                            }`}
                          >
                            {col.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {filteredRows.length > 0 ? (
                        filteredRows.map((row, idx) => {
                          const rowKey = String(row.id || row.rowKey || idx);
                          const isChecked = selectedRowKeys.has(rowKey);

                          return (
                            <tr
                              key={rowKey}
                              onClick={() => toggleRow(rowKey)}
                              className={`cursor-pointer transition-colors ${
                                isChecked ? 'hover:bg-indigo-50/40' : 'opacity-60 bg-slate-50/50 hover:opacity-100'
                              }`}
                            >
                              <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleRow(rowKey)}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                              </td>
                              <td className="py-2 px-2 text-center text-slate-400 font-mono text-[11px]">
                                {idx + 1}
                              </td>
                              {reportData?.columns.map((col) => (
                                <td
                                  key={col.key}
                                  className={`py-2 px-3 font-medium ${
                                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                                  }`}
                                >
                                  {String(row[col.key] ?? '—')}
                                </td>
                              ))}
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={(reportData?.columns.length || 0) + 2} className="py-10 text-center text-slate-400">
                            {t('No records found.')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            {t('Showing')} <strong className="text-slate-800">{filteredRows.length}</strong> {t('entries')}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors"
          >
            {t('Close')}
          </button>
        </div>

      </div>
    </div>
  );
};
