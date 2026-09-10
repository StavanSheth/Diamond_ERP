import React, { useState, useEffect } from 'react';
import { StockItem, CreateStockDTO, UpdateStockDTO, REPORT_GROUPS } from '../../../types/stock';
import { useLocations, DEFAULT_LOCATION } from '../../../hooks/useLocations';

interface StockModalProps {
  open: boolean;
  stock?: StockItem | null; // null = create mode, StockItem = edit mode
  onClose: () => void;
  onSubmit: (data: CreateStockDTO | UpdateStockDTO, id?: string) => Promise<void>;
}

export const PARCEL_TYPES = [
  'Mix / Melee Parcel',
  'Rough Diamonds Lot',
  'Single / Certified Stones',
  'Polished Assortment',
  'General Inventory',
] as const;

const defaultForm: CreateStockDTO & { status?: string; isActive?: boolean } = {
  stockName: '',
  reportGroup: '',
  location: DEFAULT_LOCATION,
  itemType: 'Mix / Melee Parcel',
  caratWeight: 0,
  caratRate: 0,
  remarks: '',
  itemCount: 1,
  status: 'ACTIVE',
  isActive: true,
};

export const StockModal: React.FC<StockModalProps> = ({ open, stock, onClose, onSubmit }) => {
  const isEdit = !!stock;
  const { locations, addLocation } = useLocations();
  const [form, setForm] = useState<CreateStockDTO & { status?: string; isActive?: boolean }>(defaultForm);
  const [hasOpeningBalance, setHasOpeningBalance] = useState(false);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIsAddingLocation(false);
      setNewLocName('');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (stock) {
      setForm({
        stockName: stock.stockName,
        reportGroup: stock.reportGroup || '',
        location: stock.location || DEFAULT_LOCATION,
        itemType: (stock as any).itemType || 'Mix / Melee Parcel',
        caratWeight: stock.caratWeight || 0,
        caratRate: stock.caratRate || 0,
        remarks: stock.remarks || '',
        itemCount: stock.itemCount || 1,
        status: stock.status || 'ACTIVE',
        isActive: stock.status !== 'ARCHIVED',
      });
      setHasOpeningBalance(false);
    } else {
      setForm(defaultForm);
      setHasOpeningBalance(false);
    }
    setError(null);
  }, [stock, open]);

  const handleChange = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveNewLocation = async () => {
    const trimmed = newLocName.trim();
    if (!trimmed) return;
    const res = await addLocation(trimmed);
    if (res.success) {
      handleChange('location', trimmed);
      setNewLocName('');
      setIsAddingLocation(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.stockName.trim()) {
      setError('Stock Parcel Name is required');
      return;
    }

    if (hasOpeningBalance && (!form.caratWeight || Number(form.caratWeight) <= 0)) {
      setError('Please enter a valid Carat Weight greater than 0 for opening balance');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: CreateStockDTO = {
        stockName: form.stockName.trim(),
        reportGroup: form.reportGroup || undefined,
        location: form.location || DEFAULT_LOCATION,
        itemType: form.itemType || 'Mix / Melee Parcel',
        remarks: form.remarks?.trim() || undefined,
      };

      if (hasOpeningBalance && form.caratWeight && Number(form.caratWeight) > 0) {
        payload.caratWeight = Number(form.caratWeight);
        payload.caratRate = Number(form.caratRate) || 0;
        payload.shape = 'MIX';
        payload.cut = 'MIX';
        payload.clarity = 'MIX';
        payload.color = 'MIX';
      }

      if (isEdit) {
        (payload as any).status = form.status;
        (payload as any).isActive = form.isActive;
        (payload as any).version = stock?.version || 1;
      }

      await onSubmit(payload, stock?.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save stock parcel');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const totalOpeningValue = (Number(form.caratWeight) || 0) * (Number(form.caratRate) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-md overflow-y-auto">
      <div className="bg-surface-container-lowest w-full max-w-2xl rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] flex flex-col my-auto border border-outline-variant animate-fade-in-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-xl py-lg border-b border-outline-variant bg-surface-bright shrink-0">
          <div className="flex items-center gap-md">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-primary font-bold shadow-sm">
              <span className="material-symbols-outlined text-[22px]">inventory_2</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface m-0 font-bold tracking-tight">
                {isEdit ? 'Edit Stock Parcel' : 'Add New Stock Parcel'}
              </h2>
              <p className="font-caption text-caption text-on-surface-variant m-0">
                {isEdit
                  ? 'Update parcel properties and warehouse storage location.'
                  : 'Register a new stock inventory parcel / lot container.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:bg-surface-container hover:text-on-surface p-sm rounded-full transition-colors self-start"
            title="Close modal"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-lg flex flex-col gap-md bg-background max-h-[calc(85vh-140px)] overflow-y-auto">
          {error && (
            <div className="bg-error-container border border-error/20 rounded-xl px-md py-sm flex items-center gap-sm">
              <span className="material-symbols-outlined text-error text-[18px]">error</span>
              <span className="font-body-md text-body-md text-on-error-container font-medium">{error}</span>
            </div>
          )}

          {/* Section 1: Parcel Identification & Classification */}
          <div className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden shadow-xs">
            <div className="h-1 bg-primary" />
            <div className="p-lg flex flex-col gap-md">
              <h3 className="font-body-md text-body-md text-on-surface font-bold flex items-center gap-xs m-0">
                <span className="material-symbols-outlined text-primary text-[18px]">label</span>
                Parcel Details & Classification
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                {/* Stock Parcel Name */}
                <div className="flex flex-col gap-xs md:col-span-2">
                  <label className="font-caption text-caption font-bold text-on-surface-variant flex items-center gap-1">
                    Stock Parcel Name <span className="text-error">*</span>
                    <span className="font-normal text-on-surface-variant/70 text-[11px]">(e.g., Lot code, Envelope ID, or Brand)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={form.stockName}
                      onChange={(e) => handleChange('stockName', e.target.value.toUpperCase())}
                      placeholder="e.g., WHITE STAR, LOT-A-2026, MELEE-MIX"
                      className="w-full px-md py-2.5 border border-outline-variant rounded-lg bg-white focus:outline-none focus:border-primary font-body-md text-on-surface font-semibold tracking-wide"
                      autoFocus={!isEdit}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-xs uppercase font-mono">
                      CODE
                    </span>
                  </div>
                </div>

                {/* Parcel Classification / Type */}
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">
                    Parcel Classification / Type
                  </label>
                  <select
                    value={form.itemType}
                    onChange={(e) => handleChange('itemType', e.target.value)}
                    className="w-full px-sm py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:border-primary font-body-md text-on-surface font-medium"
                  >
                    {PARCEL_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Certificate Group / Classification */}
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">
                    Certificate Group / Category
                  </label>
                  <select
                    value={form.reportGroup}
                    onChange={(e) => handleChange('reportGroup', e.target.value)}
                    className="w-full px-sm py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:border-primary font-body-md text-on-surface"
                  >
                    <option value="">Select Group (Optional)</option>
                    {REPORT_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Storage Location */}
                <div className={`flex flex-col gap-xs ${isEdit ? '' : 'md:col-span-2'}`}>
                  <div className="flex items-center justify-between">
                    <label className="font-caption text-caption font-bold text-on-surface-variant">
                      Storage Location
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddingLocation(!isAddingLocation)}
                      className="text-[11px] font-bold text-primary hover:underline flex items-center gap-0.5"
                    >
                      <span className="material-symbols-outlined text-[13px]">add</span>
                      {isAddingLocation ? 'Cancel' : 'New Location'}
                    </button>
                  </div>

                  {isAddingLocation ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newLocName}
                        onChange={(e) => setNewLocName(e.target.value)}
                        placeholder="e.g. Surat Safe, BKC Vault..."
                        className="w-full px-sm py-1.5 border border-outline-variant rounded-lg bg-white text-xs text-on-surface focus:outline-none focus:border-primary"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveNewLocation();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleSaveNewLocation}
                        className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold shrink-0 hover:bg-surface-tint shadow-xs transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <select
                      value={form.location || DEFAULT_LOCATION}
                      onChange={(e) => handleChange('location', e.target.value)}
                      className="w-full px-sm py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:border-primary font-body-md text-on-surface"
                    >
                      <option value={DEFAULT_LOCATION}>{DEFAULT_LOCATION}</option>
                      {locations.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Edit Mode Status Selector */}
                {isEdit && (
                  <div className="flex flex-col gap-xs">
                    <label className="font-caption text-caption font-bold text-on-surface-variant">
                      Lifecycle Status
                    </label>
                    <select
                      value={form.isActive === false || form.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE'}
                      onChange={(e) => {
                        const isArch = e.target.value === 'ARCHIVED';
                        setForm((prev) => ({
                          ...prev,
                          isActive: !isArch,
                          status: isArch ? 'ARCHIVED' : 'ACTIVE',
                        }));
                      }}
                      className="w-full px-sm py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:border-primary font-body-md text-on-surface font-semibold"
                    >
                      <option value="ACTIVE">Active (In Circulation)</option>
                      <option value="ARCHIVED">Archived (Closed / Deactivated)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Optional Opening Balance (Only for Create Mode) */}
          {!isEdit && (
            <div className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden shadow-xs">
              <div className="h-1 bg-emerald-600" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-xs">
                    <span className="material-symbols-outlined text-emerald-600 text-[20px]">
                      account_balance_wallet
                    </span>
                    <h3 className="font-body-md text-body-md text-on-surface font-bold m-0">
                      Opening Stock Balance
                    </h3>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Optional
                    </span>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasOpeningBalance}
                      onChange={(e) => setHasOpeningBalance(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-outline-variant focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="font-caption text-caption font-bold text-on-surface">
                      Add Initial Balance
                    </span>
                  </label>
                </div>

                {hasOpeningBalance ? (
                  <div className="flex flex-col gap-md pt-sm border-t border-outline-variant/60 animate-fade-in-up">
                    <p className="font-caption text-caption text-on-surface-variant m-0">
                      Record existing physical inventory weight and valuation for this parcel upon registration.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                      {/* Carat Weight */}
                      <div className="flex flex-col gap-xs">
                        <label className="font-caption text-caption font-bold text-on-surface-variant">
                          Carat Weight <span className="text-error">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.caratWeight || ''}
                            onChange={(e) => handleChange('caratWeight', e.target.value)}
                            placeholder="0.00"
                            className="w-full px-sm py-2 border border-emerald-200 rounded-lg bg-emerald-50/30 focus:outline-none focus:border-emerald-600 font-body-lg text-on-surface font-bold text-right pr-9"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-caption text-on-surface-variant font-medium">
                            ct
                          </span>
                        </div>
                      </div>

                      {/* Carat Rate */}
                      <div className="flex flex-col gap-xs">
                        <label className="font-caption text-caption font-bold text-on-surface-variant">
                          Carat Rate (₹)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-caption text-on-surface-variant font-semibold">
                            ₹
                          </span>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={form.caratRate || ''}
                            onChange={(e) => handleChange('caratRate', e.target.value)}
                            placeholder="0"
                            className="w-full pl-8 pr-sm py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:border-primary font-body-lg text-on-surface font-bold text-right"
                          />
                        </div>
                      </div>

                      {/* Total Net Value (Auto) */}
                      <div className="flex flex-col gap-xs">
                        <label className="font-caption text-caption font-bold text-on-surface-variant">
                          Total Opening Value (Auto)
                        </label>
                        <div className="h-[42px] flex items-center justify-between px-3 rounded-lg bg-emerald-50 border border-emerald-200 font-body-lg text-emerald-800 font-bold">
                          <span className="text-xs font-semibold text-emerald-600">₹</span>
                          <span>
                            {totalOpeningValue.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-surface-container/60 rounded-lg p-sm border border-outline-variant/40 flex items-center gap-sm">
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">info</span>
                    <p className="font-caption text-caption text-on-surface-variant m-0">
                      No initial balance specified. You can record diamond purchases, transfers, or inward lots into this parcel at any time via <strong className="text-on-surface">Add Transaction</strong>.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 3: Notes & Metadata */}
          <div className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden shadow-xs">
            <div className="h-1 bg-purple-600" />
            <div className="p-lg flex flex-col gap-sm">
              <h3 className="font-body-md text-body-md text-on-surface font-bold flex items-center gap-xs m-0">
                <span className="material-symbols-outlined text-purple-600 text-[18px]">notes</span>
                Operational Notes & Sourcing
              </h3>
              <div className="flex flex-col gap-xs">
                <label className="font-caption text-[10px] font-bold text-on-surface-variant uppercase">
                  Remarks / Origin Details
                </label>
                <textarea
                  value={form.remarks}
                  onChange={(e) => handleChange('remarks', e.target.value)}
                  placeholder="Add sourcing details (e.g. rough supplier, lot reference, parcel origin, or intended cutting profile)..."
                  rows={2}
                  className="w-full px-sm py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:border-primary font-body-sm text-on-surface resize-none leading-relaxed"
                />
              </div>
            </div>
          </div>

          {/* Context Banner for Edit Mode */}
          {isEdit && (
            <div className="bg-blue-50/70 rounded-xl p-md flex gap-md border border-blue-200">
              <span className="material-symbols-outlined text-primary text-[20px] shrink-0">info</span>
              <div>
                <h4 className="font-body-md font-bold text-on-surface mb-0.5">Inventory Tracking Context</h4>
                <p className="font-caption text-caption text-on-surface-variant leading-relaxed m-0">
                  Current status is <span className="text-primary font-bold">{stock.status}</span>. Dynamic diamond balances, weights, and items are maintained automatically via Ledger transactions.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-xl py-md border-t border-outline-variant bg-surface-bright rounded-b-2xl flex justify-end gap-md shrink-0">
          <button
            onClick={onClose}
            className="px-lg py-2 rounded-lg font-body-md font-semibold text-on-surface hover:bg-surface-container transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-xl py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-sm font-body-md font-semibold shadow-sm"
          >
            {saving ? (
              <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">{isEdit ? 'save' : 'add_circle'}</span>
            )}
            {isEdit ? 'Save Changes' : 'Create Stock Parcel'}
          </button>
        </div>
      </div>
    </div>
  );
};
