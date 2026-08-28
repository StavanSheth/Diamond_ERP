import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { useDraftAutoSave } from '../../hooks/useDraftAutoSave';
import { DraftSyncStatus } from '../drafts/DraftSyncStatus';
import { useTranslation } from 'react-i18next';

interface TransactionModalProps {
  open: boolean;
  stockId: string | null;
  editTransactionData?: any | null;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ open, stockId, editTransactionData, onClose, onSubmit }) => {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resumeDraft = editTransactionData?._resumeDraft;
  const draftPayload = resumeDraft?.payload || {};

  const [txnType, setTxnType] = useState(draftPayload.txnType || 'PURCHASE');
  const [partyId, setPartyId] = useState(draftPayload.partyId || '');
  const [remarks, setRemarks] = useState(draftPayload.remarks || '');
  const [referenceNo, setReferenceNo] = useState(draftPayload.referenceNo || '');
  const [paymentStatus, setPaymentStatus] = useState(draftPayload.paymentStatus || 'PENDING');
  const [paymentDone, setPaymentDone] = useState(draftPayload.paymentDone || '');
  const [transactionDate, setTransactionDate] = useState(draftPayload.transactionDate?.split('T')[0] || new Date().toISOString().split('T')[0]);
  
  const [parties, setParties] = useState<any[]>([]);
  const [stocks, setStocks] = useState<{id: string, name: string, ledgers: any[]}[]>([]);
  const [unlinkedCerts, setUnlinkedCerts] = useState<any[]>([]);
  const [allCerts, setAllCerts] = useState<any[]>([]);
  const [allRepairs, setAllRepairs] = useState<any[]>([]);
  const [allDiamonds, setAllDiamonds] = useState<any[]>([]);
  const [selectedLedgerId, setSelectedLedgerId] = useState(draftPayload.ledgerId || '');

  // Item lines state
  const [items, setItems] = useState<any[]>(draftPayload.items || []);

  // Draft integration
  const currentPayload = useMemo(() => ({
    txnType,
    partyId,
    remarks,
    referenceNo,
    paymentStatus,
    paymentDone,
    transactionDate,
    selectedLedgerId,
    items,
  }), [txnType, partyId, remarks, referenceNo, paymentStatus, paymentDone, transactionDate, selectedLedgerId, items]);

  const {
    syncState,
    draftId,
    lastSavedAgo,
    onPayloadChange,
    forceServerSync,
  } = useDraftAutoSave({
    entityType: 'TRANSACTION',
    entityId: editTransactionData?.id,
    ledgerId: selectedLedgerId,
    initialDraftId: resumeDraft && !resumeDraft.isLocalOnly ? resumeDraft.id : undefined,
    initialDraftNumber: resumeDraft && !resumeDraft.isLocalOnly ? resumeDraft.draftNumber : undefined,
    initialLocalId: resumeDraft && resumeDraft.isLocalOnly ? resumeDraft.localId : undefined,
  });

  useEffect(() => {
    if (open) {
      onPayloadChange(currentPayload, `Updated ${txnType} details`);
    }
  }, [currentPayload, open, onPayloadChange]);

  useEffect(() => {
    if (open) {
      api.getParties()
        .then(res => {
          if (res.success) setParties(res.data as any);
        })
        .catch(err => console.error('Failed to load parties:', err));

      api.getStocks()
        .then(res => {
          if (res.success) setStocks(res.data as any);
          
          if (stockId && res.success) {
            const stock = (res.data as any).find((s: any) => s.id === stockId);
            if (stock && stock.ledgers.length > 0) {
              setSelectedLedgerId(stock.ledgers[0].id);
            }
          }
        })
        .catch(err => console.error('Failed to load stocks:', err));
        
      api.getCertificates().then(res => {
        if (res.success) setAllCerts(res.data);
        fetch('/api/certificates/unlinked')
          .then(r => r.json())
          .then(res => {
            if (res.success) setUnlinkedCerts(res.data);
          })
          .catch(err => console.error('Failed to load unlinked certs:', err));
      });

      api.getRepairs().then(res => {
        if (res.success) setAllRepairs(res.data);
      }).catch(err => console.error('Failed to load repairs:', err));

      if (editTransactionData) {
        setTxnType(editTransactionData.transactionType || 'PURCHASE');
        setPartyId(editTransactionData.partyId || '');
        setRemarks(editTransactionData.remarks || '');
        setReferenceNo(editTransactionData.referenceNo || '');
        setPaymentStatus(editTransactionData.paymentStatus || 'PENDING');
        setPaymentDone(editTransactionData.paymentDone?.toString() || '');
        setTransactionDate(editTransactionData.transactionDate ? editTransactionData.transactionDate.split('T')[0] : new Date().toISOString().split('T')[0]);
        setSelectedLedgerId(editTransactionData.ledgerId || '');
        if (editTransactionData.items && editTransactionData.items.length > 0) {
          setItems(editTransactionData.items.map((i: any) => ({
            diamondItemId: i.diamondItemId,
            existingDiamondId: i.diamondItemId,
            carat: i.carat?.toString() || '',
            ratePerCarat: i.ratePerCarat?.toString() || '',
            totalValue: i.totalValue?.toString() || '',
            shape: i.diamondItem?.shape || 'Round',
            color: i.diamondItem?.color || 'D',
            clarity: i.diamondItem?.clarity || 'VS1',
            cut: i.diamondItem?.cut || 'EX',
            category: i.diamondItem?.category || 'SINGLE',
            polish: i.diamondItem?.polish || 'EX',
            symmetry: i.diamondItem?.symmetry || 'EX',
            fluorescence: i.diamondItem?.fluorescence || 'NONE',
            certificationState: i.diamondItem?.certificateStatus === 'RECEIVED' ? 'CERTIFIED' : '',
            polishState: '',
            linkedCertificateId: i.diamondItem?.currentCertificateId || '',
            labType: '',
            internalNotes: '',
            certCost: '',
            repairType: '',
            repairVendorId: '',
            repairCost: '',
          })));
        } else {
          setItems([{ name: '', carat: '', value: '', shape: 'Round', color: 'D', clarity: 'VS1', cut: 'EX', category: 'SINGLE', certificationState: '', polishState: '', linkedCertificateId: '', labType: 'GIA', internalNotes: '', certCost: '', repairType: 'Polishing', repairVendorId: '', repairCost: '', existingDiamondId: '' }]);
        }
      } else {
        setTxnType('PURCHASE');
        setPartyId('');
        setRemarks('');
        setReferenceNo('');
        setPaymentStatus('PENDING');
        setPaymentDone('');
        setTransactionDate(new Date().toISOString().split('T')[0]);
        setItems([{ name: '', carat: '', value: '', shape: 'Round', color: 'D', clarity: 'VS1', cut: 'EX', category: 'SINGLE', certificationState: '', polishState: '', linkedCertificateId: '', labType: 'GIA', internalNotes: '', certCost: '', repairType: 'Polishing', repairVendorId: '', repairCost: '', existingDiamondId: '', linkedRepairId: '' }]);
      }
      setError(null);
    }
  }, [open, stockId]);

  useEffect(() => {
    if (selectedLedgerId && stocks.length > 0) {
      const stock = stocks.find(s => s.ledgers.some((l: any) => l.id === selectedLedgerId));
      if (stock) {
        api.getDiamonds(stock.id).then(res => {
          if (res.success) setAllDiamonds(res.data);
        });
      }
    } else {
      setAllDiamonds([]);
    }
  }, [selectedLedgerId, stocks]);

  const filteredDiamonds = useMemo(() => {
    if (txnType === 'REPAIR_IN') return allDiamonds.filter(d => d.status === 'IN_REPAIR');
    if (txnType === 'CERTIFICATION_IN') return allDiamonds.filter(d => d.status === 'IN_CERTIFICATION');
    return allDiamonds.filter(d => d.status === 'AVAILABLE');
  }, [allDiamonds, txnType]);

  if (!open) return null;

  const handleAddItem = () => {
    setItems([...items, { name: '', carat: '', value: '', shape: 'Round', color: 'D', clarity: 'VS1', cut: 'EX', category: 'SINGLE', certificationState: '', polishState: '', linkedCertificateId: '', labType: 'GIA', internalNotes: '', certCost: '', repairType: 'Polishing', repairVendorId: '', repairCost: '', existingDiamondId: '', linkedRepairId: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, val: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: val };
    
    // Auto-calculate totalValue
    if (field === 'carat' || field === 'ratePerCarat') {
      const c = parseFloat(newItems[index].carat || '0');
      const r = parseFloat(newItems[index].ratePerCarat || '0');
      newItems[index].totalValue = (c > 0 && r > 0) ? (c * r).toFixed(2) : '';
    }
    
    // Auto populate carat and properties when existing diamond is selected
    if (field === 'existingDiamondId' && val) {
      const diamond = filteredDiamonds.find(d => d.id === val);
      if (diamond) {
        newItems[index].name = diamond.displayName || '';
        newItems[index].carat = diamond.carat?.toString() || '';
        newItems[index].shape = diamond.shape || 'Round';
        newItems[index].color = diamond.color || 'D';
        newItems[index].clarity = diamond.clarity || 'VS1';
        newItems[index].cut = diamond.cut || 'EX';
        newItems[index].polish = diamond.polish || 'EX';
        newItems[index].symmetry = diamond.symmetry || 'EX';
        newItems[index].fluorescence = diamond.fluorescence || 'NONE';
        newItems[index].category = diamond.category || 'SINGLE';
      }
    }
    
    setItems(newItems);
  };

  const handleSubmit = async () => {
    if (!selectedLedgerId) {
      setError('Please select a stock/ledger');
      return;
    }
    if (!partyId) {
      setError('Please select a party');
      return;
    }

    // Validate items
    for (let i = 0; i < items.length; i++) {
      if (!items[i].carat || isNaN(parseFloat(items[i].carat))) {
        setError(`Item ${i + 1} is missing a valid carat weight`);
        return;
      }
      if (!items[i].totalValue || isNaN(parseFloat(items[i].totalValue))) {
        setError(`Item ${i + 1} is missing a valid total value`);
        return;
      }
    }

    setSaving(true);
    try {
      await forceServerSync();
      
      const payload = {
        ledgerId: selectedLedgerId,
        txnType: txnType,
        transactionDate: new Date(transactionDate).toISOString(),
        partyId: partyId,
        remarks: remarks,
        referenceNo: referenceNo,
        paymentStatus: paymentStatus,
        paymentDone: paymentDone ? parseFloat(paymentDone) : 0,
        paymentDue: (txnType === 'SALE' || txnType === 'PURCHASE') 
          ? (items.reduce((sum, item) => sum + parseFloat(item.totalValue || '0'), 0) - (parseFloat(paymentDone) || 0))
          : 0,
        items: items.map((item, idx) => {
          const c = parseFloat(item.carat);
          const r = parseFloat(item.ratePerCarat);
          const v = parseFloat(item.totalValue);
          return {
            itemCode: `ITM-${Date.now()}-${idx}`,
            name: item.name,
            carat: c,
            totalValue: v,
            ratePerCarat: r,
            itemAction: txnType === 'PURCHASE' || txnType === 'CERTIFICATION' ? 'IN' : 'OUT',
            shape: item.shape,
            color: item.color,
            clarity: item.clarity,
            cut: item.cut,
            polish: item.polish,
            symmetry: item.symmetry,
            fluorescence: item.fluorescence,
            measurements: item.measurements,
            category: item.category,
            certificationState: item.category === 'MIX' ? item.certificationState : null,
            polishState: item.category === 'MIX' ? item.polishState : null,
            linkedCertificateId: item.linkedCertificateId,
            labType: item.labType,
            internalNotes: item.internalNotes,
            certCost: item.certCost ? parseFloat(item.certCost) : null,
            repairType: item.repairType,
            repairVendorId: item.repairVendorId,
            repairCost: item.repairCost ? parseFloat(item.repairCost) : null,
            existingDiamondId: item.existingDiamondId,
            linkedRepairId: item.linkedRepairId
          };
        })
      };

      if (editTransactionData) {
        await api.updateLedger(editTransactionData.id, payload);
      } else {
        await api.postLedger(payload);
      }
      
      if (draftId) {
        await api.commitDraft(draftId);
      }
      
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to authorize transaction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-md overflow-y-auto">
      <div className="bg-[#F8F9FA] w-full max-w-5xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] flex flex-col my-auto border border-outline-variant animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-xl py-lg border-b border-outline-variant bg-white rounded-t-2xl shrink-0">
          <div className="flex items-center gap-md">
            <div className="w-12 h-12 rounded-xl bg-[#5C6BC0] text-white flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-[28px]">diamond</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <h2 className="font-headline-sm text-headline-sm text-on-surface m-0 font-bold">
                {editTransactionData ? t('Edit Transaction') : t('Add Transaction')}
              </h2>
              <p className="text-sm text-on-surface-variant m-0">{t('Transaction Items')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:bg-surface-container hover:text-on-surface p-sm rounded-full transition-colors self-start"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-xl flex flex-col gap-xl overflow-y-auto max-h-[75vh]">
          {error && (
            <div className="bg-error-container border border-error/20 rounded-xl px-md py-sm flex items-center gap-sm shadow-sm">
              <span className="material-symbols-outlined text-error text-[20px]">error</span>
              <span className="font-body-md text-body-md text-on-error-container font-medium">{error}</span>
            </div>
          )}

          {/* Top Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-lg">
            {/* Transaction Type */}
            <div className="flex flex-col gap-sm">
              <label className="text-sm font-bold text-on-surface-variant">{t('Transaction Type')}</label>
              <div className="flex items-center gap-sm">
                <div className="w-10 h-10 rounded-lg bg-[#F3E5F5] text-[#8E24AA] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">shopping_cart</span>
                </div>
                <select
                  value={txnType}
                  onChange={(e) => setTxnType(e.target.value)}
                  className="w-full px-md h-10 border border-outline-variant rounded-lg bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm font-medium shadow-sm"
                >
                  <option value="PURCHASE">{t('Purchase')}</option>
                  <option value="SALE">{t('Sale')}</option>
                  <option value="REPAIR_OUT">{t('Send to Repair')}</option>
                  <option value="REPAIR_IN">{t('Receive Repair')}</option>
                  <option value="CERTIFICATION">{t('Send for Certification')}</option>
                  <option value="CERTIFICATION_IN">{t('Receive Certificate')}</option>
                </select>
              </div>
            </div>

            {/* Target Stock */}
            <div className="flex flex-col gap-sm">
              <label className="text-sm font-bold text-on-surface-variant">{t('Target Stock')}</label>
              <div className="flex items-center gap-sm">
                <div className="w-10 h-10 rounded-lg bg-[#E8F5E9] text-[#2E7D32] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                </div>
                <select
                  value={selectedLedgerId}
                  onChange={(e) => setSelectedLedgerId(e.target.value)}
                  className="w-full px-md h-10 border border-outline-variant rounded-lg bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm font-medium shadow-sm"
                >
                  <option value="">{t('Select Stock')}</option>
                  {stocks.map((s: any) => 
                    s.ledgers.length > 0 ? (
                      <option key={s.ledgers[0].id} value={s.ledgers[0].id}>{s.name}</option>
                    ) : null
                  )}
                </select>
              </div>
            </div>

            {/* Party */}
            <div className="flex flex-col gap-sm">
              <label className="text-sm font-bold text-on-surface-variant">{t('Party')}</label>
              <div className="flex items-center gap-sm">
                <div className="w-10 h-10 rounded-lg bg-[#FFF3E0] text-[#E65100] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">person</span>
                </div>
                <select
                  value={partyId}
                  onChange={(e) => setPartyId(e.target.value)}
                  className="w-full px-md h-10 border border-outline-variant rounded-lg bg-white focus:outline-none focus:border-primary focus:ring-1 text-sm font-medium shadow-sm"
                >
                  <option value="">{t('Select Party')}</option>
                  {parties.map(p => (
                    <option key={p.partyId} value={p.partyId}>{p.partyName}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Transaction Date */}
            <div className="flex flex-col gap-sm">
              <label className="text-sm font-bold text-on-surface-variant">Transaction Date</label>
              <div className="flex items-center gap-sm">
                <div className="w-10 h-10 rounded-lg bg-[#E3F2FD] text-[#1976D2] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">calendar_month</span>
                </div>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="w-full px-md h-10 border border-outline-variant rounded-lg bg-white focus:outline-none focus:border-primary focus:ring-1 text-sm font-medium shadow-sm"
                />
              </div>
            </div>
          </div>

          {(txnType === 'SALE' || txnType === 'PURCHASE') && (
            <div className="flex flex-col md:flex-row gap-lg bg-primary-container/30 p-md rounded-xl border border-primary-container">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-bold text-on-surface-variant mb-1">{t('Payment Status')}</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:border-primary font-medium"
                >
                  <option value="PENDING">{t('Payment Left / Due')}</option>
                  <option value="PARTIAL">{t('Partial')}</option>
                  <option value="COMPLETED">{t('Payment Done')}</option>
                </select>
              </div>
              {(paymentStatus === 'PARTIAL' || paymentStatus === 'COMPLETED') && (
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-bold text-on-surface-variant mb-1">Amount Paid (₹)</label>
                  <input
                    type="number"
                    value={paymentDone}
                    onChange={(e) => setPaymentDone(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:border-primary font-medium"
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>
          )}

          {/* Transaction Items Section */}
          <div className="bg-[#F4F7FA] border border-outline-variant/60 rounded-xl p-lg flex flex-col gap-lg shadow-inner">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-sm">
                <div className="w-8 h-8 rounded-lg bg-[#E3F2FD] text-[#1976D2] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">diamond</span>
                </div>
                <div>
                  <h3 className="font-bold text-on-surface m-0 text-base">{t('Transaction Items')}</h3>
                </div>
              </div>
              <button 
                onClick={handleAddItem}
                className="text-[#1976D2] border border-[#1976D2] bg-white hover:bg-[#E3F2FD] px-md py-sm rounded-lg flex items-center gap-xs font-bold transition-colors text-sm shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">add</span> {t('Add Another Item')}
              </button>
            </div>

            <div className="flex flex-col gap-md">
              {items.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-md bg-white p-lg rounded-xl border border-outline-variant shadow-sm relative transition-all hover:shadow-md">
                  
                  {items.length > 1 && (
                    <button onClick={() => handleRemoveItem(idx)} className="absolute right-4 top-4 text-error border border-error/30 bg-error/5 hover:bg-error/10 p-1.5 rounded-lg flex items-center justify-center transition-colors shadow-sm">
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  )}
                  
                  {/* Primary Row */}
                  <div className={`flex flex-wrap gap-md items-end w-full ${items.length > 1 ? 'pr-12' : ''}`}>
                    {(txnType === 'SALE' || txnType === 'REPAIR_OUT' || txnType === 'REPAIR_IN' || txnType === 'CERTIFICATION' || txnType === 'CERTIFICATION_IN') && (
                      <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-on-surface-variant mb-1 block">Select Existing Diamond</label>
                        <select value={item.existingDiamondId} onChange={e => handleItemChange(idx, 'existingDiamondId', e.target.value)} className="w-full p-2 border border-outline-variant rounded-md bg-[#F4F7FA] text-sm focus:border-primary focus:ring-1 font-bold text-primary">
                          <option value="">Select diamond...</option>
                          {filteredDiamonds.map(d => (
                            <option key={d.id} value={d.id}>{d.displayName || d.itemCode} - {d.carat}ct</option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-[150px]">
                      <label className="text-xs font-bold text-on-surface-variant mb-1 block flex items-center">Name</label>
                      <input type="text" value={item.name || ''} disabled={!!item.existingDiamondId} onChange={e => handleItemChange(idx, 'name', e.target.value)} className={`w-full p-2 border border-outline-variant rounded-md focus:border-primary focus:ring-1 text-sm font-medium ${item.existingDiamondId ? 'bg-gray-100' : ''}`} placeholder="Item Name" />
                    </div>
                    
                    <div className="w-[100px]">
                      <label className="text-xs font-bold text-error mb-1 block flex items-center">Carat <span className="ml-1">*</span></label>
                      <input type="number" value={item.carat} disabled={!!item.existingDiamondId} onChange={e => handleItemChange(idx, 'carat', e.target.value)} className={`w-full p-2 border border-outline-variant rounded-md focus:border-primary focus:ring-1 text-sm font-medium ${item.existingDiamondId ? 'bg-gray-100' : ''}`} placeholder="0.00" />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="text-xs font-bold text-on-surface-variant mb-1 block">Category</label>
                      <select value={item.category} disabled={!!item.existingDiamondId} onChange={e => handleItemChange(idx, 'category', e.target.value)} className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${item.existingDiamondId ? 'bg-gray-100' : 'bg-white'}`}>
                        <option value="SINGLE">Single</option>
                        <option value="MIX">Mix / Parcel</option>
                      </select>
                    </div>
                    {item.category === 'MIX' && (
                      <>
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-xs font-bold text-on-surface-variant mb-1 block">Cert. State</label>
                          <select value={item.certificationState} disabled={!!item.existingDiamondId} onChange={e => handleItemChange(idx, 'certificationState', e.target.value)} className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${item.existingDiamondId ? 'bg-gray-100' : 'bg-white'}`}>
                            <option value="">Select...</option>
                            <option value="CERTIFIED">Certified</option>
                            <option value="NON_CERTIFIED">Non-Certified</option>
                          </select>
                        </div>
                        {item.certificationState && (
                          <div className="flex-1 min-w-[120px]">
                            <label className="text-xs font-bold text-on-surface-variant mb-1 block">Polish State</label>
                            <select value={item.polishState} disabled={!!item.existingDiamondId} onChange={e => handleItemChange(idx, 'polishState', e.target.value)} className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${item.existingDiamondId ? 'bg-gray-100' : 'bg-white'}`}>
                              <option value="">Select...</option>
                              <option value="ROUGH">Rough</option>
                              <option value="POLISHED">Polished</option>
                            </select>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex-1 min-w-[100px]">
                      <label className="text-xs font-bold text-on-surface-variant mb-1 block">Shape</label>
                      <select value={item.shape} disabled={!!item.existingDiamondId} onChange={e => handleItemChange(idx, 'shape', e.target.value)} className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${item.existingDiamondId ? 'bg-gray-100' : 'bg-white'}`}>
                        {['Round', 'Princess', 'Cushion', 'Emerald', 'Oval', 'Pear'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[80px]">
                      <label className="text-xs font-bold text-on-surface-variant mb-1 block">Color</label>
                      <select value={item.color} disabled={!!item.existingDiamondId} onChange={e => handleItemChange(idx, 'color', e.target.value)} className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${item.existingDiamondId ? 'bg-gray-100' : 'bg-white'}`}>
                        {['D', 'E', 'F', 'G', 'H', 'I', 'J'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[80px]">
                      <label className="text-xs font-bold text-on-surface-variant mb-1 block">Clarity</label>
                      <select value={item.clarity} disabled={!!item.existingDiamondId} onChange={e => handleItemChange(idx, 'clarity', e.target.value)} className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${item.existingDiamondId ? 'bg-gray-100' : 'bg-white'}`}>
                        {['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[80px]">
                      <label className="text-xs font-bold text-on-surface-variant mb-1 block">Cut</label>
                      <select value={item.cut} disabled={!!item.existingDiamondId} onChange={e => handleItemChange(idx, 'cut', e.target.value)} className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${item.existingDiamondId ? 'bg-gray-100' : 'bg-white'}`}>
                        {['EX', 'VG', 'G', 'F', 'P'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[80px]">
                      <label className="text-xs font-bold text-on-surface-variant mb-1 block">Sym.</label>
                      <select value={item.symmetry} disabled={!!item.existingDiamondId} onChange={e => handleItemChange(idx, 'symmetry', e.target.value)} className={`w-full p-2 border border-outline-variant rounded-md bg-white text-sm focus:border-primary focus:ring-1 ${item.existingDiamondId ? 'bg-gray-100' : ''}`}>
                        {['EX', 'VG', 'G', 'F', 'P'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[80px]">
                      <label className="text-xs font-bold text-on-surface-variant mb-1 block">Pol.</label>
                      <select value={item.polish} disabled={!!item.existingDiamondId} onChange={e => handleItemChange(idx, 'polish', e.target.value)} className={`w-full p-2 border border-outline-variant rounded-md bg-white text-sm focus:border-primary focus:ring-1 ${item.existingDiamondId ? 'bg-gray-100' : ''}`}>
                        {['EX', 'VG', 'G', 'F', 'P'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[100px]">
                      <label className="text-xs font-bold text-on-surface-variant mb-1 block">Rate / Ct (₹)</label>
                      <input type="number" value={item.ratePerCarat} onChange={e => handleItemChange(idx, 'ratePerCarat', e.target.value)} className="w-full p-2 border border-outline-variant rounded-md focus:border-primary focus:ring-1 text-sm font-medium" placeholder="0.00" />
                    </div>
                    <div className="flex-1 min-w-[100px]">
                      <label className="text-xs font-bold text-on-surface-variant mb-1 block">Total Value (₹)</label>
                      <input type="number" value={item.totalValue} readOnly className="w-full p-2 border border-outline-variant rounded-md bg-[#FAFAFA] font-bold text-primary text-sm shadow-inner" placeholder="0.00" />
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-lg w-full mt-2">
                    {/* Inline Certificate Linking */}
                    {(txnType === 'PURCHASE' || txnType === 'CERTIFICATION' || txnType === 'CERTIFICATION_IN') && (
                      <div className="flex-1 border border-[#A5D6A7] bg-[#F1F8E9]/60 rounded-xl p-md flex flex-col gap-md transition-colors hover:bg-[#F1F8E9]">
                        <div className="flex items-center justify-between">
                           <div className="flex items-center gap-xs text-[#2E7D32]">
                             <span className="material-symbols-outlined text-[18px]">verified_user</span>
                             <span className="font-bold text-sm">Certification {txnType === 'CERTIFICATION_IN' ? 'Receipt' : '(Optional)'}</span>
                           </div>
                           <span className="material-symbols-outlined text-[18px] text-[#A5D6A7]">expand_less</span>
                        </div>
                        <div className="flex flex-wrap gap-md items-end w-full">
                          {txnType === 'CERTIFICATION_IN' ? (
                            <div className="flex-1 min-w-[150px]">
                              <label className="text-xs font-bold text-on-surface-variant mb-1 block">Pending Certificate</label>
                              <select value={item.linkedCertificateId} onChange={e => handleItemChange(idx, 'linkedCertificateId', e.target.value)} className="w-full p-2 border border-[#C8E6C9] rounded-md bg-white text-sm focus:border-[#4CAF50] focus:ring-1">
                                <option value="">Select Pending...</option>
                                {allCerts.filter(c => c.diamondItemId === item.existingDiamondId && c.certificateStatus === 'PENDING').map(cert => (
                                  <option key={cert.id} value={cert.id}>{cert.labType} - {cert.name || 'Unnamed'}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <>
                              {unlinkedCerts.length > 0 && txnType === 'PURCHASE' && (
                                <div className="flex-1 min-w-[120px]">
                                  <label className="text-xs font-bold text-on-surface-variant mb-1 block">Existing Cert</label>
                                  <select value={item.linkedCertificateId} onChange={e => handleItemChange(idx, 'linkedCertificateId', e.target.value)} className="w-full p-2 border border-[#C8E6C9] rounded-md bg-white text-sm focus:border-[#4CAF50] focus:ring-1">
                                    <option value="">None</option>
                                    {unlinkedCerts.map(cert => (
                                      <option key={cert.certificateId} value={cert.certificateId}>{cert.reportNumber || cert.certificateId}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <div className="flex-1 min-w-[100px]">
                                <label className="text-xs font-bold text-on-surface-variant mb-1 block">Cert. Lab</label>
                                <select value={item.labType} onChange={e => handleItemChange(idx, 'labType', e.target.value)} className="w-full p-2 border border-[#C8E6C9] rounded-md bg-white text-sm focus:border-[#4CAF50] focus:ring-1">
                                  <option value="">None</option>
                                  {['GIA', 'IGI', 'HRD', 'OTHER'].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            </>
                          )}
                          
                          {(item.labType || txnType === 'CERTIFICATION_IN') && (
                            <>
                              {txnType !== 'CERTIFICATION_IN' && (
                                <div className="flex-1 min-w-[150px]">
                                  <label className="text-xs font-bold text-on-surface-variant mb-1 block">Report / Notes</label>
                                  <input type="text" value={item.internalNotes} onChange={e => handleItemChange(idx, 'internalNotes', e.target.value)} className="w-full p-2 border border-[#C8E6C9] rounded-md text-sm focus:border-[#4CAF50] focus:ring-1" placeholder="Report # or notes..." />
                                </div>
                              )}
                              <div className="flex-1 min-w-[100px]">
                                <label className="text-xs font-bold text-on-surface-variant mb-1 block">{txnType === 'CERTIFICATION_IN' ? 'Final Cost (₹)' : 'Est. Cost (₹)'}</label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-2 text-on-surface-variant text-sm">₹</span>
                                  <input type="number" value={item.certCost} onChange={e => handleItemChange(idx, 'certCost', e.target.value)} className="w-full pl-6 pr-2 py-2 border border-[#C8E6C9] rounded-md text-sm focus:border-[#4CAF50] focus:ring-1" placeholder="0.00" />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Inline Repair Linking */}
                    {(txnType === 'PURCHASE' || txnType === 'REPAIR_OUT' || txnType === 'REPAIR_IN') && (
                      <div className="flex-1 border border-[#CE93D8] bg-[#F3E5F5]/60 rounded-xl p-md flex flex-col gap-md transition-colors hover:bg-[#F3E5F5]">
                        <div className="flex items-center justify-between">
                           <div className="flex items-center gap-xs text-[#6A1B9A]">
                             <span className="material-symbols-outlined text-[18px]">build</span>
                             <span className="font-bold text-sm">Repair {txnType === 'REPAIR_IN' ? 'Receipt' : '(Optional)'}</span>
                           </div>
                           <span className="material-symbols-outlined text-[18px] text-[#CE93D8]">expand_less</span>
                        </div>
                        <div className="flex flex-wrap gap-md items-end w-full">
                          {txnType === 'REPAIR_IN' ? (
                            <div className="flex-1 min-w-[150px]">
                              <label className="text-xs font-bold text-on-surface-variant mb-1 block">Pending Repair</label>
                              <select value={item.linkedRepairId} onChange={e => handleItemChange(idx, 'linkedRepairId', e.target.value)} className="w-full p-2 border border-[#E1BEE7] rounded-md bg-white text-sm focus:border-[#9C27B0] focus:ring-1">
                                <option value="">Select Pending...</option>
                                {allRepairs.filter(r => r.diamondItemId === item.existingDiamondId && (r.status === 'PENDING' || r.status === 'IN_PROGRESS')).map(rep => (
                                  <option key={rep.id} value={rep.id}>{rep.repairType} - {rep.name || 'Unnamed'}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="flex-1 min-w-[120px]">
                              <label className="text-xs font-bold text-on-surface-variant mb-1 block">Repair Type</label>
                              <select value={item.repairType} onChange={e => handleItemChange(idx, 'repairType', e.target.value)} className="w-full p-2 border border-[#E1BEE7] rounded-md bg-white text-sm focus:border-[#9C27B0] focus:ring-1">
                                <option value="">No Repair</option>
                                {['Polishing', 'Cutting', 'Boiling', 'Symmetry', 'Other'].map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                          )}
                          
                          {(item.repairType || txnType === 'REPAIR_IN') && (
                            <>
                              {txnType !== 'REPAIR_IN' && (
                                <div className="flex-1 min-w-[150px]">
                                  <label className="text-xs font-bold text-on-surface-variant mb-1 block">Vendor</label>
                                  <select value={item.repairVendorId} onChange={e => handleItemChange(idx, 'repairVendorId', e.target.value)} className="w-full p-2 border border-[#E1BEE7] rounded-md bg-white text-sm focus:border-[#9C27B0] focus:ring-1">
                                    <option value="">Select Vendor</option>
                                    {parties.filter(p => p.type === 'WORKSHOP' || p.partyName?.toUpperCase().includes('WORKSHOP')).map(p => (
                                      <option key={p.partyId} value={p.partyId}>{p.partyName}</option>
                                    ))}
                                    {parties.map(p => (
                                      <option key={p.partyId} value={p.partyId}>{p.partyName}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <div className="flex-1 min-w-[100px]">
                                <label className="text-xs font-bold text-on-surface-variant mb-1 block">{txnType === 'REPAIR_IN' ? 'Final Cost (₹)' : 'Est. Cost (₹)'}</label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-2 text-on-surface-variant text-sm">₹</span>
                                  <input type="number" value={item.repairCost} onChange={e => handleItemChange(idx, 'repairCost', e.target.value)} className="w-full pl-6 pr-2 py-2 border border-[#E1BEE7] rounded-md text-sm focus:border-[#9C27B0] focus:ring-1" placeholder="0.00" />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={handleAddItem}
              className="w-full py-3 border border-dashed border-[#1976D2]/50 text-[#1976D2] bg-white hover:bg-[#E3F2FD]/50 rounded-xl flex items-center justify-center gap-xs font-bold transition-all mt-2"
            >
              <span className="material-symbols-outlined text-[20px]">add_circle</span> Add Another Item
            </button>
          </div>
          
          {/* Remarks Section */}
          <div className="bg-[#FFFDF3] border border-[#FFE082] rounded-xl p-md flex flex-col gap-sm">
            <div className="flex items-center gap-xs text-[#F57F17] px-1">
              <span className="material-symbols-outlined text-[18px]">edit_note</span>
              <span className="font-bold text-sm">Remarks (Optional)</span>
            </div>
            <div className="relative">
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Enter transaction remarks, notes or any additional information..."
                maxLength={500}
                className="w-full p-4 border border-outline-variant/60 rounded-lg bg-white text-on-surface focus:outline-none focus:border-[#FFCA28] focus:ring-1 text-sm resize-none h-24 shadow-inner"
              />
              <div className="absolute bottom-3 right-3 text-xs text-on-surface-variant font-medium">{remarks.length} / 500</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-xl py-lg border-t border-outline-variant bg-[#FAFAFA] rounded-b-2xl flex items-center justify-between shrink-0 flex-wrap gap-md">
          <div className="flex items-center gap-md">
            {/* Total Items */}
            <div className="flex items-center gap-md bg-white border border-[#E3F2FD] px-md py-2 rounded-xl shadow-sm min-w-[140px]">
              <span className="material-symbols-outlined text-[#1976D2] text-[24px]">diamond</span>
              <div className="flex flex-col">
                <span className="text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">Total Items</span>
                <span className="text-base font-extrabold text-on-surface">{items.length}</span>
              </div>
            </div>
            {/* Total Carat */}
            <div className="flex items-center gap-md bg-white border border-[#F3E5F5] px-md py-2 rounded-xl shadow-sm min-w-[140px]">
              <span className="material-symbols-outlined text-[#8E24AA] text-[24px]">scale</span>
              <div className="flex flex-col">
                <span className="text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">Total Carat</span>
                <span className="text-base font-extrabold text-on-surface">{items.reduce((acc, curr) => acc + (parseFloat(curr.carat) || 0), 0).toFixed(2)} ct</span>
              </div>
            </div>
            {/* Est. Total Value */}
            <div className="flex items-center gap-md bg-white border border-[#E8F5E9] px-md py-2 rounded-xl shadow-sm min-w-[140px]">
              <span className="material-symbols-outlined text-[#2E7D32] text-[24px]">payments</span>
              <div className="flex flex-col">
                <span className="text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">Est. Total Value</span>
                <span className="text-base font-extrabold text-on-surface">₹ {items.reduce((acc, curr) => acc + (parseFloat(curr.totalValue) || 0), 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-md ml-auto">
            <DraftSyncStatus 
              syncState={syncState} 
              lastSavedAgo={lastSavedAgo} 
            />
            
            <button
              onClick={onClose}
              disabled={saving}
              className="px-lg py-2.5 font-bold text-on-surface bg-white border border-outline-variant hover:bg-surface-container rounded-lg transition-colors flex items-center gap-xs shadow-sm disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">close</span> {t('Cancel')}
            </button>
            <button
              onClick={async () => {
                await forceServerSync();
                await handleSubmit();
              }}
              disabled={saving}
              className="px-xl py-2.5 font-bold bg-[#3949AB] hover:bg-[#283593] text-white rounded-lg transition-colors flex items-center gap-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              <span className="material-symbols-outlined text-[18px]">lock</span>
              {saving ? 'Saving...' : t('Save Transaction')}
              {!saving && <span className="material-symbols-outlined text-[20px]">arrow_forward</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
