import React, { useState, useEffect } from 'react';

interface RepairModalProps {
  open: boolean;
  repair: any | null;
  onClose: () => void;
  onSubmit: (data: any, id?: string) => Promise<void>;
}

export const RepairModal: React.FC<RepairModalProps> = ({ open, repair, onClose, onSubmit }) => {
  const [saving, setSaving] = useState(false);
  
  const [stockItemId, setStockItemId] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('IN PROGRESS');
  const [repairType, setRepairType] = useState('');
  const [vendor, setVendor] = useState('');
  const [estCost, setEstCost] = useState('');
  const [finalCost, setFinalCost] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [completedOn, setCompletedOn] = useState('');
  const [restoresTo, setRestoresTo] = useState('ACTIVE');

  useEffect(() => {
    if (open) {
      if (repair) {
        setStockItemId(repair.stockItemId || '');
        setName(repair.itemName || '');
        setStatus(repair.status || 'IN PROGRESS');
        setRepairType(repair.repairType || '');
        setVendor(repair.vendor || '');
        setEstCost(repair.estCost != null ? String(repair.estCost) : '');
        setFinalCost(repair.finalCost != null ? String(repair.finalCost) : '');
        
        try {
          setDueDate(repair.dueDate ? new Date(repair.dueDate).toISOString().substring(0, 10) : '');
        } catch { setDueDate(''); }
        
        try {
          setCompletedOn(repair.completedOn ? new Date(repair.completedOn).toISOString().substring(0, 10) : '');
        } catch { setCompletedOn(''); }
        
        setRestoresTo(repair.restoresTo || 'ACTIVE');
      } else {
        setStockItemId('');
        setName('');
        setStatus('IN PROGRESS');
        setRepairType('');
        setVendor('');
        setEstCost('');
        setFinalCost('');
        setDueDate('');
        setCompletedOn('');
        setRestoresTo('ACTIVE');
      }
    }
  }, [open, repair]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSubmit({
      stockItemId,
      name,
      status,
      repairType,
      vendor,
      estCost: parseFloat(estCost || '0'),
      finalCost: parseFloat(finalCost || '0'),
      dueDate: dueDate ? new Date(dueDate).toISOString() : '',
      completedOn: completedOn ? new Date(completedOn).toISOString() : '',
      restoresTo,
    }, repair?.repairId);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-md overflow-y-auto">
      <div className="bg-surface-container-lowest w-full max-w-2xl rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-outline-variant flex flex-col my-auto animate-fade-in-up">
        
        <div className="flex items-center justify-between p-lg border-b border-outline-variant shrink-0">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            {repair ? 'Edit Repair' : 'Add Repair'}
          </h2>
          <button 
            type="button"
            onClick={onClose}
            className="p-sm hover:bg-surface-container-highest rounded-full text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-lg flex flex-col gap-md">
          
          <div className="grid grid-cols-2 gap-md">
            <div className="flex flex-col gap-xs col-span-2">
              <label className="font-caption text-caption font-bold text-on-surface-variant">Stock Item ID *</label>
              <input 
                type="text" 
                value={stockItemId}
                onChange={e => setStockItemId(e.target.value)}
                placeholder="e.g. ITM-123456"
                className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                required 
              />
              {repair && (
                <p className="text-xs text-on-surface-variant mt-1">
                  Item: {repair.weight}ct {repair.itemName}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-xs">
              <label className="font-caption text-caption font-bold text-on-surface-variant">Status</label>
              <select 
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
              >
                <option value="IN PROGRESS">IN PROGRESS</option>
                <option value="PENDING">PENDING</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-md">
            <div className="flex flex-col gap-xs">
              <label className="font-caption text-caption font-bold text-on-surface-variant">Repair Type</label>
              <select 
                value={repairType}
                onChange={e => setRepairType(e.target.value)}
                className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
              >
                <option value="Polishing">Polishing</option>
                <option value="Recutting">Recutting</option>
                <option value="Certification Prep">Certification Prep</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="flex flex-col gap-xs">
              <label className="font-caption text-caption font-bold text-on-surface-variant">Vendor</label>
              <input 
                type="text" 
                value={vendor}
                onChange={e => setVendor(e.target.value)}
                placeholder="e.g. Acme Gems Co."
                className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-md">
            <div className="flex flex-col gap-xs">
              <label className="font-caption text-caption font-bold text-on-surface-variant">Est. Cost (₹)</label>
              <input 
                type="number" 
                value={estCost}
                onChange={e => setEstCost(e.target.value)}
                className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
              />
            </div>
            <div className="flex flex-col gap-xs">
              <label className="font-caption text-caption font-bold text-on-surface-variant">Due Date</label>
              <input 
                type="date" 
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
              />
            </div>
          </div>

          {status === 'COMPLETED' && (
            <div className="grid grid-cols-2 gap-md p-md bg-surface border border-outline-variant rounded-md">
              <div className="flex flex-col gap-xs">
                <label className="font-caption text-caption font-bold text-on-surface-variant">Final Cost (₹)</label>
                <input 
                  type="number" 
                  value={finalCost}
                  onChange={e => setFinalCost(e.target.value)}
                  className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                />
              </div>
              <div className="flex flex-col gap-xs">
                <label className="font-caption text-caption font-bold text-on-surface-variant">Completed On</label>
                <input 
                  type="date" 
                  value={completedOn}
                  onChange={e => setCompletedOn(e.target.value)}
                  className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-xs col-span-2">
            <label className="font-caption text-caption font-bold text-on-surface-variant">Name</label>
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Optional custom name"
              className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-caption text-caption font-bold text-on-surface-variant">Restores To Status</label>
            <select 
              value={restoresTo}
              onChange={e => setRestoresTo(e.target.value)}
              className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="HOLD">HOLD</option>
            </select>
          </div>

          <div className="flex justify-end gap-sm mt-md">
            <button 
              type="button" 
              onClick={onClose}
              className="px-md py-sm rounded-md font-body-md font-bold text-on-surface-variant hover:bg-surface-container"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={saving}
              className="px-md py-sm rounded-md font-body-md font-bold bg-primary text-on-primary disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Repair'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
