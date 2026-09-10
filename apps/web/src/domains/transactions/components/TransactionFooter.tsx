import React from 'react';
import { useTranslation } from 'react-i18next';

interface TransactionFooterProps {
  items: Array<{ carat?: string | number; totalValue?: string | number }>;
  saving: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}

export const TransactionFooter: React.FC<TransactionFooterProps> = ({
  items,
  saving,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();

  const totalCarat = items
    .reduce((acc, curr) => acc + (parseFloat(String(curr.carat || 0)) || 0), 0)
    .toFixed(2);

  const totalValue = items
    .reduce((acc, curr) => acc + (parseFloat(String(curr.totalValue || 0)) || 0), 0)
    .toFixed(2);

  return (
    <div className="px-xl py-lg border-t border-outline-variant bg-[#FAFAFA] rounded-b-2xl flex items-center justify-between shrink-0 flex-wrap gap-md">
      <div className="flex items-center gap-md">
        {/* Total Items */}
        <div className="flex items-center gap-md bg-white border border-[#E3F2FD] px-md py-2 rounded-xl shadow-sm min-w-[140px]">
          <span className="material-symbols-outlined text-[#1976D2] text-[24px]">diamond</span>
          <div className="flex flex-col">
            <span className="text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">
              Total Items
            </span>
            <span className="text-base font-extrabold text-on-surface">{items.length}</span>
          </div>
        </div>
        {/* Total Carat */}
        <div className="flex items-center gap-md bg-white border border-[#F3E5F5] px-md py-2 rounded-xl shadow-sm min-w-[140px]">
          <span className="material-symbols-outlined text-[#8E24AA] text-[24px]">scale</span>
          <div className="flex flex-col">
            <span className="text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">
              Total Carat
            </span>
            <span className="text-base font-extrabold text-on-surface">{totalCarat} ct</span>
          </div>
        </div>
        {/* Est. Total Value */}
        <div className="flex items-center gap-md bg-white border border-[#E8F5E9] px-md py-2 rounded-xl shadow-sm min-w-[140px]">
          <span className="material-symbols-outlined text-[#2E7D32] text-[24px]">payments</span>
          <div className="flex flex-col">
            <span className="text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">
              Est. Total Value
            </span>
            <span className="text-base font-extrabold text-on-surface">₹ {totalValue}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-md ml-auto">
        <div className="flex-1" />

        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-lg py-2.5 font-bold text-on-surface bg-white border border-outline-variant hover:bg-surface-container rounded-lg transition-colors flex items-center gap-xs shadow-sm disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">close</span> {t('Cancel')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-xl py-2.5 font-bold bg-[#3949AB] hover:bg-[#283593] text-white rounded-lg transition-colors flex items-center gap-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
        >
          <span className="material-symbols-outlined text-[18px]">lock</span>
          {saving ? 'Saving...' : t('Save Transaction')}
          {!saving && <span className="material-symbols-outlined text-[20px]">arrow_forward</span>}
        </button>
      </div>
    </div>
  );
};
