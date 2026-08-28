import React from 'react';
import { StockItem, getStockColor } from '../../types/stock';
import { StatusBadge } from '../common/StatusBadge';

interface StockCardProps {
  stock: StockItem;
  onClick: (stock: StockItem) => void;
  onDelete: (stock: StockItem) => void;
}



import { formatCurrency, formatNumber } from '../../utils/format';

export const StockCard: React.FC<StockCardProps> = ({ stock, onClick, onDelete }) => {

  const stockColor = getStockColor(stock.stockName);

  return (
    <div
      className={`stock-card rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden flex flex-col group cursor-pointer ${stockColor.bg} ${stockColor.border}`}
      onClick={() => onClick(stock)}
    >
      {/* Header */}
      <div className="p-md border-b flex justify-between items-start" style={{ borderColor: 'inherit' }}>
        <div className="min-w-0 flex-1">
          <h3 className={`font-headline-sm text-headline-sm leading-tight truncate ${stockColor.text}`}>
            {stock.stockName}
          </h3>
          <p className="font-caption text-caption mt-[2px] truncate opacity-80" style={{ color: 'inherit' }}>
            {stock.reportGroup} • {stock.location}
          </p>
        </div>
        <StatusBadge status={stock.status} />
      </div>

      {/* KPI Grid */}
      <div className="p-md flex-1 grid grid-cols-2 gap-sm content-center">
        <div>
          <p className="font-caption text-caption mb-xs opacity-70" style={{ color: 'inherit' }}>Total Carat</p>
          <p className={`font-kpi-numeric text-kpi-numeric tabular-nums font-bold ${stockColor.text}`}>{formatNumber(stock.caratWeight)}</p>
        </div>
        <div>
          <p className="font-caption text-caption mb-xs opacity-70" style={{ color: 'inherit' }}>Rate/Ct</p>
          <p className={`font-kpi-numeric text-kpi-numeric tabular-nums font-bold ${stockColor.text}`}>{formatCurrency(stock.caratRate)}</p>
        </div>
        <div className="col-span-2 mt-xs">
          <p className="font-caption text-caption mb-xs opacity-70" style={{ color: 'inherit' }}>Total Value</p>
          <p className={`font-headline-md text-headline-md tabular-nums font-bold ${stockColor.text}`}>{formatCurrency(stock.totalValue)}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-md border-t border-surface-container flex justify-between items-center relative">
        <span className="inline-flex items-center gap-xs px-2 py-1 rounded-full bg-surface-container text-on-surface-variant font-caption text-caption border border-outline-variant">
          <span className="w-2 h-2 rounded-full bg-outline" />
          {stock.itemCount} {stock.itemCount === 1 ? 'item' : 'items'}
        </span>

        {/* Derived Aggregates Mini-Badges */}
        <div className="flex gap-1 ml-2">
          {(stock as any).certifiedCount > 0 && (
            <span className="text-[10px] bg-[#E8F5E9] text-[#2E7D32] px-1 rounded" title={`${(stock as any).certifiedCount} Certified`}>
              C:{(stock as any).certifiedCount}
            </span>
          )}
          {(stock as any).repairCount > 0 && (
            <span className="text-[10px] bg-[#FFF8E1] text-[#F9A825] px-1 rounded" title={`${(stock as any).repairCount} In Repair`}>
              R:{(stock as any).repairCount}
            </span>
          )}
        </div>

        {/* Quick actions on hover */}
        <div className="quick-actions flex gap-xs">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(stock); }}
            className="p-xs rounded-full hover:bg-error-container text-on-surface-variant hover:text-error transition-colors"
            title="Delete"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>

        <span className="font-caption text-caption text-outline">
          {stock.location?.split(' - ')[0] || ''}
        </span>
      </div>
    </div>
  );
};
