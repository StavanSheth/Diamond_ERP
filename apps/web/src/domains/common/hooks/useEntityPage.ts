import { useState } from 'react';
import { EntityActionContext } from '../components/EntityActionDialog';

export function useEntityPage<TTxnDefaults = any>() {
  // Shared Layout and Filtering State
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Deletion State
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Entity Action Dialog & Transaction Modal State
  const [actionContext, setActionContext] = useState<EntityActionContext | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [txnDefaults, setTxnDefaults] = useState<Partial<TTxnDefaults>>({});

  // Handlers
  const handleOpenActionDialog = (context: EntityActionContext, defaults: Partial<TTxnDefaults>) => {
    setActionContext(context);
    setTxnDefaults(defaults);
    setActionDialogOpen(true);
  };

  const handleCloseActionDialog = () => {
    setActionDialogOpen(false);
    setActionContext(null);
  };

  const handleOpenTxnModal = () => {
    setTxnModalOpen(true);
  };

  const handleCloseTxnModal = () => {
    setTxnModalOpen(false);
    setTxnDefaults({});
  };

  return {
    viewMode,
    setViewMode,
    search,
    setSearch,
    showAdvanced,
    setShowAdvanced,
    deleteTargetId,
    setDeleteTargetId,
    actionContext,
    actionDialogOpen,
    txnModalOpen,
    txnDefaults,
    handleOpenActionDialog,
    handleCloseActionDialog,
    handleOpenTxnModal,
    handleCloseTxnModal,
  };
}
