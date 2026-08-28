import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface TransactionModalProps {
  open: boolean;
  stockId: string | null;
  editTransactionData?: any | null;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ open, stockId, editTransactionData, onClose, onSubmit }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [txnType, setTxnType] = useState('PURCHASE');
  const [partyId, setPartyId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  
  const [parties, setParties] = useState<any[]>([]);
  const [stocks, setStocks] = useState<{id: string, name: string, ledgers: any[]}[]>([]);
  const [unlinkedCerts, setUnlinkedCerts] = useState<any[]>([]);
  const [availableDiamonds, setAvailableDiamonds] = useState<any[]>([]);
  const [selectedLedgerId, setSelectedLedgerId] = useState('');

  // Item lines state
  const [items, setItems] = useState<any[]>([]);

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
        fetch('/api/certificates/unlinked')
          .then(r => r.json())
          .then(res => {
            if (res.success) setUnlinkedCerts(res.data);
          })
          .catch(err => console.error('Failed to load unlinked certs:', err));
      });

      if (editTransactionData) {
        setTxnType(editTransactionData.transactionType || 'PURCHASE');
        setPartyId(editTransactionData.partyId || '');
        setRemarks(editTransactionData.remarks || '');
        setReferenceNo(editTransactionData.referenceNo || '');
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
          setItems([{ carat: '', value: '', shape: 'Round', color: 'D', clarity: 'VS1', cut: 'EX', category: 'SINGLE', certificationState: '', polishState: '', linkedCertificateId: '', labType: 'GIA', internalNotes: '', certCost: '', repairType: 'Polishing', repairVendorId: '', repairCost: '', existingDiamondId: '' }]);
        }
      } else {
        setTxnType('PURCHASE');
        setPartyId('');
        setRemarks('');
        setReferenceNo('');
        setItems([{ carat: '', value: '', shape: 'Round', color: 'D', clarity: 'VS1', cut: 'EX', category: 'SINGLE', certificationState: '', polishState: '', linkedCertificateId: '', labType: 'GIA', internalNotes: '', certCost: '', repairType: 'Polishing', repairVendorId: '', repairCost: '', existingDiamondId: '' }]);
      }
      setError(null);
    }
  }, [open, stockId]);

  useEffect(() => {
    if (selectedLedgerId && stocks.length > 0) {
      const stock = stocks.find(s => s.ledgers.some((l: any) => l.id === selectedLedgerId));
      if (stock) {
        api.getDiamonds(stock.id).then(res => {
          if (res.success) setAvailableDiamonds(res.data.filter((d: any) => d.status === 'ACTIVE' || d.status === 'RECEIVED'));
        });
      }
    } else {
      setAvailableDiamonds([]);
    }
  }, [selectedLedgerId, stocks]);

  if (!open) return null;

  const handleAddItem = () => {
    setItems([...items, { carat: '', value: '', shape: 'Round', color: 'D', clarity: 'VS1', cut: 'EX', category: 'SINGLE', certificationState: '', polishState: '', linkedCertificateId: '', labType: 'GIA', internalNotes: '', certCost: '', repairType: 'Polishing', repairVendorId: '', repairCost: '', existingDiamondId: '' }]);
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
    
    // Auto populate carat and value when existing diamond is selected
    if (field === 'existingDiamondId' && val) {
      const diamond = availableDiamonds.find(d => d.id === val);
      if (diamond) {
        newItems[index].carat = diamond.carat;
        newItems[index].value = diamond.currentValue;
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
      if (!items[i].value || isNaN(parseFloat(items[i].value))) {
        setError(`Item ${i + 1} is missing a valid value`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        ledgerId: selectedLedgerId,
        txnType: txnType,
        transactionDate: new Date().toISOString(),
        partyId: partyId,
        remarks: remarks,
        referenceNo: referenceNo,
        items: items.map((item, idx) => {
          const c = parseFloat(item.carat);
          const r = parseFloat(item.ratePerCarat);
          const v = parseFloat(item.totalValue);
          return {
            itemCode: `ITM-${Date.now()}-${idx}`,
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
            existingDiamondId: item.existingDiamondId
          };
        })
      };

      if (editTransactionData) {
        await api.updateLedger(editTransactionData.id, payload);
      } else {
        await api.postLedger(payload);
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
      <div className="bg-surface-container-lowest w-full max-w-4xl rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] flex flex-col my-auto border border-outline-variant animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-xl py-md border-b border-outline-variant bg-surface-bright rounded-t-xl shrink-0">
          <div className="flex items-center gap-md">
            <div className={`w-8 h-8 rounded bg-[#1565C0] text-white flex items-center justify-center font-bold`}>
              <span className="material-symbols-outlined text-[18px]">add</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface m-0 font-bold">
                {editTransactionData ? 'Edit Transaction' : 'Item-Level Transaction Entry'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:bg-surface-container hover:text-on-surface p-sm rounded-full transition-colors self-start"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-xl flex flex-col gap-lg bg-background overflow-y-auto max-h-[70vh]">
          {error && (
            <div className="bg-error-container border border-error/20 rounded-lg px-md py-sm flex items-center gap-sm">
              <span className="material-symbols-outlined text-error text-[18px]">error</span>
              <span className="font-body-md text-body-md text-on-error-container">{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
            {/* Transaction Type */}
            <div className="flex flex-col gap-xs">
              <label className="font-caption text-caption font-bold text-on-surface-variant">Transaction Type</label>
              <select
                value={txnType}
                onChange={(e) => setTxnType(e.target.value)}
                className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-body-md"
              >
                <option value="PURCHASE">Purchase</option>
                <option value="SALE">Sale</option>
                <option value="REPAIR_OUT">Send to Repair</option>
                <option value="CERTIFICATION">Send for Certification</option>
              </select>
            </div>

            {/* Target Stock */}
            <div className="flex flex-col gap-xs">
              <label className="font-caption text-caption font-bold text-on-surface-variant">Target Stock</label>
              <select
                value={selectedLedgerId}
                onChange={(e) => setSelectedLedgerId(e.target.value)}
                className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-body-md"
              >
                <option value="">Select stock...</option>
                {stocks.map((s: any) => 
                  s.ledgers.length > 0 ? (
                    <option key={s.ledgers[0].id} value={s.ledgers[0].id}>{s.name}</option>
                  ) : null
                )}
              </select>
            </div>

            {/* Party */}
            <div className="flex flex-col gap-xs col-span-2">
              <label className="font-caption text-caption font-bold text-on-surface-variant">Party</label>
              <select
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 font-body-md"
              >
                <option value="">Select Party</option>
                {parties.map(p => (
                  <option key={p.partyId} value={p.partyId}>{p.partyName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-outline-variant pt-4">
            <div className="flex justify-between items-center mb-sm">
              <h3 className="font-headline-sm font-bold text-on-surface">Transaction Items</h3>
              <button 
                onClick={handleAddItem}
                className="text-primary hover:bg-primary/10 px-sm py-xs rounded flex items-center gap-xs font-bold transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">add</span> Add Item
              </button>
            </div>

            <div className="flex flex-col gap-sm">
              {items.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-sm bg-surface-bright p-sm rounded-lg border border-outline-variant relative">
                  
                  {/* Primary Row */}
                  <div className="flex flex-wrap gap-sm items-end w-full">
                    {(txnType === 'SALE' || txnType === 'REPAIR_OUT') ? (
                      <div className="flex-1 min-w-[200px]">
                        <label className="font-caption text-caption text-on-surface-variant mb-1 block">Select Existing Diamond</label>
                        <select value={item.existingDiamondId} onChange={e => handleItemChange(idx, 'existingDiamondId', e.target.value)} className="w-full p-2 border border-outline-variant rounded bg-white">
                          <option value="">Select diamond...</option>
                          {availableDiamonds.map(d => (
                            <option key={d.id} value={d.id}>{d.displayName || d.itemCode} - {d.carat}ct</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-[80px]">
                          <label className="font-caption text-caption text-on-surface-variant mb-1 block">Carat</label>
                          <input type="number" value={item.carat} onChange={e => handleItemChange(idx, 'carat', e.target.value)} className="w-full p-2 border border-outline-variant rounded" placeholder="0.00" />
                        </div>
                        <div className="flex-1 min-w-[100px]">
                          <label className="font-caption text-caption text-on-surface-variant mb-1 block">Category</label>
                          <select value={item.category} onChange={e => handleItemChange(idx, 'category', e.target.value)} className="w-full p-2 border border-outline-variant rounded bg-white">
                            <option value="SINGLE">Single</option>
                            <option value="MIX">Mix / Parcel</option>
                          </select>
                        </div>
                        {item.category === 'MIX' && (
                          <>
                            <div className="flex-1 min-w-[120px]">
                              <label className="font-caption text-caption text-on-surface-variant mb-1 block">1. Cert. State</label>
                              <select value={item.certificationState} onChange={e => handleItemChange(idx, 'certificationState', e.target.value)} className="w-full p-2 border border-outline-variant rounded bg-white">
                                <option value="">Select...</option>
                                <option value="CERTIFIED">Certified</option>
                                <option value="NON_CERTIFIED">Non-Certified</option>
                              </select>
                            </div>
                            {item.certificationState && (
                              <div className="flex-1 min-w-[100px]">
                                <label className="font-caption text-caption text-on-surface-variant mb-1 block">2. Polish State</label>
                                <select value={item.polishState} onChange={e => handleItemChange(idx, 'polishState', e.target.value)} className="w-full p-2 border border-outline-variant rounded bg-white">
                                  <option value="">Select...</option>
                                  <option value="ROUGH">Rough</option>
                                  <option value="POLISHED">Polished</option>
                                </select>
                              </div>
                            )}
                          </>
                        )}
                        <div className="flex-1 min-w-[100px]">
                          <label className="font-caption text-caption text-on-surface-variant mb-1 block">Shape</label>
                          <select value={item.shape} onChange={e => handleItemChange(idx, 'shape', e.target.value)} className="w-full p-2 border border-outline-variant rounded bg-white">
                            {['Round', 'Princess', 'Cushion', 'Emerald', 'Oval', 'Pear'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="flex-1 min-w-[80px]">
                          <label className="font-caption text-caption text-on-surface-variant mb-1 block">Color</label>
                          <select value={item.color} onChange={e => handleItemChange(idx, 'color', e.target.value)} className="w-full p-2 border border-outline-variant rounded bg-white">
                            {['D', 'E', 'F', 'G', 'H', 'I', 'J'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="flex-1 min-w-[80px]">
                          <label className="font-caption text-caption text-on-surface-variant mb-1 block">Clarity</label>
                          <select value={item.clarity} onChange={e => handleItemChange(idx, 'clarity', e.target.value)} className="w-full p-2 border border-outline-variant rounded bg-white">
                            {['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="flex-1 min-w-[80px]">
                          <label className="font-caption text-caption text-on-surface-variant mb-1 block">Cut</label>
                          <select value={item.cut} onChange={e => handleItemChange(idx, 'cut', e.target.value)} className="w-full p-2 border border-outline-variant rounded bg-white">
                            {['EX', 'VG', 'G', 'F', 'P'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="flex-1 min-w-[80px]">
                          <label className="font-caption text-caption text-on-surface-variant mb-1 block">Pol.</label>
                          <select value={item.polish} onChange={e => handleItemChange(idx, 'polish', e.target.value)} className="w-full p-2 border border-outline-variant rounded bg-white">
                            {['EX', 'VG', 'G', 'F', 'P'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="flex-1 min-w-[80px]">
                          <label className="font-caption text-caption text-on-surface-variant mb-1 block">Sym.</label>
                          <select value={item.symmetry} onChange={e => handleItemChange(idx, 'symmetry', e.target.value)} className="w-full p-2 border border-outline-variant rounded bg-white">
                            {['EX', 'VG', 'G', 'F', 'P'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="flex-1 min-w-[80px]">
                          <label className="font-caption text-caption text-on-surface-variant mb-1 block">Fluor.</label>
                          <select value={item.fluorescence} onChange={e => handleItemChange(idx, 'fluorescence', e.target.value)} className="w-full p-2 border border-outline-variant rounded bg-white">
                            {['NONE', 'FAINT', 'MEDIUM', 'STRONG'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </>
                    )}
                    <div className="flex-1 min-w-[100px]">
                      <label className="font-caption text-caption text-on-surface-variant mb-1 block">Rate / Ct (₹)</label>
                      <input type="number" value={item.ratePerCarat} onChange={e => handleItemChange(idx, 'ratePerCarat', e.target.value)} className="w-full p-2 border border-outline-variant rounded" placeholder="₹" />
                    </div>
                    <div className="flex-1 min-w-[100px]">
                      <label className="font-caption text-caption text-on-surface-variant mb-1 block">Total Value (₹)</label>
                      <input type="number" value={item.totalValue} readOnly className="w-full p-2 border border-outline-variant rounded bg-surface-container-lowest font-bold text-primary" placeholder="₹" />
                    </div>
                  </div>
                  <div className="flex flex-wrap md:flex-nowrap gap-sm items-end w-full border-t border-outline-variant/30 pt-2 mt-1">
                    {/* Inline Certificate Linking */}
                    {(txnType === 'PURCHASE' || txnType === 'CERTIFICATION') && (
                      <div className="flex flex-1 gap-sm p-2 bg-primary/5 rounded border border-primary/20">
                        {unlinkedCerts.length > 0 && txnType === 'PURCHASE' && (
                          <div className="flex-1 min-w-[120px]">
                            <label className="font-caption text-caption text-on-surface-variant mb-1 block">Existing Cert</label>
                            <select value={item.linkedCertificateId} onChange={e => handleItemChange(idx, 'linkedCertificateId', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded bg-white text-sm">
                              <option value="">None</option>
                              {unlinkedCerts.map(cert => (
                                <option key={cert.certificateId} value={cert.certificateId}>{cert.reportNumber || cert.certificateId}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="flex-1 min-w-[80px]">
                          <label className="font-caption text-caption text-on-surface-variant mb-1 block">New Cert Lab</label>
                          <select value={item.labType} onChange={e => handleItemChange(idx, 'labType', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded bg-white text-sm">
                            <option value="">None</option>
                            {['GIA', 'IGI', 'HRD', 'OTHER'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        {item.labType && (
                          <>
                            <div className="flex-1 min-w-[120px]">
                              <label className="font-caption text-caption text-on-surface-variant mb-1 block">Report # / Notes</label>
                              <input type="text" value={item.internalNotes} onChange={e => handleItemChange(idx, 'internalNotes', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded text-sm" placeholder="Ref..." />
                            </div>
                            <div className="flex-1 min-w-[80px]">
                              <label className="font-caption text-caption text-on-surface-variant mb-1 block">Cert Cost</label>
                              <input type="number" value={item.certCost} onChange={e => handleItemChange(idx, 'certCost', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded text-sm" placeholder="₹" />
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Inline Repair Linking */}
                    {(txnType === 'PURCHASE' || txnType === 'REPAIR_OUT') && (
                      <div className="flex flex-1 gap-sm p-2 bg-tertiary/5 rounded border border-tertiary/20">
                        <div className="flex-1 min-w-[100px]">
                          <label className="font-caption text-caption text-on-surface-variant mb-1 block">Link Repair</label>
                          <select value={item.repairType} onChange={e => handleItemChange(idx, 'repairType', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded bg-white text-sm">
                            <option value="">No Repair</option>
                            {['Polishing', 'Cutting', 'Boiling', 'Symmetry', 'Other'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        {item.repairType && (
                          <>
                            <div className="flex-1 min-w-[120px]">
                              <label className="font-caption text-caption text-on-surface-variant mb-1 block">Repair Vendor</label>
                              <select value={item.repairVendorId} onChange={e => handleItemChange(idx, 'repairVendorId', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded bg-white text-sm">
                                <option value="">Select Vendor...</option>
                                {parties.filter(p => p.type === 'WORKSHOP' || p.partyName?.toUpperCase().includes('WORKSHOP')).map(p => (
                                  <option key={p.partyId} value={p.partyId}>{p.partyName}</option>
                                ))}
                                {/* If workshop filter is tricky, we can just show all parties for now */}
                                {parties.map(p => (
                                  <option key={p.partyId} value={p.partyId}>{p.partyName}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex-1 min-w-[80px]">
                              <label className="font-caption text-caption text-on-surface-variant mb-1 block">Est. Cost</label>
                              <input type="number" value={item.repairCost} onChange={e => handleItemChange(idx, 'repairCost', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded text-sm" placeholder="₹" />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {items.length > 1 && (
                    <button onClick={() => handleRemoveItem(idx)} className="absolute -right-3 -top-3 p-1 bg-white shadow border border-outline-variant text-error hover:bg-error/10 rounded-full">
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-4 flex flex-col gap-xs">
              <label className="font-caption text-caption font-bold text-on-surface-variant">Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Transaction remarks..."
                rows={2}
                className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary focus:ring-1 font-body-md resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-xl py-md border-t border-outline-variant bg-surface-container-lowest rounded-b-xl flex items-center justify-end shrink-0 gap-sm">
          <button
            onClick={onClose}
            className="px-lg py-sm font-body-md font-bold text-on-surface hover:bg-surface-container rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-lg py-sm font-body-md font-bold bg-[#7986CB] hover:bg-[#5C6BC0] text-white rounded-lg transition-colors flex items-center gap-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {saving ? 'Authorizing...' : 'Authorize Ledger Entry'}
            {!saving && <span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
          </button>
        </div>
      </div>
    </div>
  );
};
