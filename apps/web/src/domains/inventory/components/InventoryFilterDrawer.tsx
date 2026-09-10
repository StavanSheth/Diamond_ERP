import React from 'react';
import {
  SHAPES as SHAPE_OPTIONS,
  COLORS as COLOR_OPTIONS,
  CLARITIES as CLARITY_OPTIONS,
  CUTS as CUT_OPTIONS,
  SYMMETRIES as SYMMETRY_OPTIONS,
  POLISHES as POLISH_OPTIONS,
} from '../../../types/stock';

interface InventoryFilterDrawerProps {
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  activeFilterCount: number;
  selectedShapes: string[];
  setSelectedShapes: React.Dispatch<React.SetStateAction<string[]>>;
  selectedColors: string[];
  setSelectedColors: React.Dispatch<React.SetStateAction<string[]>>;
  selectedClarities: string[];
  setSelectedClarities: React.Dispatch<React.SetStateAction<string[]>>;
  selectedCuts: string[];
  setSelectedCuts: React.Dispatch<React.SetStateAction<string[]>>;
  selectedSymmetries: string[];
  setSelectedSymmetries: React.Dispatch<React.SetStateAction<string[]>>;
  selectedPolishes: string[];
  setSelectedPolishes: React.Dispatch<React.SetStateAction<string[]>>;
  paymentDirection: string;
  setPaymentDirection: (dir: string) => void;
  agingDays: string;
  setAgingDays: (days: string) => void;
  locationFilter: string;
  setLocationFilter: (loc: string) => void;
  minCarat: string;
  setMinCarat: (val: string) => void;
  maxCarat: string;
  setMaxCarat: (val: string) => void;
  minPrice: string;
  setMinPrice: (val: string) => void;
  maxPrice: string;
  setMaxPrice: (val: string) => void;
  hasRepairs: boolean;
  setHasRepairs: (val: boolean) => void;
  hasCertificates: boolean;
  setHasCertificates: (val: boolean) => void;
  category: string;
  setCategory: (cat: string) => void;
  transactionType: string;
  setTransactionType: (txn: string) => void;
  onResetAll: () => void;
  onApply: () => void;
  toggleMultiSelect: (
    item: string,
    selectedList: string[],
    setSelectedList: React.Dispatch<React.SetStateAction<string[]>>
  ) => void;
}

export const InventoryFilterDrawer: React.FC<InventoryFilterDrawerProps> = ({
  showAdvanced,
  setShowAdvanced,
  activeFilterCount,
  selectedShapes,
  setSelectedShapes,
  selectedColors,
  setSelectedColors,
  selectedClarities,
  setSelectedClarities,
  selectedCuts,
  setSelectedCuts,
  selectedSymmetries,
  setSelectedSymmetries,
  selectedPolishes,
  setSelectedPolishes,
  paymentDirection,
  setPaymentDirection,
  agingDays,
  setAgingDays,
  locationFilter,
  setLocationFilter,
  minCarat,
  setMinCarat,
  maxCarat,
  setMaxCarat,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  hasRepairs,
  setHasRepairs,
  hasCertificates,
  setHasCertificates,
  category,
  setCategory,
  transactionType,
  setTransactionType,
  onResetAll,
  onApply,
  toggleMultiSelect,
}) => {
  if (!showAdvanced) return null;

  return (
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
            onClick={onResetAll}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
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
                Shape{' '}
                {selectedShapes.length > 0 && (
                  <span className="text-emerald-600">({selectedShapes.length})</span>
                )}
              </span>
              {selectedShapes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedShapes([])}
                  className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer"
                >
                  Clear
                </button>
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
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-500 font-semibold shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`w-3 h-3 rounded flex items-center justify-center text-[9px] border ${
                        active
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
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
                Color{' '}
                {selectedColors.length > 0 && (
                  <span className="text-emerald-600">({selectedColors.length})</span>
                )}
              </span>
              {selectedColors.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedColors([])}
                  className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer"
                >
                  Clear
                </button>
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
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-500 font-semibold shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`w-3 h-3 rounded flex items-center justify-center text-[9px] border ${
                        active
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
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
                Clarity{' '}
                {selectedClarities.length > 0 && (
                  <span className="text-emerald-600">({selectedClarities.length})</span>
                )}
              </span>
              {selectedClarities.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedClarities([])}
                  className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer"
                >
                  Clear
                </button>
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
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-500 font-semibold shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`w-3 h-3 rounded flex items-center justify-center text-[9px] border ${
                        active
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
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
                Cut{' '}
                {selectedCuts.length > 0 && (
                  <span className="text-emerald-600">({selectedCuts.length})</span>
                )}
              </span>
              {selectedCuts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCuts([])}
                  className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer"
                >
                  Clear
                </button>
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
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-500 font-semibold shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`w-3 h-3 rounded flex items-center justify-center text-[9px] border ${
                        active
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
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
                Symmetry{' '}
                {selectedSymmetries.length > 0 && (
                  <span className="text-emerald-600">({selectedSymmetries.length})</span>
                )}
              </span>
              {selectedSymmetries.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedSymmetries([])}
                  className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer"
                >
                  Clear
                </button>
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
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-500 font-semibold shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`w-3 h-3 rounded flex items-center justify-center text-[9px] border ${
                        active
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
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
                Polish{' '}
                {selectedPolishes.length > 0 && (
                  <span className="text-emerald-600">({selectedPolishes.length})</span>
                )}
              </span>
              {selectedPolishes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedPolishes([])}
                  className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer"
                >
                  Clear
                </button>
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
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-500 font-semibold shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`w-3 h-3 rounded flex items-center justify-center text-[9px] border ${
                        active
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
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
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all text-center cursor-pointer ${
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
                  className={`py-1.5 px-1 rounded-lg text-xs font-semibold border transition-all text-center cursor-pointer ${
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
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Category
            </label>
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
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Transaction Type
            </label>
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
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Location
            </label>
            <input
              type="text"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              placeholder="e.g. Vault, Mumbai"
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Carat Weight
            </label>
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
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Price Range (₹)
            </label>
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
          onClick={onResetAll}
          className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          Clear All Filters
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(false)}
            className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onApply}
            className="px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">check</span>
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};
