import React, { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../../utils/format';

interface PaymentSummaryBannerProps {
  stockId?: string;
  partyId?: string;
  itemCode?: string;
  onAgeChange?: (days: string) => void;
  defaultAge?: string;
}

export const PaymentSummaryBanner: React.FC<PaymentSummaryBannerProps> = ({ 
  stockId, 
  partyId, 
  itemCode,
  onAgeChange,
  defaultAge = ''
}) => {
  const [agingDays, setAgingDays] = useState<string>(defaultAge);
  const [summary, setSummary] = useState({
    payableDue: 0,
    payablePaid: 0,
    receivableDue: 0,
    receivableCollected: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getPaymentSummary(stockId, partyId, itemCode, agingDays || undefined)
      .then(res => {
        if (res.success) {
          setSummary(res.data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [stockId, partyId, itemCode, agingDays]);

  const handleSelectAge = (days: string) => {
    setAgingDays(days);
    if (onAgeChange) {
      onAgeChange(days);
    }
  };

  const { t } = useTranslation();

  return (
    <div className="bg-surface border-b border-outline-variant px-margin-page py-xs flex flex-wrap justify-between items-center gap-md shadow-xs z-10 shrink-0">
      <div className="flex items-center gap-lg flex-wrap py-1">
        <div className="flex items-center gap-xs">
          <span className="material-symbols-outlined text-[#E65100] text-[18px]">account_balance_wallet</span>
          <span className="font-caption text-caption font-bold text-on-surface-variant uppercase">{t('TO PAY (VENDOR DUE)')}:</span>
          <span className="font-kpi-numeric text-[15px] font-extrabold text-[#E65100] tabular-nums">{formatCurrency(summary.payableDue)}</span>
          <span className="font-caption text-[11px] text-outline ml-xs">({t('Paid')}: {formatCurrency(summary.payablePaid)})</span>
        </div>
        <div className="h-4 w-px bg-outline-variant hidden sm:block" />
        <div className="flex items-center gap-xs">
          <span className="material-symbols-outlined text-[#1565C0] text-[18px]">payments</span>
          <span className="font-caption text-caption font-bold text-on-surface-variant uppercase">{t('TO COLLECT (CLIENT DUE)')}:</span>
          <span className="font-kpi-numeric text-[15px] font-extrabold text-[#1565C0] tabular-nums">{formatCurrency(summary.receivableDue)}</span>
          <span className="font-caption text-[11px] text-outline ml-xs">({t('Collected')}: {formatCurrency(summary.receivableCollected)})</span>
        </div>
      </div>

      {/* Aging Filter Pills */}
      <div className="flex items-center gap-xs py-1 flex-wrap">
        <span className="font-caption text-[11px] uppercase font-bold text-on-surface-variant mr-1 flex items-center gap-0.5">
          <span className="material-symbols-outlined text-[14px]">schedule</span>
          Aging:
        </span>
        {[
          { label: 'All', value: '' },
          { label: '> 15d', value: '15' },
          { label: '> 30d', value: '30' },
          { label: '> 45d', value: '45' },
          { label: '> 60d', value: '60' },
        ].map((item) => {
          const isActive = agingDays === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => handleSelectAge(item.value)}
              className={`px-2 py-0.5 rounded-full font-caption text-[11px] font-bold transition-all ${
                isActive
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
