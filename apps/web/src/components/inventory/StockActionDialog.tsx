import React from 'react';
import { StockItem } from '../../types/stock';

interface StockActionDialogProps {
  open: boolean;
  stock: StockItem | null;
  filters?: Record<string, any>;
  onClose: () => void;
  onEditStock: () => void;
  onManageLedger: (qs?: string) => void;
}

export const StockActionDialog: React.FC<StockActionDialogProps> = ({
  open,
  stock,
  filters,
  onClose,
  onEditStock,
  onManageLedger,
}) => {
  if (!open || !stock) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-md" onClick={onClose}>
      <div 
        className="bg-surface-container-lowest w-full max-w-sm rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-outline-variant p-xl flex flex-col gap-md animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-sm">
          <div className="w-12 h-12 bg-primary-container text-on-primary-container rounded-full flex items-center justify-center mx-auto mb-md">
            <span className="material-symbols-outlined text-[24px]">inventory_2</span>
          </div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-xs">
            {stock.stockName}
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
            {stock.reportGroup} • {stock.location} • {stock.caratWeight} ct
          </p>
        </div>

        <button
          onClick={() => { onClose(); onEditStock(); }}
          className="w-full flex items-center gap-md p-md rounded-lg border border-outline-variant hover:bg-surface-container hover:border-primary transition-all group text-left"
        >
          <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">edit_square</span>
          <div className="flex-1">
            <h4 className="font-body-lg font-bold text-on-surface group-hover:text-primary transition-colors">Edit Stock Details</h4>
            <p className="font-caption text-caption text-on-surface-variant">Update identity, location, and remarks</p>
          </div>
          <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
        </button>

        <button
          onClick={() => { 
            onClose(); 
            let queryString = undefined;
            if (filters) {
               const qs = new URLSearchParams();
               Object.entries(filters).forEach(([k,v]) => {
                  if (v && v !== 'All') qs.append(k, String(v));
               });
               qs.set('stock', stock.id);
               queryString = qs.toString();
            }
            onManageLedger(queryString); 
          }}
          className="w-full flex items-center gap-md p-md rounded-lg border border-outline-variant hover:bg-surface-container hover:border-primary transition-all group text-left"
        >
          <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">receipt_long</span>
          <div className="flex-1">
            <h4 className="font-body-lg font-bold text-on-surface group-hover:text-primary transition-colors">Manage Ledger</h4>
            <p className="font-caption text-caption text-on-surface-variant">View history and add transactions</p>
          </div>
          <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
        </button>

      </div>
    </div>
  );
};
