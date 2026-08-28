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

  /** Get ledger entries, optionally filtered by stockId, partyId, itemCode, and paymentStatus */
  getLedger(stockId?: string, partyId?: string, itemCode?: string, paymentStatus?: string): Promise<{ success: boolean; data: LedgerEntry[]; count: number }> {
    const params = new URLSearchParams();
    if (stockId) params.append('stockId', stockId);
    if (partyId) params.append('partyId', partyId);
    if (itemCode) params.append('itemCode', itemCode);
    if (paymentStatus) params.append('paymentStatus', paymentStatus);
    
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/ledger${qs}`);
  },

  /** Get ledger payment summary */
  getPaymentSummary(stockId?: string, partyId?: string, itemCode?: string): Promise<{ success: boolean; data: { payableDue: number; payablePaid: number; receivableDue: number; receivableCollected: number } }> {
    const params = new URLSearchParams();
    if (stockId) params.append('stockId', stockId);
    if (partyId) params.append('partyId', partyId);
    if (itemCode) params.append('itemCode', itemCode);
    
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


  /** Delete transaction */
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
  // DRAFTS API (Version-Control Architecture)
  // ═══════════════════════════════════════════════════════════════

  /** List all drafts */
  getDrafts(status?: string): Promise<{ success: boolean; data: any[] }> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request(`/api/drafts${qs}`);
  },

  /** Get a single draft */
  getDraft(id: string): Promise<{ success: boolean; data: any }> {
    return request(`/api/drafts/${encodeURIComponent(id)}`);
  },

  /** Create a new draft */
  createDraft(data: {
    entityType: string;
    entityId?: string;
    ledgerId?: string;
    payload: Record<string, unknown>;
    createdBy: string;
  }): Promise<{ success: boolean; data: any }> {
    return request('/api/drafts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Save a draft revision (Level B — server sync) */
  saveDraftRevision(draftId: string, data: {
    payload: Record<string, unknown>;
    changeSet?: Array<{ path: string; before: unknown; after: unknown }>;
    changeSummary?: string;
    updatedBy: string;
  }): Promise<{ success: boolean; data: any }> {
    return request(`/api/drafts/${encodeURIComponent(draftId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /** Commit a draft (authorize ledger entry) */
  commitDraft(draftId: string, createdBy?: string): Promise<{ success: boolean; data: any }> {
    return request(`/api/drafts/${encodeURIComponent(draftId)}/commit`, {
      method: 'POST',
      body: JSON.stringify({ createdBy: createdBy || 'system' }),
    });
  },

  /** Abandon a draft */
  abandonDraft(draftId: string): Promise<{ success: boolean; data: any }> {
    return request(`/api/drafts/${encodeURIComponent(draftId)}`, {
      method: 'DELETE',
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // VERSIONS API (Version History)
  // ═══════════════════════════════════════════════════════════════

  /** Get version history for an entity */
  getVersionHistory(entityType: string, entityId: string): Promise<{ success: boolean; data: any[] }> {
    return request(`/api/versions/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
  },

  /** Get a single version snapshot */
  getVersion(versionId: string): Promise<{ success: boolean; data: any }> {
    return request(`/api/versions/${encodeURIComponent(versionId)}`);
  },

  /** Restore a previous version */
  restoreVersion(versionId: string, createdBy?: string): Promise<{ success: boolean; data: any }> {
    return request(`/api/versions/${encodeURIComponent(versionId)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ createdBy: createdBy || 'system' }),
    });
  },

  /** Diff two versions */
  diffVersions(idA: string, idB: string): Promise<{ success: boolean; data: any }> {
    return request(`/api/versions/${encodeURIComponent(idA)}/diff/${encodeURIComponent(idB)}`);
  },
};
