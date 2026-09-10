import React from 'react';
import { useTranslation } from 'react-i18next';
import { SearchableSelect, SearchOption } from '../../common/components/SearchableSelect';

interface TransactionItemsSectionProps {
  txnType: string;
  items: any[];
  handleAddItem: () => void;
  handleRemoveItem: (index: number) => void;
  handleItemChange: (index: number, field: string, value: any) => void;
  diamondOptions: SearchOption[];
  allCerts: any[];
  unlinkedCerts: any[];
  allRepairs: any[];
  parties: any[];
}

export const TransactionItemsSection: React.FC<TransactionItemsSectionProps> = ({
  txnType,
  items,
  handleAddItem,
  handleRemoveItem,
  handleItemChange,
  diamondOptions,
  allCerts,
  unlinkedCerts,
  allRepairs,
  parties,
}) => {
  const { t } = useTranslation();

  return (
    <div className="bg-[#F4F7FA] border border-outline-variant/60 rounded-xl p-lg flex flex-col gap-lg shadow-inner">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-sm">
          <div className="w-8 h-8 rounded-lg bg-[#E3F2FD] text-[#1976D2] flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px]">diamond</span>
          </div>
          <div>
            <h3 className="font-bold text-on-surface m-0 text-base">{t('Transaction Items')}</h3>
          </div>
        </div>
        <button
          type="button"
          onClick={handleAddItem}
          className="text-[#1976D2] border border-[#1976D2] bg-white hover:bg-[#E3F2FD] px-md py-sm rounded-lg flex items-center gap-xs font-bold transition-colors text-sm shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">add</span> {t('Add Another Item')}
        </button>
      </div>

      <div className="flex flex-col gap-md">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-md bg-white p-lg rounded-xl border border-outline-variant shadow-sm relative transition-all hover:shadow-md"
          >
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveItem(idx)}
                className="absolute right-4 top-4 text-error border border-error/30 bg-error/5 hover:bg-error/10 p-1.5 rounded-lg flex items-center justify-center transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            )}

            {/* Primary Row */}
            <div className={`flex flex-wrap gap-md items-end w-full ${items.length > 1 ? 'pr-12' : ''}`}>
              {(txnType === 'SALE' ||
                txnType === 'REPAIR_OUT' ||
                txnType === 'REPAIR_IN' ||
                txnType === 'CERTIFICATION' ||
                txnType === 'CERTIFICATION_IN') && (
                <div className="flex-1 min-w-[240px]">
                  <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                    Select Existing Diamond
                  </label>
                  <SearchableSelect
                    options={diamondOptions}
                    value={item.existingDiamondId}
                    onChange={(val) => handleItemChange(idx, 'existingDiamondId', val)}
                    placeholder="Search diamond..."
                    searchPlaceholder="Type stone ID, shape, carat..."
                    icon="diamond"
                  />
                </div>
              )}

              <div className="flex-1 min-w-[150px]">
                <label className="text-xs font-bold text-on-surface-variant mb-1 block flex items-center">
                  Name
                </label>
                <input
                  type="text"
                  value={item.name || ''}
                  disabled={!!item.existingDiamondId}
                  onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                  className={`w-full p-2 border border-outline-variant rounded-md focus:border-primary focus:ring-1 text-sm font-medium ${
                    item.existingDiamondId ? 'bg-gray-100' : ''
                  }`}
                  placeholder="Item Name"
                />
              </div>

              <div className="w-[100px]">
                <label className="text-xs font-bold text-error mb-1 block flex items-center">
                  Carat <span className="ml-1">*</span>
                </label>
                <input
                  type="number"
                  value={item.carat}
                  disabled={!!item.existingDiamondId}
                  onChange={(e) => handleItemChange(idx, 'carat', e.target.value)}
                  className={`w-full p-2 border border-outline-variant rounded-md focus:border-primary focus:ring-1 text-sm font-medium ${
                    item.existingDiamondId ? 'bg-gray-100' : ''
                  }`}
                  placeholder="0.00"
                />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-xs font-bold text-on-surface-variant mb-1 block">Category</label>
                <select
                  value={item.category}
                  disabled={!!item.existingDiamondId}
                  onChange={(e) => handleItemChange(idx, 'category', e.target.value)}
                  className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${
                    item.existingDiamondId ? 'bg-gray-100' : 'bg-white'
                  }`}
                >
                  <option value="SINGLE">Single</option>
                  <option value="MIX">Mix / Parcel</option>
                </select>
              </div>
              {item.category === 'MIX' && (
                <>
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                      Cert. State
                    </label>
                    <select
                      value={item.certificationState}
                      disabled={!!item.existingDiamondId}
                      onChange={(e) => handleItemChange(idx, 'certificationState', e.target.value)}
                      className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${
                        item.existingDiamondId ? 'bg-gray-100' : 'bg-white'
                      }`}
                    >
                      <option value="">Select...</option>
                      <option value="CERTIFIED">Certified</option>
                      <option value="NON_CERTIFIED">Non-Certified</option>
                    </select>
                  </div>
                  {item.certificationState && (
                    <div className="flex-1 min-w-[120px]">
                      <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                        Polish State
                      </label>
                      <select
                        value={item.polishState}
                        disabled={!!item.existingDiamondId}
                        onChange={(e) => handleItemChange(idx, 'polishState', e.target.value)}
                        className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${
                          item.existingDiamondId ? 'bg-gray-100' : 'bg-white'
                        }`}
                      >
                        <option value="">Select...</option>
                        <option value="ROUGH">Rough</option>
                        <option value="POLISHED">Polished</option>
                      </select>
                    </div>
                  )}
                </>
              )}
              <div className="flex-1 min-w-[100px]">
                <label className="text-xs font-bold text-on-surface-variant mb-1 block">Shape</label>
                <select
                  value={item.shape}
                  disabled={!!item.existingDiamondId}
                  onChange={(e) => handleItemChange(idx, 'shape', e.target.value)}
                  className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${
                    item.existingDiamondId ? 'bg-gray-100' : 'bg-white'
                  }`}
                >
                  {['Round', 'Princess', 'Cushion', 'Emerald', 'Oval', 'Pear'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[80px]">
                <label className="text-xs font-bold text-on-surface-variant mb-1 block">Color</label>
                <select
                  value={item.color}
                  disabled={!!item.existingDiamondId}
                  onChange={(e) => handleItemChange(idx, 'color', e.target.value)}
                  className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${
                    item.existingDiamondId ? 'bg-gray-100' : 'bg-white'
                  }`}
                >
                  {['D', 'E', 'F', 'G', 'H', 'I', 'J'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[80px]">
                <label className="text-xs font-bold text-on-surface-variant mb-1 block">Clarity</label>
                <select
                  value={item.clarity}
                  disabled={!!item.existingDiamondId}
                  onChange={(e) => handleItemChange(idx, 'clarity', e.target.value)}
                  className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${
                    item.existingDiamondId ? 'bg-gray-100' : 'bg-white'
                  }`}
                >
                  {['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[80px]">
                <label className="text-xs font-bold text-on-surface-variant mb-1 block">Cut</label>
                <select
                  value={item.cut}
                  disabled={!!item.existingDiamondId}
                  onChange={(e) => handleItemChange(idx, 'cut', e.target.value)}
                  className={`w-full p-2 border border-outline-variant rounded-md text-sm focus:border-primary focus:ring-1 ${
                    item.existingDiamondId ? 'bg-gray-100' : 'bg-white'
                  }`}
                >
                  {['EX', 'VG', 'G', 'F', 'P'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[80px]">
                <label className="text-xs font-bold text-on-surface-variant mb-1 block">Sym.</label>
                <select
                  value={item.symmetry}
                  disabled={!!item.existingDiamondId}
                  onChange={(e) => handleItemChange(idx, 'symmetry', e.target.value)}
                  className={`w-full p-2 border border-outline-variant rounded-md bg-white text-sm focus:border-primary focus:ring-1 ${
                    item.existingDiamondId ? 'bg-gray-100' : ''
                  }`}
                >
                  {['EX', 'VG', 'G', 'F', 'P'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[80px]">
                <label className="text-xs font-bold text-on-surface-variant mb-1 block">Pol.</label>
                <select
                  value={item.polish}
                  disabled={!!item.existingDiamondId}
                  onChange={(e) => handleItemChange(idx, 'polish', e.target.value)}
                  className={`w-full p-2 border border-outline-variant rounded-md bg-white text-sm focus:border-primary focus:ring-1 ${
                    item.existingDiamondId ? 'bg-gray-100' : ''
                  }`}
                >
                  {['EX', 'VG', 'G', 'F', 'P'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[100px]">
                <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                  Rate / Ct (₹)
                </label>
                <input
                  type="number"
                  value={item.ratePerCarat}
                  onChange={(e) => handleItemChange(idx, 'ratePerCarat', e.target.value)}
                  className="w-full p-2 border border-outline-variant rounded-md focus:border-primary focus:ring-1 text-sm font-medium"
                  placeholder="0.00"
                />
              </div>
              <div className="flex-1 min-w-[100px]">
                <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                  Total Value (₹)
                </label>
                <input
                  type="number"
                  value={item.totalValue}
                  readOnly
                  className="w-full p-2 border border-outline-variant rounded-md bg-[#FAFAFA] font-bold text-primary text-sm shadow-inner"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-lg w-full mt-2">
              {/* Inline Certificate Linking */}
              {(txnType === 'PURCHASE' ||
                txnType === 'CERTIFICATION' ||
                txnType === 'CERTIFICATION_IN') && (
                <div className="flex-1 border border-[#A5D6A7] bg-[#F1F8E9]/60 rounded-xl p-md flex flex-col gap-md transition-colors hover:bg-[#F1F8E9]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-xs text-[#2E7D32]">
                      <span className="material-symbols-outlined text-[18px]">verified_user</span>
                      <span className="font-bold text-sm">
                        Certification {txnType === 'CERTIFICATION_IN' ? 'Receipt' : '(Optional)'}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-[#A5D6A7]">
                      expand_less
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-md items-end w-full">
                    {txnType === 'CERTIFICATION_IN' ? (
                      <div className="flex-1 min-w-[150px]">
                        <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                          Pending Certificate
                        </label>
                        <select
                          value={item.linkedCertificateId}
                          onChange={(e) => handleItemChange(idx, 'linkedCertificateId', e.target.value)}
                          className="w-full p-2 border border-[#C8E6C9] rounded-md bg-white text-sm focus:border-[#4CAF50] focus:ring-1"
                        >
                          <option value="">Select Pending...</option>
                          {allCerts
                            .filter(
                              (c) =>
                                c.diamondItemId === item.existingDiamondId &&
                                c.certificateStatus === 'PENDING'
                            )
                            .map((cert) => (
                              <option key={cert.id} value={cert.id}>
                                {cert.labType} - {cert.name || 'Unnamed'}
                              </option>
                            ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        {unlinkedCerts.length > 0 && txnType === 'PURCHASE' && (
                          <div className="flex-1 min-w-[120px]">
                            <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                              Existing Cert
                            </label>
                            <select
                              value={item.linkedCertificateId}
                              onChange={(e) => handleItemChange(idx, 'linkedCertificateId', e.target.value)}
                              className="w-full p-2 border border-[#C8E6C9] rounded-md bg-white text-sm focus:border-[#4CAF50] focus:ring-1"
                            >
                              <option value="">None</option>
                              {unlinkedCerts.map((cert) => (
                                <option key={cert.certificateId} value={cert.certificateId}>
                                  {cert.reportNumber || cert.certificateId}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="flex-1 min-w-[100px]">
                          <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                            Cert. Lab
                          </label>
                          <select
                            value={item.labType}
                            onChange={(e) => handleItemChange(idx, 'labType', e.target.value)}
                            className="w-full p-2 border border-[#C8E6C9] rounded-md bg-white text-sm focus:border-[#4CAF50] focus:ring-1"
                          >
                            <option value="">None</option>
                            {['GIA', 'IGI', 'HRD', 'OTHER'].map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    {(item.labType || txnType === 'CERTIFICATION_IN') && (
                      <>
                        {txnType !== 'CERTIFICATION_IN' && (
                          <div className="flex-1 min-w-[150px]">
                            <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                              Report / Notes
                            </label>
                            <input
                              type="text"
                              value={item.internalNotes}
                              onChange={(e) => handleItemChange(idx, 'internalNotes', e.target.value)}
                              className="w-full p-2 border border-[#C8E6C9] rounded-md text-sm focus:border-[#4CAF50] focus:ring-1"
                              placeholder="Report # or notes..."
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-[100px]">
                          <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                            {txnType === 'CERTIFICATION_IN' ? 'Final Cost (₹)' : 'Est. Cost (₹)'}
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-on-surface-variant text-sm">
                              ₹
                            </span>
                            <input
                              type="number"
                              value={item.certCost}
                              onChange={(e) => handleItemChange(idx, 'certCost', e.target.value)}
                              className="w-full pl-6 pr-2 py-2 border border-[#C8E6C9] rounded-md text-sm focus:border-[#4CAF50] focus:ring-1"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Inline Repair Linking */}
              {(txnType === 'PURCHASE' || txnType === 'REPAIR_OUT' || txnType === 'REPAIR_IN') && (
                <div className="flex-1 border border-[#CE93D8] bg-[#F3E5F5]/60 rounded-xl p-md flex flex-col gap-md transition-colors hover:bg-[#F3E5F5]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-xs text-[#6A1B9A]">
                      <span className="material-symbols-outlined text-[18px]">build</span>
                      <span className="font-bold text-sm">
                        Repair {txnType === 'REPAIR_IN' ? 'Receipt' : '(Optional)'}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-[#CE93D8]">
                      expand_less
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-md items-end w-full">
                    {txnType === 'REPAIR_IN' ? (
                      <div className="flex-1 min-w-[150px]">
                        <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                          Pending Repair
                        </label>
                        <select
                          value={item.linkedRepairId}
                          onChange={(e) => handleItemChange(idx, 'linkedRepairId', e.target.value)}
                          className="w-full p-2 border border-[#E1BEE7] rounded-md bg-white text-sm focus:border-[#9C27B0] focus:ring-1"
                        >
                          <option value="">Select Pending...</option>
                          {allRepairs
                            .filter(
                              (r) =>
                                r.diamondItemId === item.existingDiamondId &&
                                (r.status === 'PENDING' || r.status === 'IN_PROGRESS')
                            )
                            .map((rep) => (
                              <option key={rep.id} value={rep.id}>
                                {rep.repairType} - {rep.name || 'Unnamed'}
                              </option>
                            ))}
                        </select>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-[120px]">
                        <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                          Repair Type
                        </label>
                        <select
                          value={item.repairType}
                          onChange={(e) => handleItemChange(idx, 'repairType', e.target.value)}
                          className="w-full p-2 border border-[#E1BEE7] rounded-md bg-white text-sm focus:border-[#9C27B0] focus:ring-1"
                        >
                          <option value="">No Repair</option>
                          {['Polishing', 'Cutting', 'Boiling', 'Symmetry', 'Other'].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {(item.repairType || txnType === 'REPAIR_IN') && (
                      <>
                        {txnType !== 'REPAIR_IN' && (
                          <div className="flex-1 min-w-[150px]">
                            <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                              Vendor
                            </label>
                            <select
                              value={item.repairVendorId}
                              onChange={(e) => handleItemChange(idx, 'repairVendorId', e.target.value)}
                              className="w-full p-2 border border-[#E1BEE7] rounded-md bg-white text-sm focus:border-[#9C27B0] focus:ring-1"
                            >
                              <option value="">Select Vendor</option>
                              {parties
                                .filter(
                                  (p) =>
                                    p.type === 'WORKSHOP' ||
                                    p.partyName?.toUpperCase().includes('WORKSHOP')
                                )
                                .map((p) => (
                                  <option key={p.partyId} value={p.partyId}>
                                    {p.partyName}
                                  </option>
                                ))}
                              {parties.map((p) => (
                                <option key={p.partyId} value={p.partyId}>
                                  {p.partyName}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="flex-1 min-w-[100px]">
                          <label className="text-xs font-bold text-on-surface-variant mb-1 block">
                            {txnType === 'REPAIR_IN' ? 'Final Cost (₹)' : 'Est. Cost (₹)'}
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-on-surface-variant text-sm">
                              ₹
                            </span>
                            <input
                              type="number"
                              value={item.repairCost}
                              onChange={(e) => handleItemChange(idx, 'repairCost', e.target.value)}
                              className="w-full pl-6 pr-2 py-2 border border-[#E1BEE7] rounded-md text-sm focus:border-[#9C27B0] focus:ring-1"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleAddItem}
        className="w-full py-3 border border-dashed border-[#1976D2]/50 text-[#1976D2] bg-white hover:bg-[#E3F2FD]/50 rounded-xl flex items-center justify-center gap-xs font-bold transition-all mt-2"
      >
        <span className="material-symbols-outlined text-[20px]">add_circle</span> Add Another Item
      </button>
    </div>
  );
};
