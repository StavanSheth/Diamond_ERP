import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { BaseModal } from '../../common/components/BaseModal';

interface EditCertificateModalProps {
  open: boolean;
  certificate: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditCertificateModal: React.FC<EditCertificateModalProps> = ({
  open,
  certificate,
  onClose,
  onSuccess,
}) => {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [labType, setLabType] = useState('GIA');
  const [reportNumber, setReportNumber] = useState('');
  const [cost, setCost] = useState('');
  const [measurements, setMeasurements] = useState('');
  const [polish, setPolish] = useState('EX');
  const [symmetry, setSymmetry] = useState('EX');
  const [fluorescence, setFluorescence] = useState('None');
  const [pdfPath, setPdfPath] = useState('');

  useEffect(() => {
    if (open && certificate) {
      setLabType(certificate.labType || 'GIA');
      setReportNumber(certificate.reportNumber || '');
      setCost(certificate.cost ? String(certificate.cost) : '');
      setMeasurements(certificate.measurements || '');
      setPolish(certificate.polish || 'EX');
      setSymmetry(certificate.symmetry || 'EX');
      setFluorescence(certificate.fluorescence || 'None');
      setPdfPath(certificate.pdfPath || '');
      setError(null);
    }
  }, [open, certificate]);

  if (!open || !certificate) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);
      const res = await api.uploadCertificateFile(file);
      if (res.success) {
        setPdfPath(res.data.path);
      }
    } catch (err: any) {
      setError('File upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);

      await api.updateCertificate(certificate.certificateId || certificate.id, {
        labType,
        reportNumber: reportNumber.trim(),
        cost: Number(cost) || 0,
        measurements: measurements.trim(),
        polish,
        symmetry,
        fluorescence,
        pdfPath,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update certificate');
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={saving || uploading}
        className="px-md py-sm rounded-lg font-body-md font-semibold text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving || uploading}
        className="flex items-center gap-xs px-lg py-sm rounded-lg font-body-md font-semibold bg-primary text-on-primary hover:bg-surface-tint shadow-xs transition-all disabled:opacity-50"
      >
        {saving && <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>}
        Save Changes
      </button>
    </>
  );

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title="Edit Certificate Details"
      subtitle={`Report: ${certificate.reportNumber || 'Unassigned'} • Stock: ${certificate.stockName || (certificate.stockItemId ? 'Diamond Stock' : 'Unlinked')}`}
      icon="description"
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <div className="flex flex-col gap-xs">
            <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
              Grading Lab
            </label>
            <select
              value={labType}
              onChange={(e) => setLabType(e.target.value)}
              className="w-full px-md py-sm border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
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
            <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
              Report Number
            </label>
            <input
              type="text"
              value={reportNumber}
              onChange={(e) => setReportNumber(e.target.value)}
              placeholder="e.g. 5214896321"
              className="w-full px-md py-sm border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
              Cost (₹)
            </label>
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
              className="w-full px-md py-sm border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
              Measurements (mm)
            </label>
            <input
              type="text"
              value={measurements}
              onChange={(e) => setMeasurements(e.target.value)}
              placeholder="e.g. 6.45 - 6.48 x 3.98 mm"
              className="w-full px-md py-sm border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
              Polish
            </label>
            <select
              value={polish}
              onChange={(e) => setPolish(e.target.value)}
              className="w-full px-md py-sm border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
            >
              {['EX', 'VG', 'GD', 'FR'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
              Symmetry
            </label>
            <select
              value={symmetry}
              onChange={(e) => setSymmetry(e.target.value)}
              className="w-full px-md py-sm border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
            >
              {['EX', 'VG', 'GD', 'FR'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
            <label className="font-caption text-caption font-bold text-on-surface-variant uppercase tracking-wider">
              Fluorescence
            </label>
            <select
              value={fluorescence}
              onChange={(e) => setFluorescence(e.target.value)}
              className="w-full px-md py-sm border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-on-surface font-body-md"
            >
              {['None', 'Faint', 'Medium Blue', 'Strong Blue', 'Very Strong Blue'].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* Certificate PDF Upload */}
          <div className="flex flex-col gap-xs col-span-1 md:col-span-2 border border-outline-variant rounded-xl p-md bg-surface-container-low">
            <label className="font-caption text-caption font-bold text-on-surface flex items-center justify-between">
              <span>Certificate PDF Document</span>
              {pdfPath && (
                <span className="text-xs text-[#2E7D32] flex items-center gap-1 font-semibold">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  PDF Uploaded
                </span>
              )}
            </label>
            <div className="flex items-center gap-md mt-1">
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileUpload}
                disabled={uploading}
                className="text-xs text-on-surface-variant file:mr-md file:py-xs file:px-md file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-on-primary hover:file:bg-surface-tint cursor-pointer"
              />
              {uploading && (
                <span className="text-xs text-primary flex items-center gap-1 font-medium">
                  <span className="material-symbols-outlined animate-spin text-[16px]">sync</span>
                  Uploading...
                </span>
              )}
            </div>
            {pdfPath && (
              <p className="text-[11px] text-outline mt-1 font-mono truncate">
                Path: {pdfPath}
              </p>
            )}
          </div>
        </div>
      </form>
    </BaseModal>
  );
};
