/**
 * Unified HTTP transport layer for Diamond ERP Frontend.
 *
 * Implements:
 * - Single request core eliminating triplication (Finding 45)
 * - Safe combined abort signals (caller signal + timeout controller) (Finding 46)
 * - Explicit typed ApiError taxonomy
 */

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

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
}

const BASE_URL = '';

/**
 * Authoritative session & tenant store for Diamond ERP Frontend (Findings 48 & 49).
 * Eliminates split-brain sources of truth between React state, localStorage, and API client.
 * Enforces immediate request cancellation of outstanding profile-scoped requests on profile switch.
 */
class SessionStore {
  private token: string | null = null;
  private profileId: string | null = null;
  private profileGeneration = 0;
  private profileAbortController: AbortController = new AbortController();

  constructor() {
    if (typeof localStorage !== 'undefined') {
      this.token = localStorage.getItem('token');
      this.profileId = localStorage.getItem('profileId') || 'Stavan';
    }
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string | null): void {
    this.token = token;
    if (typeof localStorage !== 'undefined') {
      if (token) localStorage.setItem('token', token);
      else localStorage.removeItem('token');
    }
  }

  getProfileId(): string | null {
    return this.profileId || 'Stavan';
  }

  getProfileGeneration(): number {
    return this.profileGeneration;
  }

  getProfileAbortSignal(): AbortSignal {
    return this.profileAbortController.signal;
  }

  setProfileId(profileId: string | null): void {
    if (this.profileId === profileId) return;

    // Finding 49: Stale request protection on profile switch
    this.profileAbortController.abort('Profile switched');
    this.profileAbortController = new AbortController();
    this.profileGeneration++;
    this.profileId = profileId;

    if (typeof localStorage !== 'undefined') {
      if (profileId) localStorage.setItem('profileId', profileId);
      else localStorage.removeItem('profileId');
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('profileChanged', {
          detail: { profileId, generation: this.profileGeneration },
        })
      );
    }
  }
}

export const sessionStore = new SessionStore();

/**
 * Returns authentication and tenant headers from authoritative session store.
 */
export function getAuthHeaders(includeContentType = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  const token = sessionStore.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const profileId = sessionStore.getProfileId();
  if (profileId) {
    headers['X-Profile-Id'] = profileId;
  }
  return headers;
}

/**
 * Combines a timeout abort signal with an optional caller-provided signal.
 * Ensures that if either signal aborts, the request is properly terminated (Finding 46).
 */
export function combineSignals(timeoutSignal: AbortSignal, callerSignal?: AbortSignal | null): AbortSignal {
  if (!callerSignal) return timeoutSignal;
  if ('any' in AbortSignal && typeof (AbortSignal as any).any === 'function') {
    return (AbortSignal as any).any([timeoutSignal, callerSignal]);
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();

  if (callerSignal.aborted || timeoutSignal.aborted) {
    controller.abort();
    return controller.signal;
  }

  callerSignal.addEventListener('abort', onAbort, { once: true });
  timeoutSignal.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

/**
 * Core transport function handling network fetch, headers, timeouts, and errors.
 */
export async function requestCore(
  url: string,
  options?: ApiRequestOptions,
  bodyType: 'json' | 'blob' | 'form' = 'json'
): Promise<Response> {
  const isUpload = bodyType === 'form';
  const headers = {
    ...getAuthHeaders(!isUpload),
    ...(options?.headers || {}),
  };
  const timeoutMs = options?.timeoutMs || (isUpload ? 120000 : 30000);

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  let signal = combineSignals(timeoutController.signal, options?.signal);
  if (!url.startsWith('/api/auth') && !url.startsWith('/health')) {
    signal = combineSignals(signal, sessionStore.getProfileAbortSignal());
  }

  try {
    const res = await fetch(`${BASE_URL}${url}`, {
      ...options,
      headers,
      signal,
    });

    if (res.status === 401) {
      let errData: any = {};
      try {
        errData = await res.json();
      } catch {
        /* ignore */
      }
      throw new ApiError(errData?.error || errData?.message || 'Unauthorized', 401, errData);
    }

    if (!res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errorJson = await res.json().catch(() => ({}));
        throw new ApiError(
          errorJson.error || errorJson.message || `Request failed with status ${res.status}`,
          res.status,
          errorJson
        );
      }
      const text = await res.text().catch(() => '');
      throw new ApiError(text || `Request failed with status ${res.status}`, res.status);
    }

    return res;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      if (sessionStore.getProfileAbortSignal().aborted) {
        throw new ApiError('Request cancelled due to profile switch', 499);
      }
      throw new ApiError(`Request timed out after ${timeoutMs}ms`, 408);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Perform a JSON request and parse the response.
 */
export async function request<T>(url: string, options?: ApiRequestOptions): Promise<T> {
  const res = await requestCore(url, options, 'json');
  return res.json() as Promise<T>;
}

/**
 * Perform a Blob request (for binary file downloads / reports).
 */
export async function requestBlob(url: string, options?: ApiRequestOptions): Promise<Blob> {
  const res = await requestCore(url, options, 'blob');
  return res.blob();
}

/**
 * Perform a multipart form-data upload request.
 */
export async function requestUpload<T>(url: string, formData: FormData, options?: ApiRequestOptions): Promise<T> {
  const res = await requestCore(url, { ...options, body: formData, method: options?.method || 'POST' }, 'form');
  return res.json() as Promise<T>;
}
