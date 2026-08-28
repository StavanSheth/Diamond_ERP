import React, { useState } from 'react';
import { TransactionModal } from '../../transactions/TransactionModal';

import { useTranslation } from 'react-i18next';

interface AddTransactionButtonProps {
  stockId?: string;
  onTransactionAdded?: () => void;
}

export const AddTransactionButton: React.FC<AddTransactionButtonProps> = ({ stockId, onTransactionAdded }) => {
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
        onClose={() => setTxnModalOpen(false)}
        onSubmit={async () => {
          setTxnModalOpen(false);
          if (onTransactionAdded) onTransactionAdded();
        }}
      />
    </>
  );
};
