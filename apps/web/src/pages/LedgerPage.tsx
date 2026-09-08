import React, { useEffect, useState } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { LedgerView } from '../domains/ledger/components/LedgerView';

export const LedgerPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const resumeDraft = location.state?.resumeDraft;

  const [selectedStock, setSelectedStock] = useState<string>(searchParams.get('stock') || '');
  const [selectedParty, setSelectedParty] = useState<string>(searchParams.get('party') || '');
  const [selectedItemCode, setSelectedItemCode] = useState<string>(searchParams.get('itemCode') || '');
  const [selectedCertificateId, setSelectedCertificateId] = useState<string>(searchParams.get('certificateId') || '');
  const [selectedRepairId, setSelectedRepairId] = useState<string>(searchParams.get('repairId') || '');

  useEffect(() => {
    const stockParam = searchParams.get('stock');
    if (stockParam !== null && stockParam !== selectedStock) setSelectedStock(stockParam);
    const partyParam = searchParams.get('party');
    if (partyParam !== null && partyParam !== selectedParty) setSelectedParty(partyParam);
    const itemCodeParam = searchParams.get('itemCode');
    if (itemCodeParam !== null && itemCodeParam !== selectedItemCode) setSelectedItemCode(itemCodeParam);
    const certParam = searchParams.get('certificateId');
    if (certParam !== null && certParam !== selectedCertificateId) setSelectedCertificateId(certParam);
    const repairParam = searchParams.get('repairId');
    if (repairParam !== null && repairParam !== selectedRepairId) setSelectedRepairId(repairParam);
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
      certificateId={selectedCertificateId}
      repairId={selectedRepairId}
      onStockChange={handleStockChange}
      resumeDraft={resumeDraft}
    />
  );
};

