import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../services/api';
import { useDraftAutoSave } from '../../../hooks/useDraftAutoSave';
import { deleteLocalDraft } from '../../../services/draftDb';
import { useTranslation } from 'react-i18next';
import { TransactionHeader } from './TransactionHeader';
import { TransactionRemarks } from './TransactionRemarks';
import { TransactionFooter } from './TransactionFooter';
import { TransactionBrokerageSection } from './TransactionBrokerageSection';
import { TransactionPaymentSection } from './TransactionPaymentSection';
import { TransactionItemsSection } from './TransactionItemsSection';
import { SearchableSelect, SearchOption } from '../../common/components/SearchableSelect';
import { getPartyTypeConfig, isBrokerType } from '../../parties/types/partyTypes';
import { PartyModal } from '../../parties/components/PartyModal';

interface TransactionModalProps {
  open: boolean;
  stockId: string | null;
  editTransactionData?: any | null;
  /** Pre-select transaction type when opening a new transaction (e.g., CERTIFICATION, REPAIR_OUT) */
  defaultTxnType?: string;
  /** Pre-select party dropdown when opening a new transaction */
  defaultPartyId?: string;
  /** Pre-fill linkedCertificateId on the first item row */
  defaultCertificateId?: string;
  /** Pre-fill linkedRepairId on the first item row */
  defaultRepairId?: string;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ open, stockId, editTransactionData, defaultTxnType, defaultPartyId, defaultCertificateId, defaultRepairId, onClose, onSubmit }) => {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resumeDraft = editTransactionData?._resumeDraft;
  const draftPayload = resumeDraft?.payload || {};

  const [txnType, setTxnType] = useState(draftPayload.txnType || 'PURCHASE');
  const [partyId, setPartyId] = useState(draftPayload.partyId || '');
  const [brokerageType, setBrokerageType] = useState<'INCLUSIVE' | 'EXCLUSIVE'>(draftPayload.brokerageType || 'INCLUSIVE');
  const [brokeragePercentage, setBrokeragePercentage] = useState<string>(draftPayload.brokeragePercentage?.toString() || '');
  const [brokerageAmount, setBrokerageAmount] = useState<string>(draftPayload.brokerageAmount?.toString() || '');
  const [remarks, setRemarks] = useState(draftPayload.remarks || '');
  const [referenceNo, setReferenceNo] = useState(draftPayload.referenceNo || '');
  const [paymentType, setPaymentType] = useState<'TO_PAY' | 'TO_COLLECT'>(
    draftPayload.paymentType || (draftPayload.txnType === 'SALE' ? 'TO_COLLECT' : 'TO_PAY')
  );
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
  const [isAddPartyModalOpen, setIsAddPartyModalOpen] = useState(false);
  const [showBrokerage, setShowBrokerage] = useState(false);

  // Item lines state
  const [items, setItems] = useState<any[]>(draftPayload.items || []);

  const selectedParty = useMemo(() => {
    return parties.find(p => (p.partyId || p.id) === partyId);
  }, [parties, partyId]);

  const isBroker = useMemo(() => {
    return isBrokerType(selectedParty?.type || selectedParty?.partyType);
  }, [selectedParty]);

  const selectedPartyConfig = useMemo(() => {
    return getPartyTypeConfig(selectedParty?.type || selectedParty?.partyType);
  }, [selectedParty]);

  const totalTransactionValue = useMemo(() => {
    return items.reduce((acc, it) => acc + (parseFloat(it.totalValue || '0') || 0), 0);
  }, [items]);

  // When selected party changes, if it's a broker and has a default percentage, auto-fill it
  useEffect(() => {
    if (selectedParty && isBroker && !brokeragePercentage && selectedParty.brokeragePercentage > 0) {
      setBrokeragePercentage(String(selectedParty.brokeragePercentage));
    }
  }, [selectedParty, isBroker]);

  // Auto calculate brokerage amount when percentage or total value changes
  useEffect(() => {
    if (isBroker && brokeragePercentage) {
      const pct = parseFloat(brokeragePercentage);
      if (!isNaN(pct) && pct >= 0 && totalTransactionValue > 0) {
        setBrokerageAmount(((totalTransactionValue * pct) / 100).toFixed(2));
      }
    }
  }, [isBroker, brokeragePercentage, totalTransactionValue]);

  const handleCreatePartyFromTxn = async (partyData: any) => {
    try {
      const res = await api.createParty(partyData);
      if (res.success && res.data) {
        const newParty = {
          ...res.data,
          id: res.data.id,
          partyId: res.data.id,
          name: res.data.name,
          partyName: res.data.name,
          type: res.data.partyType,
          partyType: res.data.partyType,
          brokeragePercentage: res.data.brokeragePercentage ? Number(res.data.brokeragePercentage) : 0,
        };
        setParties((prev) => [newParty, ...prev]);
        setPartyId(newParty.id);
        if (isBrokerType(newParty.partyType) && newParty.brokeragePercentage > 0) {
          setBrokeragePercentage(String(newParty.brokeragePercentage));
        }
        setIsAddPartyModalOpen(false);
      }
    } catch (err: any) {
      console.error('Failed to create party from transaction modal:', err);
      throw err;
    }
  };

  // Draft integration
  const currentPayload = useMemo(() => ({
    txnType,
    partyId,
    brokerageType,
    brokeragePercentage,
    brokerageAmount,
    remarks,
    referenceNo,
    paymentType,
    paymentStatus,
    paymentDone,
    transactionDate,
    selectedLedgerId,
    items,
  }), [txnType, partyId, brokerageType, brokeragePercentage, brokerageAmount, remarks, referenceNo, paymentType, paymentStatus, paymentDone, transactionDate, selectedLedgerId, items]);

  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    return localStorage.getItem('draftAutoSaveEnabled') !== 'false';
  });

  const handleToggleAutoSave = () => {
    setAutoSaveEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('draftAutoSaveEnabled', next.toString());
      return next;
    });
  };

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
    enabled: autoSaveEnabled,
  });

  useEffect(() => {
    if (open && autoSaveEnabled) {
      onPayloadChange(currentPayload, `Updated ${txnType} details`);
    }
  }, [currentPayload, open, autoSaveEnabled, onPayloadChange]);

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
        api.getUnlinkedCertificates()
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
        setBrokerageType(editTransactionData.brokerageType || 'INCLUSIVE');
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
        setTxnType(defaultTxnType || 'PURCHASE');
        setPartyId(defaultPartyId || '');
        setBrokerageType('INCLUSIVE');
        setRemarks('');
        setReferenceNo('');
        setPaymentStatus('PENDING');
        setPaymentDone('');
        setTransactionDate(new Date().toISOString().split('T')[0]);
        setItems([{ name: '', carat: '', value: '', shape: 'Round', color: 'D', clarity: 'VS1', cut: 'EX', category: 'SINGLE', certificationState: '', polishState: '', linkedCertificateId: defaultCertificateId || '', labType: 'GIA', internalNotes: '', certCost: '', repairType: 'Polishing', repairVendorId: '', repairCost: '', existingDiamondId: '', linkedRepairId: defaultRepairId || '' }]);
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

  const partyOptions = useMemo<SearchOption[]>(() => {
    return parties.map((p) => {
      const id = p.partyId || p.id;
      const cfg = getPartyTypeConfig(p.type || p.partyType);
      const subparts = [];
      if (p.gstin) subparts.push(`GST: ${p.gstin}`);
      if (p.nickname || p.phone) subparts.push(p.nickname || p.phone);
      return {
        value: id,
        label: p.partyName || p.name,
        sublabel: subparts.length > 0 ? subparts.join(' • ') : undefined,
        badge: {
          text: cfg.badgeText,
          className: cfg.badgeClass,
        },
        icon: cfg.icon,
        data: p,
      };
    });
  }, [parties]);

  const stockOptions = useMemo<SearchOption[]>(() => {
    return stocks
      .filter((s: any) => s.ledgers && s.ledgers.length > 0)
      .map((s: any) => ({
        value: s.ledgers[0].id,
        label: s.name,
        sublabel: s.description || `${s.itemCount || 0} stones`,
        icon: 'inventory_2',
        data: s,
      }));
  }, [stocks]);

  const diamondOptions = useMemo<SearchOption[]>(() => {
    return filteredDiamonds.map((d: any) => ({
      value: d.id,
      label: `${d.displayName || d.itemCode} (${d.carat}ct)`,
      sublabel: `${d.shape || ''} • ${d.color || ''} ${d.clarity || ''} • ${d.cut || ''}`.trim(),
      badge: {
        text: d.status || 'AVAILABLE',
        className:
          d.status === 'AVAILABLE'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-amber-50 text-amber-700 border-amber-200',
      },
      icon: 'diamond',
      data: d,
    }));
  }, [filteredDiamonds]);

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
    let targetLedgerId = selectedLedgerId;
    if (!targetLedgerId && stocks.length > 0 && stocks[0].ledgers?.length > 0) {
      targetLedgerId = stocks[0].ledgers[0].id;
      setSelectedLedgerId(targetLedgerId);
    }
    if (!targetLedgerId) {
      setError('Please select or create a stock/ledger first');
      return;
    }

    let targetPartyId = partyId;
    if (!targetPartyId && parties.length > 0) {
      targetPartyId = parties[0].partyId || parties[0].id;
      setPartyId(targetPartyId);
    }
    if (!targetPartyId) {
      setError('Please select or add a party');
      return;
    }

    setSaving(true);
    try {
      await forceServerSync();
      
      const effectiveItems = items.length > 0 ? items : [{
        name: 'General Stock Stone',
        carat: '1.0',
        totalValue: '0',
        ratePerCarat: '0',
        shape: 'Round',
        color: 'D',
        clarity: 'VS1',
        cut: 'EX'
      }];

      const preparedItems = effectiveItems.map((item, idx) => {
        const c = (!item.carat || isNaN(parseFloat(item.carat))) ? 1.0 : parseFloat(item.carat);
        const v = (!item.totalValue || isNaN(parseFloat(item.totalValue))) ? 0 : parseFloat(item.totalValue);
        const r = (!item.ratePerCarat || isNaN(parseFloat(item.ratePerCarat))) ? (c > 0 ? v / c : 0) : parseFloat(item.ratePerCarat);
        return {
          itemCode: item.itemCode || `ITM-${Date.now()}-${idx}`,
          name: item.name || `Item ${idx + 1}`,
          carat: c,
          totalValue: v,
          ratePerCarat: r,
          itemAction: (['PURCHASE', 'RETURN', 'REPAIR_IN', 'CERTIFICATION_IN', 'ADD_IN'].includes(txnType) ? 'IN' : 'OUT') as 'IN' | 'OUT',
          shape: item.shape || 'Round',
          color: item.color || 'D',
          clarity: item.clarity || 'VS1',
          cut: item.cut || 'EX',
          polish: item.polish || 'EX',
          symmetry: item.symmetry || 'EX',
          fluorescence: item.fluorescence || 'NONE',
          measurements: item.measurements || '',
          category: item.category || 'SINGLE',
          certificationState: item.category === 'MIX' ? item.certificationState : null,
          polishState: item.category === 'MIX' ? item.polishState : null,
          linkedCertificateId: item.linkedCertificateId || undefined,
          labType: item.labType || undefined,
          internalNotes: item.internalNotes || '',
          certCost: item.certCost ? parseFloat(item.certCost) : null,
          repairType: item.repairType || undefined,
          repairVendorId: item.repairVendorId || undefined,
          repairCost: item.repairCost ? parseFloat(item.repairCost) : null,
          existingDiamondId: item.existingDiamondId || undefined,
          linkedRepairId: item.linkedRepairId || undefined
        };
      });

      const totalCarat = preparedItems.reduce((sum, item) => sum + item.carat, 0);
      const totalVal = preparedItems.reduce((sum, item) => sum + item.totalValue, 0);

      const payload = {
        ledgerId: targetLedgerId,
        txnType: txnType,
        transactionDate: new Date(transactionDate).toISOString(),
        partyId: targetPartyId,
        brokeragePercentage: isBroker && brokeragePercentage ? parseFloat(brokeragePercentage) : 0,
        brokerageAmount: isBroker && brokerageAmount ? parseFloat(brokerageAmount) : 0,
        brokerageType: isBroker ? brokerageType : 'INCLUSIVE',
        remarks: remarks || '',
        referenceNo: referenceNo || `REF-${Date.now().toString().slice(-6)}`,
        paymentType: paymentType,
        paymentStatus: paymentStatus || 'PENDING',
        paymentDone: paymentDone ? parseFloat(paymentDone) : 0,
        paymentDue: Math.max(0, totalVal - (parseFloat(paymentDone) || 0)),
        totalCarat,
        totalValue: totalVal,
        items: preparedItems
      };

      if (editTransactionData) {
        await api.updateLedger(editTransactionData.id, payload);
      } else {
        await api.postLedger(payload);
      }
      
      if (draftId) {
        await deleteLocalDraft(parseInt(draftId, 10));
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
        <TransactionHeader 
          isEdit={!!editTransactionData} 
          onClose={onClose}
          autoSaveDrafts={autoSaveEnabled}
          onToggleAutoSave={handleToggleAutoSave}
          syncState={syncState}
          lastSavedAgo={lastSavedAgo}
        />

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
                  onChange={(e) => {
                    const newType = e.target.value;
                    setTxnType(newType);
                    if (newType === 'SALE') {
                      setPaymentType('TO_COLLECT');
                    } else {
                      setPaymentType('TO_PAY');
                    }
                  }}
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
                <div className="flex-1 min-w-0">
                  <SearchableSelect
                    options={stockOptions}
                    value={selectedLedgerId}
                    onChange={(val) => setSelectedLedgerId(val)}
                    placeholder={t('Select Stock')}
                    searchPlaceholder="Search stock parcel..."
                    icon="inventory_2"
                  />
                </div>
              </div>
            </div>

            {/* Party */}
            <div className="flex flex-col gap-sm">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-on-surface-variant">{t('Party')}</label>
                <button
                  type="button"
                  onClick={() => setIsAddPartyModalOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-focus hover:underline"
                  title="Add a new account / party directly"
                >
                  <span className="material-symbols-outlined text-[15px]">person_add</span>
                  {t('+ Add Account')}
                </button>
              </div>
              <div className="flex items-center gap-sm">
                <div className="w-10 h-10 rounded-lg bg-[#FFF3E0] text-[#E65100] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">person</span>
                </div>
                <div className="flex-1 min-w-0">
                  <SearchableSelect
                    options={partyOptions}
                    value={partyId}
                    onChange={(val) => setPartyId(val)}
                    placeholder={t('Select Party')}
                    searchPlaceholder="Search party name, code, GSTIN, or type..."
                    icon="person"
                    onAddNew={() => setIsAddPartyModalOpen(true)}
                    addNewText="+ Add New Account / Party"
                  />
                </div>
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

          {/* Brokerage Commission Section */}
          {isBroker || (brokerageAmount && Number(brokerageAmount) > 0) || showBrokerage ? (
            <div className="relative">
              <TransactionBrokerageSection
                isBroker={isBroker}
                selectedPartyConfig={selectedPartyConfig}
                totalTransactionValue={totalTransactionValue}
                brokerageType={brokerageType}
                setBrokerageType={setBrokerageType}
                brokeragePercentage={brokeragePercentage}
                setBrokeragePercentage={setBrokeragePercentage}
                brokerageAmount={brokerageAmount}
                setBrokerageAmount={setBrokerageAmount}
              />
              {!isBroker && (
                <button
                  type="button"
                  onClick={() => {
                    setShowBrokerage(false);
                    setBrokeragePercentage('');
                    setBrokerageAmount('');
                  }}
                  className="absolute top-3 right-3 text-purple-400 hover:text-purple-700 transition-colors"
                  title="Remove Brokerage"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex justify-start">
              <button
                type="button"
                onClick={() => setShowBrokerage(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                Add Brokerage
              </button>
            </div>
          )}

          {/* Payment Section */}
          <TransactionPaymentSection
            txnType={txnType}
            paymentType={paymentType}
            setPaymentType={setPaymentType}
            paymentStatus={paymentStatus}
            setPaymentStatus={setPaymentStatus}
            paymentDone={paymentDone}
            setPaymentDone={setPaymentDone}
            totalTransactionValue={totalTransactionValue}
          />

          {/* Transaction Items Section */}
          <TransactionItemsSection
            txnType={txnType}
            items={items}
            handleAddItem={handleAddItem}
            handleRemoveItem={handleRemoveItem}
            handleItemChange={handleItemChange}
            diamondOptions={diamondOptions}
            allCerts={allCerts}
            unlinkedCerts={unlinkedCerts}
            allRepairs={allRepairs}
            parties={parties}
          />
          
          {/* Remarks Section */}
          <TransactionRemarks remarks={remarks} setRemarks={setRemarks} />
        </div>

        {/* Footer */}
        <TransactionFooter
          items={items}
          saving={saving}
          onClose={onClose}
          onSave={async () => {
            await forceServerSync();
            await handleSubmit();
          }}
        />

        {/* Nested Party Creation Modal */}
        {isAddPartyModalOpen && (
          <PartyModal
            open={isAddPartyModalOpen}
            party={null}
            zIndex="z-[60]"
            onClose={() => setIsAddPartyModalOpen(false)}
            onSubmit={handleCreatePartyFromTxn}
          />
        )}
      </div>
    </div>
  );
};
