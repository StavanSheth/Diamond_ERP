import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer
} from 'recharts';
import { api } from '../services/api';
import { formatCurrency } from '../utils/format';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export const ReportsPage: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await api.getReports();
        if (res.success) {
          setData(res.data);
        }
      } catch (err) {
        console.error('Failed to fetch reports', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-bright overflow-hidden">
      <header className="px-margin-page py-lg bg-surface border-b border-outline-variant shrink-0">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">{t('Reports')}</h2>
          <p className="font-body-md text-on-surface-variant mt-xs">
            {t('Detailed visual analytics for your diamond inventory and transactions.')}
          </p>
        </div>
      </header>

      <div className="flex-1 p-margin-page overflow-y-auto">
        {loading ? (
          <div className="flex justify-center items-center h-64 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-[32px]">progress_activity</span>
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-xl max-w-7xl mx-auto">
            {/* Sales vs Purchases */}
            <div className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface mb-lg">
                {t('Sales vs Purchases (Total Value ₹)')}
              </h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.salesVsPurchases} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(val) => `₹${(val / 100000).toFixed(1)}L`} />
                    <RechartsTooltip formatter={(val: any) => formatCurrency(Number(val) || 0)} />
                    <Legend />
                    <Bar dataKey="value" name={t('Value')} fill="#1565C0" radius={[4, 4, 0, 0]} maxBarSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Inventory By Category */}
            <div className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface mb-lg">
                {t('Inventory by Category (Value ₹)')}
              </h3>
              <div className="h-80 w-full">
                {data.inventoryByCategory && data.inventoryByCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.inventoryByCategory}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                      >
                        {data.inventoryByCategory.map((_: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(val: any) => formatCurrency(Number(val) || 0)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-on-surface-variant">
                    {t('No inventory data available')}
                  </div>
                )}
              </div>
            </div>

            {/* Certification Status */}
            <div className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm md:col-span-2 max-w-3xl mx-auto w-full">
              <h3 className="font-title-lg font-bold text-on-surface mb-lg text-center">
                {t('Certification Status (Item Count)')}
              </h3>
              <div className="h-80 w-full">
                {data.certificationStatus && data.certificationStatus.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.certificationStatus}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        fill="#82ca9d"
                        dataKey="value"
                        nameKey="name"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {data.certificationStatus.map((_: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={['#4CAF50', '#9E9E9E'][index % 2]} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-on-surface-variant">
                    {t('No certification data available')}
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : (
          <div className="flex justify-center items-center h-64 text-on-surface-variant">
            {t('No data available to display reports.')}
          </div>
        )}
      </div>
    </div>
  );
};
