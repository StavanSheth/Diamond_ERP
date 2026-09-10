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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-gutter mb-xl pb-md border-b border-outline-variant/50">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shadow-2xs border border-blue-100 shrink-0">
            <span className="material-symbols-outlined text-[24px]">dashboard</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-on-surface m-0 leading-tight">Executive Dashboard</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync
              </span>
            </div>
            <p className="text-xs text-on-surface-variant m-0 mt-0.5">
              Real-time valuation, carats breakdown, and inventory audit metrics.
              {lastSyncedAt && (
                <span className="ml-2 text-outline font-medium">Last synced: {new Date(lastSyncedAt).toLocaleTimeString()}</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/inventory')}
          className="flex items-center gap-2 px-md py-2 bg-primary hover:bg-[#0D47A1] text-white rounded-xl transition-all font-bold text-xs shadow-xs hover:shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">inventory_2</span>
          View Full Inventory
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter mb-xl">
        {/* Total Stock Value */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs hover:shadow-xs transition-all">
          <div className="h-1 bg-emerald-600" />
          <div className="p-lg">
            <div className="flex items-center justify-between mb-md">
              <span className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant">Total Portfolio Value</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shadow-2xs border border-emerald-100">
                <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
              </div>
            </div>
            {loading ? (
              <div className="h-8 skeleton rounded w-3/4" />
            ) : (
              <p className="text-2xl sm:text-3xl font-bold font-mono text-on-surface tracking-tight tabular-nums m-0">{fmtShort(kpis.totalValue)}</p>
            )}
            <p className="text-[11px] text-emerald-800 font-semibold mt-1 bg-emerald-50/70 border border-emerald-100 px-2 py-0.5 rounded-md inline-block">
              {fmt(kpis.totalValue)}
            </p>
          </div>
        </div>

        {/* Total Carats */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs hover:shadow-xs transition-all">
          <div className="h-1 bg-blue-600" />
          <div className="p-lg">
            <div className="flex items-center justify-between mb-md">
              <span className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant">Total Carat Weight</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shadow-2xs border border-blue-100">
                <span className="material-symbols-outlined text-[20px]">diamond</span>
              </div>
            </div>
            {loading ? (
              <div className="h-8 skeleton rounded w-2/3" />
            ) : (
              <p className="text-2xl sm:text-3xl font-bold font-mono text-on-surface tracking-tight tabular-nums m-0">{formatNumber(kpis.totalCarats)} <span className="text-sm font-normal text-on-surface-variant">ct</span></p>
            )}
            <p className="text-[11px] text-blue-800 font-semibold mt-1 bg-blue-50/70 border border-blue-100 px-2 py-0.5 rounded-md inline-block">
              Across {(stocks || []).length} parcel lots
            </p>
          </div>
        </div>

        {/* Active Parcels */}
        <div 
          className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs hover:shadow-xs hover:border-indigo-400 transition-all cursor-pointer group"
          onClick={() => navigate('/inventory?status=ACTIVE')}
        >
          <div className="h-1 bg-indigo-600" />
          <div className="p-lg">
            <div className="flex items-center justify-between mb-md">
              <span className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant group-hover:text-indigo-700 transition-colors">Active Parcels</span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shadow-2xs border border-indigo-100 group-hover:bg-indigo-100 transition-colors">
                <span className="material-symbols-outlined text-[20px]">verified</span>
              </div>
            </div>
            {loading ? (
              <div className="h-8 skeleton rounded w-1/2" />
            ) : (
              <p className="text-2xl sm:text-3xl font-bold font-mono text-on-surface tracking-tight tabular-nums m-0">{kpis.activeParcels}</p>
            )}
            <p className="text-[11px] text-indigo-800 font-semibold mt-1 bg-indigo-50/70 border border-indigo-100 px-2 py-0.5 rounded-md inline-block">
              {kpis.activeParcels} of {(stocks || []).length} parcels active
            </p>
          </div>
        </div>

        {/* Avg Rate */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs hover:shadow-xs transition-all">
          <div className="h-1 bg-amber-500" />
          <div className="p-lg">
            <div className="flex items-center justify-between mb-md">
              <span className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant">Avg Rate / Carat</span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shadow-2xs border border-amber-100">
                <span className="material-symbols-outlined text-[20px]">trending_up</span>
              </div>
            </div>
            {loading ? (
              <div className="h-8 skeleton rounded w-2/3" />
            ) : (
              <p className="text-2xl sm:text-3xl font-bold font-mono text-on-surface tracking-tight tabular-nums m-0">{fmt(kpis.avgRate)}</p>
            )}
            <p className="text-[11px] text-amber-800 font-semibold mt-1 bg-amber-50/70 border border-amber-100 px-2 py-0.5 rounded-md inline-block">
              Weighted average per carat
            </p>
          </div>
        </div>
      </div>

      {/* Second Row: Stock Distribution + Top Stocks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter mb-xl">
        {/* Stock Distribution by Status */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
          <div className="h-1 bg-blue-600" />
          <div className="p-lg">
            <div className="flex items-center gap-2.5 mb-lg pb-sm border-b border-outline-variant/60">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-[18px]">donut_small</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">Stock Parcel Distribution</h3>
                <p className="text-[11px] text-on-surface-variant m-0">Breakdown of inventory parcels by current lifecycle stage</p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-xl items-center justify-center p-md bg-white rounded-xl border border-outline-variant/50 shadow-2xs">
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
                    className="w-48 h-48 rounded-full shadow-inner relative flex items-center justify-center transition-all duration-500 shrink-0"
                    style={{ background: pieGradient }}
                  >
                    <div className="w-32 h-32 bg-white rounded-full shadow-sm flex items-center justify-center flex-col border border-slate-100">
                      <span className="text-on-surface text-xl font-bold font-mono tabular-nums">{totalStocks}</span>
                      <span className="text-on-surface-variant text-[10px] font-bold uppercase tracking-wider">Parcels</span>
                    </div>
                  </div>
                  
                  {/* Legend */}
                  <div className="flex flex-col gap-2 w-full max-w-xs">
                    {Object.entries(kpis.byStatus).map(([status, count]) => (
                      <div 
                        key={status} 
                        className="flex items-center gap-3 cursor-pointer group hover:bg-slate-50 px-3 py-2 rounded-xl border border-outline-variant/40 bg-white transition-all shadow-2xs"
                        onClick={() => navigate(`/inventory?status=${status}`)}
                      >
                        <div className="w-3 h-3 rounded-full shadow-xs shrink-0" style={{ backgroundColor: statusHex[status] || '#9E9E9E' }} />
                        <span className="text-xs font-semibold text-on-surface-variant flex-1 group-hover:text-primary transition-colors">
                          {statusLabels[status] || status}
                        </span>
                        <span className="text-xs font-bold text-on-surface font-mono tabular-nums">{count}</span>
                        <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono tabular-nums">
                          {((count / totalStocks) * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-on-surface-variant text-center py-lg w-full">No stocks yet. Add your first stock parcel!</p>
              )}
            </div>
          </div>
        </div>

        {/* Top 5 Stocks by Value */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
          <div className="h-1 bg-emerald-600" />
          <div className="p-lg">
            <div className="flex items-center gap-2.5 mb-lg pb-sm border-b border-outline-variant/60">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-[18px]">leaderboard</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">Top Stocks by Net Value</h3>
                <p className="text-[11px] text-on-surface-variant m-0">Highest valuation diamond parcels in current inventory</p>
              </div>
            </div>

            <div className="overflow-x-auto bg-white rounded-xl border border-outline-variant/50 shadow-2xs p-xs">
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
                    <tr className="border-b border-outline-variant/60">
                      <th className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider text-left py-2 px-3">#</th>
                      <th className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider text-left py-2 px-3">Stock Parcel</th>
                      <th className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider text-right py-2 px-3">Carats</th>
                      <th className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider text-right py-2 px-3">Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.topStocks.map((stock, i) => (
                      <tr key={stock.id} className="border-b border-outline-variant/40 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3">
                          <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${
                            i === 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                            i === 1 ? 'bg-slate-100 text-slate-700 border border-slate-300' :
                            i === 2 ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                            'bg-surface-container text-on-surface-variant'
                          }`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-xs font-bold text-on-surface block leading-tight">{stock.stockName}</span>
                          <span className="text-[10px] text-on-surface-variant">
                            {stock.itemCount ? `${stock.itemCount} items` : 'Parcel'} • {stock.location || 'Vault'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="text-xs font-mono font-semibold text-on-surface">{(stock.caratWeight || 0).toFixed(2)} ct</span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="text-xs font-mono font-bold text-emerald-700">{fmtShort(stock.totalValue || 0)}</span>
                        </td>
                      </tr>
                    ))}
                    {kpis.topStocks.length === 0 && (
                      <tr><td colSpan={4} className="py-lg text-center text-xs text-on-surface-variant">No stock data available</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inventory Locations Management */}
      <div className="mb-xl">
        <LocationManagerCard />
      </div>

      {/* Recent Activity */}
      <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs mb-xxl">
        <div className="h-1 bg-purple-600" />
        <div className="p-lg">
          <div className="flex items-center gap-2.5 mb-lg pb-sm border-b border-outline-variant/60">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 shadow-2xs">
              <span className="material-symbols-outlined text-[18px]">history</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">Recent Inventory Audit Trail</h3>
              <p className="text-[11px] text-on-surface-variant m-0">Latest parcel modifications, receipts, and version increments</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
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
                  <div key={stock.id} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-outline-variant/50 hover:border-purple-300 hover:shadow-2xs transition-all">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${
                      stock.version === 1 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      <span className="material-symbols-outlined text-[18px]">
                        {stock.version === 1 ? 'add_circle' : 'edit_document'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-on-surface truncate m-0 leading-tight">{stock.stockName}</p>
                      <p className="text-[11px] text-on-surface-variant m-0 mt-0.5">
                        {stock.version === 1 ? 'Initial stock parcel entry' : `Updated parcel parameters (v${stock.version})`} • {stock.location || 'Vault'}
                      </p>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                      {stock.updatedAt ? new Date(stock.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                ))}
                {kpis.recentActivity.length === 0 && (
                  <p className="text-xs text-on-surface-variant text-center py-lg">No recent activity detected</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
