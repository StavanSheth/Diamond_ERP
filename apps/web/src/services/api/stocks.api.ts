import { request } from './client';
import { ApiResponse, StockItem, CreateStockDTO, UpdateStockDTO, DashboardData, HealthResponse, AdvancedItemFilters } from '../../types/stock';
import { buildFilterQueryString as sharedBuildFilterQueryString } from '@diamond-erp/shared-utils';

export const buildFilterQueryString = (filters?: AdvancedItemFilters): string => {
  return sharedBuildFilterQueryString(filters);
};

export const stocksApi = {
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

  /** Get individual diamonds in a stock parcel */
  getDiamonds(stockId?: string, filters?: AdvancedItemFilters): Promise<{ success: boolean; data: any[] }> {
    const filterQs = buildFilterQueryString(filters).replace('?', '&');
    const qs = stockId ? `?stockId=${encodeURIComponent(stockId)}${filterQs}` : buildFilterQueryString(filters);
    return request(`/api/diamonds${qs}`);
  },

  /** Get a single diamond by its ID */
  getDiamondById(id: string): Promise<{ success: boolean; data: any }> {
    return request(`/api/diamonds/${id}`);
  },
};
