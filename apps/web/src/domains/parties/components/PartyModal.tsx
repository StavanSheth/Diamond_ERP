import React, { useState, useEffect } from 'react';
import { BaseModal } from '../../common/components/BaseModal';
import { PARTY_TYPES, isBrokerType } from '../types/partyTypes';

interface PartyModalProps {
  open: boolean;
  party: any | null;
  zIndex?: string;
  onClose: () => void;
  onSubmit: (data: any, id?: string) => Promise<void>;
}

export const PartyModal: React.FC<PartyModalProps> = ({ open, party, zIndex, onClose, onSubmit }) => {
  const [saving, setSaving] = useState(false);
  const [partyName, setPartyName] = useState('');
  const [type, setType] = useState('CUSTOMER');
  const [brokeragePercentage, setBrokeragePercentage] = useState('');
  const [outstandingBalance, setOutstandingBalance] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (party) {
        setPartyName(party.partyName || party.name || '');
        setType(party.type || party.partyType || 'CUSTOMER');
        setBrokeragePercentage(
          party.brokeragePercentage != null && Number(party.brokeragePercentage) > 0
            ? String(party.brokeragePercentage)
            : ''
        );
        setOutstandingBalance(
          party.outstandingBalance !== undefined && party.outstandingBalance !== null
            ? String(party.outstandingBalance)
            : '0'
        );
        setPhone(party.phone || '');
        setEmail(party.email || '');
        setAddress(party.address || '');
        setGstin(party.gstin || '');
        setNotes(party.notes || '');
      } else {
        setPartyName('');
        setType('CUSTOMER');
        setBrokeragePercentage('');
        setOutstandingBalance('0');
        setPhone('');
        setEmail('');
        setAddress('');
        setGstin('');
        setNotes('');
      }
      setError(null);
    }
  }, [open, party]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyName.trim()) {
      setError('Party name is required.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSubmit(
        {
          partyName: partyName.trim(),
          name: partyName.trim(),
          type,
          partyType: type,
          brokeragePercentage: isBrokerType(type) && brokeragePercentage ? parseFloat(brokeragePercentage) : 0,
          outstandingBalance: parseFloat(outstandingBalance || '0'),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          gstin: gstin.trim().toUpperCase() || undefined,
          notes: notes.trim() || undefined,
        },
        party?.partyId || party?.id
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save party record');
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
        onClick={handleSubmit}
        disabled={saving}
        className="flex items-center gap-xs px-lg py-sm rounded-lg font-body-md font-semibold bg-primary text-on-primary hover:bg-surface-tint shadow-xs transition-all disabled:opacity-50"
      >
        {saving && <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>}
        {party ? 'Update Party' : 'Create Party'}
      </button>
    </>
  );

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={party ? 'Edit Party' : 'Add Party'}
      subtitle={party ? `Manage profile for ${party.partyName || party.name}` : 'Register a new customer, vendor, or workshop.'}
      icon="domain"
      maxWidth="2xl"
      zIndex={zIndex}
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-md">
        {error && (
          <div className="bg-error-container text-on-error-container px-md py-sm rounded-lg text-sm flex items-center gap-2 border border-error/20">
            <span className="material-symbols-outlined text-[18px]">error</span>
            {error}
          </div>
        )}

        {/* Section 1: Account Identity & Classification */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
          <div className="h-1 bg-blue-600" />
          <div className="p-lg flex flex-col gap-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-[18px]">person</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                  1. Account Identity & Classification
                </h3>
                <p className="text-[11px] text-on-surface-variant m-0">
                  Party company or individual name, trading role, and brokerage terms
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md pt-xs">
              <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                  Party / Company Name *
                </label>
                <input
                  type="text"
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  placeholder="e.g. Acme Gems Co. / Harshil Jewels"
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                  required
                />
              </div>

              <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                  Party Type / Trading Role
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md font-medium"
                >
                  {PARTY_TYPES.map((pt) => (
                    <option key={pt.value} value={pt.value}>
                      {pt.label}
                    </option>
                  ))}
                </select>
              </div>

              {isBrokerType(type) && (
                <div className="flex flex-col gap-xs col-span-1 md:col-span-2 bg-purple-50/80 border border-purple-200 p-md rounded-xl animate-fade-in">
                  <label className="font-caption text-caption font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] text-purple-600">percent</span>
                    Default Brokerage Commission (%)
                  </label>
                  <div className="flex items-center gap-sm">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={brokeragePercentage}
                      onChange={(e) => setBrokeragePercentage(e.target.value)}
                      placeholder="e.g. 1.0 or 2.0"
                      className="w-full px-md py-2 border border-purple-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-500 text-on-surface font-body-md"
                    />
                    <span className="text-sm font-bold text-purple-800">%</span>
                  </div>
                  <p className="text-[11px] text-purple-700 m-0">
                    This rate will automatically pre-fill brokerage calculations whenever this broker is selected in transactions.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Contact & Tax Information */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
          <div className="h-1 bg-amber-500" />
          <div className="p-lg flex flex-col gap-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-[18px]">contact_phone</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                  2. Contact & Tax Information
                </h3>
                <p className="text-[11px] text-on-surface-variant m-0">
                  Communication channels, GSTIN tax registration, and physical office address
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md pt-xs">
              <div className="flex flex-col gap-xs">
                <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                />
              </div>

              <div className="flex flex-col gap-xs">
                <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@company.com"
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                />
              </div>

              <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    GSTIN Number
                  </label>
                  <span className="text-[11px] text-on-surface-variant font-medium">(Optional)</span>
                </div>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="e.g. 27AAAAA0000A1Z5"
                  maxLength={15}
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md uppercase font-mono tracking-wider"
                />
              </div>

              <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                    Office / Billing Address
                  </label>
                  <span className="text-[11px] text-on-surface-variant font-medium">(Optional)</span>
                </div>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Suite 402, Bharat Diamond Bourse, BKC, Mumbai"
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Financial Balance & Operational Notes */}
        <div className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
          <div className="h-1 bg-emerald-600" />
          <div className="p-lg flex flex-col gap-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                  3. Financial Balance & Operational Notes
                </h3>
                <p className="text-[11px] text-on-surface-variant m-0">
                  Initial opening balance, credit terms, and internal party remarks
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md pt-xs">
              <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                  Opening Outstanding Balance (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-caption text-on-surface-variant font-semibold">
                    ₹
                  </span>
                  <input
                    type="number"
                    value={outstandingBalance}
                    onChange={(e) => setOutstandingBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md font-medium"
                  />
                </div>
                <p className="text-[11px] text-on-surface-variant m-0">
                  Positive balance indicates amount receivable from party; negative indicates payable.
                </p>
              </div>

              <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
                  Operational Notes / Payment Terms (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. VIP client, requires net-30 payment terms, contact via manager"
                  className="w-full px-md py-2 border border-outline-variant rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </BaseModal>
  );
};
