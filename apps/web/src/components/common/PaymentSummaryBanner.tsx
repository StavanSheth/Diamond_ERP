import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/format';

interface PaymentSummaryBannerProps {
  stockId?: string;
  partyId?: string;
  itemCode?: string;
}

export const PaymentSummaryBanner: React.FC<PaymentSummaryBannerProps> = ({ stockId, partyId, itemCode }) => {
  const [summary, setSummary] = useState({
    payableDue: 0,
    payablePaid: 0,
    receivableDue: 0,
    receivableCollected: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getPaymentSummary(stockId, partyId, itemCode)
      .then(res => {
        if (res.success) {
          setSummary(res.data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [stockId, partyId, itemCode]);

  const { t } = useTranslation();

  if (loading) return null;

  return (
    <div className="bg-surface border-b border-outline-variant px-margin-page py-sm flex justify-between items-center shadow-sm z-10 shrink-0">
      <div className="flex items-center gap-md">
        <div className="flex items-center gap-xs">
          <span className="material-symbols-outlined text-[#E65100] text-[18px]">account_balance_wallet</span>
          <span className="font-caption text-caption text-on-surface-variant">{t('TO PAY')}:</span>
          <span className="font-kpi-numeric text-[16px] text-[#E65100] tabular-nums">{formatCurrency(summary.payableDue)}</span>
          <span className="font-caption text-caption text-outline ml-xs">({t('Paid')}: {formatCurrency(summary.payablePaid)})</span>
        </div>
        <div className="h-4 w-px bg-outline-variant" />
        <div className="flex items-center gap-xs">
          <span className="material-symbols-outlined text-[#1565C0] text-[18px]">payments</span>
          <span className="font-caption text-caption text-on-surface-variant">{t('TO COLLECT')}:</span>
          <span className="font-kpi-numeric text-[16px] text-[#1565C0] tabular-nums">{formatCurrency(summary.receivableDue)}</span>
          <span className="font-caption text-caption text-outline ml-xs">({t('Collected')}: {formatCurrency(summary.receivableCollected)})</span>
        </div>
      </div>
    </div>
  );
};
