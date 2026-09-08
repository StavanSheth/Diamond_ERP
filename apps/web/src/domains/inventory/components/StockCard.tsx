import React from 'react';
import { StockItem } from '../../../types/stock';
import { StatusBadge } from '../../common/components/StatusBadge';
import { formatCurrency, formatNumber } from '../../../utils/format';
import { getFloralPalette } from '../../../utils/floralColors';

interface StockCardProps {
  stock: StockItem;
  onClick: (stock: StockItem) => void;
  onDelete: (stock: StockItem) => void;
}

export const StockCard: React.FC<StockCardProps> = ({ stock, onClick, onDelete }) => {
  const floral = getFloralPalette(stock.id || stock.stockName);

  return (
    <div
      className={`stock-card rounded-xl border-x border-b border-black/[0.08] ${floral.topBorder} border-t-[3.5px] bg-white shadow-xs hover:shadow-md transition-all duration-200 relative overflow-hidden flex flex-col justify-between group cursor-pointer h-full min-h-[230px]`}
      onClick={() => onClick(stock)}
    >
      {/* Header */}
      <div className="p-4 border-b border-black/[0.06] bg-white flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-mono font-semibold text-slate-400 tracking-wider block mb-0.5 uppercase">
            {stock.reportGroup || 'PARCEL'}
          </span>
          <h3 className={`text-sm font-bold text-slate-900 group-hover:${floral.accentText} transition-colors truncate leading-tight`}>
            {stock.stockName}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px] text-slate-400">location_on</span>
            <span>{stock.location || 'Vault'}</span>
          </p>
        </div>
        <StatusBadge status={stock.status} />
      </div>

      {/* KPI Grid */}
      <div className="p-4 flex-1 grid grid-cols-2 gap-3 content-center bg-white text-xs">
        <div>
          <div className="flex items-center gap-1 mb-0.5">
            <span className="material-symbols-outlined text-[14px] text-indigo-500">diamond</span>
            <span className="text-[11px] font-medium text-slate-400">Total Carat</span>
          </div>
          <p className="text-sm font-bold tabular-nums text-slate-800">
            {formatNumber(stock.caratWeight)} <span className="text-[11px] font-normal text-slate-400">ct</span>
          </p>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-0.5">
            <span className="material-symbols-outlined text-[14px] text-amber-500">sell</span>
            <span className="text-[11px] font-medium text-slate-400">Rate / Ct</span>
          </div>
          <p className="text-sm font-bold tabular-nums text-slate-800">
            {formatCurrency(stock.caratRate)}
          </p>
        </div>
        <div className="col-span-2 pt-2.5 mt-0.5 border-t border-black/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px] text-emerald-500">account_balance_wallet</span>
            <span className="text-[11px] font-medium text-slate-400">Total Valuation</span>
          </div>
          <p className={`text-base font-bold tabular-nums ${floral.accentText}`}>
            {formatCurrency(stock.totalValue)}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 bg-slate-50/70 border-t border-black/[0.06] flex justify-between items-center text-xs mt-auto">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white text-slate-700 text-[11px] font-medium border border-black/[0.06] shadow-2xs">
            <span className="material-symbols-outlined text-[13px] text-slate-500">inventory_2</span>
            <span className="font-semibold">{stock.itemCount}</span> {stock.itemCount === 1 ? 'item' : 'items'}
          </span>

          {/* Derived Aggregates Mini-Badges */}
          {stock.certifiedCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60 px-1.5 py-0.5 rounded-full" title={`${stock.certifiedCount} Certified`}>
              <span className="material-symbols-outlined text-[11px]">verified</span>
              C:{stock.certifiedCount}
            </span>
          )}
          {stock.repairCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 px-1.5 py-0.5 rounded-full" title={`${stock.repairCount} In Repair`}>
              <span className="material-symbols-outlined text-[11px]">build</span>
              R:{stock.repairCount}
            </span>
          )}
        </div>

        {/* Quick actions on hover */}
        <div className="quick-actions flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(stock); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Delete Stock"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
