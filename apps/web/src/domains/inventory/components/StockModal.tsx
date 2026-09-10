import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { StockItem, CreateStockDTO, UpdateStockDTO, REPORT_GROUPS, SHAPES, CUTS, CLARITIES, COLORS } from '../../../types/stock';
import { useLocations, DEFAULT_LOCATION } from '../../../hooks/useLocations';

interface StockModalProps {
  open: boolean;
  stock?: StockItem | null; // null = create mode, StockItem = edit mode
  onClose: () => void;
  onSubmit: (data: CreateStockDTO | UpdateStockDTO, id?: string) => Promise<void>;
}

const defaultForm: CreateStockDTO = {
  stockName: '',
  reportGroup: '',
  location: DEFAULT_LOCATION,
  itemType: 'Mix',
  shape: 'Round',
  cut: 'EX',
  clarity: 'VS1',
  color: 'D',
  caratWeight: 0,
  caratRate: 0,
  remarks: '',
  itemCount: 1,
  mixCertification: 'Non-Certified',
  mixState: 'Polished',
  linkedCertificateId: '',
  labType: '',
  internalNotes: '',
  certCost: '',
  repairType: '',
  repairVendorId: '',
  repairCost: ''
};

export const StockModal: React.FC<StockModalProps> = ({ open, stock, onClose, onSubmit }) => {
  const isEdit = !!stock;
  const { locations, addLocation } = useLocations();
  const [form, setForm] = useState<CreateStockDTO & { status?: string; isActive?: boolean }>(defaultForm);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parties, setParties] = useState<{id: string, name: string}[]>([]);
  const [unlinkedCerts, setUnlinkedCerts] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      setIsAddingLocation(false);
      setNewLocName('');
      api.getParties()
        .then(res => {
          if (res.success) setParties(res.data as any);
        })
        .catch(err => console.error('Failed to load parties:', err));

      api.getUnlinkedCertificates()
        .then(res => {
          if (res.success) setUnlinkedCerts(res.data);
        })
        .catch(err => console.error('Failed to load unlinked certs:', err));
    }
  }, [open]);

  useEffect(() => {
    if (stock) {
      setForm({
        stockName: stock.stockName,
        reportGroup: stock.reportGroup,
        location: stock.location || DEFAULT_LOCATION,
        itemType: 'Mix', // Defaults for edit since they aren't on Stock_Master
        shape: 'Round',
        cut: 'EX',
        clarity: 'VS1',
        color: 'D',
        caratWeight: stock.caratWeight,
        caratRate: stock.caratRate,
        remarks: stock.remarks,
        itemCount: stock.itemCount,
        status: stock.status,
        isActive: stock.status !== 'ARCHIVED',
        mixCertification: 'Non-Certified',
        mixState: 'Polished',
      });
    } else {
      setForm(defaultForm);
    }
    setError(null);
  }, [stock, open]);

  const handleChange = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.stockName.trim()) {
      setError('Stock Name is required');
      return;
    }
    if (form.itemType === 'Certified' && !form.reportGroup) {
      setError('Certificate Type is required for Certified parcels');
      return;
    }
    if (!form.caratWeight || form.caratWeight <= 0) {
      setError('Carat Weight must be greater than 0');
      return;
    }
    if (!form.caratRate || form.caratRate <= 0) {
      setError('Carat Rate must be greater than 0');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = { ...form };
      if (payload.itemType === 'Mix') {
        payload.itemType = `Mix - ${payload.mixCertification} - ${payload.mixState}`;
      }
      
      await onSubmit(payload, stock?.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save stock');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const totalValue = (Number(form.caratWeight) || 0) * (Number(form.caratRate) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-md overflow-y-auto">
      <div className="bg-surface-container-lowest w-full max-w-3xl rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] flex flex-col my-auto border border-outline-variant animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-xl py-md border-b border-outline-variant bg-surface-bright rounded-t-xl shrink-0">
          <div className="flex items-center gap-md">
            <div className="w-8 h-8 rounded bg-[#E3F2FD] flex items-center justify-center text-[#1565C0] font-bold">
              <span className="material-symbols-outlined text-[18px]">add_box</span>
            </div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface m-0 font-bold">
              {isEdit ? 'Edit Stock Parcel' : 'Add New Stock Parcel'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:bg-surface-container hover:text-on-surface p-sm rounded-full transition-colors self-start"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-xl flex flex-col gap-lg bg-background">
          {error && (
            <div className="bg-error-container border border-error/20 rounded-lg px-md py-sm flex items-center gap-sm">
              <span className="material-symbols-outlined text-error text-[18px]">error</span>
              <span className="font-body-md text-body-md text-on-error-container">{error}</span>
            </div>
          )}

          {/* Section 1: Parcel Identification */}
          <div className="flex flex-col rounded-lg border border-outline-variant bg-surface-container-lowest overflow-hidden">
            <div className="h-1 bg-[#1565C0]" />
            <div className="p-md flex flex-col gap-sm">
              <h3 className="font-body-md text-body-md text-on-surface font-bold flex items-center gap-xs">
                <span className="material-symbols-outlined text-[#1565C0] text-[18px]">label</span>
                Parcel Identification
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">
                    Stock Name <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.stockName}
                    onChange={(e) => handleChange('stockName', e.target.value.toUpperCase())}
                    placeholder="e.g., WHITE STAR"
                    className="w-full px-sm py-xs border border-outline-variant rounded bg-white focus:outline-none focus:border-primary font-body-md text-on-surface"
                  />
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">
                    Certificate Type {form.itemType === 'Certified' && <span className="text-error">*</span>}
                  </label>
                  <select
                    value={form.reportGroup}
                    onChange={(e) => handleChange('reportGroup', e.target.value)}
                    className="w-full px-sm py-xs border border-outline-variant rounded bg-white focus:outline-none focus:border-primary font-body-md text-on-surface"
                  >
                    <option value="">Select Group</option>
                    {REPORT_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-xs">
                  <div className="flex items-center justify-between">
                    <label className="font-caption text-caption font-bold text-on-surface-variant">
                      Location
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
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newLocName}
                        onChange={(e) => setNewLocName(e.target.value)}
                        placeholder="e.g. Surat Vault, HK..."
                        className="w-full px-sm py-xs border border-outline-variant rounded bg-white text-xs text-on-surface focus:outline-none focus:border-primary"
                        autoFocus
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (newLocName.trim()) {
                              const res = await addLocation(newLocName.trim());
                              if (res.success) {
                                handleChange('location', newLocName.trim());
                                setNewLocName('');
                                setIsAddingLocation(false);
                              }
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (newLocName.trim()) {
                            const res = await addLocation(newLocName.trim());
                            if (res.success) {
                              handleChange('location', newLocName.trim());
                              setNewLocName('');
                              setIsAddingLocation(false);
                            }
                          }
                        }}
                        className="px-2 py-1 bg-primary text-white rounded text-xs font-bold shrink-0 hover:bg-surface-tint"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <select
                      value={form.location || DEFAULT_LOCATION}
                      onChange={(e) => handleChange('location', e.target.value)}
                      className="w-full px-sm py-xs border border-outline-variant rounded bg-white focus:outline-none focus:border-primary font-body-md text-on-surface"
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
                {isEdit && (
                  <div className="flex flex-col gap-xs">
                    <label className="font-caption text-caption font-bold text-on-surface-variant">
                      Lifecycle Status / Tag
                    </label>
                    <select
                      value={form.isActive === false || form.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE'}
                      onChange={(e) => {
                        const isArch = e.target.value === 'ARCHIVED';
                        setForm(prev => ({
                          ...prev,
                          isActive: !isArch,
                          status: isArch ? 'ARCHIVED' : 'ACTIVE',
                        }));
                      }}
                      className="w-full px-sm py-xs border border-outline-variant rounded bg-white focus:outline-none focus:border-primary font-body-md text-on-surface font-semibold"
                    >
                      <option value="ACTIVE">Active (In Use)</option>
                      <option value="ARCHIVED">Archived (Deactivated / Closed)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Initial Item Specification */}
          <div className="flex flex-col rounded-lg border border-outline-variant bg-surface-container-lowest overflow-hidden">
            <div className="h-1 bg-[#FF8F00]" />
            <div className="p-md flex flex-col gap-sm">
              <div className="flex justify-between items-center">
                <h3 className="font-body-md text-body-md text-on-surface font-bold flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[#FF8F00] text-[18px]">diamond</span>
                  Initial Item Specification
                </h3>
                <div className="flex rounded bg-surface-container border border-outline-variant p-[2px]">
                  {['Rough', 'Mix', 'Certified'].map((type) => (
                    <button
                      key={type}
                      onClick={() => handleChange('itemType', type)}
                      className={`px-sm py-[2px] font-caption text-caption rounded transition-colors ${
                        form.itemType === type ? 'bg-white shadow-sm font-bold text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {form.itemType === 'Mix' && (
                <div className="flex flex-col gap-sm bg-surface-container-lowest border border-outline-variant rounded p-sm mt-xs">
                  <div className="flex flex-col gap-md">
                    <div className="flex flex-col gap-xs">
                      <label className="font-caption text-[10px] uppercase font-bold text-on-surface-variant">1. Certification State</label>
                      <div className="flex rounded bg-surface-container border border-outline-variant p-[2px] w-fit">
                        {['Certified', 'Non-Certified'].map((cert) => (
                          <button
                            key={cert}
                            onClick={() => handleChange('mixCertification', cert)}
                            className={`px-sm py-[2px] font-caption text-caption rounded transition-colors ${
                              form.mixCertification === cert ? 'bg-white shadow-sm font-bold text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                          >
                            {cert}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {form.mixCertification && (
                      <div className="flex flex-col gap-xs">
                        <label className="font-caption text-[10px] uppercase font-bold text-on-surface-variant">2. Polish State</label>
                        <div className="flex rounded bg-surface-container border border-outline-variant p-[2px] w-fit">
                          {['Rough', 'Polished'].map((state) => (
                            <button
                              key={state}
                              onClick={() => handleChange('mixState', state)}
                              className={`px-sm py-[2px] font-caption text-caption rounded transition-colors ${
                                form.mixState === state ? 'bg-white shadow-sm font-bold text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
                              }`}
                            >
                              {state}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-4 gap-md pb-md border-b border-outline-variant/50 border-dashed mt-xs">
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-[10px] uppercase font-bold text-on-surface-variant">SHAPE</label>
                  <select
                    value={form.shape}
                    onChange={(e) => handleChange('shape', e.target.value)}
                    className="w-full px-sm py-xs border border-outline-variant rounded bg-white focus:outline-none focus:border-primary font-body-sm text-on-surface"
                  >
                    {SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-[10px] uppercase font-bold text-on-surface-variant">CUT</label>
                  <select
                    value={form.cut}
                    onChange={(e) => handleChange('cut', e.target.value)}
                    className="w-full px-sm py-xs border border-outline-variant rounded bg-white focus:outline-none focus:border-primary font-body-sm text-on-surface"
                  >
                    {CUTS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-[10px] uppercase font-bold text-on-surface-variant">CLARITY</label>
                  <select
                    value={form.clarity}
                    onChange={(e) => handleChange('clarity', e.target.value)}
                    className="w-full px-sm py-xs border border-outline-variant rounded bg-white focus:outline-none focus:border-primary font-body-sm text-on-surface"
                  >
                    {CLARITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-[10px] uppercase font-bold text-on-surface-variant">COLOR</label>
                  <select
                    value={form.color}
                    onChange={(e) => handleChange('color', e.target.value)}
                    className="w-full px-sm py-xs border border-outline-variant rounded bg-white focus:outline-none focus:border-primary font-body-sm text-on-surface"
                  >
                    {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-md pt-sm">
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Carat Weight <span className="text-error">*</span></label>
                  <div className="relative">
                    <input
                      type="number"
                      value={form.caratWeight || ''}
                      onChange={(e) => handleChange('caratWeight', e.target.value)}
                      className="w-full px-sm py-sm border border-[#1565C0]/30 rounded bg-[#E3F2FD]/20 focus:outline-none focus:border-[#1565C0] font-body-lg text-on-surface font-bold text-right pr-xl"
                    />
                    <span className="absolute right-sm top-1/2 -translate-y-1/2 font-caption text-on-surface-variant">ct</span>
                  </div>
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Carat Rate (₹) <span className="text-error">*</span></label>
                  <div className="relative">
                    <span className="absolute left-sm top-1/2 -translate-y-1/2 font-caption text-on-surface-variant">₹</span>
                    <input
                      type="number"
                      value={form.caratRate || ''}
                      onChange={(e) => handleChange('caratRate', e.target.value)}
                      className="w-full pl-lg pr-sm py-sm border border-outline-variant rounded bg-white focus:outline-none focus:border-primary font-body-lg text-on-surface font-bold text-right"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Total Net Value (Auto)</label>
                  <div className="relative h-full flex items-center">
                    <span className="absolute left-sm font-caption text-on-surface-variant">₹</span>
                    <div className="w-full pl-lg pr-sm py-sm border border-transparent rounded bg-[#E8F5E9] font-body-lg text-[#2E7D32] font-bold text-right">
                      {totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Inline Certificate & Repair Linking (Only for Create) */}
              {!isEdit && (
                <div className="flex flex-col gap-sm border-t border-outline-variant pt-md mt-sm">
                  <div className="flex flex-wrap md:flex-nowrap gap-sm items-start w-full">
                    {/* Inline Certificate Linking */}
                    <div className="flex flex-1 flex-col gap-sm p-sm bg-primary/5 rounded border border-primary/20">
                      <h4 className="font-label-md font-bold text-primary">Link Certificate</h4>
                      <div className="flex flex-wrap md:flex-nowrap gap-sm">
                        {unlinkedCerts.length > 0 && (
                          <div className="flex-1 min-w-[120px]">
                            <label className="font-caption text-caption text-on-surface-variant mb-1 block">Existing Cert</label>
                            <select value={form.linkedCertificateId || ''} onChange={e => handleChange('linkedCertificateId', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded bg-white text-sm">
                              <option value="">None</option>
                              {unlinkedCerts.map(cert => (
                                <option key={cert.certificateId} value={cert.certificateId}>{cert.reportNumber || cert.certificateId}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="flex-1 min-w-[80px]">
                          <label className="font-caption text-caption text-on-surface-variant mb-1 block">New Cert Lab</label>
                          <select value={form.labType || ''} onChange={e => handleChange('labType', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded bg-white text-sm">
                            <option value="">None</option>
                            {['GIA', 'IGI', 'HRD', 'OTHER'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </div>
                      {form.labType && (
                        <div className="flex flex-wrap md:flex-nowrap gap-sm mt-xs">
                          <div className="flex-1 min-w-[120px]">
                            <label className="font-caption text-caption text-on-surface-variant mb-1 block">Report # / Notes</label>
                            <input type="text" value={form.internalNotes || ''} onChange={e => handleChange('internalNotes', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded text-sm" placeholder="Ref..." />
                          </div>
                          <div className="flex-1 min-w-[80px]">
                            <label className="font-caption text-caption text-on-surface-variant mb-1 block">Cert Cost</label>
                            <input type="number" value={form.certCost || ''} onChange={e => handleChange('certCost', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded text-sm" placeholder="₹" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Inline Repair Linking */}
                    <div className="flex flex-1 flex-col gap-sm p-sm bg-tertiary/5 rounded border border-tertiary/20">
                      <h4 className="font-label-md font-bold text-tertiary">Link Repair</h4>
                      <div className="flex-1 min-w-[100px]">
                        <label className="font-caption text-caption text-on-surface-variant mb-1 block">Repair Type</label>
                        <select value={form.repairType || ''} onChange={e => handleChange('repairType', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded bg-white text-sm">
                          <option value="">No Repair</option>
                          {['Polishing', 'Cutting', 'Boiling', 'Symmetry', 'Other'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      {form.repairType && (
                        <div className="flex flex-wrap md:flex-nowrap gap-sm mt-xs">
                          <div className="flex-1 min-w-[120px]">
                            <label className="font-caption text-caption text-on-surface-variant mb-1 block">Repair Vendor</label>
                            <select value={form.repairVendorId || ''} onChange={e => handleChange('repairVendorId', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded bg-white text-sm">
                              <option value="">Select Vendor...</option>
                              {parties.filter(p => p.name.toUpperCase().includes('WORKSHOP')).map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                              {parties.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1 min-w-[80px]">
                            <label className="font-caption text-caption text-on-surface-variant mb-1 block">Est. Cost</label>
                            <input type="number" value={form.repairCost || ''} onChange={e => handleChange('repairCost', e.target.value)} className="w-full p-1.5 border border-outline-variant rounded text-sm" placeholder="₹" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Metadata */}
          <div className="flex flex-col rounded-lg border border-outline-variant bg-surface-container-lowest overflow-hidden">
            <div className="h-1 bg-[#8E24AA]" />
            <div className="p-md flex flex-col gap-sm">
              <h3 className="font-body-md text-body-md text-on-surface font-bold flex items-center gap-xs">
                <span className="material-symbols-outlined text-[#8E24AA] text-[18px]">notes</span>
                Metadata
              </h3>
              <div className="flex flex-col gap-xs">
                <label className="font-caption text-[10px] font-bold text-on-surface-variant uppercase">
                  Remarks
                </label>
                <textarea
                  value={form.remarks}
                  onChange={(e) => handleChange('remarks', e.target.value)}
                  placeholder="Add any operational notes or origin details here..."
                  rows={2}
                  className="w-full px-sm py-xs border border-outline-variant rounded bg-white focus:outline-none focus:border-primary font-body-sm text-on-surface resize-none"
                />
              </div>
            </div>
          </div>

          {isEdit && (
            <div className="bg-surface-container rounded-lg p-md flex gap-md border border-outline-variant/50 mt-sm">
              <span className="material-symbols-outlined text-[#1565C0] text-[20px]">info</span>
              <div>
                <h4 className="font-body-md font-bold text-on-surface mb-1">Read-only Context</h4>
                <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
                  Note: Status (<span className="text-[#E65100] font-bold">{stock.status}</span>) and Inventory Balances are derived automatically from the underlying Stock Items and Transactions. To edit specifications or balances, please navigate to the Items or Ledger tabs.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-xl py-md border-t border-outline-variant bg-surface-bright rounded-b-xl flex justify-end gap-md shrink-0">
          <button
            onClick={onClose}
            className="px-lg py-sm rounded font-body-md font-medium text-on-surface hover:bg-surface-container transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-lg py-sm rounded bg-[#1565C0] text-white hover:bg-[#0D47A1] disabled:opacity-50 transition-colors flex items-center gap-sm font-body-md font-medium shadow-sm"
          >
            {saving ? (
              <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">save</span>
            )}
            {isEdit ? 'Save Changes' : 'Create Stock & Item'}
          </button>
        </div>
      </div>
    </div>
  );
};
