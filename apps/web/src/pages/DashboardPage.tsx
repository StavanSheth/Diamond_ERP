import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { StockItem } from '../types/stock';

interface DashboardPageProps {
  stocks: StockItem[];
  loading: boolean;
  lastSyncedAt: string | null;
}

import { formatCurrency, formatNumber } from '../utils/format';
import { useTranslation } from 'react-i18next';
import { LocationManagerCard } from '../components/locations/LocationManagerCard';

const fmt = formatCurrency;
const fmtShort = (v: number) => {
  if (v >= 10000000) return '₹' + formatNumber(v / 10000000) + ' Cr';
  if (v >= 100000) return '₹' + formatNumber(v / 100000) + ' L';
  if (v >= 1000) return '₹' + formatNumber(v / 1000, 1, 1) + 'K';
  return formatCurrency(v);
};

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-status-success',
  PARTIAL: 'bg-status-partial',
  SOLD_OUT: 'bg-[#D32F2F]',
  ARCHIVED: 'bg-status-archived',
};

const statusHex: Record<string, string> = {
  ACTIVE: '#2E7D32',
  PARTIAL: '#ED6C02',
  SOLD_OUT: '#D32F2F',
  ARCHIVED: '#757575',
};

const statusLabels: Record<string, string> = {
  ACTIVE: 'Active',
  PARTIAL: 'Partial',
  SOLD_OUT: 'Sold Out',
  ARCHIVED: 'Archived',
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ stocks, loading, lastSyncedAt }) => {
  const navigate = useNavigate();

  const kpis = useMemo(() => {
    const list = Array.isArray(stocks) ? stocks : [];
    const totalValue = list.reduce((sum, s) => sum + (s.totalValue || 0), 0);
    const totalCarats = list.reduce((sum, s) => sum + (s.caratWeight || 0), 0);
    const activeParcels = list.filter((s) => s.status === 'ACTIVE').length;
    const avgRate = totalCarats > 0 ? totalValue / totalCarats : 0;

    const byStatus: Record<string, number> = {};
    list.forEach((s) => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });

    const topStocks = [...list].sort((a, b) => b.totalValue - a.totalValue).slice(0, 5);

    const recentActivity = [...list]
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      .slice(0, 8);

    return { totalValue, totalCarats, activeParcels, avgRate, byStatus, topStocks, recentActivity };
  }, [stocks]);

  const totalStocks = Object.values(kpis.byStatus).reduce((a, b) => a + b, 0);
  
  let currentAngle = 0;
  const pieGradient = totalStocks > 0 ? `conic-gradient(${Object.entries(kpis.byStatus).map(([status, count]) => {
    const percentage = (count / totalStocks) * 100;
    const color = statusHex[status] || '#9E9E9E';
    const start = currentAngle;
    currentAngle += percentage;
    return `${color} ${start}% ${currentAngle}%`;
  }).join(', ')})` : '';

  return (
    <div className="flex-1 overflow-y-auto p-margin-page bg-surface-bright">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-gutter mb-xl">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface mb-xs">Dashboard</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Real-time overview of your diamond inventory.
            {lastSyncedAt && (
              <span className="ml-sm text-outline">Last synced: {new Date(lastSyncedAt).toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => navigate('/inventory')}
          className="flex items-center gap-xs px-md py-sm bg-primary text-on-primary rounded-lg hover:bg-surface-tint transition-colors font-headline-sm text-headline-sm shadow-sm"
        >
          <span className="material-symbols-outlined text-[20px]">inventory_2</span>
          View Inventory
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter mb-xl">
        {/* Total Stock Value */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
          <div className="flex items-center justify-between mb-md">
            <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Total Stock Value</span>
            <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[18px]">account_balance_wallet</span>
            </div>
          </div>
          {loading ? (
            <div className="h-8 skeleton rounded w-3/4" />
          ) : (
            <p className="font-kpi-numeric text-kpi-numeric text-on-surface tabular-nums">{fmtShort(kpis.totalValue)}</p>
          )}
          <p className="font-caption text-caption text-on-surface-variant mt-xs">{fmt(kpis.totalValue)}</p>
        </div>

        {/* Total Carats */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-secondary-container" />
          <div className="flex items-center justify-between mb-md">
            <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Total Carats</span>
            <div className="w-8 h-8 rounded-full bg-secondary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-secondary text-[18px]">diamond</span>
            </div>
          </div>
          {loading ? (
            <div className="h-8 skeleton rounded w-2/3" />
          ) : (
            <p className="font-kpi-numeric text-kpi-numeric text-on-surface tabular-nums">{formatNumber(kpis.totalCarats)} ct</p>
          )}
          <p className="font-caption text-caption text-on-surface-variant mt-xs">Across {(stocks || []).length} parcels</p>
        </div>

        {/* Active Parcels */}
        <div 
          className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg relative overflow-hidden cursor-pointer hover:border-primary transition-colors"
          onClick={() => navigate('/inventory?status=ACTIVE')}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-status-success" />
          <div className="flex items-center justify-between mb-md">
            <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Active Parcels</span>
            <div className="w-8 h-8 rounded-full bg-status-success/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-status-success text-[18px]">check_circle</span>
            </div>
          </div>
          {loading ? (
            <div className="h-8 skeleton rounded w-1/2" />
          ) : (
            <p className="font-kpi-numeric text-kpi-numeric text-on-surface tabular-nums">{kpis.activeParcels}</p>
          )}
          <p className="font-caption text-caption text-on-surface-variant mt-xs">of {(stocks || []).length} total</p>
        </div>

        {/* Avg Rate */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-tertiary" />
          <div className="flex items-center justify-between mb-md">
            <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Avg Rate/Ct</span>
            <div className="w-8 h-8 rounded-full bg-tertiary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-tertiary text-[18px]">trending_up</span>
            </div>
          </div>
          {loading ? (
            <div className="h-8 skeleton rounded w-2/3" />
          ) : (
            <p className="font-kpi-numeric text-kpi-numeric text-on-surface tabular-nums">{fmt(kpis.avgRate)}</p>
          )}
          <p className="font-caption text-caption text-on-surface-variant mt-xs">Weighted average</p>
        </div>
      </div>

      {/* Second Row: Stock Distribution + Top Stocks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter mb-xl">
        {/* Stock Distribution by Status */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg">
          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-lg flex items-center gap-xs">
            <span className="material-symbols-outlined text-primary text-[20px]">donut_small</span>
            Stock Distribution
          </h3>
          <div className="flex flex-col md:flex-row gap-xl items-center justify-center p-md">
            {loading ? (
              <div className="flex flex-col md:flex-row gap-xl items-center justify-center p-md w-full">
                <div className="w-44 h-44 rounded-full skeleton" />
                <div className="flex flex-col gap-sm w-40">
                  <div className="h-4 skeleton rounded w-full" />
                  <div className="h-4 skeleton rounded w-3/4" />
                  <div className="h-4 skeleton rounded w-5/6" />
                </div>
              </div>
            ) : totalStocks > 0 ? (
              <>
                {/* Donut Chart */}
                <div 
                  className="w-48 h-48 rounded-full shadow-inner relative flex items-center justify-center transition-all duration-500"
                  style={{ background: pieGradient }}
                >
                  <div className="w-32 h-32 bg-surface-container-lowest rounded-full shadow-sm flex items-center justify-center flex-col">
                    <span className="text-on-surface font-headline-sm font-bold tabular-nums">{totalStocks}</span>
                    <span className="text-on-surface-variant text-[10px] font-bold uppercase tracking-wider">Stocks</span>
                  </div>
                </div>
                
                {/* Legend */}
                <div className="flex flex-col gap-sm">
                  {Object.entries(kpis.byStatus).map(([status, count]) => (
                    <div 
                      key={status} 
                      className="flex items-center gap-md cursor-pointer group hover:bg-surface-container-low px-sm py-xs rounded-lg transition-colors"
                      onClick={() => navigate(`/inventory?status=${status}`)}
                    >
                      <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: statusHex[status] || '#9E9E9E' }} />
                      <span className="font-body-md text-body-md text-on-surface-variant w-20 shrink-0 group-hover:text-primary transition-colors">
                        {statusLabels[status] || status}
                      </span>
                      <span className="font-body-md text-on-surface font-bold w-8 text-right tabular-nums">{count}</span>
                      <span className="text-xs text-outline w-10 text-right tabular-nums">{((count / totalStocks) * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="font-body-md text-body-md text-on-surface-variant text-center py-lg w-full">No stocks yet. Add your first stock parcel!</p>
            )}
          </div>
        </div>

        {/* Top 5 Stocks by Value */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg">
          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-lg flex items-center gap-xs">
            <span className="material-symbols-outlined text-secondary-container text-[20px]">leaderboard</span>
            Top Stocks by Value
          </h3>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-sm flex flex-col gap-sm">
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-surface-container">
                    <div className="h-4 skeleton rounded w-28" />
                    <div className="h-4 skeleton rounded w-16" />
                    <div className="h-4 skeleton rounded w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-outline-variant">
                    <th className="font-caption text-caption text-on-surface-variant uppercase tracking-wider text-left py-sm">#</th>
                    <th className="font-caption text-caption text-on-surface-variant uppercase tracking-wider text-left py-sm">Name</th>
                    <th className="font-caption text-caption text-on-surface-variant uppercase tracking-wider text-right py-sm">Carats</th>
                    <th className="font-caption text-caption text-on-surface-variant uppercase tracking-wider text-right py-sm">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.topStocks.map((stock, i) => (
                    <tr key={stock.id} className="border-b border-surface-container last:border-0 hover:bg-surface-container-low transition-colors">
                      <td className="py-sm font-body-md text-body-md text-on-surface-variant">{i + 1}</td>
                      <td className="py-sm font-body-md text-body-md text-on-surface font-semibold">{stock.stockName}</td>
                      <td className="py-sm font-body-md text-body-md text-on-surface text-right tabular-nums">{(stock.caratWeight || 0).toFixed(2)}</td>
                      <td className="py-sm font-body-md text-body-md text-on-surface text-right tabular-nums font-semibold">{fmtShort(stock.totalValue || 0)}</td>
                    </tr>
                  ))}
                  {kpis.topStocks.length === 0 && (
                    <tr><td colSpan={4} className="py-lg text-center font-body-md text-on-surface-variant">No data</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Inventory Locations Management */}
      <div className="mb-xl">
        <LocationManagerCard />
      </div>

      {/* Recent Activity */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg mb-xxl">
        <h3 className="font-headline-sm text-headline-sm text-on-surface mb-lg flex items-center gap-xs">
          <span className="material-symbols-outlined text-tertiary text-[20px]">history</span>
          Recent Activity
        </h3>
        <div className="flex flex-col gap-sm">
          {loading ? (
            <div className="flex flex-col gap-sm">
              {[1, 2, 3].map((idx) => (
                <div key={idx} className="flex items-center gap-md px-md py-sm border-b border-surface-container">
                  <div className="w-8 h-8 rounded-full skeleton shrink-0" />
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="h-4 skeleton rounded w-1/3" />
                    <div className="h-3 skeleton rounded w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {kpis.recentActivity.map((stock) => (
                <div key={stock.id} className="flex items-center gap-md px-md py-sm rounded-lg hover:bg-surface-container-low transition-colors border-b border-surface-container last:border-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    stock.version === 1 ? 'bg-transaction-add/10' : 'bg-primary-fixed'
                  }`}>
                    <span className={`material-symbols-outlined text-[16px] ${
                      stock.version === 1 ? 'text-transaction-add' : 'text-primary'
                    }`}>
                      {stock.version === 1 ? 'add_circle' : 'edit'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body-md text-body-md text-on-surface font-semibold truncate">{stock.stockName}</p>
                    <p className="font-caption text-caption text-on-surface-variant">
                      {stock.version === 1 ? 'Created' : `Updated (v${stock.version})`} • {stock.location?.split(' - ')[0]}
                    </p>
                  </div>
                  <span className="font-caption text-caption text-outline shrink-0">
                    {stock.updatedAt ? new Date(stock.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                  </span>
                </div>
              ))}
              {kpis.recentActivity.length === 0 && (
                <p className="font-body-md text-body-md text-on-surface-variant text-center py-lg">No activity yet</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
