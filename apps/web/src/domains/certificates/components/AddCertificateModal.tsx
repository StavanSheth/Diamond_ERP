import React, { useState, useEffect, useMemo } from 'react';
import { BaseModal } from '../../common/components/BaseModal';
import { api } from '../../../services/api';
import { SearchableSelect, SearchOption } from '../../common/components/SearchableSelect';

interface AddCertificateModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddCertificateModal: React.FC<AddCertificateModalProps> = ({ open, onClose, onSuccess }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Stock / Inventory Selection
  const [stocks, setStocks] = useState<any[]>([]);
  const [selectedStockId, setSelectedStockId] = useState('');
  const [isStandalone, setIsStandalone] = useState(false);

  // Step 2: Level Selection (Item Level vs General Level)
  const [linkingLevel, setLinkingLevel] = useState<'ITEM' | 'GENERAL'>('ITEM');

  // Available diamonds for selected stock (or all diamonds if unselected)
  const [diamonds, setDiamonds] = useState<any[]>([]);
  const [selectedDiamondId, setSelectedDiamondId] = useState('');

  // Certificate Metadata (Non-compulsory details)
  const [name, setName] = useState('');
  const [labType, setLabType] = useState('GIA');
  const [reportNumber, setReportNumber] = useState('');
  const [cost, setCost] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [priority, setPriority] = useState('Normal');

  useEffect(() => {
    if (open) {
      setSelectedStockId('');
      setIsStandalone(false);
      setLinkingLevel('ITEM');
      setSelectedDiamondId('');
      setName('');
      setLabType('GIA');
      setReportNumber('');
      setCost('');
      setInternalNotes('');
      setPriority('Normal');
      setError(null);

      // Fetch available stocks
      api.getStocks()
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            setStocks(res.data);
            if (res.data.length > 0) {
              setSelectedStockId(res.data[0].id);
            }
          }
        })
        .catch(() => setStocks([]));

      // Fetch diamonds
      api.getDiamonds()
        .then((res) => {
          if (res.success) setDiamonds(res.data);
        })
        .catch(() => setDiamonds([]));
    }
  }, [open]);

  // When selectedStockId changes, fetch diamonds specifically in that stock
  useEffect(() => {
    if (selectedStockId && !isStandalone) {
      api.getDiamonds(selectedStockId)
        .then((res) => {
          if (res.success) {
            setDiamonds(res.data);
            // If currently selected diamond doesn't belong to this stock, reset it
            if (!res.data.some((d: any) => d.id === selectedDiamondId)) {
              setSelectedDiamondId('');
            }
          }
        })
        .catch(() => setDiamonds([]));
    } else if (isStandalone) {
      setDiamonds([]);
      setSelectedDiamondId('');
    }
  }, [selectedStockId, isStandalone]);

  const selectedStock = useMemo(() => {
    return stocks.find((s) => s.id === selectedStockId);
  }, [stocks, selectedStockId]);

  const stockOptions = useMemo<SearchOption[]>(() => {
    return stocks.map((s: any) => ({
      value: s.id,
      label: s.name || s.stockName || 'Unnamed Stock',
      sublabel: `${s.caratsTotal || s.totalCarat || 0}ct total`.trim(),
      icon: 'inventory_2',
      badge: {
        text: s.status || 'ACTIVE',
        className: 'bg-blue-50 text-blue-700 border-blue-200',
      },
      data: s,
    }));
  }, [stocks]);

  const diamondOptions = useMemo<SearchOption[]>(() => {
    return diamonds
      .filter((d: any) => {
        const s = (d.status || '').toUpperCase();
        // Never allow sold, in repair, already in certification, or written off stones
        if (s === 'SOLD' || s === 'IN_REPAIR' || s === 'IN_CERTIFICATION' || s === 'WRITTEN_OFF') {
          return false;
        }
        return s === 'AVAILABLE' || !s;
      })
      .map((d: any) => ({
        value: d.id,
        label: `${d.displayName || d.itemCode} (${d.carat}ct)`,
        sublabel: `${d.shape || ''} • ${d.color || ''} ${d.clarity || ''} • Cut: ${d.cut || ''}`.trim(),
        badge: {
          text: 'AVAILABLE',
          className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        },
        icon: 'diamond',
        data: d,
      }));
  }, [diamonds]);

  if (!open) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    try {
      setSaving(true);
      setError(null);

      // Pick diamondItemId if in ITEM level and selected
      const targetDiamondItemId = (!isStandalone && linkingLevel === 'ITEM' && selectedDiamondId) 
        ? selectedDiamondId 
        : null;

      // Graceful fallback for certificate name (non-compulsory)
      let effectiveName = name.trim();
      if (!effectiveName) {
        if (targetDiamondItemId) {
          const found = diamonds.find((d) => d.id === targetDiamondItemId);
          effectiveName = found 
            ? `${found.carat}ct ${found.shape || ''} ${labType} Certificate (${found.itemCode})`
            : `${labType} Grading Certificate`;
        } else if (selectedStock && !isStandalone) {
          effectiveName = `${selectedStock.name} - ${labType} Certificate (${linkingLevel === 'GENERAL' ? 'Parcel Level' : 'Stock'})`;
        } else {
          effectiveName = `${labType} Certificate ${reportNumber ? `#${reportNumber}` : ''}`.trim();
        }
      }

      await api.createCertificate({
        diamondItemId: targetDiamondItemId,
        name: effectiveName,
        labType: labType || 'GIA',
        reportNumber: reportNumber.trim() || undefined,
        cost: parseFloat(cost || '0') || 0,
        internalNotes: internalNotes 
          ? `[Priority: ${priority}] ${linkingLevel === 'GENERAL' ? '[General Level] ' : ''}${internalNotes}` 
          : `[Priority: ${priority}] ${linkingLevel === 'GENERAL' ? '[General Level]' : ''}`.trim(),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add certificate');
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="px-md py-sm rounded-lg font-body-md font-semibold text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => handleSubmit()}
        disabled={saving}
        className="flex items-center gap-xs px-lg py-sm rounded-lg font-body-md font-semibold bg-primary text-on-primary hover:bg-surface-tint shadow-xs transition-all disabled:opacity-50"
      >
        {saving ? (
          <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
        ) : (
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
        )}
        Add to Registry
      </button>
    </>
  );

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title="Add Certificate to Registry"
      subtitle="Register an in-progress lab report or incoming grading document with 2-step inventory linking."
      icon="verified"
      maxWidth="2xl"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-md">
        {error && (
          <div className="bg-error-container text-on-error-container px-md py-sm rounded-lg text-sm flex items-center gap-2 border border-error/20">
            <span className="material-symbols-outlined text-[18px]">error</span>
            {error}
          </div>
        )}

        {/* Section 1: Inventory Linking & Stock Hierarchy */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
          <div className="h-1 bg-blue-600" />
          <div className="p-lg flex flex-col gap-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
                  <span className="material-symbols-outlined text-[18px]">
                    {isStandalone ? 'link_off' : 'account_tree'}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                    {isStandalone ? 'Standalone Certificate (No Stock Link)' : '1. Inventory Lot & Stone Linking'}
                  </h3>
                  <p className="text-[11px] text-on-surface-variant m-0">
                    {isStandalone
                      ? 'Creates certificate record without binding to inventory (can link later)'
                      : 'Choose stock first, then select individual item or general parcel level'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsStandalone(!isStandalone)}
                className="px-sm py-1 text-xs font-bold rounded-lg border border-outline-variant bg-white hover:bg-surface-container text-primary transition-colors shadow-2xs shrink-0"
              >
                {isStandalone ? 'Link to Inventory' : 'Make Standalone'}
              </button>
            </div>

            {!isStandalone && (
              <div className="flex flex-col gap-md pt-sm border-t border-outline-variant/50">
                {/* Step 1: Select Stock Name */}
                <div className="flex flex-col gap-xs">
                  <div className="flex items-center justify-between">
                    <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-primary">inventory_2</span>
                      Step 1: Select Stock Name / Parcel
                    </label>
                    <span className="text-[11px] text-on-surface-variant font-medium">(Optional)</span>
                  </div>
                  <SearchableSelect
                    options={stockOptions}
                    value={selectedStockId}
                    onChange={(val) => {
                      setSelectedStockId(val);
                      setSelectedDiamondId('');
                    }}
                    placeholder="Select stock / parcel..."
                    searchPlaceholder="Search stock name or code..."
                    icon="inventory_2"
                    allowClear
                  />
                </div>

                {/* Step 2: Level Selection (Item Level vs General Level) */}
                <div className="flex flex-col gap-xs pt-sm border-t border-outline-variant/40">
                  <div className="flex items-center justify-between">
                    <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-primary">tune</span>
                      Step 2: Detail Level
                    </label>
                    <div className="flex items-center bg-white p-0.5 rounded-lg border border-outline-variant">
                      <button
                        type="button"
                        onClick={() => setLinkingLevel('ITEM')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${
                          linkingLevel === 'ITEM'
                            ? 'bg-primary text-on-primary shadow-xs'
                            : 'text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[14px]">diamond</span>
                        Item Level
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinkingLevel('GENERAL')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${
                          linkingLevel === 'GENERAL'
                            ? 'bg-primary text-on-primary shadow-xs'
                            : 'text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[14px]">layers</span>
                        General Level
                      </button>
                    </div>
                  </div>

                  {/* If Item Level: show available stones */}
                  {linkingLevel === 'ITEM' && (
                    <div className="mt-2 flex flex-col gap-xs">
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-1">
                        Select Available Stone in Selected Stock
                        <span className="text-[11px] text-on-surface-variant font-normal">(Optional)</span>
                      </label>
                      <SearchableSelect
                        options={diamondOptions}
                        value={selectedDiamondId}
                        onChange={(val, opt) => {
                          setSelectedDiamondId(val);
                          if (opt?.data && !name) {
                            const itm = opt.data;
                            setName(`${itm.shape || ''} ${itm.cut || ''} ${itm.clarity || ''} ${itm.carat || ''}ct`.trim());
                          }
                        }}
                        placeholder={
                          selectedStockId
                            ? `Select stone from ${selectedStock?.name || 'selected stock'} (${diamonds.length} stones available)...`
                            : "Select diamond stone..."
                        }
                        searchPlaceholder="Type stone code, carat, shape..."
                        icon="diamond"
                        allowClear
                      />
                      {selectedDiamondId && (
                        <p className="text-[11px] text-emerald-700 flex items-center gap-1 mt-0.5 font-medium">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          Item selected and linked directly.
                        </p>
                      )}
                    </div>
                  )}

                  {/* If General Level */}
                  {linkingLevel === 'GENERAL' && (
                    <div className="p-sm bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-center gap-2 mt-1">
                      <span className="material-symbols-outlined text-blue-600 text-[18px]">info</span>
                      <span>
                        Certificate will apply to the entire <strong>{selectedStock?.name || 'Stock'}</strong> parcel at a general level without binding to a single stone.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Lab & Report Specifications */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
          <div className="h-1 bg-amber-500" />
          <div className="p-lg flex flex-col gap-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                  2. Lab & Grading Specifications
                </h3>
                <p className="text-[11px] text-on-surface-variant m-0">
                  Grading authority, report identification, and priority tag
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md pt-xs">
              <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    Certificate Title / Label
                  </label>
                  <span className="text-[11px] text-on-surface-variant font-medium">(Auto-fills if empty)</span>
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    selectedStock
                      ? `e.g. ${selectedStock.name} ${labType} Certificate`
                      : `e.g. 1.05ct Round ${labType} Report`
                  }
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                />
              </div>

              <div className="flex flex-col gap-xs">
                <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                  Lab Type
                </label>
                <select
                  value={labType}
                  onChange={(e) => setLabType(e.target.value)}
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                >
                  <option value="GIA">GIA</option>
                  <option value="IGI">IGI</option>
                  <option value="HRD">HRD</option>
                  <option value="AGS">AGS</option>
                  <option value="EGL">EGL</option>
                  <option value="OTHER">Other Lab</option>
                </select>
              </div>

              <div className="flex flex-col gap-xs">
                <div className="flex items-center justify-between">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    Report / Dossier Number
                  </label>
                  <span className="text-[11px] text-on-surface-variant font-medium">(Optional)</span>
                </div>
                <input
                  type="text"
                  value={reportNumber}
                  onChange={(e) => setReportNumber(e.target.value)}
                  placeholder="e.g. 2145893214"
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                />
              </div>

              <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                  Processing Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                >
                  <option value="Normal">Normal Priority</option>
                  <option value="High">High Priority</option>
                  <option value="Urgent">Urgent / Express Lab</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Financial Valuation & Operational Notes */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
          <div className="h-1 bg-emerald-600" />
          <div className="p-lg flex flex-col gap-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-[18px]">payments</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                  3. Valuation & Tracking Notes
                </h3>
                <p className="text-[11px] text-on-surface-variant m-0">
                  Lab certification fee and logistics tracking notes
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md pt-xs">
              <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    Certification Cost (₹)
                  </label>
                  <span className="text-[11px] text-on-surface-variant font-medium">(Optional)</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-caption text-on-surface-variant font-semibold">₹</span>
                  <input
                    type="number"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    Internal Notes / Tracking
                  </label>
                  <span className="text-[11px] text-on-surface-variant font-medium">(Optional)</span>
                </div>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="e.g. Dispatched to GIA Mumbai via Malca-Amit on 14th..."
                  rows={2}
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md resize-none leading-relaxed"
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </BaseModal>
  );
};
