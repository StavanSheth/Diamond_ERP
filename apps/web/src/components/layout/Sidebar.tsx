import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DraftSyncStatus } from '../drafts/DraftSyncStatus';

const navItems = [
  { to: '/', icon: 'dashboard', label: 'Dashboard' },
  { to: '/inventory', icon: 'inventory_2', label: 'Inventory', fill: true },
  { to: '/certificates', icon: 'verified', label: 'Certificates' },
  { to: '/repairs', icon: 'build', label: 'Repairs' },
  { to: '/parties', icon: 'domain', label: 'Parties' },
  { to: '/drafts', icon: 'draft', label: 'Drafts' },
  { to: '/reports', icon: 'analytics', label: 'Reports' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
];

interface SidebarProps {
  syncStatus: string;
  lastSyncedAt: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ syncStatus, lastSyncedAt }) => {
  const { t } = useTranslation();
  const syncTime = lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Never';

  return (
    <nav className="bg-surface-container-low shadow-sm flex-col h-full py-xl px-md gap-sm hidden md:flex shrink-0 w-64 border-r border-outline-variant">
      {/* Logo */}
      <div className="flex items-center gap-md px-md mb-xl">
        <div className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-headline-sm">
          💎
        </div>
        <div>
          <h1 className="font-headline-sm text-headline-sm font-black text-primary">{t('DiamondERP')}</h1>
          <p className="font-caption text-caption text-on-surface-variant">{t('Technical Suite')}</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-sm flex-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-md px-md py-sm rounded-lg transition-all duration-200 active:scale-95 font-body-md text-body-md ${
                isActive && item.to !== '#'
                  ? 'bg-primary-container text-on-primary-container font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`
            }
          >
            <span
              className="material-symbols-outlined"
              style={item.fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {item.icon}
            </span>
            <span>{t(item.label)}</span>
          </NavLink>
        ))}
      </div>

      {/* Sync Status */}
      <div className="mt-auto border-t border-outline-variant pt-md px-md pb-md">
        <DraftSyncStatus 
          syncState={(syncStatus as any) || 'IDLE'} 
          lastSavedAgo={null} 
        />
      </div>
    </nav>
  );
};
