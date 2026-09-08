import { ApiResponse, StockItem, CreateStockDTO, UpdateStockDTO, DashboardData, HealthResponse, LedgerEntry, LedgerStockOption } from '../types/stock';

const BASE_URL = '';

/**
 * API client for DiamondERP backend.
 * Uses fetch with proper error handling.
 */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error || `Request failed with status ${res.status}`, res.status, data);
  }

  return data as T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface AdvancedItemFilters {
  category?: string;
  transactionType?: string;
  shape?: string;
  color?: string;
  clarity?: string;
  cut?: string;
  symmetry?: string;
  polish?: string;
  minCarat?: string;
  maxCarat?: string;
  minPrice?: string;
  maxPrice?: string;
  paymentDirection?: string;
  agingDays?: string;
}

const buildFilterQueryString = (filters?: AdvancedItemFilters) => {
  if (!filters) return '';
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== 'All' && value !== '') {
      params.append(key, value);
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

export const api = {
  /** Get all stock items */
  getStocks(filters?: AdvancedItemFilters): Promise<ApiResponse<StockItem[]>> {
    return request(`/api/stocks${buildFilterQueryString(filters)}`);
  },

  /** Create a new stock item */
  createStock(dto: CreateStockDTO): Promise<ApiResponse<StockItem[]>> {
    return request('/api/stocks', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  /** Update a stock item */
  updateStock(id: string, dto: UpdateStockDTO): Promise<ApiResponse<StockItem[]>> {
    return request(`/api/stocks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  /** Delete a stock item */
  deleteStock(id: string): Promise<ApiResponse<StockItem[]>> {
    return request(`/api/stocks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  /** Get dashboard KPIs */
  getDashboard(): Promise<ApiResponse<DashboardData>> {
    return request('/api/dashboard');
  },

  /** Health check */
  getHealth(): Promise<HealthResponse> {
    return request('/health');
  },

  /** Get ledger entries, optionally filtered by stockId, partyId, itemCode, paymentStatus, agingDays, and paymentDirection */
  getLedger(stockId?: string, partyId?: string, itemCode?: string, paymentStatus?: string, agingDays?: string | number, paymentDirection?: string): Promise<{ success: boolean; data: LedgerEntry[]; count: number }> {
    const params = new URLSearchParams();
    if (stockId) params.append('stockId', stockId);
    if (partyId) params.append('partyId', partyId);
    if (itemCode) params.append('itemCode', itemCode);
    if (paymentStatus) params.append('paymentStatus', paymentStatus);
    if (agingDays) params.append('agingDays', String(agingDays));
    if (paymentDirection) params.append('paymentDirection', paymentDirection);
    
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/ledger${qs}`);
  },

  /** Get ledger payment summary with optional aging filter */
  getPaymentSummary(stockId?: string, partyId?: string, itemCode?: string, agingDays?: string | number): Promise<{ success: boolean; data: { payableDue: number; payablePaid: number; receivableDue: number; receivableCollected: number; aging?: any } }> {
    const params = new URLSearchParams();
    if (stockId) params.append('stockId', stockId);
    if (partyId) params.append('partyId', partyId);
    if (itemCode) params.append('itemCode', itemCode);
    if (agingDays) params.append('agingDays', String(agingDays));
    
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/ledger/payment-summary${qs}`);
  },

  /** Get stock names for filter dropdown */
  getLedgerStocks(): Promise<{ success: boolean; data: LedgerStockOption[] }> {
    return request('/api/ledger/stocks');
  },

  /** Get party names for transaction dropdown */
  getLedgerParties(): Promise<{ success: boolean; data: { partyId: string; partyName: string; type: string }[] }> {
    return request('/api/ledger/parties');
  },

  /** Create transaction */
  postLedger(data: any): Promise<any> {
    return request('/api/ledger', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Update transaction */
  updateLedger(id: string, data: any): Promise<any> {
    return request(`/api/ledger/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },


  /**
   * Delete transaction - Note: Historical transactions are immutable in the ledger.
   * Attempting to delete will be rejected by the backend. Use a reversal transaction instead.
   */
  deleteLedger(id: string): Promise<any> {
    return request(`/api/ledger/${id}`, {
      method: 'DELETE',
    });
  },

  /** Get Stock Items for a Stock ID */
  getStockItems(stockId: string): Promise<{ success: boolean; data: any[] }> {
    return request(`/api/stocks/${stockId}/items`);
  },

  /** Create a Stock Item */
  createStockItem(stockId: string, data: any): Promise<any> {
    return request(`/api/stocks/${stockId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Update a Stock Item */
  updateStockItem(stockId: string, itemId: string, data: any): Promise<any> {
    return request(`/api/stocks/${stockId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /** Delete a Stock Item */
  deleteStockItem(stockId: string, itemId: string): Promise<any> {
    return request(`/api/stocks/${stockId}/items/${itemId}`, {
      method: 'DELETE',
    });
  },

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
    
    // We can't use our `request` wrapper directly because it sets 'Content-Type': 'application/json'
    // For FormData, the browser must set the boundary header automatically.
    return fetch(`/api/certificates/upload`, {
      method: 'POST',
      body: formData,
    }).then(res => {
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    });
  },

  // --- PARTIES ---
  getParties(): Promise<{ success: boolean; data: any[] }> {
    return request('/api/parties');
  },
  createParty(data: any): Promise<any> {
    return request('/api/parties', { method: 'POST', body: JSON.stringify(data) });
  },
  updateParty(id: string, data: any): Promise<any> {
    return request(`/api/parties/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteParty(id: string): Promise<any> {
    return request(`/api/parties/${id}`, { method: 'DELETE' });
  },

  /** Get all repairs */
  getRepairs(filters?: AdvancedItemFilters): Promise<{ success: boolean; data: any[] }> {
    return request(`/api/repairs${buildFilterQueryString(filters)}`);
  },
  createRepair(data: any): Promise<any> {
    return request('/api/repairs', { method: 'POST', body: JSON.stringify(data) });
  },
  updateRepair(id: string, data: any): Promise<any> {
    return request(`/api/repairs/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteRepair(id: string): Promise<any> {
    return request(`/api/repairs/${id}`, { method: 'DELETE' });
  },

  // --- SETTINGS ---
  getSettings(): Promise<{ success: boolean; data: Record<string, string> }> {
    return request('/api/settings');
  },

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
    const res = await fetch(`/api/reports/export/excel${qs}`);
    if (!res.ok) throw new Error('Failed to download report Excel');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = customFilename || `DiamondERP_${params?.reportType || 'Report'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  updateSettings(data: Record<string, string>): Promise<any> {
    return request('/api/settings', { method: 'PUT', body: JSON.stringify(data) });
  },

  /** Get individual diamonds in a stock parcel */
  getDiamonds(stockId?: string, filters?: AdvancedItemFilters): Promise<{ success: boolean; data: any[] }> {
    const filterQs = buildFilterQueryString(filters).replace('?', '&');
    const qs = stockId ? `?stockId=${encodeURIComponent(stockId)}${filterQs}` : buildFilterQueryString(filters);
    return request(`/api/diamonds${qs}`);
  },

  // ═══════════════════════════════════════════════════════════════
  // DATA MANAGEMENT & PROFILES API
  // ═══════════════════════════════════════════════════════════════

  getProfiles(): Promise<{ success: boolean; data: { profiles: string[], active: string } }> {
    return request('/api/settings/profiles');
  },
  switchProfile(profileName: string): Promise<any> {
    return request('/api/settings/profile', { method: 'POST', body: JSON.stringify({ profileName }) });
  },
  factoryReset(): Promise<any> {
    return request('/api/settings/factory-reset', { method: 'POST' });
  },

  /** Export data to Excel */
  exportExcel(): Promise<Blob> {
    return fetch(`/api/settings/export/excel`).then((res) => {
      if (!res.ok) throw new Error('Export failed');
      return res.blob();
    });
  },

  /** Download Excel template */
  downloadTemplate(): Promise<Blob> {
    return fetch(`/api/settings/export/template`).then((res) => {
      if (!res.ok) throw new Error('Download failed');
      return res.blob();
    });
  },

  /** Import data from Excel */
  importExcel(file: File, mode: 'merge' | 'overwrite' = 'merge'): Promise<{ success: boolean; message?: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`/api/settings/import/excel?mode=${mode}`, {
      method: 'POST',
      body: formData,
    }).then(async (res) => {
      if (res.status === 400 && res.headers.get('content-type')?.includes('spreadsheetml')) {
        // Automatically trigger a download of the error excel file if the backend returned it
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Import_Errors.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
        return { success: false, message: 'Import failed with errors. Downloaded error file for review.' };
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Import failed');
      }
      return res.json();
    });
  },
};
