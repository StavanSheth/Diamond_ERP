import React from 'react';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'inbox',
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-huge px-lg text-center max-w-md mx-auto my-auto animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mb-lg text-outline shadow-xs border border-outline-variant/50">
        <span className="material-symbols-outlined text-[32px] text-primary">{icon}</span>
      </div>
      <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface mb-xs">
        {title}
      </h3>
      {description && (
        <p className="font-body-md text-body-md text-on-surface-variant mb-xl leading-relaxed">
          {description}
        </p>
      )}
      <div className="flex items-center gap-sm flex-wrap justify-center">
        {secondaryActionLabel && onSecondaryAction && (
          <button
            type="button"
            onClick={onSecondaryAction}
            className="px-lg py-sm rounded-lg border border-outline-variant font-label-lg text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            {secondaryActionLabel}
          </button>
        )}
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="flex items-center gap-xs px-xl py-sm bg-primary text-on-primary rounded-lg hover:bg-surface-tint font-label-lg font-medium shadow-sm transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
};
