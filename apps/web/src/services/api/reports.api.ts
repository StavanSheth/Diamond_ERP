import { request, requestBlob } from './client';

export const reportsApi = {
  getReports(): Promise<any> {
    return request('/api/reports');
  },

  getReportPreview(params?: Record<string, any>): Promise<{
    success: boolean;
    title: string;
    subtitle: string;
    columns: Array<{ key: string; header: string; align?: 'left' | 'center' | 'right'; width?: number }>;
    rows: any[];
    kpis: Array<{ label: string; value: string | number; color?: string }>;
    entityProfile?: any;
  }> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          if (v.length > 0) searchParams.append(k, v.join(','));
        } else if (v !== undefined && v !== null && v !== '') {
          searchParams.append(k, String(v));
        }
      });
    }
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request(`/api/reports/preview${qs}`);
  },

  async downloadReportExcel(params?: Record<string, any>, customFilename?: string): Promise<void> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          if (v.length > 0) searchParams.append(k, v.join(','));
        } else if (v !== undefined && v !== null && v !== '') {
          searchParams.append(k, String(v));
        }
      });
    }
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const blob = await requestBlob(`/api/reports/export/excel${qs}`);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      customFilename ||
      `DiamondERP_${params?.reportType || 'Report'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
};
