import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface EntityActionContext {
  /** The type of entity originating the action */
  entityType: 'CERTIFICATE' | 'REPAIR' | 'PARTY';
  /** Display name / title */
  title: string;
  /** Subtitle or secondary info */
  subtitle?: string;
  /** Material icon for the header */
  icon: string;
  /** Icon background color class */
  iconBg?: string;
  /** Icon text color class */
  iconColor?: string;
  /** Status badge */
  status?: string;
  /** Status badge color class */
  statusColor?: string;
  /** Linked stock item ID (for certificates / repairs) */
  stockItemId?: string;
  /** Linked party ID */
  partyId?: string;
  /** Certificate ID (when originating from certificates) */
  certificateId?: string;
  /** Repair ID (when originating from repairs) */
  repairId?: string;
  /** Default transaction type to pre-select when adding a transaction */
  defaultTxnType?: string;
}

interface EntityActionDialogProps {
  open: boolean;
  context: EntityActionContext | null;
  onClose: () => void;
  onEdit: () => void;
  onAddTransaction?: () => void;
}

export const EntityActionDialog: React.FC<EntityActionDialogProps> = ({
  open,
  context,
  onClose,
  onEdit,
  onAddTransaction,
}) => {
  const navigate = useNavigate();

  if (!open || !context) return null;

  const handleViewLedger = () => {
    onClose();
    const params = new URLSearchParams();
    if (context.stockItemId) params.set('itemCode', context.stockItemId);
    if (context.partyId) params.set('party', context.partyId);
    if (context.certificateId) params.set('certificateId', context.certificateId);
    if (context.repairId) params.set('repairId', context.repairId);
    navigate(`/ledger?${params.toString()}`);
  };

  const handleAddTransaction = () => {
    onClose();
    if (onAddTransaction) {
      onAddTransaction();
    }
  };

  const iconBg = context.iconBg || 'bg-primary-container';
  const iconColor = context.iconColor || 'text-on-primary-container';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-md"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest w-full max-w-sm rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-outline-variant p-xl flex flex-col gap-md animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-sm">
          <div
            className={`w-12 h-12 ${iconBg} ${iconColor} rounded-full flex items-center justify-center mx-auto mb-md`}
          >
            <span className="material-symbols-outlined text-[24px]">{context.icon}</span>
          </div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-xs">
            {context.title}
          </h3>
          {context.subtitle && (
            <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
              {context.subtitle}
            </p>
          )}
          {context.status && (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border mt-sm ${
                context.statusColor || 'bg-surface-container text-on-surface border-outline-variant'
              }`}
            >
              {context.status}
            </span>
          )}
        </div>

        {/* Edit Action */}
        <button
          onClick={() => {
            onClose();
            onEdit();
          }}
          className="w-full flex items-center gap-md p-md rounded-lg border border-outline-variant hover:bg-surface-container hover:border-primary transition-all group text-left"
        >
          <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">
            edit_square
          </span>
          <div className="flex-1">
            <h4 className="font-body-lg font-bold text-on-surface group-hover:text-primary transition-colors">
              Edit {context.entityType === 'CERTIFICATE' ? 'Certificate' : context.entityType === 'REPAIR' ? 'Repair' : 'Party'} Details
            </h4>
            <p className="font-caption text-caption text-on-surface-variant">
              {context.entityType === 'CERTIFICATE'
                ? 'Update lab, report number, and grading specs'
                : context.entityType === 'REPAIR'
                ? 'Update repair type, vendor, and cost'
                : 'Update name, contact, and type'}
            </p>
          </div>
          <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
        </button>

        {/* View Ledger Action */}
        {(context.stockItemId || context.partyId) && (
          <button
            onClick={handleViewLedger}
            className="w-full flex items-center gap-md p-md rounded-lg border border-outline-variant hover:bg-surface-container hover:border-primary transition-all group text-left"
          >
            <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">
              receipt_long
            </span>
            <div className="flex-1">
              <h4 className="font-body-lg font-bold text-on-surface group-hover:text-primary transition-colors">
                View Ledger
              </h4>
              <p className="font-caption text-caption text-on-surface-variant">
                See transaction history and balances
              </p>
            </div>
            <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
          </button>
        )}

        {/* Add Transaction Action */}
        {onAddTransaction && (
          <button
            onClick={handleAddTransaction}
            className="w-full flex items-center gap-md p-md rounded-lg border border-outline-variant hover:bg-surface-container hover:border-primary transition-all group text-left"
          >
            <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">
              add_circle
            </span>
            <div className="flex-1">
              <h4 className="font-body-lg font-bold text-on-surface group-hover:text-primary transition-colors">
                Add Transaction
              </h4>
              <p className="font-caption text-caption text-on-surface-variant">
                {context.entityType === 'CERTIFICATE'
                  ? 'Create a certification transaction for this item'
                  : context.entityType === 'REPAIR'
                  ? 'Create a repair transaction for this item'
                  : 'Create a transaction with this party'}
              </p>
            </div>
            <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
          </button>
        )}
      </div>
    </div>
  );
};
