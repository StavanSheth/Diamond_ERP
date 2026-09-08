import React from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: string;
  badge?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  showSearch?: boolean;
  actionButton?: {
    label: string;
    icon?: string;
    onClick: () => void;
  };
  secondaryActions?: React.ReactNode;
  children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  badge,
  searchPlaceholder = 'Search...',
  searchValue = '',
  onSearchChange,
  showSearch = true,
  actionButton,
  secondaryActions,
  children,
}) => {
  return (
    <header className="px-margin-page py-lg bg-surface border-b border-outline-variant shrink-0 relative z-10 transition-colors">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-gutter">
        {/* Title and details */}
        <div className="flex items-center gap-md">
          {icon && (
            <div className="w-10 h-10 rounded-xl bg-primary-container/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <span className="material-symbols-outlined text-[24px]">{icon}</span>
            </div>
          )}
          <div>
            <div className="flex items-center gap-sm flex-wrap">
              <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
                {title}
              </h1>
              {badge && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-container text-on-primary-container border border-primary/20">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="font-body-md text-body-md text-on-surface-variant mt-0.5 max-w-2xl">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-sm w-full md:w-auto">
          {showSearch && onSearchChange && (
            <div className="relative flex-1 md:w-64">
              <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-outline text-[20px]">
                search
              </span>
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-xl pr-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary font-body-md text-body-md transition-shadow shadow-xs"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-sm top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors p-0.5"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>
          )}

          {secondaryActions}

          {actionButton && (
            <button
              onClick={actionButton.onClick}
              className="flex items-center gap-xs px-md py-sm bg-primary text-on-primary rounded-lg hover:bg-surface-tint active:scale-98 transition-all font-headline-sm text-headline-sm shadow-sm ml-auto md:ml-0 font-medium cursor-pointer"
            >
              {actionButton.icon && (
                <span className="material-symbols-outlined text-[20px]">{actionButton.icon}</span>
              )}
              {actionButton.label}
            </button>
          )}
        </div>
      </div>

      {children && <div className="mt-md">{children}</div>}
    </header>
  );
};
