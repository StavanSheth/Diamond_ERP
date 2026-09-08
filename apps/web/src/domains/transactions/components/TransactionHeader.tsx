import React from 'react';
import { useTranslation } from 'react-i18next';

interface TransactionHeaderProps {
  isEdit: boolean;
  onClose: () => void;
  autoSaveDrafts?: boolean;
  onToggleAutoSave?: () => void;
  syncState?: string;
  lastSavedAgo?: number | null;
}

export const TransactionHeader: React.FC<TransactionHeaderProps> = ({
  isEdit,
  onClose,
  autoSaveDrafts = true,
  onToggleAutoSave,
  syncState,
  lastSavedAgo,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between px-xl py-lg border-b border-outline-variant bg-white rounded-t-2xl shrink-0">
      <div className="flex items-center gap-md">
        <div className="w-12 h-12 rounded-xl bg-[#5C6BC0] text-white flex items-center justify-center shadow-sm">
          <span className="material-symbols-outlined text-[28px]">diamond</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <h2 className="font-headline-sm text-headline-sm text-on-surface m-0 font-bold">
            {isEdit ? t('Edit Transaction') : t('Add Transaction')}
          </h2>
          <p className="text-sm text-on-surface-variant m-0">{t('Transaction Items')}</p>
        </div>
      </div>

      <div className="flex items-center gap-md">
        {onToggleAutoSave && (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/90 px-3 py-1.5 rounded-full shadow-2xs">
            <span className="material-symbols-outlined text-[16px] text-slate-500">draft</span>
            <span className="text-xs font-semibold text-slate-600">Draft Auto-Save:</span>
            <button
              type="button"
              onClick={onToggleAutoSave}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoSaveDrafts ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
              role="switch"
              aria-checked={autoSaveDrafts}
              title={autoSaveDrafts ? 'Draft Auto-Save is ON (Click to disable)' : 'Draft Auto-Save is OFF (Click to enable)'}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoSaveDrafts ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-[11px] font-bold ${autoSaveDrafts ? 'text-emerald-700' : 'text-slate-500'}`}>
              {autoSaveDrafts ? 'ON' : 'OFF'}
            </span>
            {autoSaveDrafts && syncState === 'SAVING_LOCAL' && (
              <span className="text-[10px] text-amber-600 animate-pulse font-medium">• Saving...</span>
            )}
            {autoSaveDrafts && lastSavedAgo !== null && (
              <span className="text-[10px] text-slate-400 font-medium">({lastSavedAgo}s ago)</span>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="text-on-surface-variant hover:bg-surface-container hover:text-on-surface p-sm rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-[24px]">close</span>
        </button>
      </div>
    </div>
  );
};
