import React from 'react';
import { useTranslation } from 'react-i18next';

interface TopBarProps {
  syncStatus: string;
  onRefresh: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ syncStatus, onRefresh }) => {
  const { t } = useTranslation();
  return (
    <header className="bg-surface border-b border-outline-variant flex justify-between items-center w-full px-lg h-16 shrink-0 md:hidden">
      <div className="flex items-center gap-md">
        <span className="font-headline-md text-headline-md font-bold text-primary">{t('DiamondERP')}</span>
      </div>
      <div className="flex items-center gap-md">
        <a href="/parties" className="text-sm font-bold text-primary hover:underline">
          {t('Parties')}
        </a>
        <button
          onClick={onRefresh}
          className={`p-sm rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors ${
            syncStatus === 'syncing' ? 'animate-spin' : ''
          }`}
        >
          <span className="material-symbols-outlined">sync</span>
        </button>
        <span className="font-body-md text-body-md text-on-surface-variant bg-surface-container-high px-md py-xs rounded-full border border-outline-variant">
          Partition: Harshil
        </span>
      </div>
    </header>
  );
};
