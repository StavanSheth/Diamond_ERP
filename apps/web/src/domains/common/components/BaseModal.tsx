import React from 'react';

export interface BaseModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const maxWidthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
};

export const BaseModal: React.FC<BaseModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  icon,
  maxWidth = 'md',
  children,
  footer,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-md overflow-y-auto animate-fade-in">
      <div
        className={`bg-surface-container-lowest w-full ${maxWidthMap[maxWidth]} rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.16)] border border-outline-variant flex flex-col my-auto max-h-[90vh] overflow-hidden animate-fade-in-up`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-xl py-lg border-b border-outline-variant bg-surface-bright shrink-0">
          <div className="flex items-center gap-md">
            {icon && (
              <div className="w-9 h-9 rounded-lg bg-primary-container/15 text-primary flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
              </div>
            )}
            <div>
              <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface m-0 leading-snug">
                {title}
              </h2>
              {subtitle && (
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
            title="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-xl overflow-y-auto flex-1 bg-surface-container-lowest">
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="px-xl py-md border-t border-outline-variant bg-surface-container-low shrink-0 flex justify-end gap-sm items-center">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
