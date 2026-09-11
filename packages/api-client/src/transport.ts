/**
 * Diamond ERP API Client — Transport Layer.
 *
 * Platform-agnostic HTTP transport that works across:
 * - Web (browser fetch)
 * - React Native (built-in fetch)
 * - Node.js (node-fetch or native fetch in Node 18+)
 *
 * Clients provide their own fetch implementation and token storage
 * via the DiamondApiConfig interface.
 */

import {
  ApiResponse,
  ApiErrorResponse,
  PaginatedResponse,
  ListQueryParams,
  ErrorCode,
} from '@diamond-erp/contracts';

// ── Configuration ───────────────────────────────────────────────────────

export interface DiamondApiConfig {
  /** Base URL of the API server (e.g., 'http://localhost:3002'). */
  baseUrl: string;

  /** Returns the current auth token, or null if not authenticated. */
  getToken: () => string | null;

  /** Returns the current profile ID, or null if not set. */
  getProfileId: () => string | null;

  /** Default timeout in milliseconds. Default: 30000. */
  timeoutMs?: number;

  /** Optional fetch implementation override. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;

  /** Called when a 401 response is received. Use to trigger re-login. */
  onUnauthorized?: () => void;
}

// ── Error Class ─────────────────────────────────────────────────────────

export class DiamondApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: ErrorCode,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DiamondApiError';
  }
}

// ── Transport ───────────────────────────────────────────────────────────

export class DiamondApiTransport {
  private config: Required<Pick<DiamondApiConfig, 'baseUrl' | 'getToken' | 'getProfileId' | 'timeoutMs'>> & DiamondApiConfig;

  constructor(config: DiamondApiConfig) {
    this.config = {
      ...config,
      timeoutMs: config.timeoutMs ?? 30000,
    };
  }

  /** Update configuration (e.g., after login). */
  updateConfig(partial: Partial<DiamondApiConfig>): void {
    Object.assign(this.config, partial);
  }

  /** Build request headers. */
  private getHeaders(includeContentType = true): Record<string, string> {
    const headers: Record<string, string> = {};
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    const token = this.config.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const profileId = this.config.getProfileId();
    if (profileId) {
      headers['X-Profile-Id'] = profileId;
    }
    return headers;
  }

  /** Core request method with timeout and error handling. */
  async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<ApiResponse<T>> {
    const fetchFn = this.config.fetch ?? globalThis.fetch;
    const url = `${this.config.baseUrl}${path}`;
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Combine caller signal with timeout signal
    let signal = controller.signal;
    if (options?.signal) {
      if ('any' in AbortSignal && typeof (AbortSignal as any).any === 'function') {
        signal = (AbortSignal as any).any([controller.signal, options.signal]);
      }
    }

    try {
      const isFormData = options?.body instanceof FormData;
      const response = await fetchFn(url, {
        method,
        headers: {
          ...this.getHeaders(!isFormData),
          ...(options?.headers ?? {}),
        },
        body: options?.body
          ? isFormData
            ? options.body as any
            : JSON.stringify(options.body)
          : undefined,
        signal,
      });

      if (response.status === 401) {
        this.config.onUnauthorized?.();
        const errorBody = await response.json().catch(() => ({}));
        throw new DiamondApiError(
          (errorBody as any)?.error || 'Unauthorized',
          401,
          ErrorCode.AUTH_REQUIRED,
        );
      }

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const errorJson = await response.json().catch(() => ({})) as ApiErrorResponse;
          throw new DiamondApiError(
            errorJson.error || `Request failed with status ${response.status}`,
            response.status,
            errorJson.code,
            errorJson.details,
          );
        }
        const text = await response.text().catch(() => '');
        throw new DiamondApiError(
          text || `Request failed with status ${response.status}`,
          response.status,
        );
      }

      return await response.json() as ApiResponse<T>;
    } catch (err: any) {
      if (err instanceof DiamondApiError) throw err;
      if (err.name === 'AbortError') {
        throw new DiamondApiError(`Request timed out after ${timeoutMs}ms`, 408);
      }
      throw new DiamondApiError(
        err.message || 'Network error',
        0,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Convenience methods ─────────────────────────────────────────────

  async get<T>(path: string, params?: ListQueryParams): Promise<ApiResponse<T>> {
    const queryString = params ? this.buildQueryString(params) : '';
    const fullPath = queryString ? `${path}?${queryString}` : path;
    return this.request<T>('GET', fullPath);
  }

  async getPaginated<T>(path: string, params?: ListQueryParams): Promise<PaginatedResponse<T>> {
    const queryString = params ? this.buildQueryString(params) : '';
    const fullPath = queryString ? `${path}?${queryString}` : path;
    return this.request<T[]>('GET', fullPath) as Promise<PaginatedResponse<T>>;
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, { body });
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, { body });
  }

  async patch<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, { body });
  }

  async delete<T = void>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path);
  }

  async upload<T>(path: string, formData: FormData): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, { body: formData, timeoutMs: 120000 });
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private buildQueryString(params: Record<string, unknown>): string {
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return entries.join('&');
  }
}
