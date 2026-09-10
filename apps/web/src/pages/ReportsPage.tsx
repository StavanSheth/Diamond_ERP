import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { EntityPreloader } from '../domains/common/components/EntityPreloader';
import { SHAPES, COLORS, CLARITIES, CUTS, SYMMETRIES, POLISHES } from '../types/stock';

import {
  QUICK_PRESETS,
  type QuickPreset,
} from '../domains/reports/reportDefinitions';
import { ReportPresetCards } from '../domains/reports/components/ReportPresetCards';
import { ReportFilterSection } from '../domains/reports/components/ReportFilterSection';
import { ReportAnalyticsCharts } from '../domains/reports/components/ReportAnalyticsCharts';

export const ReportsPage: React.FC = () => {
  const { t } = useTranslation();

  // Primary Report Type
  const [reportType, setReportType] = useState<string>('FY_25_26');
  const prevReportTypeRef = React.useRef<string>('FY_25_26');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [showAnalytics, setShowAnalytics] = useState<boolean>(false);

  // Multi-select Checkbox Filters
  const [selectedFYs, setSelectedFYs] = useState<string[]>(['2025-26']);
  const [selectedPartyTypes, setSelectedPartyTypes] = useState<string[]>([]);
  const [selectedPartyIds, setSelectedPartyIds] = useState<string[]>([]);
  const [selectedStockIds, setSelectedStockIds] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  // 4Cs Multi-Select Checkboxes
  const [selectedShapes, setSelectedShapes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedClarities, setSelectedClarities] = useState<string[]>([]);
  const [selectedCuts, setSelectedCuts] = useState<string[]>([]);
  const [selectedSymmetries, setSelectedSymmetries] = useState<string[]>([]);
  const [selectedPolishes, setSelectedPolishes] = useState<string[]>([]);

  // Payment Aging & Classification
  const [paymentDirection, setPaymentDirection] = useState<string>('ALL');
  const [agingDays, setAgingDays] = useState<string>('');
  const [minCarat, setMinCarat] = useState<string>('');
  const [maxCarat, setMaxCarat] = useState<string>('');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [category, setCategory] = useState<string>('ALL');
  const [hasRepair, setHasRepair] = useState<boolean>(false);
  const [hasCert, setHasCert] = useState<boolean>(false);

  // Column Selection State
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [showColumnDropdown, setShowColumnDropdown] = useState<boolean>(false);
  const columnDropdownRef = React.useRef<HTMLDivElement>(null);

  // Close column dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(e.target as Node)) {
        setShowColumnDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedFYs.length > 0 && !(selectedFYs.length === 1 && selectedFYs[0] === 'ALL_TIME')) count += selectedFYs.length;
    count += selectedPartyTypes.length;
    count += selectedPartyIds.length;
    count += selectedStockIds.length;
    count += selectedStatuses.length;
    count += selectedShapes.length;
    count += selectedColors.length;
    count += selectedClarities.length;
    count += selectedCuts.length;
    count += selectedSymmetries.length;
    count += selectedPolishes.length;
    if (paymentDirection !== 'ALL') count += 1;
    if (agingDays) count += 1;
    if (minCarat || maxCarat) count += 1;
    if (minPrice || maxPrice) count += 1;
    if (category !== 'ALL') count += 1;
    if (hasRepair) count += 1;
    if (hasCert) count += 1;
    return count;
  }, [
    selectedFYs, selectedPartyTypes, selectedPartyIds, selectedStockIds,
    selectedStatuses, selectedShapes, selectedColors, selectedClarities,
    selectedCuts, selectedSymmetries, selectedPolishes, paymentDirection,
    agingDays, minCarat, maxCarat, minPrice, maxPrice, category, hasRepair, hasCert
  ]);

  // Auxiliary dropdown lists
  const [stocksList, setStocksList] = useState<any[]>([]);
  const [partiesList, setPartiesList] = useState<any[]>([]);

  // Report Preview Data & Loading
  const [previewLoading, setPreviewLoading] = useState<boolean>(true);
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);
  const [reportData, setReportData] = useState<{
    title: string;
    subtitle: string;
    columns: Array<{ key: string; header: string; align?: 'left' | 'center' | 'right'; width?: number }>;
    rows: any[];
    kpis: Array<{ label: string; value: string | number; color?: string }>;
  } | null>(null);

  // Row Selection (Checkbox per row)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());

  // Expandable stone rows
  const [expandedRowKeys, setExpandedRowKeys] = useState<Set<string>>(new Set());

  // In-table search & pagination
  const [tableSearch, setTableSearch] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Dedicated Print Preview Modal
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const reportRequestGenRef = React.useRef<number>(0);

  // Load auxiliary lists on mount
  useEffect(() => {
    const loadAux = async () => {
      try {
        const [stocksRes, partiesRes, reportsRes] = await Promise.all([
          api.getStocks().catch(() => ({ success: false, data: [] })),
          api.getParties().catch(() => ({ success: false, data: [] })),
          api.getReports().catch(() => ({ success: false, data: null }))
        ]);
        if (stocksRes && Array.isArray((stocksRes as any).data)) {
          setStocksList((stocksRes as any).data);
        }
        if (partiesRes && Array.isArray(partiesRes.data)) {
          setPartiesList(partiesRes.data);
        }
        if (reportsRes?.success) {
          setAnalyticsData(reportsRes.data);
        }
      } catch (err) {
        console.error('Failed to load auxiliary filter data', err);
      }
    };
    loadAux();
  }, []);

  // Fetch report data whenever parameters change (with race-condition cancellation)
  const fetchReport = async () => {
    const currentGen = ++reportRequestGenRef.current;
    setPreviewLoading(true);
    setCurrentPage(1);
    try {
      const params: Record<string, any> = {
        reportType,
        fys: selectedFYs,
        partyIds: selectedPartyIds,
        partyTypes: selectedPartyTypes,
        stockIds: selectedStockIds,
        statuses: selectedStatuses,
        shapes: selectedShapes,
        colors: selectedColors,
        clarities: selectedClarities,
        cuts: selectedCuts,
        symmetries: selectedSymmetries,
        polishes: selectedPolishes,
        paymentDirection: paymentDirection !== 'ALL' ? paymentDirection : undefined,
        agingDays: agingDays || undefined,
        minCarat: minCarat || undefined,
        maxCarat: maxCarat || undefined,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        category: category !== 'ALL' ? category : undefined,
        hasRepair: hasRepair ? true : undefined,
        hasCert: hasCert ? true : undefined
      };

      const res = await api.getReportPreview(params);
      if (currentGen !== reportRequestGenRef.current) {
        // Discard stale out-of-order response
        return;
      }
      if (res?.success) {
        setReportData({
          title: res.title,
          subtitle: res.subtitle,
          columns: res.columns || [],
          rows: res.rows || [],
          kpis: res.kpis || []
        });
        // Sync column selection with incoming columns
        if (res.columns && res.columns.length > 0) {
          const typeChanged = prevReportTypeRef.current !== reportType;
          prevReportTypeRef.current = reportType;

          setVisibleColumns(prev => {
            if (typeChanged || prev.size === 0) {
              return new Set(res.columns.map((c: any) => c.key));
            }
            const newKeys = new Set(res.columns.map((c: any) => c.key));
            const next = new Set<string>();
            res.columns.forEach((c: any) => {
              if (prev.has(c.key)) next.add(c.key);
            });
            return next.size > 0 ? next : newKeys;
          });
        }
        // Select all rows by default
        setSelectedRowKeys(new Set((res.rows || []).map((r: any, idx: number) => String(r.id || r.rowKey || idx))));
        setExpandedRowKeys(new Set());
      }
    } catch (err) {
      console.error('Failed to load report preview', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [
    reportType,
    selectedFYs,
    selectedPartyTypes,
    selectedPartyIds,
    selectedStockIds,
    selectedStatuses,
    selectedShapes,
    selectedColors,
    selectedClarities,
    selectedCuts,
    selectedSymmetries,
    selectedPolishes,
    paymentDirection,
    agingDays,
    minCarat,
    maxCarat,
    minPrice,
    maxPrice,
    category,
    hasRepair,
    hasCert
  ]);

  // Handle Preset Clicks
  const handleApplyPreset = (preset: QuickPreset) => {
    setReportType(preset.reportType);
    if (!preset.hasYearSelector) {
      setSelectedFYs(['ALL_TIME']);
    } else if (selectedFYs.length === 0 || (selectedFYs.length === 1 && selectedFYs[0] === 'ALL_TIME')) {
      setSelectedFYs(['2025-26']);
    }
    setSelectedPartyIds([]);
    setSelectedPartyTypes([]);
    setSelectedStockIds([]);
    setSelectedStatuses([]);
    setSelectedShapes([]);
    setSelectedColors([]);
    setSelectedClarities([]);
    setSelectedCuts([]);
    setSelectedSymmetries([]);
    setSelectedPolishes([]);
    setPaymentDirection('ALL');
    setAgingDays('');
  };

  // Reset all filters to default
  const handleResetAllFilters = () => {
    setSelectedFYs(['2025-26']);
    setSelectedPartyTypes([]);
    setSelectedPartyIds([]);
    setSelectedStockIds([]);
    setSelectedStatuses([]);
    setSelectedShapes([]);
    setSelectedColors([]);
    setSelectedClarities([]);
    setSelectedCuts([]);
    setSelectedSymmetries([]);
    setSelectedPolishes([]);
    setPaymentDirection('ALL');
    setAgingDays('');
    setMinCarat('');
    setMaxCarat('');
    setMinPrice('');
    setMaxPrice('');
    setCategory('ALL');
    setHasRepair(false);
    setHasCert(false);
  };

  // Toggle multi-select helper
  const toggleItem = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
    setList(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);
  };

  // Row selection helpers
  const toggleRow = (key: string) => {
    const next = new Set(selectedRowKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedRowKeys(next);
  };

  const toggleSelectAll = () => {
    if (selectedRowKeys.size === filteredRows.length) {
      setSelectedRowKeys(new Set());
    } else {
      setSelectedRowKeys(new Set(filteredRows.map((r, idx) => String(r.id || r.rowKey || idx))));
    }
  };

  // Toggle expandable row
  const toggleExpandRow = (key: string) => {
    const next = new Set(expandedRowKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedRowKeys(next);
  };

  // Export to Excel respecting selected rows and visible columns
  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const params: Record<string, any> = {
        reportType,
        fys: selectedFYs,
        partyIds: selectedPartyIds,
        partyTypes: selectedPartyTypes,
        stockIds: selectedStockIds,
        statuses: selectedStatuses,
        shapes: selectedShapes,
        colors: selectedColors,
        clarities: selectedClarities,
        cuts: selectedCuts,
        symmetries: selectedSymmetries,
        polishes: selectedPolishes,
        paymentDirection: paymentDirection !== 'ALL' ? paymentDirection : undefined,
        agingDays: agingDays || undefined,
        minCarat: minCarat || undefined,
        maxCarat: maxCarat || undefined,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        category: category !== 'ALL' ? category : undefined,
        hasRepair: hasRepair ? true : undefined,
        hasCert: hasCert ? true : undefined
      };

      // Only pass selected keys if a subset is selected
      if (selectedRowKeys.size > 0 && selectedRowKeys.size < (reportData?.rows?.length || 0)) {
        params.selectedRowKeys = Array.from(selectedRowKeys);
      }

      // Pass visible columns if user customized them
      if (visibleColumns.size > 0 && visibleColumns.size < (reportData?.columns?.length || 0)) {
        params.visibleColumns = Array.from(visibleColumns);
      }

      const filename = `DiamondERP_${reportType}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      await api.downloadReportExcel(params, filename);
    } catch (err) {
      console.error('Failed to export Excel', err);
      alert('Failed to export Excel report. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  // Visible columns memo
  const displayedColumns = useMemo(() => {
    if (!reportData?.columns) return [];
    if (visibleColumns.size === 0) return reportData.columns;
    return reportData.columns.filter(c => visibleColumns.has(c.key));
  }, [reportData?.columns, visibleColumns]);

  // In-table search filter
  const filteredRows = useMemo(() => {
    if (!reportData?.rows) return [];
    if (!tableSearch.trim()) return reportData.rows;
    const q = tableSearch.toLowerCase().trim();
    return reportData.rows.filter(row =>
      Object.values(row).some(val => String(val ?? '').toLowerCase().includes(q))
    );
  }, [reportData?.rows, tableSearch]);

  // Paginated Rows
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAFAFC] overflow-hidden">
      {/* ═══════════════════════════════════════════════════════════════
          HEADER: Title, Accounting Terms & Actions
          ═══════════════════════════════════════════════════════════════ */}
      <header className="px-6 py-4 bg-white border-b border-slate-200 shadow-xs shrink-0 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 material-symbols-outlined text-[24px]">
                account_balance
              </span>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {t('Enterprise Reports & Audit Center')}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Dr / Cr / Closing Balances
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {t('Statutory Financial Statements with Debit (Dr / In), Credit (Cr / Out), running carat & valuation balances, 4Cs multi-filters and row-level selections.')}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Toggle Advanced Multi-Filters */}
            <button
              id="btn-toggle-filters"
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${
                showAdvancedFilters
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : activeFiltersCount > 0
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              <span>{showAdvancedFilters ? t('Hide Filters') : t('Multi-Select Filters')}</span>
              {activeFiltersCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  showAdvancedFilters ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white'
                }`}>
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Visual Analytics */}
            <button
              id="btn-toggle-analytics"
              onClick={() => setShowAnalytics(!showAnalytics)}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 transition-all"
            >
              <span className="material-symbols-outlined text-[18px] text-indigo-600">insights</span>
              {showAnalytics ? t('Hide Analytics') : t('Visual Analytics')}
            </button>

            {/* Print / Save PDF */}
            <button
              id="btn-export-pdf"
              onClick={() => setShowPrintModal(true)}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 hover:border-slate-400 text-slate-800 shadow-xs hover:bg-slate-50 flex items-center gap-2 transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[18px] text-rose-600">picture_as_pdf</span>
              {t('Print / Save PDF')}
            </button>

            {/* Export to Excel */}
            <button
              id="btn-export-excel"
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow flex items-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[18px] ${exportingExcel ? 'animate-spin' : ''}`}>
                {exportingExcel ? 'refresh' : 'table_view'}
              </span>
              {exportingExcel ? t('Exporting...') : `${t('Export')} (${selectedRowKeys.size}) ${t('to Excel')}`}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* ═══════════════════════════════════════════════════════════════
            QUICK STATUTORY & AUDIT PRESETS
            ═══════════════════════════════════════════════════════════════ */}
        <ReportPresetCards
          reportType={reportType}
          selectedFYs={selectedFYs}
          onApplyPreset={handleApplyPreset}
          onSelectFY={(rt, fyId) => {
            setReportType(rt);
            setSelectedFYs([fyId]);
          }}
        />

        {/* ═══════════════════════════════════════════════════════════════
            ADVANCED MULTI-SELECT CHECKBOX FILTER PANELS
            ═══════════════════════════════════════════════════════════════ */}
        <ReportFilterSection
          showAdvancedFilters={showAdvancedFilters}
          setShowAdvancedFilters={setShowAdvancedFilters}
          activeFiltersCount={activeFiltersCount}
          handleResetAllFilters={handleResetAllFilters}
          selectedFYs={selectedFYs}
          setSelectedFYs={setSelectedFYs}
          reportType={reportType}
          setReportType={setReportType}
          selectedPartyTypes={selectedPartyTypes}
          setSelectedPartyTypes={setSelectedPartyTypes}
          selectedPartyIds={selectedPartyIds}
          setSelectedPartyIds={setSelectedPartyIds}
          selectedStockIds={selectedStockIds}
          setSelectedStockIds={setSelectedStockIds}
          selectedStatuses={selectedStatuses}
          setSelectedStatuses={setSelectedStatuses}
          partiesList={partiesList}
          stocksList={stocksList}
          toggleItem={toggleItem}
          paymentDirection={paymentDirection}
          setPaymentDirection={setPaymentDirection}
          agingDays={agingDays}
          setAgingDays={setAgingDays}
          hasCert={hasCert}
          setHasCert={setHasCert}
          hasRepair={hasRepair}
          setHasRepair={setHasRepair}
          selectedShapes={selectedShapes}
          setSelectedShapes={setSelectedShapes}
          selectedColors={selectedColors}
          setSelectedColors={setSelectedColors}
          selectedClarities={selectedClarities}
          setSelectedClarities={setSelectedClarities}
          selectedCuts={selectedCuts}
          setSelectedCuts={setSelectedCuts}
          selectedPolishes={selectedPolishes}
          setSelectedPolishes={setSelectedPolishes}
          selectedSymmetries={selectedSymmetries}
          setSelectedSymmetries={setSelectedSymmetries}
          minCarat={minCarat}
          setMinCarat={setMinCarat}
          maxCarat={maxCarat}
          setMaxCarat={setMaxCarat}
          minPrice={minPrice}
          setMinPrice={setMinPrice}
          maxPrice={maxPrice}
          setMaxPrice={setMaxPrice}
          category={category}
          setCategory={setCategory}
          onApplyFilters={fetchReport}
        />

        {/* ═══════════════════════════════════════════════════════════════
            DYNAMIC STATUTORY & FINANCIAL KPIS
            ═══════════════════════════════════════════════════════════════ */}
        {reportData?.kpis && reportData.kpis.length > 0 && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 no-print">
            {reportData.kpis.map((kpi, idx) => {
              const getKpiMeta = (label: string, i: number) => {
                const l = (label || '').toLowerCase();
                if (l.includes('carat') || l.includes('weight')) return { icon: 'diamond', color: 'text-indigo-600', topBorder: 'border-t-indigo-500', bg: 'bg-indigo-50' };
                if (l.includes('debit') || l.includes('purchase') || l.includes('inward')) return { icon: 'arrow_downward', color: 'text-amber-600', topBorder: 'border-t-amber-500', bg: 'bg-amber-50' };
                if (l.includes('credit') || l.includes('sales') || l.includes('outward')) return { icon: 'arrow_upward', color: 'text-blue-600', topBorder: 'border-t-blue-500', bg: 'bg-blue-50' };
                if (l.includes('closing') || l.includes('balance') || l.includes('value') || l.includes('net')) return { icon: 'account_balance_wallet', color: 'text-emerald-600', topBorder: 'border-t-emerald-500', bg: 'bg-emerald-50' };
                if (l.includes('profit') || l.includes('margin')) return { icon: 'monetization_on', color: 'text-emerald-600', topBorder: 'border-t-emerald-500', bg: 'bg-emerald-50' };
                if (l.includes('brokerage') || l.includes('commission')) return { icon: 'handshake', color: 'text-purple-600', topBorder: 'border-t-purple-500', bg: 'bg-purple-50' };
                if (l.includes('stone') || l.includes('count') || l.includes('record')) return { icon: 'receipt_long', color: 'text-sky-600', topBorder: 'border-t-sky-500', bg: 'bg-sky-50' };
                const fallbacks = [
                  { icon: 'analytics', color: 'text-indigo-600', topBorder: 'border-t-indigo-500', bg: 'bg-indigo-50' },
                  { icon: 'paid', color: 'text-emerald-600', topBorder: 'border-t-emerald-500', bg: 'bg-emerald-50' },
                  { icon: 'toll', color: 'text-amber-600', topBorder: 'border-t-amber-500', bg: 'bg-amber-50' },
                  { icon: 'query_stats', color: 'text-blue-600', topBorder: 'border-t-blue-500', bg: 'bg-blue-50' },
                  { icon: 'inventory_2', color: 'text-purple-600', topBorder: 'border-t-purple-500', bg: 'bg-purple-50' },
                ];
                return fallbacks[i % fallbacks.length];
              };
              const meta = getKpiMeta(kpi.label, idx);

              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border-x border-b border-black/[0.08] ${meta.topBorder} border-t-[3.5px] bg-white shadow-xs flex flex-col justify-between`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">
                      {kpi.label}
                    </span>
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center ${meta.bg} ${meta.color} shrink-0`}>
                      <span className="material-symbols-outlined text-[15px]">{meta.icon}</span>
                    </span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
                    {kpi.value}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            VISUAL ANALYTICS CHARTS (Collapsible)
            ═══════════════════════════════════════════════════════════════ */}
        <ReportAnalyticsCharts
          showAnalytics={showAnalytics}
          analyticsData={analyticsData}
          onClose={() => setShowAnalytics(false)}
        />

        {/* ═══════════════════════════════════════════════════════════════
            DATA PREVIEW TABLE: ROW SELECTION, EXPANSION, EXACT ACCOUNTING COLUMNS
            ═══════════════════════════════════════════════════════════════ */}
        <section id="report-data-table-section" className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col no-print">
          
          {/* Table Controls Bar */}
          <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/60">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-600 text-[20px]">table_chart</span>
                  {reportData?.title || 'Report Statement'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {reportData?.subtitle}
                </p>
              </div>

              {/* Selection Counter Badge */}
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                {selectedRowKeys.size} {t('Selected')} / {filteredRows.length} {t('Total Rows')}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filter Button directly on table toolbar */}
              <button
                id="btn-table-filters"
                type="button"
                onClick={() => {
                  setShowAdvancedFilters(!showAdvancedFilters);
                  if (!showAdvancedFilters) {
                    setTimeout(() => {
                      const filterEl = document.getElementById('advanced-filters-section');
                      if (filterEl) filterEl.scrollIntoView({ behavior: 'smooth' });
                    }, 50);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all active:scale-[0.98] ${
                  showAdvancedFilters
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : activeFiltersCount > 0
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
                <span>{t('Filters')}</span>
                {activeFiltersCount > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${showAdvancedFilters ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white'}`}>
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* Column Selection Dropdown */}
              <div className="relative" ref={columnDropdownRef}>
                <button
                  id="btn-columns-select"
                  type="button"
                  onClick={() => setShowColumnDropdown(prev => !prev)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-[16px] text-indigo-600">view_column</span>
                  <span>{t('Columns')}</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {displayedColumns.length}/{reportData?.columns?.length || 0}
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-slate-400">arrow_drop_down</span>
                </button>

                {showColumnDropdown && (
                  <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-3 animate-fade-in-up">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px] text-indigo-600">checklist</span>
                        {t('Select Columns')}
                      </span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setVisibleColumns(new Set(reportData?.columns?.map(c => c.key) || []))}
                          className="text-indigo-600 hover:text-indigo-800 font-semibold"
                        >
                          {t('All')}
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => setVisibleColumns(new Set())}
                          className="text-slate-500 hover:text-slate-700 font-medium"
                        >
                          {t('None')}
                        </button>
                      </div>
                    </div>

                    <div className="max-h-56 overflow-y-auto space-y-1 py-1">
                      {reportData?.columns?.map((col) => {
                        const isVisible = visibleColumns.has(col.key);
                        return (
                          <label
                            key={col.key}
                            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-50 cursor-pointer text-xs text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => {
                                const next = new Set(visibleColumns);
                                if (isVisible) next.delete(col.key);
                                else next.add(col.key);
                                setVisibleColumns(next);
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="font-medium truncate">{col.header}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Select / Deselect All Button */}
              <button
                id="btn-toggle-select-all"
                type="button"
                onClick={toggleSelectAll}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
              >
                {selectedRowKeys.size === filteredRows.length ? t('Deselect All') : t('Select All')}
              </button>

              {/* In-table Search */}
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
                  search
                </span>
                <input
                  id="input-table-search"
                  type="text"
                  placeholder={t('Search in results...')}
                  value={tableSearch}
                  onChange={(e) => {
                    setTableSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-36 sm:w-44"
                />
              </div>

              {/* Rows Per Page */}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="text-xs font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700"
              >
                <option value={15}>15 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>

              {/* Refresh */}
              <button
                type="button"
                onClick={fetchReport}
                title="Refresh Report Data"
                className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
            </div>
          </div>

          {/* Active Filter Chips Strip */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 bg-indigo-50/40 border-b border-indigo-100/80 text-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mr-1">
                <span className="material-symbols-outlined text-[14px] text-indigo-600">filter_alt</span>
                {t('Active Filters')}:
              </span>
              {selectedFYs.map(fy => (
                <span key={fy} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 text-[11px] font-medium shadow-2xs">
                  FY: {fy}
                  <button type="button" onClick={() => toggleItem(selectedFYs, setSelectedFYs, fy)} className="text-indigo-400 hover:text-indigo-800">✕</button>
                </span>
              ))}
              {selectedPartyTypes.map(pt => (
                <span key={pt} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 text-[11px] font-medium shadow-2xs">
                  Type: {pt}
                  <button type="button" onClick={() => toggleItem(selectedPartyTypes, setSelectedPartyTypes, pt)} className="text-indigo-400 hover:text-indigo-800">✕</button>
                </span>
              ))}
              {selectedStatuses.map(st => (
                <span key={st} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 text-[11px] font-medium shadow-2xs">
                  Status: {st}
                  <button type="button" onClick={() => toggleItem(selectedStatuses, setSelectedStatuses, st)} className="text-indigo-400 hover:text-indigo-800">✕</button>
                </span>
              ))}
              {selectedShapes.map(sh => (
                <span key={sh} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 text-[11px] font-medium shadow-2xs">
                  Shape: {sh}
                  <button type="button" onClick={() => toggleItem(selectedShapes, setSelectedShapes, sh)} className="text-indigo-400 hover:text-indigo-800">✕</button>
                </span>
              ))}
              {selectedColors.map(cl => (
                <span key={cl} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 text-[11px] font-medium shadow-2xs">
                  Color: {cl}
                  <button type="button" onClick={() => toggleItem(selectedColors, setSelectedColors, cl)} className="text-indigo-400 hover:text-indigo-800">✕</button>
                </span>
              ))}
              {selectedClarities.map(c => (
                <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 text-[11px] font-medium shadow-2xs">
                  Clarity: {c}
                  <button type="button" onClick={() => toggleItem(selectedClarities, setSelectedClarities, c)} className="text-indigo-400 hover:text-indigo-800">✕</button>
                </span>
              ))}
              {paymentDirection !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 text-[11px] font-medium shadow-2xs">
                  Direction: {paymentDirection}
                  <button type="button" onClick={() => setPaymentDirection('ALL')} className="text-indigo-400 hover:text-indigo-800">✕</button>
                </span>
              )}
              {category !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 text-[11px] font-medium shadow-2xs">
                  Category: {category}
                  <button type="button" onClick={() => setCategory('ALL')} className="text-indigo-400 hover:text-indigo-800">✕</button>
                </span>
              )}
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="text-[11px] text-rose-600 hover:underline font-semibold ml-1"
              >
                {t('Clear All')}
              </button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto min-h-[360px] relative">
            {previewLoading ? (
              reportData ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/85 backdrop-blur-xs z-20 text-slate-500">
                  <span className="material-symbols-outlined animate-spin text-[36px] text-indigo-600">
                    progress_activity
                  </span>
                  <span className="text-xs font-semibold mt-2">{t('Querying and aggregating report statements...')}</span>
                </div>
              ) : (
                <div className="p-4">
                  <EntityPreloader viewMode="table" count={6} tableColumns={8} />
                </div>
              )
            ) : null}

            {reportData && reportData.columns && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                    {/* Master Checkbox */}
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredRows.length > 0 && selectedRowKeys.size === filteredRows.length}
                        onChange={toggleSelectAll}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        title="Select / Deselect All"
                      />
                    </th>

                    {/* Expand column */}
                    <th className="py-2.5 px-2 w-8 text-center text-slate-400"></th>

                    {/* Column Headers */}
                    {displayedColumns.map((col) => (
                      <th
                        key={col.key}
                        className={`py-2.5 px-3 ${
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                        }`}
                        style={{ minWidth: col.width ? `${col.width * 8}px` : '100px' }}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {paginatedRows.length > 0 ? (
                    paginatedRows.map((row, idx) => {
                      const rowKey = String(row.id || row.rowKey || idx);
                      const isSelected = selectedRowKeys.has(rowKey);
                      const isExpanded = expandedRowKeys.has(rowKey);
                      const hasNestedStones = row.items && Array.isArray(row.items) && row.items.length > 0;

                      // P&L Banking Format detection
                      const isPL = reportType === 'PROFIT_AND_LOSS' || reportType === 'P_AND_L';
                      const isSectionHeader = isPL && row.schedule && String(row.schedule).startsWith('SCH-');
                      const isTotalRow = isPL && row.schedule && String(row.schedule).startsWith('TOTAL');
                      const isGrossMargin = isPL && row.schedule === 'SCH-3';
                      const isNetProfit = isPL && row.schedule === 'SCH-5';

                      if (isSectionHeader) {
                        return (
                          <tr key={rowKey} className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
                            <td className="py-2.5 px-3 text-center text-slate-400">
                              <span className="material-symbols-outlined text-[16px] text-indigo-600">folder_open</span>
                            </td>
                            <td className="py-2.5 px-1 text-center"></td>
                            {displayedColumns.map((col) => (
                              <td
                                key={col.key}
                                className={`py-2.5 px-3 font-bold text-slate-900 ${
                                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                                }`}
                              >
                                {row[col.key]}
                              </td>
                            ))}
                          </tr>
                        );
                      }

                      let rowBgClass = isSelected ? 'hover:bg-indigo-50/30' : 'opacity-60 bg-slate-50/50 hover:opacity-100';
                      if (isNetProfit) {
                        rowBgClass = 'bg-emerald-50/90 border-t-2 border-b-2 border-emerald-400 font-bold text-emerald-950';
                      } else if (isGrossMargin) {
                        rowBgClass = 'bg-blue-50/90 border-t-2 border-b-2 border-blue-300 font-bold text-blue-950';
                      } else if (isTotalRow) {
                        rowBgClass = 'bg-indigo-50/70 border-t border-b border-indigo-200 font-bold text-indigo-950';
                      }

                      return (
                        <React.Fragment key={rowKey}>
                          <tr className={`transition-colors ${rowBgClass}`}>
                            {/* Row Checkbox */}
                            <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleRow(rowKey)}
                                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>

                            {/* Row Expander Arrow */}
                            <td className="py-2.5 px-1 text-center">
                              {hasNestedStones ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandRow(rowKey)}
                                  className="text-slate-400 hover:text-indigo-600 p-0.5 rounded"
                                  title="View Stones Breakdown"
                                >
                                  <span className="material-symbols-outlined text-[18px]">
                                    {isExpanded ? 'expand_less' : 'expand_more'}
                                  </span>
                                </button>
                              ) : null}
                            </td>

                            {/* Data Cells */}
                            {displayedColumns.map((col) => {
                              const val = row[col.key];

                              // Dynamic Badges
                              let cellContent: React.ReactNode = String(val ?? '—');

                              // Type with Badge
                              if (col.key === 'type' && val) {
                                const isPurchase = val === 'PURCHASE';
                                const isSale = val === 'SALE';
                                cellContent = (
                                  <div className="inline-flex items-center gap-1">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                      isPurchase ? 'bg-blue-50 text-blue-700 border-blue-200' : isSale ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                                    }`}>
                                      {val}
                                    </span>
                                  </div>
                                );
                              }

                              // Debit (Dr) in Blue / Bold
                              if (col.key === 'debit' && val && val !== '—') {
                                cellContent = <span className="text-blue-700 font-bold">{val}</span>;
                              }

                              // Credit (Cr) in Emerald / Bold
                              if (col.key === 'credit' && val && val !== '—') {
                                cellContent = <span className="text-emerald-700 font-bold">{val}</span>;
                              }

                              // Closing Balances in font-semibold
                              if ((col.key === 'closingBalCt' || col.key === 'closingBalVal') && val && val !== '—') {
                                cellContent = <span className="text-slate-900 font-semibold">{val}</span>;
                              }

                              // Brokerage
                              if (col.key === 'brokerage' && val && val !== '—') {
                                cellContent = (
                                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                    {val}
                                  </span>
                                );
                              }

                              // P&L Net Amount Highlight
                              if (col.key === 'netAmount' && val && val !== '—') {
                                cellContent = (
                                  <span className={`font-mono font-bold ${
                                    isNetProfit ? 'text-emerald-800 text-sm' : isGrossMargin ? 'text-blue-800' : 'text-slate-900'
                                  }`}>
                                    {val}
                                  </span>
                                );
                              }

                              return (
                                <td
                                  key={col.key}
                                  className={`py-2.5 px-3 ${
                                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                                  }`}
                                >
                                  {cellContent}
                                </td>
                              );
                            })}
                          </tr>

                          {/* Expanded Nested Stone Breakdown Subtable */}
                          {isExpanded && hasNestedStones && (
                            <tr className="bg-indigo-50/20 border-b border-indigo-100">
                              <td colSpan={displayedColumns.length + 2} className="p-4 pl-12">
                                <div className="bg-white border border-indigo-200 rounded-xl p-3 shadow-xs space-y-2">
                                  <div className="flex items-center justify-between text-xs text-indigo-900 font-bold">
                                    <span>Item-Level Diamond Stone Breakdown ({row.items.length} stones registered in voucher)</span>
                                    <span className="text-[11px] font-normal text-slate-500">Stock: {row.stock} • Voucher: {row.type}</span>
                                  </div>
                                  <table className="w-full text-left border-collapse text-[11px]">
                                    <thead>
                                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                                        <th className="py-1 px-2">Stone Code</th>
                                        <th className="py-1 px-2 text-center">Shape</th>
                                        <th className="py-1 px-2 text-right">Carats</th>
                                        <th className="py-1 px-2 text-center">Color</th>
                                        <th className="py-1 px-2 text-center">Clarity</th>
                                        <th className="py-1 px-2 text-center">Cut</th>
                                        <th className="py-1 px-2 text-center">Polish</th>
                                        <th className="py-1 px-2 text-center">Symm</th>
                                        <th className="py-1 px-2 text-right">Rate / Ct (₹)</th>
                                        <th className="py-1 px-2 text-right">Valuation (₹)</th>
                                        <th className="py-1 px-2 text-center">Cert #</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {row.items.map((st: any, sIdx: number) => (
                                        <tr key={sIdx} className="hover:bg-slate-50/60">
                                          <td className="py-1 px-2 font-mono font-semibold text-slate-800">{st.itemCode}</td>
                                          <td className="py-1 px-2 text-center">{st.shape}</td>
                                          <td className="py-1 px-2 text-right font-medium">{st.carat} ct</td>
                                          <td className="py-1 px-2 text-center">{st.color}</td>
                                          <td className="py-1 px-2 text-center">{st.clarity}</td>
                                          <td className="py-1 px-2 text-center">{st.cut}</td>
                                          <td className="py-1 px-2 text-center">{st.polish}</td>
                                          <td className="py-1 px-2 text-center">{st.symmetry}</td>
                                          <td className="py-1 px-2 text-right">₹{Number(st.ratePerCarat || 0).toLocaleString('en-IN')}</td>
                                          <td className="py-1 px-2 text-right font-semibold">₹{Number(st.totalValue || 0).toLocaleString('en-IN')}</td>
                                          <td className="py-1 px-2 text-center text-slate-500 font-mono">{st.certNo}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={displayedColumns.length + 2} className="py-12 text-center text-slate-400">
                        <span className="material-symbols-outlined text-[36px] text-slate-300 block mb-1">
                          search_off
                        </span>
                        {t('No matching records found for the selected criteria.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Footer */}
          <div className="p-3 border-t border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              {t('Showing')} <span className="font-semibold text-slate-800">{filteredRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> to{' '}
              <span className="font-semibold text-slate-800">{Math.min(currentPage * pageSize, filteredRows.length)}</span> of{' '}
              <span className="font-semibold text-slate-800">{filteredRows.length.toLocaleString('en-IN')}</span> {t('records')}
              <span className="ml-2 font-bold text-indigo-700">
                ({selectedRowKeys.size} {t('selected for export')})
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                {t('Previous')}
              </button>

              <span className="px-3 py-1 font-semibold text-slate-700">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
              >
                {t('Next')}
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        </section>

      </div>

      {/* ═══════════════════════════════════════════════════════════════
          PRINTABLE AUDIT DOCUMENT MODAL & PRINT ENGINE
          ═══════════════════════════════════════════════════════════════ */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-rose-400 text-[20px]">print</span>
                  {t('Official Audit Document Print & PDF Generator')}
                </h3>
                <p className="text-xs text-slate-400">
                  {t('Official statement with corporate letterhead, filter summary, KPI snapshot, and auditor sign-off.')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  <span className="material-symbols-outlined text-[18px]">print</span>
                  {t('Print / Save PDF Now')}
                </button>
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Document Preview inside Modal */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-100">
              <div className="bg-white max-w-4xl mx-auto p-8 shadow-sm border border-slate-200 rounded-lg text-slate-900 font-sans">
                <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
                  <div>
                    <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                      DIAMOND ERP ENTERPRISE
                    </h1>
                    <p className="text-xs text-slate-600 font-medium">Diamond Valuation, Processing & Ledger System</p>
                    <p className="text-[11px] text-slate-500">Surat • Mumbai • Antwerp • Dubai</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2.5 py-1 rounded bg-slate-900 text-white text-[11px] font-bold tracking-wider uppercase mb-1">
                      AUDITED STATEMENT
                    </span>
                    <div className="text-xs text-slate-600 font-mono">
                      Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h2 className="text-lg font-bold text-slate-900 uppercase">{reportData?.title}</h2>
                  <p className="text-xs text-slate-600 italic">{reportData?.subtitle}</p>
                </div>

                {/* KPI Summary Block */}
                {reportData?.kpis && reportData.kpis.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {reportData.kpis.map((kpi, idx) => (
                      <div key={idx} className="border border-slate-300 rounded p-2.5 bg-slate-50/50">
                        <span className="text-[9px] uppercase font-bold text-slate-500 block">{kpi.label}</span>
                        <span className="text-sm font-bold text-slate-900 block mt-0.5">{kpi.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Table */}
                <table className="w-full text-left border-collapse text-[10px] mb-8">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2 px-2 text-center w-8">#</th>
                      {displayedColumns.map((col) => (
                        <th key={col.key} className={`py-2 px-2 font-bold ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredRows.filter((r, idx) => selectedRowKeys.has(String(r.id || r.rowKey || idx))).slice(0, 100).map((row, idx) => (
                      <tr key={idx} className="even:bg-slate-50/60">
                        <td className="py-1.5 px-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                        {displayedColumns.map((col) => (
                          <td key={col.key} className={`py-1.5 px-2 font-medium ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                            {String(row[col.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Audit Sign-off */}
                <div className="border-t-2 border-slate-300 pt-6 mt-12 grid grid-cols-3 gap-6 text-center page-break-inside-avoid">
                  <div>
                    <div className="h-12 border-b border-dashed border-slate-400 mb-2"></div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-800 block">PREPARED BY</span>
                    <span className="text-[9px] text-slate-500">Accounts & Ledger Executive</span>
                  </div>
                  <div>
                    <div className="h-12 border-b border-dashed border-slate-400 mb-2"></div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-800 block">AUDITED & VERIFIED</span>
                    <span className="text-[9px] text-slate-500">Internal Diamond Auditor</span>
                  </div>
                  <div>
                    <div className="h-12 border-b border-dashed border-slate-400 mb-2"></div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-800 block">AUTHORIZED SIGNATORY</span>
                    <span className="text-[9px] text-slate-500">Director / Managing Partner</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          OFFSCREEN/PRINT LAYOUT FOR BROWSER PRINT ENGINE
          ═══════════════════════════════════════════════════════════════ */}
      <div className="hidden print:block print-container p-6 bg-white text-slate-900 font-sans">
        <div className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
              DIAMOND ERP ENTERPRISE
            </h1>
            <p className="text-xs text-slate-600 font-medium">Diamond Valuation & Inventory Management System</p>
            <p className="text-[10px] text-slate-500">Surat • Mumbai • Antwerp • Dubai</p>
          </div>
          <div className="text-right">
            <span className="inline-block px-2 py-0.5 bg-slate-900 text-white text-[10px] font-bold uppercase mb-1">
              AUDITED STATEMENT
            </span>
            <div className="text-xs font-mono">{new Date().toLocaleDateString('en-IN')}</div>
          </div>
        </div>

        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900 uppercase">{reportData?.title}</h2>
          <p className="text-xs text-slate-600 italic">{reportData?.subtitle}</p>
        </div>

        {reportData?.kpis && reportData.kpis.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-4">
            {reportData.kpis.map((kpi, idx) => (
              <div key={idx} className="border border-slate-300 p-2 rounded bg-slate-50">
                <span className="text-[8px] font-bold uppercase text-slate-500 block">{kpi.label}</span>
                <span className="text-xs font-bold text-slate-900 block">{kpi.value}</span>
              </div>
            ))}
          </div>
        )}

        <table className="w-full text-left border-collapse text-[9px] mb-8">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="py-1 px-1.5 text-center w-6">#</th>
              {displayedColumns.map((col) => (
                <th key={col.key} className={`py-1 px-1.5 font-bold ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredRows.filter((r, idx) => selectedRowKeys.has(String(r.id || r.rowKey || idx))).map((row, idx) => (
              <tr key={idx} className="even:bg-slate-50">
                <td className="py-1 px-1.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                {displayedColumns.map((col) => (
                  <td key={col.key} className={`py-1 px-1.5 font-medium ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                    {String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t-2 border-slate-300 pt-6 mt-8 grid grid-cols-3 gap-6 text-center page-break-inside-avoid">
          <div>
            <div className="h-10 border-b border-dashed border-slate-400 mb-1"></div>
            <span className="text-[9px] font-bold uppercase text-slate-800 block">PREPARED BY</span>
            <span className="text-[8px] text-slate-500">Accounts & Ledger Executive</span>
          </div>
          <div>
            <div className="h-10 border-b border-dashed border-slate-400 mb-1"></div>
            <span className="text-[9px] font-bold uppercase text-slate-800 block">AUDITED & VERIFIED</span>
            <span className="text-[8px] text-slate-500">Internal Auditor</span>
          </div>
          <div>
            <div className="h-10 border-b border-dashed border-slate-400 mb-1"></div>
            <span className="text-[9px] font-bold uppercase text-slate-800 block">AUTHORIZED SIGNATORY</span>
            <span className="text-[8px] text-slate-500">Director / Managing Partner</span>
          </div>
        </div>
      </div>
    </div>
  );
};
