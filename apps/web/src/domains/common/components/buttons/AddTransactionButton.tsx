import React, { useState } from 'react';
import { TransactionModal } from '../../../transactions/components/TransactionModal';

import { useTranslation } from 'react-i18next';

interface AddTransactionButtonProps {
  stockId?: string;
  /** Pre-select transaction type when opening a new transaction */
  defaultTxnType?: string;
  /** Pre-select party dropdown */
  defaultPartyId?: string;
  /** Pre-fill linkedCertificateId on the first item row */
  defaultCertificateId?: string;
  /** Pre-fill linkedRepairId on the first item row */
  defaultRepairId?: string;
  onTransactionAdded?: () => void;
}

export const AddTransactionButton: React.FC<AddTransactionButtonProps> = ({ stockId, defaultTxnType, defaultPartyId, defaultCertificateId, defaultRepairId, onTransactionAdded }) => {
  const { t } = useTranslation();
  const [txnModalOpen, setTxnModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setTxnModalOpen(true)}
        className="flex items-center gap-xs bg-primary text-on-primary px-md py-sm rounded hover:bg-primary/90 transition-colors shadow-sm"
      >
        <span className="material-symbols-outlined text-[18px]">add</span>
        <span className="font-body-md font-bold">{t('Add Transaction')}</span>
      </button>

      <TransactionModal
        open={txnModalOpen}
        stockId={stockId || ''}
        defaultTxnType={defaultTxnType}
        defaultPartyId={defaultPartyId}
        defaultCertificateId={defaultCertificateId}
        defaultRepairId={defaultRepairId}
        onClose={() => setTxnModalOpen(false)}
        onSubmit={async () => {
          setTxnModalOpen(false);
          if (onTransactionAdded) onTransactionAdded();
        }}
      />
    </>
  );
};

