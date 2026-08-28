import React from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-md">
      <div className="bg-surface-container-lowest rounded-xl shadow-lg p-xl max-w-sm w-full animate-fade-in-up border border-outline-variant">
        <div className="flex items-center gap-md mb-lg">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${danger ? 'bg-error-container' : 'bg-primary-fixed'}`}>
            <span className={`material-symbols-outlined ${danger ? 'text-error' : 'text-primary'}`}>
              {danger ? 'warning' : 'help'}
            </span>
          </div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface">{title}</h3>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant mb-xl">{message}</p>
        <div className="flex justify-end gap-md">
          <button
            onClick={onCancel}
            className="px-xl py-sm font-headline-sm text-headline-sm text-on-surface-variant hover:bg-surface-container-high rounded transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-xl py-sm font-headline-sm text-headline-sm text-on-primary rounded shadow-sm transition-all ${
              danger ? 'bg-error hover:bg-error/90' : 'bg-primary hover:bg-surface-tint'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
