/**
 * Thin typed wrapper around fetch that auto-injects the Supabase JWT.
 * Use this for ALL calls to the NestJS backend.
 *
 * Why a wrapper:
 *   - One place to manage the API base URL and auth header.
 *   - One place to unwrap the { data, meta } envelope the backend uses.
 *   - One place to map non-200 responses to thrown ApiError so callers
 *     don't have to handle response.ok everywhere.
 */
import { supabase } from '@/integrations/supabase/client';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000';

export interface ApiEnvelope<T> {
  data: T;
  meta?: { requestId?: string };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: string;
  };
  meta?: { requestId?: string };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ApiOptions {
  /** If true, skip the Authorization header (for public endpoints). */
  skipAuth?: boolean;
  /** Override the request body. If a Blob/FormData, fetch sets Content-Type itself. */
  body?: unknown;
  /** Override the default JSON Content-Type when not using FormData. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.skipAuth ? {} : await authHeaders()),
    ...(opts.headers ?? {}),
  };

  let body: BodyInit | undefined;
  if (opts.body instanceof FormData || opts.body instanceof Blob) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['Content-Type'] ??= 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body,
    signal: opts.signal,
  });

  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try { body = (await res.json()) as ApiErrorBody; } catch { /* swallow */ }
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'HTTP_ERROR',
      body?.error?.message ?? `${res.status} ${res.statusText}`,
      body?.error?.details,
    );
  }

  // No-body 204
  if (res.status === 204) return undefined as T;

  const json = (await res.json()) as ApiEnvelope<T>;
  return json.data;
}

export const api = {
  get:  <T>(path: string, opts?: ApiOptions): Promise<T> => request<T>('GET',  path, opts),
  post: <T>(path: string, opts?: ApiOptions): Promise<T> => request<T>('POST', path, opts),
  patch:  <T>(path: string, opts?: ApiOptions): Promise<T> => request<T>('PATCH',  path, opts),
  delete: <T>(path: string, opts?: ApiOptions): Promise<T> => request<T>('DELETE', path, opts),
};
