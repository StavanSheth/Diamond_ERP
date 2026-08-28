import React, { useEffect, useState } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { LedgerView } from '../components/ledger/LedgerView';

export const LedgerPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const resumeDraft = location.state?.resumeDraft;

  const [selectedStock, setSelectedStock] = useState<string>(searchParams.get('stock') || '');
  const [selectedParty, setSelectedParty] = useState<string>(searchParams.get('party') || '');
  const [selectedItemCode, setSelectedItemCode] = useState<string>(searchParams.get('itemCode') || '');

  useEffect(() => {
    const stockParam = searchParams.get('stock');
    if (stockParam !== null && stockParam !== selectedStock) setSelectedStock(stockParam);
    const partyParam = searchParams.get('party');
    if (partyParam !== null && partyParam !== selectedParty) setSelectedParty(partyParam);
    const itemCodeParam = searchParams.get('itemCode');
    if (itemCodeParam !== null && itemCodeParam !== selectedItemCode) setSelectedItemCode(itemCodeParam);
  }, [searchParams]);

  const handleStockChange = (newStock: string) => {
    setSelectedStock(newStock);
    const newParams = new URLSearchParams(searchParams);
    if (newStock) newParams.set('stock', newStock);
    else newParams.delete('stock');
    setSearchParams(newParams);
  };

  return (
    <LedgerView 
      stockId={selectedStock}
      partyId={selectedParty}
      itemCode={selectedItemCode}
      onStockChange={handleStockChange}
      resumeDraft={resumeDraft}
    />
  );
};

