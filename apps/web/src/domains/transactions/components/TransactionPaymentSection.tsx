import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../../utils/format';

interface TransactionPaymentSectionProps {
  txnType: string;
  paymentType: 'TO_PAY' | 'TO_COLLECT' | string;
  setPaymentType: (type: 'TO_PAY' | 'TO_COLLECT') => void;
  paymentStatus: string;
  setPaymentStatus: (status: string) => void;
  paymentDone: string;
  setPaymentDone: (amt: string) => void;
  totalTransactionValue?: number;
}

export const TransactionPaymentSection: React.FC<TransactionPaymentSectionProps> = ({
  txnType,
  paymentType,
  setPaymentType,
  paymentStatus,
  setPaymentStatus,
  paymentDone,
  setPaymentDone,
  totalTransactionValue = 0,
}) => {
  const { t } = useTranslation();

  const isToCollect = paymentType === 'TO_COLLECT';
  const numericPaymentDone = parseFloat(paymentDone || '0') || 0;
  const remainingDue = Math.max(0, totalTransactionValue - numericPaymentDone);

  // If status is COMPLETED and paymentDone is empty or 0, auto-fill with totalTransactionValue
  const handleSelectStatus = (status: string) => {
    setPaymentStatus(status);
    if (status === 'COMPLETED') {
      if (totalTransactionValue > 0) {
        setPaymentDone(totalTransactionValue.toFixed(2));
      }
    } else if (status === 'PENDING') {
      setPaymentDone('0');
    }
  };

  const handleSelectDirection = (type: 'TO_PAY' | 'TO_COLLECT') => {
    setPaymentType(type);
  };

  return (
    <div className="bg-[#F8FAFC] p-md rounded-2xl border border-outline-variant shadow-xs flex flex-col gap-md">
      {/* Header & Direction Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-sm border-b border-outline-variant/60 pb-sm">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow-xs ${isToCollect ? 'bg-emerald-600' : 'bg-amber-600'}`}>
            <span className="material-symbols-outlined text-[18px]">
              {isToCollect ? 'arrow_downward' : 'arrow_upward'}
            </span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-on-surface m-0 leading-tight">
              {t('Payment Settlement')}
            </h4>
            <span className="text-[11px] text-on-surface-variant">
              {isToCollect ? t('Incoming Payment from Customer / Counterparty') : t('Outgoing Payment to Supplier / Vendor')}
            </span>
          </div>
        </div>

        {/* Direction Toggle Buttons */}
        <div className="inline-flex rounded-xl p-1 bg-surface-container border border-outline-variant/80 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => handleSelectDirection('TO_COLLECT')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              isToCollect
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-800 hover:bg-emerald-50/80'
            }`}
            title="Payment to be collected / received (Receivable)"
          >
            <span className="material-symbols-outlined text-[16px]">call_received</span>
            <span>{t('To Collect (Receive)')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectDirection('TO_PAY')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              !isToCollect
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-800 hover:bg-amber-50/80'
            }`}
            title="Payment to be given / paid (Payable)"
          >
            <span className="material-symbols-outlined text-[16px]">call_made</span>
            <span>{t('To Pay (Give)')}</span>
          </button>
        </div>
      </div>

      {/* Payment Status Buttons */}
      <div className="flex flex-col gap-xs">
        <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          {t('Payment Status')}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-sm">
          {/* PENDING / LEFT */}
          <button
            type="button"
            onClick={() => handleSelectStatus('PENDING')}
            className={`flex items-center justify-center gap-2 px-md py-2.5 rounded-xl border text-xs font-bold transition-all ${
              paymentStatus === 'PENDING'
                ? 'bg-rose-50 border-rose-400 text-rose-700 shadow-xs ring-2 ring-rose-300/40'
                : 'bg-white border-outline-variant text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {paymentStatus === 'PENDING' ? 'pending' : 'radio_button_unchecked'}
            </span>
            <span>
              {isToCollect ? t('To Collect (Payment Left)') : t('To Pay (Payment Left)')}
            </span>
          </button>

          {/* PARTIAL */}
          <button
            type="button"
            onClick={() => handleSelectStatus('PARTIAL')}
            className={`flex items-center justify-center gap-2 px-md py-2.5 rounded-xl border text-xs font-bold transition-all ${
              paymentStatus === 'PARTIAL'
                ? 'bg-amber-50 border-amber-400 text-amber-700 shadow-xs ring-2 ring-amber-300/40'
                : 'bg-white border-outline-variant text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {paymentStatus === 'PARTIAL' ? 'timelapse' : 'radio_button_unchecked'}
            </span>
            <span>
              {isToCollect ? t('Partial Collected') : t('Partial Paid')}
            </span>
          </button>

          {/* COMPLETED / DONE */}
          <button
            type="button"
            onClick={() => handleSelectStatus('COMPLETED')}
            className={`flex items-center justify-center gap-2 px-md py-2.5 rounded-xl border text-xs font-bold transition-all ${
              paymentStatus === 'COMPLETED'
                ? 'bg-emerald-50 border-emerald-400 text-emerald-700 shadow-xs ring-2 ring-emerald-300/40'
                : 'bg-white border-outline-variant text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {paymentStatus === 'COMPLETED' ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            <span>
              {isToCollect ? t('Payment Collected (Done)') : t('Payment Given (Done)')}
            </span>
          </button>
        </div>
      </div>

      {/* Amount Inputs & Settlement Summary */}
      {(paymentStatus === 'PARTIAL' || paymentStatus === 'COMPLETED') && (
        <div className="pt-xs grid grid-cols-1 sm:grid-cols-2 gap-md items-end animate-fade-in">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
              {isToCollect ? t('Amount Collected / Received (₹)') : t('Amount Paid / Given (₹)')}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-outline">
                ₹
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={paymentDone}
                onChange={(e) => setPaymentDone(e.target.value)}
                className="w-full pl-8 pr-4 py-2.5 bg-white border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm font-bold text-on-surface"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex items-center justify-between bg-white border border-outline-variant p-2.5 rounded-xl text-xs font-medium">
            <span className="text-on-surface-variant font-semibold">
              {isToCollect ? t('Remaining To Collect:') : t('Remaining To Pay:')}
            </span>
            <span className={`text-sm font-bold tabular-nums ${remainingDue > 0 ? (isToCollect ? 'text-emerald-700' : 'text-amber-700') : 'text-slate-500'}`}>
              {formatCurrency(remainingDue)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
