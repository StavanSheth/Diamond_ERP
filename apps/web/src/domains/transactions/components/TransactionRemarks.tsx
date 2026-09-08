import React from 'react';

interface TransactionRemarksProps {
  remarks: string;
  setRemarks: (val: string) => void;
}

export const TransactionRemarks: React.FC<TransactionRemarksProps> = ({ remarks, setRemarks }) => {
  return (
    <div className="bg-[#FFFDF3] border border-[#FFE082] rounded-xl p-md flex flex-col gap-sm">
      <div className="flex items-center gap-xs text-[#F57F17] px-1">
        <span className="material-symbols-outlined text-[18px]">edit_note</span>
        <span className="font-bold text-sm">Remarks (Optional)</span>
      </div>
      <div className="relative">
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Enter transaction remarks, notes or any additional information..."
          maxLength={500}
          className="w-full p-4 border border-outline-variant/60 rounded-lg bg-white text-on-surface focus:outline-none focus:border-[#FFCA28] focus:ring-1 text-sm resize-none h-24 shadow-inner"
        />
        <div className="absolute bottom-3 right-3 text-xs text-on-surface-variant font-medium">
          {remarks.length} / 500
        </div>
      </div>
    </div>
  );
};
