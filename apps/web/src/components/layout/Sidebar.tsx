import React, { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppLock } from '../../contexts/AppLockContext';

const SIDEBAR_COLLAPSED_KEY = 'diamonderp-sidebar-collapsed';

const navItems = [
  { to: '/', icon: 'dashboard', label: 'Dashboard' },
  { to: '/inventory', icon: 'inventory_2', label: 'Inventory', fill: true },
  { to: '/ledger', icon: 'receipt_long', label: 'Ledger' },
  { to: '/certificates', icon: 'verified', label: 'Certificates' },
  { to: '/repairs', icon: 'build', label: 'Repairs' },
  { to: '/parties', icon: 'domain', label: 'Parties' },
  { to: '/reports', icon: 'analytics', label: 'Reports' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
];

interface SidebarProps {
  syncStatus: string;
  lastSyncedAt: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ syncStatus, lastSyncedAt }) => {
  const { t } = useTranslation();
  const { isAppLockEnabled, lockNow } = useAppLock();
  const syncTime = lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Never';

  // Initialize collapsed state from localStorage
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Persist collapsed state
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  return (
    <nav
      className={`sidebar-nav bg-surface-container-low shadow-sm flex-col h-full py-xl px-md gap-sm hidden md:flex shrink-0 border-r border-outline-variant ${
        collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'
      }`}
      style={{ width: collapsed ? 72 : 256, position: 'relative' }}
    >
      {/* Header: Logo + Toggle */}
      <div className="flex items-center justify-between mb-xl" style={{ minHeight: 40 }}>
        {/* Logo area */}
        <div className="flex items-center gap-md px-md overflow-hidden">
          <div
            className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-headline-sm shrink-0"
          >
            💎
          </div>
          <div className="sidebar-label">
            <h1 className="font-headline-sm text-headline-sm font-black text-primary whitespace-nowrap">
              {t('DiamondERP')}
            </h1>
            <p className="font-caption text-caption text-on-surface-variant whitespace-nowrap">
              {t('Technical Suite')}
            </p>
          </div>
        </div>

        {/* Toggle button — always visible */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="sidebar-toggle-btn flex items-center justify-center w-7 h-7 rounded-full text-on-surface-variant shrink-0"
          title={collapsed ? t('Expand Sidebar') : t('Collapse Sidebar')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={collapsed ? { position: 'absolute', right: -14, top: 28, zIndex: 10, backgroundColor: 'var(--md-sys-color-surface-container, #f0eeee)', border: '1px solid var(--md-sys-color-outline-variant, #c4c6cf)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' } : {}}
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-sm flex-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-md rounded-lg transition-all duration-200 active:scale-95 font-body-md text-body-md ${
                collapsed ? 'px-0 py-sm justify-center' : 'px-md py-sm'
              } ${
                isActive && item.to !== '#'
                  ? 'bg-primary-container text-on-primary-container font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`
            }
            title={collapsed ? t(item.label) : undefined}
          >
            <span
              className="material-symbols-outlined shrink-0"
              style={item.fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {item.icon}
            </span>
            <span className="sidebar-label">{t(item.label)}</span>
          </NavLink>
        ))}
      </div>

      {/* Sidebar Footer Controls */}
      <div className={`sidebar-footer pt-sm border-t border-outline-variant flex flex-col gap-2`}>
        {isAppLockEnabled && (
          <button
            type="button"
            onClick={lockNow}
            className={`flex items-center justify-center gap-2 w-full py-2 px-3 bg-surface-container hover:bg-surface-container-high border border-outline-variant rounded-lg text-xs font-bold text-on-surface transition-colors ${
              collapsed ? 'px-0' : ''
            }`}
            title={t('Lock App Screen')}
          >
            <span className="material-symbols-outlined text-[16px] text-primary">lock</span>
            {!collapsed && <span>{t('Lock App Screen')}</span>}
          </button>
        )}
        {!collapsed && (
          <div className="px-2 text-[10px] text-on-surface-variant flex items-center justify-between">
            <span>Sync: {syncStatus}</span>
            <span>{syncTime}</span>
          </div>
        )}
      </div>
    </nav>
  );
};
