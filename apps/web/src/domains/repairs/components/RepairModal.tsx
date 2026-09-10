import React, { useState, useEffect, useMemo } from 'react';
import { BaseModal } from '../../common/components/BaseModal';
import { api } from '../../../services/api';
import { SearchableSelect, SearchOption } from '../../common/components/SearchableSelect';
import { getPartyTypeConfig } from '../../parties/types/partyTypes';
import { PartyItem } from '../../../types/stock';

interface RepairModalProps {
  open: boolean;
  repair: any | null;
  onClose: () => void;
  onSubmit: (data: any, id?: string) => Promise<void>;
}

export const RepairModal: React.FC<RepairModalProps> = ({ open, repair, onClose, onSubmit }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Stock / Inventory Selection
  const [stocks, setStocks] = useState<any[]>([]);
  const [selectedStockId, setSelectedStockId] = useState('');
  const [isStandalone, setIsStandalone] = useState(false);

  // Step 2: Level Selection (Item Level vs General Level)
  const [linkingLevel, setLinkingLevel] = useState<'ITEM' | 'GENERAL'>('ITEM');

  // Diamond stones for selected stock
  const [diamonds, setDiamonds] = useState<any[]>([]);
  const [selectedDiamondId, setSelectedDiamondId] = useState('');

  // Parties for vendor/workshop selection
  const [parties, setParties] = useState<PartyItem[]>([]);
  const [vendor, setVendor] = useState('');

  // Repair metadata (all non-compulsory with friendly fallbacks)
  const [name, setName] = useState('');
  const [status, setStatus] = useState('IN PROGRESS');
  const [repairType, setRepairType] = useState('Polishing');
  const [estCost, setEstCost] = useState('');
  const [finalCost, setFinalCost] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [completedOn, setCompletedOn] = useState('');
  const [restoresTo, setRestoresTo] = useState('ACTIVE');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (open) {
      // Fetch available stocks
      api.getStocks()
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            setStocks(res.data);
            if (res.data.length > 0 && !repair) {
              setSelectedStockId(res.data[0].id);
            }
          }
        })
        .catch(() => setStocks([]));

      // Fetch available diamonds
      api.getDiamonds()
        .then((res) => {
          if (res.success) setDiamonds(res.data);
        })
        .catch(() => setDiamonds([]));

      // Fetch parties
      api.getParties()
        .then((res) => {
          if (res.success) setParties(res.data);
        })
        .catch(() => setParties([]));

      if (repair) {
        setSelectedDiamondId(repair.diamondItemId || repair.stockItemId || '');
        setName(repair.itemName || repair.name || '');
        setStatus(repair.status || 'IN PROGRESS');
        setRepairType(repair.repairType || 'Polishing');
        setVendor(repair.vendor || repair.vendorPartyId || '');
        setEstCost(repair.estCost != null ? String(repair.estCost) : '');
        setFinalCost(repair.finalCost != null ? String(repair.finalCost) : '');
        setRemarks(repair.remarks || '');
        
        try {
          setDueDate(repair.dueDate ? new Date(repair.dueDate).toISOString().substring(0, 10) : '');
        } catch { setDueDate(''); }
        
        try {
          setCompletedOn(repair.completedOn ? new Date(repair.completedOn).toISOString().substring(0, 10) : '');
        } catch { setCompletedOn(''); }
        
        setRestoresTo(repair.restoresTo || 'ACTIVE');
        setIsStandalone(!repair.diamondItemId);
      } else {
        setSelectedDiamondId('');
        setName('');
        setStatus('IN PROGRESS');
        setRepairType('Polishing');
        setVendor('');
        setEstCost('');
        setFinalCost('');
        setDueDate('');
        setCompletedOn('');
        setRestoresTo('ACTIVE');
        setRemarks('');
        setIsStandalone(false);
        setLinkingLevel('ITEM');
      }
      setError(null);
    }
  }, [open, repair]);

  // When selectedStockId changes, fetch diamonds in that stock
  useEffect(() => {
    if (selectedStockId && !isStandalone) {
      api.getDiamonds(selectedStockId)
        .then((res) => {
          if (res.success) {
            setDiamonds(res.data);
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
        // If editing an existing repair, retain the attached diamond item
        if (repair && (d.id === repair.diamondItemId || d.id === repair.stockItemId)) {
          return true;
        }
        const s = (d.status || '').toUpperCase();
        // Never allow sold, already in repair, in certification, or written off stones
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
  }, [diamonds, repair]);

  // Party search options with visual party type tags
  const partyOptions = useMemo<SearchOption[]>(() => {
    return parties.map((p) => {
      const partyType = p.type || p.partyType;
      const cfg = partyType ? getPartyTypeConfig(partyType) : null;
      const partyName = p.name || p.partyName || 'Unknown Party';
      const sub = [p.city, p.phone, p.nickname, p.contactPerson].filter(Boolean).join(' • ');
      return {
        value: partyName,
        label: partyName,
        sublabel: sub || undefined,
        badge: cfg ? { text: cfg.badgeText, className: cfg.badgeClass } : undefined,
        icon: cfg?.icon || 'storefront',
        data: p,
      };
    });
  }, [parties]);

  if (!open) return null;

  const handleDiamondChange = (diamondId: string) => {
    setSelectedDiamondId(diamondId);
    const found = diamonds.find((d) => d.id === diamondId);
    if (found && !name) {
      setName(`${found.carat}ct ${found.shape || ''} ${found.color || ''} ${found.clarity || ''} (${found.itemCode})`.trim());
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    try {
      setSaving(true);
      setError(null);

      const targetDiamondId = (!isStandalone && linkingLevel === 'ITEM' && selectedDiamondId)
        ? selectedDiamondId
        : undefined;

      const selectedStone = diamonds.find((d) => d.id === targetDiamondId);
      const codeOrId = selectedStone?.itemCode || targetDiamondId || undefined;

      // Graceful fallback for repair name
      let effectiveName = name.trim();
      if (!effectiveName) {
        if (selectedStone) {
          effectiveName = `${selectedStone.carat}ct ${selectedStone.shape || ''} ${repairType} Repair (${selectedStone.itemCode})`;
        } else if (selectedStock && !isStandalone) {
          effectiveName = `${selectedStock.name} - ${repairType} Repair (${linkingLevel === 'GENERAL' ? 'General Parcel' : 'Stock'})`;
        } else {
          effectiveName = `${repairType} Repair Order`;
        }
      }

      await onSubmit(
        {
          stockId: !isStandalone ? selectedStockId : undefined,
          stockItemId: codeOrId,
          diamondItemId: targetDiamondId,
          name: effectiveName,
          status: status || 'IN PROGRESS',
          repairType: repairType || 'Polishing',
          vendor: vendor.trim() || 'General Workshop',
          estCost: parseFloat(estCost || '0') || 0,
          finalCost: parseFloat(finalCost || estCost || '0') || 0,
          dueDate: dueDate ? new Date(dueDate).toISOString() : '',
          completedOn: completedOn ? new Date(completedOn).toISOString() : '',
          restoresTo: restoresTo || 'ACTIVE',
          remarks: remarks.trim() 
            ? `${linkingLevel === 'GENERAL' && !isStandalone ? '[General Level] ' : ''}${remarks.trim()}`
            : (linkingLevel === 'GENERAL' && !isStandalone ? '[General Parcel Level Repair]' : ''),
        },
        repair?.repairId || repair?.id
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save repair record');
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
        {saving && <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>}
        {repair ? 'Update Repair' : 'Send for Repair'}
      </button>
    </>
  );

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={repair ? 'Edit Repair Order' : 'New Repair Job'}
      subtitle={repair ? `Job #${repair.repairId?.substring(0, 8)} • ${repair.stockName || repair.itemName || repair.name}` : 'Track stones sent for cutting, polishing, or setting repair with 2-step inventory linking.'}
      icon="build"
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
          <div className="h-1 bg-sky-600" />
          <div className="p-lg flex flex-col gap-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center shrink-0 shadow-2xs">
                  <span className="material-symbols-outlined text-[18px]">
                    {isStandalone ? 'link_off' : 'account_tree'}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                    {isStandalone ? 'Standalone Repair Job (Unlinked)' : '1. Inventory Lot & Stone Linking'}
                  </h3>
                  <p className="text-[11px] text-on-surface-variant m-0">
                    {isStandalone
                      ? 'Track repair without binding to inventory item'
                      : 'Select stock first, then choose specific item or general level'}
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
                {/* Step 1: Select Stock */}
                <div className="flex flex-col gap-xs">
                  <div className="flex items-center justify-between">
                    <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-primary">inventory_2</span>
                      Step 1: Select Stock Name / Parcel
                    </label>
                    <span className="text-[11px] text-on-surface-variant font-medium">(Optional)</span>
                  </div>
                  <SearchableSelect
                    placeholder="Search stock / parcel name..."
                    options={stockOptions}
                    value={selectedStockId}
                    onChange={(val) => {
                      setSelectedStockId(val);
                      setSelectedDiamondId('');
                    }}
                    icon="inventory_2"
                    allowClear
                  />
                </div>

                {/* Step 2: Level Selection */}
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

                  {/* Item Level selection */}
                  {linkingLevel === 'ITEM' && (
                    <div className="mt-2 flex flex-col gap-xs">
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-1">
                        Select Available Stone in Selected Stock
                        <span className="text-[11px] text-on-surface-variant font-normal">(Optional)</span>
                      </label>
                      <SearchableSelect
                        placeholder={
                          selectedStockId
                            ? `Select stone from ${selectedStock?.name || 'stock'} (${diamonds.length} stones available)...`
                            : "Select stone by code, shape, carat..."
                        }
                        options={diamondOptions}
                        value={selectedDiamondId}
                        onChange={handleDiamondChange}
                        icon="diamond"
                        allowClear
                      />
                      {selectedDiamondId && (
                        <p className="text-[11px] text-emerald-700 flex items-center gap-1 mt-0.5 font-medium">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          Stone selected and linked directly.
                        </p>
                      )}
                    </div>
                  )}

                  {/* General Level note */}
                  {linkingLevel === 'GENERAL' && (
                    <div className="p-sm bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-center gap-2 mt-1">
                      <span className="material-symbols-outlined text-blue-600 text-[18px]">info</span>
                      <span>
                        Repair job applies to the entire <strong>{selectedStock?.name || 'Stock'}</strong> parcel at a general level.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Repair Service & Workshop / Vendor */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
          <div className="h-1 bg-orange-500" />
          <div className="p-lg flex flex-col gap-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-700 flex items-center justify-center shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-[18px]">build</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                  2. Service Job & Workshop / Vendor
                </h3>
                <p className="text-[11px] text-on-surface-variant m-0">
                  Specify repair work type, item label, and assigned workshop
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md pt-xs">
              <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    Item Name / Description
                  </label>
                  <span className="text-[11px] text-on-surface-variant font-medium">(Auto-fills if empty)</span>
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    selectedStock
                      ? `e.g. ${selectedStock.name} Repair`
                      : 'e.g. 1.25ct Round VVS1'
                  }
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                />
              </div>

              {/* Vendor / Workshop Searchable Select with Party Type Tag */}
              <div className="flex flex-col gap-xs">
                <div className="flex items-center justify-between">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    Vendor / Workshop Party
                  </label>
                  <span className="text-[11px] text-on-surface-variant font-medium">(Optional)</span>
                </div>
                <SearchableSelect
                  placeholder="Search workshop, supplier, broker..."
                  options={partyOptions}
                  value={vendor}
                  onChange={(val) => setVendor(val)}
                  allowClear
                />
              </div>

              <div className="flex flex-col gap-xs">
                <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                  Repair Type
                </label>
                <select
                  value={repairType}
                  onChange={(e) => setRepairType(e.target.value)}
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                >
                  <option value="Polishing">Polishing</option>
                  <option value="Recutting">Recutting / Re-shaping</option>
                  <option value="Chip Repair">Chip / Damage Repair</option>
                  <option value="Laser Drilling">Laser Drilling</option>
                  <option value="Symmetry Correction">Symmetry Correction</option>
                  <option value="Boiling / Deep Clean">Boiling / Deep Clean</option>
                  <option value="Other">Other Repair</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Job Lifecycle & Schedule */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
          <div className="h-1 bg-purple-600" />
          <div className="p-lg flex flex-col gap-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-[18px]">schedule</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                  3. Status & Timeline
                </h3>
                <p className="text-[11px] text-on-surface-variant m-0">
                  Lifecycle status, expected delivery date, and completion date
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md pt-xs">
              <div className="flex flex-col gap-xs">
                <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                  Current Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                >
                  <option value="IN PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ON HOLD">On Hold</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div className="flex flex-col gap-xs">
                <div className="flex items-center justify-between">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    Expected Due Date
                  </label>
                  <span className="text-[11px] text-on-surface-variant font-medium">(Optional)</span>
                </div>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                />
              </div>

              {status === 'COMPLETED' && (
                <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    Completed Date
                  </label>
                  <input
                    type="date"
                    value={completedOn}
                    onChange={(e) => setCompletedOn(e.target.value)}
                    className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 4: Repair Costs & Operational Instructions */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
          <div className="h-1 bg-emerald-600" />
          <div className="p-lg flex flex-col gap-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-[18px]">payments</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                  4. Cost Valuation & Instructions
                </h3>
                <p className="text-[11px] text-on-surface-variant m-0">
                  Estimated / actual job cost and workshop instructions
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md pt-xs">
              <div className="flex flex-col gap-xs">
                <div className="flex items-center justify-between">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    Estimated Cost (₹)
                  </label>
                  <span className="text-[11px] text-on-surface-variant font-medium">(Optional)</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-caption text-on-surface-variant font-semibold">₹</span>
                  <input
                    type="number"
                    value={estCost}
                    onChange={(e) => setEstCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-xs">
                <div className="flex items-center justify-between">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    Final Cost (₹)
                  </label>
                  <span className="text-[11px] text-on-surface-variant font-medium">(Optional)</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-caption text-on-surface-variant font-semibold">₹</span>
                  <input
                    type="number"
                    value={finalCost}
                    onChange={(e) => setFinalCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    Repair Instructions / Remarks
                  </label>
                  <span className="text-[11px] text-on-surface-variant font-medium">(Optional)</span>
                </div>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Polish table to remove minor surface feather without reducing carat below 1.00ct..."
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
