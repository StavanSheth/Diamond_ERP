import { request, requestBlob, requestUpload } from './client';
import { buildFilterQueryString } from './stocks.api';
import { AdvancedItemFilters } from '../../types/stock';

export const certificatesApi = {
  /** Get all certificates */
  getCertificates(filters?: AdvancedItemFilters): Promise<{ success: boolean; data: any[] }> {
    return request(`/api/certificates${buildFilterQueryString(filters)}`);
  },

  /** Create a certificate */
  createCertificate(data: any): Promise<any> {
    return request('/api/certificates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Update a certificate */
  updateCertificate(id: string, data: any): Promise<any> {
    return request(`/api/certificates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /** Delete a certificate */
  deleteCertificate(id: string): Promise<any> {
    return request(`/api/certificates/${id}`, {
      method: 'DELETE',
    });
  },

  /** Upload certificate file */
  uploadCertificateFile(file: File): Promise<{ success: boolean; data: { path: string } }> {
    const formData = new FormData();
    formData.append('file', file);
    return requestUpload('/api/certificates/upload', formData);
  },

  /**
   * Open Certificate PDF Securely.
   * Cleans up object URL after viewing to prevent memory leaks (Finding 47).
   */
  async openCertificatePdf(id: string): Promise<void> {
    const blob = await requestBlob(`/api/certificates/${id}/file`);
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Revoke object URL after delay to release blob memory
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 60000);
  },

  /** Get unlinked certificates */
  getUnlinkedCertificates(): Promise<{ success: boolean; data: any[] }> {
    return request('/api/certificates/unlinked');
  },

  /** Link a certificate to a diamond item */
  linkCertificate(certId: string, diamondItemId: string): Promise<any> {
    return request(`/api/certificates/${certId}/link`, {
      method: 'POST',
      body: JSON.stringify({ diamondItemId }),
    });
  },
};
