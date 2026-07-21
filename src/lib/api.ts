/**
 * Thin typed wrapper around fetch that auto-injects the Supabase JWT.
 * Ported from the web client (frontend/src/lib/api.ts) — same { data, meta }
 * envelope contract with the NestJS backend.
 *
 * The base URL is RUNTIME-CONFIGURABLE: it defaults to EXPO_PUBLIC_API_BASE_URL
 * (baked at build time) but can be overridden in-app (Settings → Server URL) and
 * persisted to AsyncStorage. That means a changed backend/tunnel URL never
 * requires rebuilding the APK.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

const OVERRIDE_KEY = 'sirah-api-base';

/** The URL compiled into this build. */
export const API_BASE_DEFAULT =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

let cachedBase: string | null = null;

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Resolve the active base URL (stored override wins), cached after first read. */
export async function resolveApiBase(): Promise<string> {
  if (cachedBase) return cachedBase;
  try {
    const stored = await AsyncStorage.getItem(OVERRIDE_KEY);
    cachedBase = stored && stored.trim() ? normalize(stored) : normalize(API_BASE_DEFAULT);
  } catch {
    cachedBase = normalize(API_BASE_DEFAULT);
  }
  return cachedBase;
}

/** Persist a new base URL and use it for subsequent requests. */
export async function setApiBase(url: string): Promise<void> {
  const next = normalize(url);
  cachedBase = next;
  await AsyncStorage.setItem(OVERRIDE_KEY, next);
}

/** Clear the override and fall back to the compiled-in default. */
export async function clearApiBase(): Promise<void> {
  cachedBase = normalize(API_BASE_DEFAULT);
  await AsyncStorage.removeItem(OVERRIDE_KEY);
}

/** Current value without awaiting (may be null before the first resolve). */
export function currentApiBase(): string {
  return cachedBase ?? normalize(API_BASE_DEFAULT);
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: { requestId?: string };
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: string };
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
  skipAuth?: boolean;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  const base = await resolveApiBase();
  const headers: Record<string, string> = {
    ...(opts.skipAuth ? {} : await authHeaders()),
    ...(opts.headers ?? {}),
  };

  let body: BodyInit | undefined;
  if (opts.body instanceof FormData || opts.body instanceof Blob) {
    body = opts.body as BodyInit;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['Content-Type'] ??= 'application/json';
  }

  const res = await fetch(`${base}${path}`, { method, headers, body, signal: opts.signal });

  if (!res.ok) {
    let errBody: ApiErrorBody | undefined;
    try {
      errBody = (await res.json()) as ApiErrorBody;
    } catch {
      /* swallow */
    }
    throw new ApiError(
      res.status,
      errBody?.error?.code ?? 'HTTP_ERROR',
      errBody?.error?.message ?? `${res.status}`,
      errBody?.error?.details,
    );
  }

  if (res.status === 204) return undefined as T;

  const json = (await res.json()) as ApiEnvelope<T>;
  return json.data;
}

export const api = {
  get: <T,>(path: string, opts?: ApiOptions): Promise<T> => request<T>('GET', path, opts),
  post: <T,>(path: string, opts?: ApiOptions): Promise<T> => request<T>('POST', path, opts),
  patch: <T,>(path: string, opts?: ApiOptions): Promise<T> => request<T>('PATCH', path, opts),
  put: <T,>(path: string, opts?: ApiOptions): Promise<T> => request<T>('PUT', path, opts),
  delete: <T,>(path: string, opts?: ApiOptions): Promise<T> => request<T>('DELETE', path, opts),
};
