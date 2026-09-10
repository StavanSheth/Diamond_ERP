import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SHAPE_OPTIONS,
  COLOR_OPTIONS,
  CLARITY_OPTIONS,
  CUT_OPTIONS,
  SYMMETRY_OPTIONS,
  POLISH_OPTIONS,
  FY_OPTIONS,
  PARTY_TYPE_OPTIONS,
  STATUS_OPTIONS,
} from '../reportDefinitions';

interface ReportFilterSectionProps {
  showAdvancedFilters: boolean;
  setShowAdvancedFilters: (show: boolean) => void;
  activeFiltersCount: number;
  handleResetAllFilters: () => void;
  selectedFYs: string[];
  setSelectedFYs: React.Dispatch<React.SetStateAction<string[]>>;
  reportType: string;
  setReportType: (type: string) => void;
  selectedPartyTypes: string[];
  setSelectedPartyTypes: React.Dispatch<React.SetStateAction<string[]>>;
  selectedPartyIds: string[];
  setSelectedPartyIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedStockIds: string[];
  setSelectedStockIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedStatuses: string[];
  setSelectedStatuses: React.Dispatch<React.SetStateAction<string[]>>;
  partiesList: any[];
  stocksList: any[];
  toggleItem: (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, item: string) => void;
  paymentDirection: string;
  setPaymentDirection: (val: string) => void;
  agingDays: string;
  setAgingDays: (val: string) => void;
  hasCert: boolean;
  setHasCert: (val: boolean) => void;
  hasRepair: boolean;
  setHasRepair: (val: boolean) => void;
  selectedShapes: string[];
  setSelectedShapes: React.Dispatch<React.SetStateAction<string[]>>;
  selectedColors: string[];
  setSelectedColors: React.Dispatch<React.SetStateAction<string[]>>;
  selectedClarities: string[];
  setSelectedClarities: React.Dispatch<React.SetStateAction<string[]>>;
  selectedCuts: string[];
  setSelectedCuts: React.Dispatch<React.SetStateAction<string[]>>;
  selectedPolishes: string[];
  setSelectedPolishes: React.Dispatch<React.SetStateAction<string[]>>;
  selectedSymmetries: string[];
  setSelectedSymmetries: React.Dispatch<React.SetStateAction<string[]>>;
  minCarat: string;
  setMinCarat: (val: string) => void;
  maxCarat: string;
  setMaxCarat: (val: string) => void;
  minPrice: string;
  setMinPrice: (val: string) => void;
  maxPrice: string;
  setMaxPrice: (val: string) => void;
  category: string;
  setCategory: (val: string) => void;
  onApplyFilters: () => void;
}

export const ReportFilterSection: React.FC<ReportFilterSectionProps> = ({
  showAdvancedFilters,
  setShowAdvancedFilters,
  activeFiltersCount,
  handleResetAllFilters,
  selectedFYs,
  setSelectedFYs,
  reportType,
  setReportType,
  selectedPartyTypes,
  setSelectedPartyTypes,
  selectedPartyIds,
  setSelectedPartyIds,
  selectedStockIds,
  setSelectedStockIds,
  selectedStatuses,
  setSelectedStatuses,
  partiesList,
  stocksList,
  toggleItem,
  paymentDirection,
  setPaymentDirection,
  agingDays,
  setAgingDays,
  hasCert,
  setHasCert,
  hasRepair,
  setHasRepair,
  selectedShapes,
  setSelectedShapes,
  selectedColors,
  setSelectedColors,
  selectedClarities,
  setSelectedClarities,
  selectedCuts,
  setSelectedCuts,
  selectedPolishes,
  setSelectedPolishes,
  selectedSymmetries,
  setSelectedSymmetries,
  minCarat,
  setMinCarat,
  maxCarat,
  setMaxCarat,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  category,
  setCategory,
  onApplyFilters,
}) => {
  const { t } = useTranslation();
  const [partySearch, setPartySearch] = useState<string>('');
  const [stockSearch, setStockSearch] = useState<string>('');

  const displayedParties = useMemo(() => {
    if (!partySearch.trim()) return partiesList;
    const q = partySearch.toLowerCase();
    return partiesList.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.partyType || '').toLowerCase().includes(q)
    );
  }, [partiesList, partySearch]);

  const displayedStocks = useMemo(() => {
    if (!stockSearch.trim()) return stocksList;
    const q = stockSearch.toLowerCase();
    return stocksList.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.stockCode || '').toLowerCase().includes(q)
    );
  }, [stocksList, stockSearch]);

  if (!showAdvancedFilters) {
    return null;
  }

  return (
    <section
      id="advanced-filters-section"
      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5 transition-all no-print animate-fade-in-up"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-indigo-600 text-[22px]">tune</span>
          <h3 className="text-sm font-bold text-slate-900">
            {t('Comprehensive Report Filters & Specifications')}
          </h3>
          {activeFiltersCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {activeFiltersCount} {t('Active')}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleResetAllFilters}
          className="text-xs font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
        >
          {t('Reset All Filters to Default')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-5 text-xs">
        {/* Panel 1: Financial Years & Accounting Presets */}
        <div className="space-y-3 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200">
          <span className="font-bold text-slate-800 block uppercase tracking-wider text-[11px]">
            {t('1. Financial Year(s) (FY Checkboxes)')}
          </span>
          <div className="space-y-1.5">
            {FY_OPTIONS.map((fy) => (
              <label
                key={fy.id}
                className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900"
              >
                <input
                  type="checkbox"
                  checked={selectedFYs.includes(fy.id)}
                  onChange={() => toggleItem(selectedFYs, setSelectedFYs, fy.id)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-medium text-[11px]">{fy.label}</span>
              </label>
            ))}
          </div>

          {/* Primary Report Type selector */}
          <div className="pt-2 border-t border-slate-200">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              {t('Statement Format / Nature')}
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg p-2 text-slate-800"
            >
              <option value="PROFIT_AND_LOSS">Profit & Loss (P&L) Statement (Banking Standard)</option>
              <option value="FY_25_26">Trading Statement (Debit / Credit / Balances)</option>
              <option value="AUDIT_RECONCILIATION">Stock Reconciliation Audit</option>
              <option value="INVENTORY_ITEMS">Granular Stone Register (4Cs)</option>
              <option value="INVENTORY_SUMMARY">Stock Master (Parcel Level)</option>
              <option value="BROKERAGE">Brokerage Commission Audit</option>
              <option value="PARTY_STATEMENT">Party Ledger Statements</option>
              <option value="CERTIFICATES">Lab Certification Register</option>
              <option value="REPAIRS">Workshop Repairs Register</option>
              <option value="AGING_DUES">Payment Due & Aging Report</option>
            </select>
          </div>
        </div>

        {/* Panel 2: Parties & Party Types */}
        <div className="space-y-3 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200">
          <span className="font-bold text-slate-800 block uppercase tracking-wider text-[11px]">
            {t('2. Party Types & Counterparties')}
          </span>

          {/* Party Type Checkboxes */}
          <div className="grid grid-cols-2 gap-1.5">
            {PARTY_TYPE_OPTIONS.map((pt) => (
              <label key={pt.id} className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedPartyTypes.includes(pt.id)}
                  onChange={() => toggleItem(selectedPartyTypes, setSelectedPartyTypes, pt.id)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-medium text-[11px]">{pt.label}</span>
              </label>
            ))}
          </div>

          {/* Counterparty Search & Multi-select */}
          <div className="pt-2 border-t border-slate-200">
            <input
              type="text"
              placeholder={t('Search parties...')}
              value={partySearch}
              onChange={(e) => setPartySearch(e.target.value)}
              className="w-full p-1.5 text-xs bg-white border border-slate-300 rounded mb-1.5"
            />
            <div className="max-h-28 overflow-y-auto space-y-1 bg-white p-2 rounded border border-slate-200">
              {displayedParties.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedPartyIds.includes(p.id)}
                    onChange={() => toggleItem(selectedPartyIds, setSelectedPartyIds, p.id)}
                    className="rounded text-indigo-600"
                  />
                  <span className="truncate">
                    {p.name} ({p.partyType || 'CLIENT'})
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Panel 3: Stocks & Statuses */}
        <div className="space-y-3 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200">
          <span className="font-bold text-slate-800 block uppercase tracking-wider text-[11px]">
            {t('3. Stocks & Status Checkboxes')}
          </span>

          {/* Status Checkboxes */}
          <div className="grid grid-cols-2 gap-1.5">
            {STATUS_OPTIONS.map((st) => (
              <label key={st.id} className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(st.id)}
                  onChange={() => toggleItem(selectedStatuses, setSelectedStatuses, st.id)}
                  className="rounded text-indigo-600"
                />
                <span className="font-medium text-[11px]">{st.label}</span>
              </label>
            ))}
          </div>

          {/* Stock Search & Multi-select */}
          <div className="pt-2 border-t border-slate-200">
            <input
              type="text"
              placeholder={t('Search stocks...')}
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              className="w-full p-1.5 text-xs bg-white border border-slate-300 rounded mb-1.5"
            />
            <div className="max-h-28 overflow-y-auto space-y-1 bg-white p-2 rounded border border-slate-200">
              {displayedStocks.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedStockIds.includes(s.id)}
                    onChange={() => toggleItem(selectedStockIds, setSelectedStockIds, s.id)}
                    className="rounded text-indigo-600"
                  />
                  <span className="truncate">{s.name || s.stockName}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Panel 4: Payment Due & Aging Filter */}
        <div className="space-y-3 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200">
          <span className="font-bold text-slate-800 block uppercase tracking-wider text-[11px]">
            {t('4. Payment Due & Aging')}
          </span>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              {t('Payment Direction')}
            </label>
            <select
              value={paymentDirection}
              onChange={(e) => setPaymentDirection(e.target.value)}
              className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg p-2 text-slate-800"
            >
              <option value="ALL">{t('All Directions (Default)')}</option>
              <option value="CLIENTS_DUE">{t('Clients Due (To Receive)')}</option>
              <option value="VENDORS_DUE">{t('Vendors Due (To Pay)')}</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              {t('Overdue Aging Period')}
            </label>
            <select
              value={agingDays}
              onChange={(e) => setAgingDays(e.target.value)}
              className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg p-2 text-slate-800"
            >
              <option value="">{t('Any Due (Default)')}</option>
              <option value="15">{t('> 15 Days Overdue')}</option>
              <option value="30">{t('> 30 Days Overdue')}</option>
              <option value="45">{t('> 45 Days Overdue')}</option>
              <option value="60">{t('> 60 Days Overdue')}</option>
            </select>
          </div>

          {/* Special Toggles */}
          <div className="pt-2 border-t border-slate-200 space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasCert}
                onChange={(e) => setHasCert(e.target.checked)}
                className="rounded text-indigo-600"
              />
              <span className="font-semibold text-slate-700">{t('Has Certified Items')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasRepair}
                onChange={(e) => setHasRepair(e.target.checked)}
                className="rounded text-indigo-600"
              />
              <span className="font-semibold text-slate-700">{t('Has Items in Repair')}</span>
            </label>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          DIAMOND 4Cs & SPECIFICATIONS MULTI-SELECT CHECKBOXES
          ═══════════════════════════════════════════════════════════ */}
      <div className="border-t border-slate-200 pt-4 space-y-3">
        <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] block">
          {t('Diamond 4Cs & Specifications (Multi-Select Pills)')}
        </span>

        {/* Shape Checkboxes */}
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Shape:</span>
          <div className="flex flex-wrap gap-1.5">
            {SHAPE_OPTIONS.map((sh) => {
              const isSel = selectedShapes.includes(sh);
              return (
                <button
                  key={sh}
                  type="button"
                  onClick={() => toggleItem(selectedShapes, setSelectedShapes, sh)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    isSel
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-indigo-300'
                  }`}
                >
                  {sh}
                </button>
              );
            })}
          </div>
        </div>

        {/* Color Checkboxes */}
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Color:</span>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_OPTIONS.map((col) => {
              const isSel = selectedColors.includes(col);
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => toggleItem(selectedColors, setSelectedColors, col)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold border flex items-center justify-center transition-all ${
                    isSel
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-indigo-300'
                  }`}
                >
                  {col}
                </button>
              );
            })}
          </div>
        </div>

        {/* Clarity Checkboxes */}
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Clarity:</span>
          <div className="flex flex-wrap gap-1.5">
            {CLARITY_OPTIONS.map((cl) => {
              const isSel = selectedClarities.includes(cl);
              return (
                <button
                  key={cl}
                  type="button"
                  onClick={() => toggleItem(selectedClarities, setSelectedClarities, cl)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    isSel
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-indigo-300'
                  }`}
                >
                  {cl}
                </button>
              );
            })}
          </div>
        </div>

        {/* Cut, Polish, Symmetry Checkboxes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cut:</span>
            <div className="flex gap-1.5">
              {CUT_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleItem(selectedCuts, setSelectedCuts, c)}
                  className={`px-2 py-1 rounded text-xs font-semibold border ${
                    selectedCuts.includes(c)
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Polish:</span>
            <div className="flex gap-1.5">
              {POLISH_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleItem(selectedPolishes, setSelectedPolishes, p)}
                  className={`px-2 py-1 rounded text-xs font-semibold border ${
                    selectedPolishes.includes(p)
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Symmetry:</span>
            <div className="flex gap-1.5">
              {SYMMETRY_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleItem(selectedSymmetries, setSelectedSymmetries, s)}
                  className={`px-2 py-1 rounded text-xs font-semibold border ${
                    selectedSymmetries.includes(s)
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Ranges: Carat Weight & Price */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Carat Range:</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="Min Ct"
                value={minCarat}
                onChange={(e) => setMinCarat(e.target.value)}
                className="w-full p-1.5 text-xs bg-white border border-slate-300 rounded"
              />
              <span className="text-slate-400">–</span>
              <input
                type="number"
                placeholder="Max Ct"
                value={maxCarat}
                onChange={(e) => setMaxCarat(e.target.value)}
                className="w-full p-1.5 text-xs bg-white border border-slate-300 rounded"
              />
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Price Range (₹):</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="Min ₹"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="w-full p-1.5 text-xs bg-white border border-slate-300 rounded"
              />
              <span className="text-slate-400">–</span>
              <input
                type="number"
                placeholder="Max ₹"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-full p-1.5 text-xs bg-white border border-slate-300 rounded"
              />
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Category:</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full p-1.5 text-xs bg-white border border-slate-300 rounded"
            >
              <option value="ALL">All Categories</option>
              <option value="SINGLE">Single Stone</option>
              <option value="PARCEL">Parcel / Lot</option>
            </select>
          </div>
        </div>
      </div>

      {/* Sticky Action Footer */}
      <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/90 -mx-5 -mb-5 p-4 rounded-b-2xl">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="material-symbols-outlined text-[18px] text-indigo-600">filter_alt</span>
          <span>
            <strong>{activeFiltersCount}</strong> {t('active filter criteria configured')}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetAllFilters}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all cursor-pointer"
          >
            {t('Reset Filters')}
          </button>
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(false)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all cursor-pointer"
          >
            {t('Close')}
          </button>
          <button
            type="button"
            id="btn-apply-filters-panel"
            onClick={() => {
              setShowAdvancedFilters(false);
              onApplyFilters();
              const tableEl = document.getElementById('report-data-table-section');
              if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            {t('Apply Filters & Update Table')}
          </button>
        </div>
      </div>
    </section>
  );
};
