import React from 'react';
import { useTranslation } from 'react-i18next';

interface TransactionPaymentSectionProps {
  txnType: string;
  paymentStatus: string;
  setPaymentStatus: (status: string) => void;
  paymentDone: string;
  setPaymentDone: (amt: string) => void;
}

export const TransactionPaymentSection: React.FC<TransactionPaymentSectionProps> = ({
  txnType,
  paymentStatus,
  setPaymentStatus,
  paymentDone,
  setPaymentDone,
}) => {
  const { t } = useTranslation();

  if (txnType !== 'SALE' && txnType !== 'PURCHASE') {
    return null;
  }

  return (
    <div className="flex flex-col md:flex-row gap-lg bg-primary-container/30 p-md rounded-xl border border-primary-container">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-sm font-bold text-on-surface-variant mb-1">
          {t('Payment Status')}
        </label>
        <select
          value={paymentStatus}
          onChange={(e) => setPaymentStatus(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:border-primary font-medium"
        >
          <option value="PENDING">{t('Payment Left / Due')}</option>
          <option value="PARTIAL">{t('Partial')}</option>
          <option value="COMPLETED">{t('Payment Done')}</option>
        </select>
      </div>
      {(paymentStatus === 'PARTIAL' || paymentStatus === 'COMPLETED') && (
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-bold text-on-surface-variant mb-1">Amount Paid (₹)</label>
          <input
            type="number"
            value={paymentDone}
            onChange={(e) => setPaymentDone(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:border-primary font-medium"
            placeholder="0.00"
          />
        </div>
      )}
    </div>
  );
};
