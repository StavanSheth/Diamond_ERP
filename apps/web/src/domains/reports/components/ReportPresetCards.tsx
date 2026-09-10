import React from 'react';
import { useTranslation } from 'react-i18next';
import { QUICK_PRESETS, QuickPreset } from '../reportDefinitions';

interface ReportPresetCardsProps {
  reportType: string;
  selectedFYs: string[];
  onApplyPreset: (preset: QuickPreset) => void;
  onSelectFY: (reportType: string, fyId: string) => void;
}

export const ReportPresetCards: React.FC<ReportPresetCardsProps> = ({
  reportType,
  selectedFYs,
  onApplyPreset,
  onSelectFY,
}) => {
  const { t } = useTranslation();

  return (
    <section className="no-print">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {t('Quick Launch Statutory Statements & Presets')}
        </h2>
        <span className="text-[11px] text-slate-400">
          {t('Click any card to auto-configure filters')}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {QUICK_PRESETS.map((preset, idx) => {
          const isActive = reportType === preset.reportType;
          const topBorderColor = [
            'border-t-indigo-600',
            'border-t-emerald-600',
            'border-t-amber-500',
            'border-t-purple-600',
            'border-t-sky-500',
          ][idx % 5];

          return (
            <div
              key={preset.id}
              onClick={() => onApplyPreset(preset)}
              className={`p-3.5 rounded-xl border-x border-b border-black/[0.08] ${topBorderColor} border-t-[3.5px] cursor-pointer transition-all relative group flex flex-col justify-between ${
                isActive
                  ? 'bg-indigo-50/50 ring-2 ring-indigo-200/60 shadow-sm'
                  : 'bg-white hover:border-black/20 hover:shadow-xs'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`p-1.5 rounded-lg ${
                      isActive
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px] block">{preset.icon}</span>
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${preset.badgeBg} ${preset.badgeText}`}
                  >
                    {preset.badge}
                  </span>
                </div>
                <h3 className="text-xs font-bold text-slate-900 line-clamp-1">{preset.title}</h3>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                  {preset.desc}
                </p>

                {/* Interactive Year Selector */}
                {preset.hasYearSelector && (
                  <div
                    className="mt-2.5 pt-2 border-t border-black/[0.06] flex flex-wrap gap-1 items-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[9px] font-bold text-slate-400 uppercase mr-0.5">FY:</span>
                    {[
                      { id: '2024-25', label: '24-25' },
                      { id: '2025-26', label: '25-26' },
                      { id: '2026-27', label: '26-27' },
                      { id: 'ALL_TIME', label: 'All' },
                    ].map((fy) => {
                      const isFySel = selectedFYs.includes(fy.id) && isActive;
                      return (
                        <button
                          key={fy.id}
                          type="button"
                          onClick={() => onSelectFY(preset.reportType, fy.id)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${
                            isFySel
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'
                          }`}
                        >
                          {fy.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-3 pt-2 border-t border-black/[0.06] flex items-center justify-between text-[11px] font-medium text-indigo-600">
                <span>{isActive ? t('Active Selection') : t('Select Report')}</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
