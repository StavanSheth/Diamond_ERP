import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppLock } from '../../contexts/AppLockContext';
import { useAuth } from '../../contexts/AuthContext';

const mobileNavItems = [
  { to: '/', icon: 'dashboard', label: 'Dashboard' },
  { to: '/inventory', icon: 'inventory_2', label: 'Inventory' },
  { to: '/ledger', icon: 'receipt_long', label: 'Ledger' },
  { to: '/certificates', icon: 'verified', label: 'Certificates' },
  { to: '/repairs', icon: 'build', label: 'Repairs' },
  { to: '/parties', icon: 'domain', label: 'Parties' },
  { to: '/reports', icon: 'analytics', label: 'Reports' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
];

interface TopBarProps {
  syncStatus: string;
  onRefresh: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ syncStatus, onRefresh }) => {
  const { t } = useTranslation();
  const { isAppLockEnabled, lockNow } = useAppLock();
  const { logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <header className="bg-surface border-b border-outline-variant flex justify-between items-center w-full px-lg h-16 shrink-0 md:hidden z-30">
        <div className="flex items-center gap-sm">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="p-sm -ml-xs rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
            title="Open Menu"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>
          <span className="font-headline-sm text-headline-sm font-black text-primary">💎 {t('DiamondERP')}</span>
        </div>
        <div className="flex items-center gap-sm">
          <button
            onClick={onRefresh}
            className={`p-sm rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors ${
              syncStatus === 'syncing' ? 'animate-spin text-primary' : ''
            }`}
            title="Refresh Data"
          >
            <span className="material-symbols-outlined text-[20px]">sync</span>
          </button>
          {isAppLockEnabled && (
            <button
              onClick={lockNow}
              className="p-sm rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors"
              title={t('Lock App Now')}
            >
              <span className="material-symbols-outlined text-[20px]">lock</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true">
          <div 
            className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs animate-fade-in"
            onClick={() => setDrawerOpen(false)} 
          />
          <div className="relative bg-surface-container-low w-72 h-full flex flex-col p-md shadow-2xl z-10 animate-fade-in-up border-r border-outline-variant">
            <div className="flex items-center justify-between px-sm py-xs mb-md border-b border-outline-variant pb-sm">
              <div className="flex items-center gap-sm">
                <span className="text-xl">💎</span>
                <span className="font-headline-sm font-bold text-primary">{t('DiamondERP')}</span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-xs rounded-full text-on-surface-variant hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-xs flex-1 overflow-y-auto">
              {mobileNavItems.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-md px-md py-sm rounded-lg transition-all font-body-md ${
                      isActive
                        ? 'bg-primary-container text-on-primary-container font-bold'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`
                  }
                >
                  <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  <span>{t(item.label)}</span>
                </NavLink>
              ))}
            </div>

            <div className="pt-sm border-t border-outline-variant mt-auto">
              <button
                type="button"
                onClick={() => { setDrawerOpen(false); logout(); }}
                className="flex items-center gap-md w-full px-md py-sm rounded-lg text-error hover:bg-error-container transition-all font-body-md"
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
                <span>{t('Sign Out')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

