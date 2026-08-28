import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { ItemDetailDrawer } from '../inventory/ItemDetailDrawer';
import { AddTransactionButton } from '../common/buttons/AddTransactionButton';
import { TransactionModal } from '../transactions/TransactionModal';

const txnConfig: Record<string, { label: string; bg: string; text: string; border: string; icon: string }> = {
  'PURCHASE': { label: 'PURCHASE', bg: 'bg-[#E8F5E9]', text: 'text-[#2E7D32]', border: 'border-l-[#2E7D32]', icon: 'add_circle' },
  'SALE': { label: 'SALE', bg: 'bg-[#FFEBEE]', text: 'text-[#D32F2F]', border: 'border-l-[#D32F2F]', icon: 'remove_circle' },
  'REPAIR_OUT': { label: 'REPAIR OUT', bg: 'bg-[#FFF8E1]', text: 'text-[#F9A825]', border: 'border-l-[#F9A825]', icon: 'build' },
  'CERTIFICATION': { label: 'CERT OUT', bg: 'bg-[#EDE7F6]', text: 'text-[#4527A0]', border: 'border-l-[#4527A0]', icon: 'workspace_premium' },
};

const fallbackTxn = { label: 'OTHER', bg: 'bg-[#F5F5F5]', text: 'text-[#616161]', border: 'border-l-[#9E9E9E]', icon: 'swap_horiz' };

import { formatCurrency, formatNumber } from '../../utils/format';
import { useTranslation } from 'react-i18next';

const fmt = formatCurrency;

export interface LedgerViewProps {
  stockId?: string;
  partyId?: string;
  itemCode?: string;
  onStockChange?: (stockId: string) => void;
  title?: string;
  resumeDraft?: any;
}

export const LedgerView: React.FC<LedgerViewProps> = ({ 
  stockId = '', 
  partyId = '', 
  itemCode = '', 
  onStockChange,
  title,
  resumeDraft
}) => {
  const [entries, setEntries] = useState<any[]>([]);
  const [stockOptions, setStockOptions] = useState<any[]>([]);
  const [selectedStock, setSelectedStock] = useState<string>(stockId);
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<any | null>(null);
  const [showAllItems, setShowAllItems] = useState(false);
  const [showAvailableItems, setShowAvailableItems] = useState(false);
  const [availableItems, setAvailableItems] = useState<any[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  useEffect(() => {
    if (resumeDraft) {
      setEditingTransaction({ _resumeDraft: resumeDraft });
    }
  }, [resumeDraft]);

  // Sync internal state with props if they change
  useEffect(() => {
    setSelectedStock(stockId);
  }, [stockId]);

  useEffect(() => {
    api.getLedgerStocks()
      .then((res) => setStockOptions(res.data))
      .catch(() => {});
  }, []);

  const fetchLedger = () => {
    setLoading(true);
    setError(null);
    api.getLedger(selectedStock || undefined, partyId || undefined, itemCode || undefined, selectedPaymentStatus || undefined)
      .then((res) => {
        setEntries(res.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    if (selectedStock) {
      setLoadingAvailable(true);
      api.getDiamonds(selectedStock)
        .then(res => {
          if (res.success) {
            setAvailableItems(res.data.filter((d: any) => d.status === 'AVAILABLE'));
          }
        })
        .finally(() => setLoadingAvailable(false));
    } else {
      setAvailableItems([]);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [selectedStock, partyId, itemCode, selectedPaymentStatus]);

  const handleStockChange = (val: string) => {
    setSelectedStock(val);
    if (onStockChange) {
      onStockChange(val);
    }
  };

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  const summary = useMemo(() => {
    const totalIn = entries.reduce((s, e) => s + Number(e.caratIn || 0), 0);
    const totalOut = entries.reduce((s, e) => s + Number(e.caratOut || 0), 0);
    const valueIn = entries.reduce((s, e) => s + Number(e.valueIn || 0), 0);
    const valueOut = entries.reduce((s, e) => s + Number(e.valueOut || 0), 0);
    const totalItems = entries.reduce((s, e) => s + Number(e.itemsCount || 0), 0);
    const finalBalanceCarat = entries.length > 0 ? entries[0].balanceCarat : 0;
    const finalBalanceValue = entries.length > 0 ? entries[0].balanceValue : 0;
    const totalPaymentDone = entries.reduce((s, e) => s + Number(e.paymentDone || 0), 0);
    const totalPaymentDue = entries.reduce((s, e) => s + Number(e.paymentDue || 0), 0);
    
    const calcLegacy = (e: any) => {
      const pd = Number(e.paymentDue || 0);
      const pdo = Number(e.paymentDone || 0);
      if (pd === 0 && pdo === 0 && e.items) {
        return e.items.reduce((sum: number, i: any) => sum + Number(i.totalValue || 0), 0);
      }
      return pd;
    };

    const payableDue = entries.filter(e => e.transactionType === 'PURCHASE').reduce((s, e) => s + calcLegacy(e), 0);
    const payablePaid = entries.filter(e => e.transactionType === 'PURCHASE').reduce((s, e) => s + Number(e.paymentDone || 0), 0);
    
    const receivableDue = entries.filter(e => e.transactionType === 'SALE').reduce((s, e) => s + calcLegacy(e), 0);
    const receivableCollected = entries.filter(e => e.transactionType === 'SALE').reduce((s, e) => s + Number(e.paymentDone || 0), 0);

    return { totalIn, totalOut, valueIn, valueOut, totalItems, txnCount: entries.length, finalBalanceCarat, finalBalanceValue, totalPaymentDone, totalPaymentDue, payableDue, payablePaid, receivableDue, receivableCollected };
  }, [entries]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-surface-bright h-full">
      {/* Header */}
      <header className="px-margin-page py-lg bg-surface border-b border-outline-variant shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-gutter">
          <div>
            <div className="flex items-center gap-sm mb-xs">
              <span className="font-caption text-caption text-on-surface-variant">Ledger</span>
              <span className="material-symbols-outlined text-[14px] text-outline-variant">chevron_right</span>
              <span className="font-caption text-caption text-on-surface-variant">
                {partyId ? `Party: ${partyId}` : itemCode ? `Item: ${itemCode}` : selectedStock ? `Stock: ${selectedStock}` : 'All Entries'}
              </span>
            </div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">
              {title || (partyId ? 'Party Ledger' : itemCode ? 'Item Ledger' : selectedStock ? 'Stock Ledger' : 'Global Ledger')}
            </h2>
          </div>

          <div className="flex items-center gap-md flex-wrap mt-md md:mt-0">
            <div className="flex items-center bg-surface-container-lowest rounded border border-outline-variant px-sm py-xs">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-xs">filter_list</span>
              <select
                value={selectedStock}
                onChange={(e) => handleStockChange(e.target.value)}
                className="bg-transparent border-none text-body-md text-on-surface focus:ring-0 focus:outline-none pr-md cursor-pointer"
              >
                <option value="">All Stocks</option>
                {stockOptions.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center bg-surface-container-lowest rounded border border-outline-variant px-sm py-xs">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-xs">payments</span>
              <select
                value={selectedPaymentStatus}
                onChange={(e) => setSelectedPaymentStatus(e.target.value)}
                className="bg-transparent border-none text-body-md text-on-surface focus:ring-0 focus:outline-none pr-md cursor-pointer"
              >
                <option value="">All Payments</option>
                <option value="PENDING">Pending</option>
                <option value="PARTIAL">Partial</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            <AddTransactionButton 
              stockId={selectedStock} 
              onTransactionAdded={() => fetchLedger()} 
            />
          </div>
        </div>

        <div className="flex items-center gap-xl mt-md">
          <div className="flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px] text-[#2E7D32]">arrow_downward</span>
            <span className="font-caption text-caption text-on-surface-variant">IN:</span>
            <span className="font-kpi-numeric text-[16px] text-[#2E7D32] tabular-nums">{summary.totalIn.toFixed(2)} ct</span>
            <span className="font-caption text-caption text-outline ml-xs">({fmt(summary.valueIn)})</span>
          </div>
          <div className="flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px] text-[#D32F2F]">arrow_upward</span>
            <span className="font-caption text-caption text-on-surface-variant">OUT:</span>
            <span className="font-kpi-numeric text-[16px] text-[#D32F2F] tabular-nums">{summary.totalOut.toFixed(2)} ct</span>
            <span className="font-caption text-caption text-outline ml-xs">({fmt(summary.valueOut)})</span>
          </div>
          <div className="h-4 w-px bg-outline-variant" />
          <span className="font-caption text-caption text-on-surface-variant">{summary.txnCount} transactions</span>
          <div className="h-4 w-px bg-outline-variant" />
          <div className="flex items-center gap-xs">
            <span className="font-caption text-caption text-on-surface-variant">TO PAY:</span>
            <span className="font-kpi-numeric text-[16px] text-[#E65100] tabular-nums">{fmt(summary.payableDue)}</span>
            <span className="font-caption text-caption text-outline ml-xs">(Paid: {fmt(summary.payablePaid)})</span>
          </div>
          <div className="h-4 w-px bg-outline-variant" />
          <div className="flex items-center gap-xs">
            <span className="font-caption text-caption text-on-surface-variant">TO COLLECT:</span>
            <span className="font-kpi-numeric text-[16px] text-[#1565C0] tabular-nums">{fmt(summary.receivableDue)}</span>
            <span className="font-caption text-caption text-outline ml-xs">(Collected: {fmt(summary.receivableCollected)})</span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-huge">
            <span className="material-symbols-outlined text-primary animate-spin mr-md">sync</span>
            <span className="font-body-md text-on-surface-variant">Loading ledger...</span>
          </div>
        )}

        {error && (
          <div className="m-margin-page bg-error-container border border-error/20 rounded-lg px-md py-sm flex items-center gap-sm">
            <span className="material-symbols-outlined text-error text-[18px]">error</span>
            <span className="font-body-md text-on-error-container">{error}</span>
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-huge text-center">
            <span className="material-symbols-outlined text-outline text-[48px] mb-md">receipt_long</span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-sm">No ledger entries found</h3>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-surface-container-low text-on-surface-variant font-caption text-caption font-bold sticky top-0 z-20 border-b-2 border-outline-variant shadow-sm">
              <tr>
                <th className="py-sm px-md w-3"></th>
                <th className="py-sm px-md">Date</th>
                <th className="py-sm px-md">Stock</th>
                <th className="py-sm px-md">Type</th>
                <th className="py-sm px-md">Party</th>
                <th className="py-sm px-md text-right">Items</th>
                <th className="py-sm px-md text-right">Carat In</th>
                <th className="py-sm px-md text-right">Carat Out</th>
                <th className="py-sm px-md text-right bg-surface-container border-l border-outline-variant font-bold">Bal. Ct</th>
                <th className="py-sm px-md text-right bg-surface-container font-bold">Bal. ₹</th>
                <th className="py-sm px-md text-right font-bold">Total ₹</th>
                <th className="py-sm px-sm w-10"></th>
              </tr>
            </thead>
            <tbody className="text-body-md text-on-surface tabular-nums divide-y divide-outline-variant/50">
              {entries.map((entry) => {
                const tc = txnConfig[entry.transactionType] || fallbackTxn;
                const isExpanded = expandedRows.has(entry.id);
                return (
                  <React.Fragment key={entry.id}>
                    <tr className={`hover:bg-surface-container-low transition-colors cursor-pointer`} onClick={() => toggleRow(entry.id)}>
                      <td className="px-sm text-center text-outline-variant">
                        <span className="material-symbols-outlined text-[16px]">{isExpanded ? 'expand_more' : 'chevron_right'}</span>
                      </td>
                      <td className="px-md py-sm text-on-surface-variant whitespace-nowrap">
                        {entry.transactionDate ? entry.transactionDate.split('T')[0] : ''}
                      </td>
                      <td className="px-md py-sm whitespace-nowrap font-medium text-primary">
                        {entry.ledger?.stock?.name || 'Unknown'}
                      </td>
                      <td className="px-md py-sm">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${tc.bg} ${tc.text}`}>
                            <span className="material-symbols-outlined text-[12px]">{tc.icon}</span>
                            {tc.label}
                          </span>
                          {(entry.transactionType === 'SALE' || entry.transactionType === 'PURCHASE') && (
                            <span className={`inline-flex items-center px-1.5 py-[1px] rounded text-[9px] font-bold tracking-wide uppercase border ${
                              entry.paymentStatus === 'COMPLETED' ? 'bg-[#E8F5E9] text-[#2E7D32] border-[#A5D6A7]' :
                              entry.paymentStatus === 'PARTIAL' ? 'bg-[#FFF3E0] text-[#E65100] border-[#FFCC80]' :
                              'bg-[#FFEBEE] text-[#C62828] border-[#FFCDD2]'
                            }`}>
                              {entry.paymentStatus || 'PENDING'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-md py-sm text-on-surface-variant whitespace-nowrap max-w-[150px] truncate">
                        {entry.party?.name || '—'}
                      </td>
                      <td className="px-md py-sm text-right text-on-surface-variant whitespace-nowrap">
                        <span className="bg-surface-container-high px-2 py-0.5 rounded text-xs font-bold">{entry.itemsCount} pcs</span>
                      </td>
                      <td className="px-md py-sm text-right font-semibold whitespace-nowrap">
                        {Number(entry.caratIn || 0) > 0 ? <span className="text-[#2E7D32]">+{Number(entry.caratIn).toFixed(2)}</span> : <span className="text-outline">—</span>}
                      </td>
                      <td className="px-md py-sm text-right font-semibold whitespace-nowrap">
                        {Number(entry.caratOut || 0) > 0 ? <span className="text-[#D32F2F]">-{(Number(entry.caratOut) || 0).toFixed(2)}</span> : <span className="text-outline">—</span>}
                      </td>
                      <td className="px-md py-sm text-right bg-surface-container-lowest border-l border-outline-variant/50 font-bold whitespace-nowrap">
                        {(entry.balanceCarat || 0).toFixed(2)}
                      </td>
                      <td className="px-md py-sm text-right bg-surface-container-lowest font-bold whitespace-nowrap">
                        {fmt(entry.balanceValue)}
                      </td>
                      <td className="px-md py-sm text-right font-bold text-primary whitespace-nowrap">
                        {fmt(Number(entry.valueIn || 0) + Number(entry.valueOut || 0))}
                      </td>
                      <td className="px-sm py-sm text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingTransaction(entry); }}
                          className="text-on-surface-variant hover:text-primary p-1 rounded hover:bg-surface-container-high transition-colors"
                          title="Edit Transaction"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                      </td>
                    </tr>
                    
                    {/* Expandable Items Row */}
                    {isExpanded && (
                      <tr className="bg-surface-container-lowest">
                        <td colSpan={12} className="p-0 border-b-2 border-outline-variant">
                          <div className="p-md pl-xl bg-surface-container-lowest shadow-inner">
                            <h4 className="font-caption text-caption font-bold text-on-surface-variant mb-sm">TRANSACTION ITEMS</h4>
                            <table className="w-full text-left border-collapse">
                              <thead className="bg-surface-container-low text-on-surface-variant font-caption text-[11px] font-bold">
                                <tr>
                                  <th className="py-1 px-2">Item</th>
                                  <th className="py-1 px-2">Name</th>
                                  <th className="py-1 px-2 text-right">Carat</th>
                                  <th className="py-1 px-2">4Cs</th>
                                  <th className="py-1 px-2 text-right">Rate</th>
                                  <th className="py-1 px-2 text-right">Total</th>
                                </tr>
                              </thead>
                              <tbody className="text-body-sm text-on-surface">
                                {entry.items.map((it: any) => (
                                  <tr 
                                    key={it.id} 
                                    className="border-b border-outline-variant/30 hover:bg-surface-bright cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedItemId(it.diamondItem?.id);
                                    }}
                                  >
                                    <td className="py-1 px-2 font-mono text-primary text-xs">{it.diamondItem?.itemCode || it.diamondItem?.id}</td>
                                    <td className="py-1 px-2 font-medium">{it.name || it.diamondItem?.displayName || '-'}</td>
                                    <td className="py-1 px-2 text-right font-bold">{Number(it.carat).toFixed(2)}</td>
                                    <td className="py-1 px-2 text-on-surface-variant text-xs">
                                      {it.diamondItem?.color}/{it.diamondItem?.clarity}/{it.diamondItem?.cut}
                                    </td>
                                    <td className="py-1 px-2 text-right text-on-surface-variant">{fmt(Number(it.ratePerCarat || (it.value / it.carat)))}</td>
                                    <td className="py-1 px-2 text-right font-bold">{fmt(Number(it.totalValue || it.value))}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-surface-container-low font-bold text-sm">
                                <tr>
                                  <td colSpan={2} className="py-1 px-2">TOTAL</td>
                                  <td className="py-1 px-2 text-right">{entry.items.reduce((sum: number, it: any) => sum + Number(it.carat), 0).toFixed(2)} ct</td>
                                  <td colSpan={2}></td>
                                  <td className="py-1 px-2 text-right text-primary">{fmt(entry.items.reduce((sum: number, it: any) => sum + Number(it.totalValue || it.value), 0))}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-surface-container-high text-on-surface font-bold sticky bottom-0 border-t-2 border-outline-variant shadow-sm text-body-md tabular-nums z-20">
              <tr className="hover:bg-surface-container-highest transition-colors">
                <td colSpan={5} className="py-md px-md text-right uppercase tracking-wider text-caption text-on-surface-variant">
                  <div className="flex items-center justify-end gap-4">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowAllItems(!showAllItems); setShowAvailableItems(false); }}
                      className={`flex items-center gap-1 font-bold px-2 py-1 rounded transition-colors ${showAllItems ? 'bg-primary/10 text-primary' : 'hover:bg-surface-bright text-on-surface-variant'}`}
                    >
                      <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${showAllItems ? 'rotate-180' : ''}`}>expand_more</span>
                      All Txn Items
                    </button>
                    {selectedStock && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowAvailableItems(!showAvailableItems); setShowAllItems(false); }}
                        className={`flex items-center gap-1 font-bold px-2 py-1 rounded transition-colors ${showAvailableItems ? 'bg-primary/10 text-primary' : 'hover:bg-surface-bright text-on-surface-variant'}`}
                      >
                        <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${showAvailableItems ? 'rotate-180' : ''}`}>expand_more</span>
                        Available In Stock
                      </button>
                    )}
                    <span className="ml-2 font-bold text-on-surface">Overall Total</span>
                  </div>
                </td>
                <td className="py-md px-md text-right">{summary.totalItems} pcs</td>
                <td className="py-md px-md text-right text-[#2E7D32]">+{summary.totalIn.toFixed(2)}</td>
                <td className="py-md px-md text-right text-[#D32F2F]">-{(summary.totalOut).toFixed(2)}</td>
                <td className="py-md px-md text-right bg-surface-container border-l border-outline-variant font-bold">{summary.finalBalanceCarat.toFixed(2)}</td>
                <td className="py-md px-md text-right bg-surface-container font-bold">{fmt(summary.finalBalanceValue)}</td>
                <td className="py-md px-md text-right text-primary text-headline-sm">
                  {fmt(summary.valueIn + summary.valueOut)}
                </td>
                <td></td>
              </tr>
              {showAllItems && (
                <tr className="bg-surface-container-lowest">
                  <td colSpan={12} className="p-0 border-t-2 border-outline-variant">
                    <div className="p-md pl-xl bg-surface-container-lowest shadow-inner max-h-[400px] overflow-y-auto">
                      <h4 className="font-caption text-caption font-bold text-on-surface-variant mb-sm">ALL TRANSACTION ITEMS</h4>
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-surface-container-low text-on-surface-variant font-caption text-[11px] font-bold">
                          <tr>
                            <th className="py-1 px-2">Date</th>
                            <th className="py-1 px-2">Ref No</th>
                            <th className="py-1 px-2">Type</th>
                            <th className="py-1 px-2">Item Code</th>
                            <th className="py-1 px-2">Name</th>
                            <th className="py-1 px-2 text-right">Carat</th>
                            <th className="py-1 px-2">4Cs</th>
                            <th className="py-1 px-2 text-right">Rate</th>
                            <th className="py-1 px-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="text-body-sm text-on-surface font-normal">
                          {entries.flatMap(entry => 
                            entry.items.map((it: any) => (
                              <tr 
                                key={it.id} 
                                className="border-b border-outline-variant/30 hover:bg-surface-bright cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedItemId(it.diamondItem?.id);
                                }}
                              >
                                <td className="py-1 px-2 whitespace-nowrap">{new Date(entry.transactionDate).toLocaleDateString()}</td>
                                <td className="py-1 px-2 text-on-surface-variant text-xs">{entry.referenceNo || '-'}</td>
                                <td className="py-1 px-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    entry.transactionType === 'SALE' || entry.transactionType === 'REPAIR_OUT' ? 'bg-[#FFEBEE] text-[#D32F2F]' :
                                    entry.transactionType === 'PURCHASE' ? 'bg-[#E8F5E9] text-[#2E7D32]' :
                                    'bg-[#E3F2FD] text-[#1976D2]'
                                  }`}>
                                    {entry.transactionType}
                                  </span>
                                </td>
                                <td className="py-1 px-2 font-mono text-primary text-xs">{it.diamondItem?.itemCode || it.diamondItem?.id}</td>
                                <td className="py-1 px-2 max-w-[150px] truncate">{it.name || it.diamondItem?.displayName || '-'}</td>
                                <td className="py-1 px-2 text-right font-medium">
                                  {it.itemAction === 'OUT' ? '-' : '+'}{it.carat}
                                </td>
                                <td className="py-1 px-2 text-[10px] text-on-surface-variant whitespace-nowrap">
                                  {it.diamondItem?.shape ? `${it.diamondItem.shape} ${it.diamondItem.color} ${it.diamondItem.clarity}` : '-'}
                                </td>
                                <td className="py-1 px-2 text-right">{fmt(it.ratePerCarat || (it.totalValue / it.carat))}</td>
                                <td className="py-1 px-2 text-right font-bold text-on-surface">{fmt(it.totalValue || it.value)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              )}
              {showAvailableItems && selectedStock && (
                <tr className="bg-surface-container-lowest">
                  <td colSpan={12} className="p-0 border-t-2 border-outline-variant">
                    <div className="p-md pl-xl bg-surface-container-lowest shadow-inner max-h-[400px] overflow-y-auto">
                      <h4 className="font-caption text-caption font-bold text-[#2E7D32] mb-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                        AVAILABLE ITEMS IN CURRENT STOCK ({availableItems.length})
                      </h4>
                      {loadingAvailable ? (
                        <div className="text-sm text-on-surface-variant py-2">Loading available items...</div>
                      ) : availableItems.length === 0 ? (
                        <div className="text-sm text-on-surface-variant py-2">No items currently available in this stock.</div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-[#E8F5E9] text-[#2E7D32] font-caption text-[11px] font-bold">
                            <tr>
                              <th className="py-1 px-2">Item Code</th>
                              <th className="py-1 px-2">Name</th>
                              <th className="py-1 px-2 text-right">Carat</th>
                              <th className="py-1 px-2">4Cs</th>
                              <th className="py-1 px-2 text-right">Rate / Ct</th>
                              <th className="py-1 px-2 text-right">Current Value</th>
                            </tr>
                          </thead>
                          <tbody className="text-body-sm text-on-surface font-normal">
                            {availableItems.map(item => (
                              <tr 
                                key={item.id} 
                                className="border-b border-outline-variant/30 hover:bg-[#F1F8E9] cursor-pointer"
                                onClick={() => setSelectedItemId(item.id)}
                              >
                                <td className="py-1 px-2 font-mono text-[#2E7D32] text-xs">{item.itemCode || item.id}</td>
                                <td className="py-1 px-2 max-w-[150px] truncate">{item.displayName || '-'}</td>
                                <td className="py-1 px-2 text-right font-medium">{item.carat}</td>
                                <td className="py-1 px-2 text-[10px] text-on-surface-variant whitespace-nowrap">
                                  {item.shape ? `${item.shape} ${item.color} ${item.clarity}` : '-'}
                                </td>
                                <td className="py-1 px-2 text-right">{fmt(item.ratePerCarat)}</td>
                                <td className="py-1 px-2 text-right font-bold text-on-surface">{fmt(item.currentValue)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-[#E8F5E9] font-bold text-sm text-[#2E7D32]">
                            <tr>
                              <td colSpan={2} className="py-1 px-2">TOTAL AVAILABLE</td>
                              <td className="py-1 px-2 text-right">{availableItems.reduce((sum, item) => sum + Number(item.carat || 0), 0).toFixed(2)} ct</td>
                              <td colSpan={2}></td>
                              <td className="py-1 px-2 text-right text-[#2E7D32]">{fmt(availableItems.reduce((sum, item) => sum + Number(item.currentValue || 0), 0))}</td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        )}
      </div>

      <ItemDetailDrawer 
        open={!!selectedItemId} 
        itemId={selectedItemId} 
        onClose={() => setSelectedItemId(null)} 
      />

      <TransactionModal
        open={!!editingTransaction}
        stockId={selectedStock}
        editTransactionData={editingTransaction}
        onClose={() => setEditingTransaction(null)}
        onSubmit={async () => {
          setEditingTransaction(null);
          fetchLedger();
        }}
      />
    </div>
  );
};
