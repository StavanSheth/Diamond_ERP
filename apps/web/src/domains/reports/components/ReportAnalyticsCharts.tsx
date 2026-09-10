import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { formatCurrency } from '../../../utils/format';
import { CHART_COLORS } from '../reportDefinitions';

interface ReportAnalyticsChartsProps {
  showAnalytics: boolean;
  analyticsData: {
    salesVsPurchases: Array<{ name: string; value: number }>;
    inventoryByCategory: Array<{ name: string; value: number }>;
    certificationStatus: Array<{ name: string; value: number }>;
  } | null;
  onClose: () => void;
}

export const ReportAnalyticsCharts: React.FC<ReportAnalyticsChartsProps> = ({
  showAnalytics,
  analyticsData,
  onClose,
}) => {
  const { t } = useTranslation();

  if (!showAnalytics || !analyticsData) {
    return null;
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs transition-all no-print">
      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <span className="material-symbols-outlined text-indigo-600 text-[20px]">insights</span>
          {t('Diamond Inventory & Financial Visual Analytics')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
        >
          {t('Close')}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/40">
          <h3 className="text-xs font-bold text-slate-700 mb-2">{t('Sales vs Purchases (Value ₹)')}</h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analyticsData.salesVsPurchases} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(val) => `₹${(val / 100000).toFixed(1)}L`} />
                <RechartsTooltip formatter={(val: any) => formatCurrency(Number(val) || 0)} />
                <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={45} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/40">
          <h3 className="text-xs font-bold text-slate-700 mb-2">{t('Inventory by Category (₹ Value)')}</h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analyticsData.inventoryByCategory}
                  cx="50%"
                  cy="50%"
                  outerRadius={65}
                  dataKey="value"
                  nameKey="name"
                >
                  {analyticsData.inventoryByCategory?.map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(val: any) => formatCurrency(Number(val) || 0)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/40">
          <h3 className="text-xs font-bold text-slate-700 mb-2">{t('Certification Status (Stone Count)')}</h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analyticsData.certificationStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={65}
                  dataKey="value"
                  nameKey="name"
                >
                  {analyticsData.certificationStatus?.map((_: any, index: number) => (
                    <Cell key={`cell-cert-${index}`} fill={['#10B981', '#94A3B8'][index % 2]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
};
