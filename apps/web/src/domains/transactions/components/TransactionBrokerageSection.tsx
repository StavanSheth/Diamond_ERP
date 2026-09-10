import React from 'react';

interface TransactionBrokerageSectionProps {
  isBroker: boolean;
  selectedPartyConfig: any;
  totalTransactionValue: number;
  brokerageType: 'INCLUSIVE' | 'EXCLUSIVE';
  setBrokerageType: (type: 'INCLUSIVE' | 'EXCLUSIVE') => void;
  brokeragePercentage: string;
  setBrokeragePercentage: (pct: string) => void;
  brokerageAmount: string;
  setBrokerageAmount: (amt: string) => void;
}

export const TransactionBrokerageSection: React.FC<TransactionBrokerageSectionProps> = ({
  isBroker,
  selectedPartyConfig,
  totalTransactionValue,
  brokerageType,
  setBrokerageType,
  brokeragePercentage,
  setBrokeragePercentage,
  brokerageAmount,
  setBrokerageAmount,
}) => {
  if (!isBroker) return null;

  return (
    <div className="flex flex-col gap-md bg-purple-50/80 p-md rounded-xl border border-purple-200 animate-fade-in shadow-2xs">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-sm">
        <div className="flex items-center gap-sm">
          <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px]">handshake</span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-purple-950 flex items-center gap-1.5">
              Brokerage Commission
              {selectedPartyConfig && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${selectedPartyConfig.badgeClass}`}>
                  {selectedPartyConfig.badgeText}
                </span>
              )}
            </h4>
            <p className="text-xs text-purple-700">
              Calculated on Deal Value:{' '}
              <span className="font-bold font-mono">
                ₹{totalTransactionValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </p>
          </div>
        </div>

        {/* Inclusive vs Exclusive Segmented Selector */}
        <div className="flex items-center bg-white p-1 rounded-xl border border-purple-300 shadow-2xs">
          <button
            type="button"
            onClick={() => setBrokerageType('INCLUSIVE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              brokerageType === 'INCLUSIVE'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'text-purple-900 hover:bg-purple-100/60'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {brokerageType === 'INCLUSIVE' ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            Inclusive (Default)
          </button>
          <button
            type="button"
            onClick={() => setBrokerageType('EXCLUSIVE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              brokerageType === 'EXCLUSIVE'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'text-purple-900 hover:bg-purple-100/60'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {brokerageType === 'EXCLUSIVE' ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            Exclusive
          </button>
        </div>
      </div>

      {/* Rate and Amount Inputs & Explanation */}
      <div className="flex flex-wrap items-center justify-between gap-md pt-2 border-t border-purple-200/70">
        <div className="flex flex-wrap items-center gap-md">
          <div className="flex items-center gap-xs">
            <label className="text-xs font-bold text-purple-900 shrink-0">Brokerage Rate (%):</label>
            <div className="relative w-28">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={brokeragePercentage}
                onChange={(e) => setBrokeragePercentage(e.target.value)}
                placeholder="0.00"
                className="w-full pl-sm pr-6 py-1.5 border border-purple-300 rounded-lg text-sm bg-white font-bold text-purple-950 focus:ring-2 focus:ring-purple-400 focus:outline-none"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-purple-700">%</span>
            </div>
          </div>
          <div className="flex items-center gap-xs">
            <label className="text-xs font-bold text-purple-900 shrink-0">Commission (₹):</label>
            <div className="relative w-36">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-purple-700">₹</span>
              <input
                type="number"
                step="0.01"
                value={brokerageAmount}
                onChange={(e) => setBrokerageAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-6 pr-sm py-1.5 border border-purple-300 rounded-lg text-sm bg-white font-bold text-purple-950 focus:ring-2 focus:ring-purple-400 focus:outline-none shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* Live Formula / Breakdown Note */}
        <div className="text-xs text-purple-900 bg-purple-100/70 px-3 py-1.5 rounded-lg border border-purple-200 font-medium">
          {brokerageType === 'INCLUSIVE' ? (
            <span>
              <strong>Inclusive:</strong> Brokerage is deducted from deal total. Net goods value:{' '}
              <strong className="font-mono text-purple-950">
                ₹
                {Math.max(
                  0,
                  totalTransactionValue - (parseFloat(brokerageAmount) || 0)
                ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </strong>
            </span>
          ) : (
            <span>
              <strong>Exclusive:</strong> Brokerage is added on top. Total settlement amount:{' '}
              <strong className="font-mono text-purple-950">
                ₹
                {(
                  totalTransactionValue + (parseFloat(brokerageAmount) || 0)
                ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
