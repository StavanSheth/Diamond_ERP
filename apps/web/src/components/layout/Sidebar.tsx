import React, { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppLock } from '../../contexts/AppLockContext';

const SIDEBAR_COLLAPSED_KEY = 'diamonderp-sidebar-collapsed';

interface NavItem {
  to: string;
  icon: string;
  label: string;
  fill?: boolean;
  color: {
    iconText: string;
    iconBg: string;
    activeBg: string;
    activeText: string;
    border: string;
    glow: string;
  };
}

interface NavSection {
  id: string;
  title: string;
  badge: string;
  badgeColor: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    badge: 'CORE',
    badgeColor: 'text-indigo-600 bg-indigo-50 border-indigo-200/60',
    items: [
      {
        to: '/',
        icon: 'dashboard',
        label: 'Dashboard',
        color: {
          iconText: 'text-indigo-600',
          iconBg: 'bg-indigo-50 text-indigo-600 border border-indigo-200/50 group-hover:bg-indigo-600 group-hover:text-white',
          activeBg: 'bg-indigo-50/90 border-indigo-500 shadow-indigo-500/10',
          activeText: 'text-indigo-950 font-bold',
          border: 'border-indigo-400',
          glow: 'rgba(99, 102, 241, 0.25)',
        },
      },
    ],
  },
  {
    id: 'operations',
    title: 'Diamond Operations',
    badge: 'OPS',
    badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200/60',
    items: [
      {
        to: '/inventory',
        icon: 'inventory_2',
        label: 'Inventory',
        fill: true,
        color: {
          iconText: 'text-emerald-600',
          iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-200/50 group-hover:bg-emerald-600 group-hover:text-white',
          activeBg: 'bg-emerald-50/90 border-emerald-500 shadow-emerald-500/10',
          activeText: 'text-emerald-950 font-bold',
          border: 'border-emerald-400',
          glow: 'rgba(16, 185, 129, 0.25)',
        },
      },
      {
        to: '/ledger',
        icon: 'receipt_long',
        label: 'Ledger',
        color: {
          iconText: 'text-amber-600',
          iconBg: 'bg-amber-50 text-amber-600 border border-amber-200/50 group-hover:bg-amber-600 group-hover:text-white',
          activeBg: 'bg-amber-50/90 border-amber-500 shadow-amber-500/10',
          activeText: 'text-amber-950 font-bold',
          border: 'border-amber-400',
          glow: 'rgba(245, 158, 11, 0.25)',
        },
      },
      {
        to: '/certificates',
        icon: 'verified',
        label: 'Certificates',
        color: {
          iconText: 'text-cyan-600',
          iconBg: 'bg-cyan-50 text-cyan-600 border border-cyan-200/50 group-hover:bg-cyan-600 group-hover:text-white',
          activeBg: 'bg-cyan-50/90 border-cyan-500 shadow-cyan-500/10',
          activeText: 'text-cyan-950 font-bold',
          border: 'border-cyan-400',
          glow: 'rgba(6, 182, 212, 0.25)',
        },
      },
      {
        to: '/repairs',
        icon: 'build',
        label: 'Repairs',
        color: {
          iconText: 'text-rose-600',
          iconBg: 'bg-rose-50 text-rose-600 border border-rose-200/50 group-hover:bg-rose-600 group-hover:text-white',
          activeBg: 'bg-rose-50/90 border-rose-500 shadow-rose-500/10',
          activeText: 'text-rose-950 font-bold',
          border: 'border-rose-400',
          glow: 'rgba(244, 63, 94, 0.25)',
        },
      },
      {
        to: '/parties',
        icon: 'domain',
        label: 'Parties',
        color: {
          iconText: 'text-purple-600',
          iconBg: 'bg-purple-50 text-purple-600 border border-purple-200/50 group-hover:bg-purple-600 group-hover:text-white',
          activeBg: 'bg-purple-50/90 border-purple-500 shadow-purple-500/10',
          activeText: 'text-purple-950 font-bold',
          border: 'border-purple-400',
          glow: 'rgba(168, 85, 247, 0.25)',
        },
      },
    ],
  },
  {
    id: 'system',
    title: 'Intelligence & System',
    badge: 'SYSTEM',
    badgeColor: 'text-blue-700 bg-blue-50 border-blue-200/60',
    items: [
      {
        to: '/reports',
        icon: 'analytics',
        label: 'Reports',
        color: {
          iconText: 'text-blue-600',
          iconBg: 'bg-blue-50 text-blue-600 border border-blue-200/50 group-hover:bg-blue-600 group-hover:text-white',
          activeBg: 'bg-blue-50/90 border-blue-500 shadow-blue-500/10',
          activeText: 'text-blue-950 font-bold',
          border: 'border-blue-400',
          glow: 'rgba(37, 99, 235, 0.25)',
        },
      },
      {
        to: '/settings',
        icon: 'settings',
        label: 'Settings',
        color: {
          iconText: 'text-slate-700',
          iconBg: 'bg-slate-100 text-slate-700 border border-slate-200/60 group-hover:bg-slate-700 group-hover:text-white',
          activeBg: 'bg-slate-100/90 border-slate-500 shadow-slate-500/10',
          activeText: 'text-slate-950 font-bold',
          border: 'border-slate-400',
          glow: 'rgba(71, 85, 105, 0.25)',
        },
      },
    ],
  },
];

interface SidebarProps {
  syncStatus: string;
  lastSyncedAt: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ syncStatus, lastSyncedAt }) => {
  const { t } = useTranslation();
  const { isAppLockEnabled, lockNow } = useAppLock();
  const syncTime = lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Never';

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {}
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  return (
    <nav
      className={`sidebar-liquid-glass flex flex-col h-full py-5 hidden md:flex shrink-0 relative z-30 select-none ${
        collapsed ? 'sidebar-collapsed px-2.5 items-center' : 'sidebar-expanded px-3'
      }`}
      style={{ width: collapsed ? 70 : 260 }}
    >
      {/* ── Floating Arrow Toggle Button (Pinned to Border when Collapsed) ── */}
      {collapsed && (
        <button
          type="button"
          onClick={toggleCollapsed}
          className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-white shadow-md border border-slate-200/90 hover:border-indigo-400 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 flex items-center justify-center cursor-pointer z-50 transition-all duration-200 hover:scale-110"
          title={t('Expand Sidebar')}
          aria-label="Expand sidebar"
        >
          <svg className="w-3.5 h-3.5 translate-x-[0.5px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* ── Header: Logo + Arrow Toggle (When Expanded) ── */}
      <div className={`flex items-center mb-5 min-h-[44px] ${collapsed ? 'justify-center w-full' : 'justify-between px-1'}`}>
        {/* Brand Logo & Name */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 overflow-hidden'}`}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-sky-400 p-[1.5px] shadow-md shadow-indigo-500/20 shrink-0 flex items-center justify-center">
            <div className="w-full h-full bg-white/95 rounded-[10px] flex items-center justify-center text-lg backdrop-blur-xs">
              💎
            </div>
          </div>
          {!collapsed && (
            <div className="sidebar-label">
              <div className="flex items-center gap-1.5">
                <h1 className="font-extrabold text-sm tracking-tight text-slate-900 whitespace-nowrap m-0 leading-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 bg-clip-text text-transparent">
                  {t('DiamondERP')}
                </h1>
                <span className="px-1.5 py-0.2 text-[9px] font-black tracking-widest text-indigo-600 bg-indigo-50 rounded border border-indigo-200">
                  PRO
                </span>
              </div>
              <p className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase whitespace-nowrap m-0 mt-0.5">
                Enterprise Suite
              </p>
            </div>
          )}
        </div>

        {/* Arrow Toggle Button (Expanded State) */}
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="w-7 h-7 rounded-lg bg-white/70 hover:bg-white border border-slate-200/80 hover:border-indigo-300 shadow-2xs flex items-center justify-center text-slate-400 hover:text-indigo-600 cursor-pointer transition-all duration-200 shrink-0"
            title={t('Collapse Sidebar')}
            aria-label="Collapse sidebar"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Navigation Sections ── */}
      <div className={`flex flex-col flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin ${collapsed ? 'w-full gap-2 items-center' : 'gap-4 pr-0.5'}`}>
        {navSections.map((section, idx) => (
          <div key={section.id} className={`flex flex-col ${collapsed ? 'w-full items-center gap-1.5' : 'gap-1'}`}>
            {/* Section Header (Expanded) or Divider (Collapsed) */}
            {collapsed ? (
              idx > 0 && <div className="w-6 h-[1px] bg-slate-200/70 my-1 shrink-0" />
            ) : (
              <div className="sidebar-section-header px-2 py-1 flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {section.title}
                </span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-widest ${section.badgeColor}`}>
                  {section.badge}
                </span>
              </div>
            )}

            {/* Nav Items */}
            {section.items.map((item) => {
              return collapsed ? (
                /* ── Collapsed Single-Icon Button (No Double Box / No Slivers) ── */
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={({ isActive }) =>
                    `group relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 border ${
                      isActive
                        ? `${item.color.activeBg} ${item.color.border} shadow-md scale-105 backdrop-blur-md`
                        : 'border-transparent hover:bg-white/80 hover:border-slate-200/80 hover:shadow-2xs'
                    }`
                  }
                  style={({ isActive }) =>
                    isActive ? { boxShadow: `0 4px 14px -1px ${item.color.glow}` } : {}
                  }
                  title={`${section.title}: ${t(item.label)}`}
                >
                  {({ isActive }) => (
                    <span
                      className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${
                        isActive
                          ? item.color.iconText
                          : `${item.color.iconText} opacity-80 group-hover:opacity-100 group-hover:scale-110`
                      }`}
                      style={item.fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    >
                      {item.icon}
                    </span>
                  )}
                </NavLink>
              ) : (
                /* ── Expanded Full-Row NavLink ── */
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-xl px-2.5 py-2 transition-all duration-200 border ${
                      isActive
                        ? `${item.color.activeBg} ${item.color.activeText} ${item.color.border} shadow-sm backdrop-blur-md`
                        : 'text-slate-600 hover:text-slate-950 hover:bg-white/60 border-transparent hover:border-white/80 hover:shadow-2xs'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Left Accent Glow for Active Link */}
                      {isActive && (
                        <span
                          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-current shadow-xs"
                          style={{ boxShadow: `0 0 10px ${item.color.glow}` }}
                        />
                      )}

                      {/* Liquid Icon Badge */}
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 shadow-2xs ${
                          item.color.iconBg
                        } ${isActive ? 'scale-105 shadow-md' : 'group-hover:scale-105'}`}
                        style={isActive ? { boxShadow: `0 3px 12px -1px ${item.color.glow}` } : {}}
                      >
                        <span
                          className={`material-symbols-outlined text-[19px] transition-colors ${
                            isActive ? 'text-inherit' : item.color.iconText
                          }`}
                          style={item.fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
                        >
                          {item.icon}
                        </span>
                      </div>

                      {/* Section Item Label */}
                      <span className="text-xs font-semibold tracking-tight truncate">
                        {t(item.label)}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Footer Controls ── */}
      <div className={`sidebar-footer pt-3 border-t border-slate-200/60 flex flex-col gap-2 mt-auto ${collapsed ? 'w-full items-center' : ''}`}>
        {isAppLockEnabled && (
          <button
            type="button"
            onClick={lockNow}
            className={`flex items-center justify-center rounded-xl bg-white/70 hover:bg-white border border-slate-200/80 text-xs font-bold text-slate-700 hover:text-indigo-600 transition-all shadow-2xs cursor-pointer ${
              collapsed ? 'w-10 h-10' : 'w-full py-2 px-3 gap-2'
            }`}
            title={t('Lock App Screen')}
          >
            <span className="material-symbols-outlined text-[16px] text-indigo-600">lock</span>
            {!collapsed && <span>{t('Lock App Screen')}</span>}
          </button>
        )}

        {!collapsed && (
          <div className="sidebar-footer-text px-2 py-1.5 rounded-lg bg-white/50 border border-white/80 text-[10px] text-slate-500 flex items-center justify-between backdrop-blur-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-700">{syncStatus}</span>
            </div>
            <span className="font-mono text-slate-400">{syncTime}</span>
          </div>
        )}
      </div>
    </nav>
  );
};
