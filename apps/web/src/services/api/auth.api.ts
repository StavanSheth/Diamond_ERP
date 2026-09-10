import { request } from './client';

export const authApi = {
  login(username: string, password: string): Promise<{ success: boolean; data: { user: any; token: string } }> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  bootstrapUser(data: any, secret?: string): Promise<{ success: boolean; data: any }> {
    const headers: Record<string, string> = {};
    if (secret) {
      headers['X-Bootstrap-Secret'] = secret;
    }
    return request('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify(data),
      headers,
    });
  },

  getMe(): Promise<{ success: boolean; data: any }> {
    return request('/api/auth/me');
  },

  logout(): Promise<{ success: boolean; message: string }> {
    return request('/api/auth/logout', { method: 'POST' });
  },
};
