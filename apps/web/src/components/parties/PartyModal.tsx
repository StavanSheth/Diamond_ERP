import React, { useState, useEffect } from 'react';

interface PartyModalProps {
  open: boolean;
  party: any | null;
  onClose: () => void;
  onSubmit: (data: any, id?: string) => Promise<void>;
}

export const PartyModal: React.FC<PartyModalProps> = ({ open, party, onClose, onSubmit }) => {
  const [saving, setSaving] = useState(false);
  
  const [partyName, setPartyName] = useState('');
  const [type, setType] = useState('CUSTOMER');
  const [outstandingBalance, setOutstandingBalance] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      if (party) {
        setPartyName(party.partyName);
        setType(party.type);
        setOutstandingBalance(party.outstandingBalance.toString());
        setNotes(party.notes || '');
      } else {
        setPartyName('');
        setType('CUSTOMER');
        setOutstandingBalance('');
        setNotes('');
      }
    }
  }, [open, party]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSubmit({
      partyName,
      type,
      outstandingBalance: parseFloat(outstandingBalance || '0'),
      notes
    }, party?.partyId);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-md">
      <div className="bg-surface-container-lowest w-full max-w-md rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-outline-variant flex flex-col animate-fade-in-up">
        
        <div className="flex items-center justify-between p-lg border-b border-outline-variant">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            {party ? 'Edit Party' : 'Add Party'}
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
          <div className="flex flex-col gap-xs">
            <label className="font-caption text-caption font-bold text-on-surface-variant">Party Name *</label>
            <input 
              type="text" 
              value={partyName}
              onChange={e => setPartyName(e.target.value)}
              className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
              required 
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-caption text-caption font-bold text-on-surface-variant">Type</label>
            <select 
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
            >
              <option value="CUSTOMER">Customer</option>
              <option value="SUPPLIER">Supplier</option>
              <option value="WORKSHOP">Workshop</option>
              <option value="CERTIFICATION_LAB">Certification Lab</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-caption text-caption font-bold text-on-surface-variant">Outstanding Balance (₹)</label>
            <input 
              type="number" 
              value={outstandingBalance}
              onChange={e => setOutstandingBalance(e.target.value)}
              className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-caption text-caption font-bold text-on-surface-variant">Notes / Warnings (Optional)</label>
            <input 
              type="text" 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Missing KYC docs"
              className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
            />
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
              {saving ? 'Saving...' : 'Save Party'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
