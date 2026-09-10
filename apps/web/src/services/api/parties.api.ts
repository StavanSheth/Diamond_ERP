import { request } from './client';

export const partiesApi = {
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
};
