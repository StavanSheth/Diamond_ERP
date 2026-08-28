import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface EditCertificateModalProps {
  open: boolean;
  certificate: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditCertificateModal: React.FC<EditCertificateModalProps> = ({ open, certificate, onClose, onSuccess }) => {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [labType, setLabType] = useState('');
  const [reportNumber, setReportNumber] = useState('');
  const [cost, setCost] = useState('');
  
  const [measurements, setMeasurements] = useState('');
  const [polish, setPolish] = useState('');
  const [symmetry, setSymmetry] = useState('');
  const [fluorescence, setFluorescence] = useState('');
  
  const [pdfPath, setPdfPath] = useState('');
  const [proportionPath, setProportionPath] = useState('');
  const [inclusionPath, setInclusionPath] = useState('');

  useEffect(() => {
    if (open && certificate) {
      setLabType(certificate.labType || '');
      setReportNumber(certificate.reportNumber || '');
      setCost(certificate.cost ? String(certificate.cost) : '');
      
      setMeasurements(certificate.measurements || '');
      setPolish(certificate.polish || '');
      setSymmetry(certificate.symmetry || '');
      setFluorescence(certificate.fluorescence || '');
      
      setPdfPath(certificate.pdfPath || '');
      setProportionPath(certificate.proportionDiagramPath || '');
      setInclusionPath(certificate.inclusionPlotPath || '');
      
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

      await api.updateCertificate(certificate.certificateId, {
        labType,
        reportNumber,
        cost: Number(cost) || 0,
        measurements,
        polish,
        symmetry,
        fluorescence,
        pdfPath,
        proportionDiagramPath: proportionPath,
        inclusionPlotPath: inclusionPath
      });
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update certificate');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-sm sm:p-md bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-3xl flex flex-col max-h-[95vh] animate-slide-up overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-xl py-lg border-b border-outline-variant bg-surface-container-lowest">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-sm">
              Edit Certificate: {labType || 'NEW'} {reportNumber || ''}
            </h2>
            <div className="flex items-center gap-sm mt-2">
              <span className="px-2 py-1 bg-primary text-on-primary text-[10px] font-bold rounded-full uppercase tracking-wider">
                WF009: Receive & Complete
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">folder</span>
                Partition: Harshil
              </span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-xl flex flex-col gap-xl">
            
            {error && (
              <div className="bg-error-container text-on-error-container p-sm rounded-lg text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {error}
              </div>
            )}

            {!certificate.stockItemId && (
              <div className="bg-primary/10 border-l-4 border-primary rounded-r-lg p-md flex gap-md">
                <span className="material-symbols-outlined text-primary">info</span>
                <div>
                  <h4 className="font-title-sm text-on-surface mb-1">Not linked to inventory</h4>
                  <p className="font-body-sm text-on-surface-variant">This certificate record is currently isolated. Completing this form will finalize the lab data before it can be assigned to a physical stock item.</p>
                </div>
              </div>
            )}

            {/* Lab & Identity */}
            <section>
              <h3 className="font-title-md text-title-md text-primary flex items-center gap-xs mb-md pb-xs border-b border-outline-variant">
                <span className="material-symbols-outlined text-[20px]">science</span>
                Lab & Identity
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                <label className="flex flex-col gap-xs">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Lab Type</span>
                  <select
                    value={labType}
                    onChange={e => setLabType(e.target.value)}
                    className="px-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary outline-none"
                  >
                    <option value="">Select...</option>
                    <option value="GIA">GIA</option>
                    <option value="IGI">IGI</option>
                    <option value="HRD">HRD</option>
                  </select>
                </label>
                <label className="flex flex-col gap-xs">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Report Number</span>
                  <input
                    type="text"
                    value={reportNumber}
                    onChange={e => setReportNumber(e.target.value)}
                    className="px-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary outline-none"
                  />
                </label>
                <label className="flex flex-col gap-xs">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Certificate Cost (INR)</span>
                  <div className="relative">
                    <span className="absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">₹</span>
                    <input
                      type="number"
                      value={cost}
                      onChange={e => setCost(e.target.value)}
                      className="w-full pl-xl pr-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary outline-none"
                    />
                  </div>
                </label>
              </div>
            </section>

            <section>
              <h3 className="font-title-md text-title-md text-primary flex items-center gap-xs mb-md pb-xs border-b border-outline-variant">
                <span className="material-symbols-outlined text-[20px]">diamond</span>
                Physical Specification
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                <label className="flex flex-col gap-xs">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Measurements (mm)</span>
                  <input
                    type="text"
                    value={measurements}
                    onChange={e => setMeasurements(e.target.value)}
                    placeholder="e.g. 6.45 - 6.49 x 4.01"
                    className="px-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary outline-none"
                  />
                </label>

                <label className="flex flex-col gap-xs">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Symmetry</span>
                  <select
                    value={symmetry}
                    onChange={e => setSymmetry(e.target.value)}
                    className="px-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary outline-none"
                  >
                    <option value="">Select...</option>
                    <option value="Excellent">Excellent</option>
                    <option value="Very Good">Very Good</option>
                    <option value="Good">Good</option>
                  </select>
                </label>
                <label className="flex flex-col gap-xs">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Polish</span>
                  <select
                    value={polish}
                    onChange={e => setPolish(e.target.value)}
                    className="px-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary outline-none"
                  >
                    <option value="">Select...</option>
                    <option value="Excellent">Excellent</option>
                    <option value="Very Good">Very Good</option>
                    <option value="Good">Good</option>
                  </select>
                </label>
                <label className="flex flex-col gap-xs">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Fluorescence</span>
                  <select
                    value={fluorescence}
                    onChange={e => setFluorescence(e.target.value)}
                    className="px-md py-sm bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary outline-none"
                  >
                    <option value="">Select...</option>
                    <option value="None">None</option>
                    <option value="Faint">Faint</option>
                    <option value="Medium">Medium</option>
                    <option value="Strong">Strong</option>
                  </select>
                </label>
              </div>
            </section>

            {/* Documents & Media */}
            <section>
              <h3 className="font-title-md text-title-md text-primary flex items-center gap-xs mb-md pb-xs border-b border-outline-variant">
                <span className="material-symbols-outlined text-[20px]">upload_file</span>
                Documents & Media
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                
                {/* PDF Upload Simulator -> Real Upload */}
                <div className="border-2 border-dashed border-outline-variant rounded-xl flex flex-col items-center justify-center p-xl bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer group relative overflow-hidden">
                  <input 
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    accept=".pdf,.jpg,.jpeg,.png"
                  />
                  
                  {uploading ? (
                    <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-primary mb-md animate-spin">
                      <span className="material-symbols-outlined text-[24px]">sync</span>
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-on-primary mb-md group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-[24px]">picture_as_pdf</span>
                    </div>
                  )}
                  
                  <h4 className="font-title-sm text-on-surface">Lab Report PDF</h4>
                  <p className="font-caption text-on-surface-variant mt-1">
                    {uploading ? 'Uploading...' : 'Drag & drop or click to upload'}
                  </p>
                  <p className="font-caption text-outline mt-1 text-[10px]">PDF, JPG, PNG (MAX 10MB)</p>
                  
                  <input
                    type="text"
                    value={pdfPath}
                    onChange={e => setPdfPath(e.target.value)}
                    placeholder="Or enter PDF path URL manually"
                    className="mt-4 px-md py-sm bg-surface w-[90%] border border-outline-variant rounded-lg focus:border-primary outline-none text-xs relative z-20"
                    onClick={e => e.stopPropagation()}
                  />
                </div>

                <div className="flex flex-col gap-sm">
                  {/* Proportion Diagram */}
                  <div className="flex items-center gap-md p-sm bg-surface-container-lowest border border-outline-variant rounded-lg">
                    <div className="w-10 h-10 rounded bg-surface-container-high flex items-center justify-center">
                      <span className="material-symbols-outlined text-on-surface-variant">bar_chart</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-label-md text-on-surface">Proportion Diagram</h4>
                      <input 
                        type="text" 
                        value={proportionPath}
                        onChange={e => setProportionPath(e.target.value)}
                        placeholder="Path to diagram image..."
                        className="w-full mt-1 bg-transparent border-b border-outline-variant focus:border-primary outline-none text-xs pb-1"
                      />
                    </div>
                    <button type="button" className="text-primary hover:bg-surface-container p-1 rounded">
                      <span className="material-symbols-outlined text-[20px]">add</span>
                    </button>
                  </div>

                  {/* Inclusion Plot */}
                  <div className="flex items-center gap-md p-sm bg-surface-container-lowest border border-outline-variant rounded-lg">
                    <div className="w-10 h-10 rounded bg-surface-container-high flex items-center justify-center">
                      <span className="material-symbols-outlined text-on-surface-variant">scatter_plot</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-label-md text-on-surface">Inclusion Plot</h4>
                      <input 
                        type="text" 
                        value={inclusionPath}
                        onChange={e => setInclusionPath(e.target.value)}
                        placeholder="Path to plot image..."
                        className="w-full mt-1 bg-transparent border-b border-outline-variant focus:border-primary outline-none text-xs pb-1"
                      />
                    </div>
                    <button type="button" className="text-primary hover:bg-surface-container p-1 rounded">
                      <span className="material-symbols-outlined text-[20px]">add</span>
                    </button>
                  </div>
                </div>

              </div>
            </section>
            
          </div>

          <div className="px-xl py-lg border-t border-outline-variant bg-surface-container-lowest flex justify-end gap-md">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-lg py-sm font-label-lg text-label-lg text-on-surface hover:bg-surface-container rounded-full transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-xs px-lg py-sm font-label-lg text-label-lg bg-primary text-on-primary hover:bg-surface-tint rounded-full shadow-sm transition-all disabled:opacity-50"
            >
              {saving ? (
                <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
              ) : (
                <span className="material-symbols-outlined text-[18px]">check</span>
              )}
              Update & Complete
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
