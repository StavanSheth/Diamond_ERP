import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface AddCertificateModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddCertificateModal: React.FC<AddCertificateModalProps> = ({ open, onClose, onSuccess }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stocks, setStocks] = useState<any[]>([]);
  const [selectedStock, setSelectedStock] = useState('');
  
  const [items, setItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState('');

  const [internalNotes, setInternalNotes] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) {
      // Reset state
      setSelectedStock('');
      setSelectedItem('');
      setItems([]);
      setInternalNotes('');
      setName('');
      setError(null);
      
      // Load stock parcels
      api.getLedgerStocks()
        .then(res => {
          if (res.success) setStocks(res.data);
        })
        .catch(err => console.error('Failed to load stocks:', err));
    }
  }, [open]);

  useEffect(() => {
    if (selectedStock) {
      setSelectedItem('');
      const stockId = stocks.find(s => s.stockName === selectedStock)?.stockId;
      if (stockId) {
        api.getStockItems(stockId)
          .then(res => {
            if (res.success) {
              // Filter out items that are already certified or pending?
              // The user might want to see all items. Let's just show all for now.
              setItems(res.data);
            }
          })
          .catch(err => console.error('Failed to load items:', err));
      } else {
        setItems([]);
      }
    } else {
      setItems([]);
      setSelectedItem('');
    }
  }, [selectedStock, stocks]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStock || !selectedItem) {
      setError('Please select a stock parcel and a specific item.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      const itemDetails = items.find(i => i.stockItemId === selectedItem);

      await api.createCertificate({
        diamondItemId: selectedItem, // NOTE: api wrapper maps it to diamondItemId? actually controller uses diamondItemId
        internalNotes,
        name
      });
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add certificate');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-sm sm:p-md bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md flex flex-col max-h-[90vh] animate-slide-up overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-xl py-lg border-b border-outline-variant bg-surface-container-lowest">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Add Certificate to Inventory</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Partition: Harshil</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-xl flex flex-col gap-xl">
            
            {error && (
              <div className="bg-error-container text-on-error-container p-sm rounded-lg text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {error}
              </div>
            )}

            {/* Step 1: Item Selection */}
            <div>
              <div className="flex items-center gap-sm mb-lg">
                <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-xs">1</div>
                <h3 className="font-title-md text-title-md text-on-surface">Item Selection</h3>
              </div>
              
              <div className="flex flex-col gap-md">
                <label className="flex flex-col gap-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant">Stock Parcel *</span>
                  <div className="relative">
                    <span className="absolute left-md top-1/2 -translate-y-1/2 material-symbols-outlined text-outline">search</span>
                    <select
                      value={selectedStock}
                      onChange={e => setSelectedStock(e.target.value)}
                      className="w-full pl-xl pr-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none appearance-none font-body-md"
                      required
                    >
                      <option value="">Select a stock parcel...</option>
                      {stocks.map(s => (
                        <option key={s.stockId} value={s.stockName}>{s.stockName}</option>
                      ))}
                    </select>
                    <span className="absolute right-md top-1/2 -translate-y-1/2 material-symbols-outlined text-outline pointer-events-none">arrow_drop_down</span>
                  </div>
                </label>
                
                <label className="flex flex-col gap-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant">Name</span>
                  <div className="relative">
                    <span className="absolute left-md top-1/2 -translate-y-1/2 material-symbols-outlined text-outline">label</span>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Optional custom name"
                      className="w-full pl-xl pr-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none font-body-md"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant">Specific Item *</span>
                  <div className="relative">
                    <span className="absolute left-md top-1/2 -translate-y-1/2 material-symbols-outlined text-outline">diamond</span>
                    <select
                      value={selectedItem}
                      onChange={e => setSelectedItem(e.target.value)}
                      disabled={!selectedStock}
                      className="w-full pl-xl pr-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none appearance-none font-body-md disabled:opacity-50"
                      required
                    >
                      <option value="">Select a specific item...</option>
                      {items.map(item => {
                        const val = item.currentValue ? `₹${item.currentValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹0.00';
                        const label = `${item.shape} ${item.cut} ${item.clarity} ${item.currentCarat}ct (Val: ${val})`;
                        return <option key={item.stockItemId} value={item.stockItemId}>{label}</option>
                      })}
                    </select>
                    <span className="absolute right-md top-1/2 -translate-y-1/2 material-symbols-outlined text-outline pointer-events-none">arrow_drop_down</span>
                  </div>
                  {selectedItem && (
                    <span className="font-body-sm text-body-sm text-outline mt-1 ml-1">Links to internal Stock_Item_ID per {selectedItem}</span>
                  )}
                </label>
              </div>

              <div className="mt-xl bg-tertiary-container/30 border border-tertiary/20 rounded-lg p-md flex gap-md">
                <span className="material-symbols-outlined text-tertiary">info</span>
                <div>
                  <h4 className="font-title-sm text-on-surface mb-1">Initial Status: PENDING</h4>
                  <p className="font-body-sm text-on-surface-variant">Certification state will be set to PENDING. Full lab details and PDF upload can be added once the report is received.</p>
                </div>
              </div>
            </div>

            <hr className="border-outline-variant" />

            {/* Step 2: Metadata */}
            <div>
              <div className="flex items-center gap-sm mb-lg">
                <div className="w-6 h-6 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center font-bold text-xs">2</div>
                <h3 className="font-title-md text-title-md text-on-surface">Metadata (Optional)</h3>
              </div>
              
              <div className="flex flex-col gap-md">
                <label className="flex flex-col gap-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant">Priority</span>
                  <select
                    className="w-full px-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none font-body-md"
                  >
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </label>

                <label className="flex flex-col gap-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant">Internal Notes</span>
                  <textarea
                    value={internalNotes}
                    onChange={e => setInternalNotes(e.target.value)}
                    placeholder="e.g., Sent via Malca-Amit on 12/Oct"
                    className="w-full px-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none font-body-md resize-none h-24"
                  />
                </label>
              </div>
            </div>
            
          </div>

          <div className="px-xl py-lg border-t border-outline-variant bg-surface-container-lowest flex justify-end gap-md">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-lg py-sm font-label-lg text-label-lg text-on-surface hover:bg-surface-container rounded-full transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-xs px-lg py-sm font-label-lg text-label-lg bg-primary text-on-primary hover:bg-surface-tint rounded-full shadow-sm transition-all disabled:opacity-50"
            >
              {saving ? (
                <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
              ) : (
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
              )}
              Add to Registry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
