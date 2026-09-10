import { request } from './client';
import { buildFilterQueryString } from './stocks.api';
import { AdvancedItemFilters } from '../../types/stock';

export const repairsApi = {
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
};
