import { useCallback, useEffect, useRef, useState } from 'react';
import { clientsApi } from '@/modules/workspace/api/clients';
import { API_BASE } from '@/lib/api';

/**
 * The minimal push API surface this hook drives. Both the client portal
 * (clientsApi) and the owner dashboard (workspacesApi) satisfy it, so the same
 * subscribe/unsubscribe machinery serves staff and clients.
 */
export interface PushApiAdapter {
  pushConfig: () => Promise<{ vapidPublicKey: string | null; enabled: boolean }>;
  pushSubscribe: (body: {
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent?: string;
  }) => Promise<{ subscribed: true }>;
  pushUnsubscribe: (endpoint: string) => Promise<{ unsubscribed: true }>;
}

/**
 * usePushSubscription — wraps the browser Web Push API + our backend's
 * subscribe / unsubscribe endpoints.
 *
 * Exposes:
 *   - status: 'unsupported' | 'denied' | 'idle' | 'subscribed'
 *   - subscribe(): registers the SW (if needed), prompts for permission,
 *     subscribes against the backend's VAPID key, persists the endpoint.
 *   - unsubscribe(): removes both server + browser records.
 *
 * Notes:
 *   - Permissions are sticky per-origin. Once a user clicks "Block" the
 *     browser refuses to re-ask without a manual reset.
 *   - We register the SAME worker main.tsx registers (/sirah-offline-sw.js) —
 *     both at scope '/'. Registering a *different* script at the same scope
 *     replaces the active worker, so using a separate /sirah-sw.js here made
 *     the two workers overwrite each other on every load and kept dropping the
 *     push subscription ("push turned itself off"). One worker = stable subs.
 *     /sirah-offline-sw.js handles both offline caching and push.
 */

const SW_URL = '/sirah-offline-sw.js';

/**
 * Sticky "the user wants push on THIS device" flag, persisted per-origin.
 *
 * The toggle's on/off used to be read purely from the live browser
 * PushManager subscription — so anything that dropped that subscription
 * (browser endpoint rotation, a service-worker reset, dev-mode SW unregister
 * on every load) silently flipped the UI to "off", and logging back in never
 * brought it back. Users read that as "push turns itself off on logout".
 *
 * We now record the user's INTENT separately. Set on an explicit enable,
 * cleared only on an explicit disable — never on logout. On load, if intent
 * is set and the browser still allows notifications, we silently
 * re-subscribe (idempotent, and it re-associates the endpoint with whoever
 * is logged in now). So once you turn push on, it stays on until YOU turn it
 * off.
 */
const PUSH_INTENT_KEY = 'sirah:push-enabled';

function readIntent(): boolean {
  try {
    return localStorage.getItem(PUSH_INTENT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeIntent(on: boolean): void {
  try {
    if (on) localStorage.setItem(PUSH_INTENT_KEY, '1');
    else localStorage.removeItem(PUSH_INTENT_KEY);
  } catch {
    /* storage unavailable (private mode / disabled) — non-fatal */
  }
}

type PushStatus = 'loading' | 'unsupported' | 'denied' | 'idle' | 'subscribed';

function isSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/**
 * Hand the service worker what it needs to re-subscribe on its own when the
 * browser rotates our subscription (`pushsubscriptionchange`). A SW can't read
 * import.meta.env, and in prod the API is a different origin (Vercel → Render),
 * so we stash the absolute base + VAPID key in a cache the worker reads back.
 * Best-effort: if this fails push still works, only self-healing is lost.
 */
async function storePushConfigForSw(cfg: {
  apiBase: string;
  vapidKey: string;
  endpoint: string;
}): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open('sirah-push-config');
    await cache.put(
      '/__sirah-push-config',
      new Response(JSON.stringify(cfg), { headers: { 'Content-Type': 'application/json' } }),
    );
  } catch { /* non-fatal */ }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // VAPID public keys are URL-safe base64. Browsers want a Uint8Array.
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Register the SW, subscribe against our VAPID key, and persist the
 * subscription to the backend. `pushManager.subscribe` is idempotent — if a
 * subscription already exists it returns the same one — so this doubles as the
 * "re-associate the existing endpoint with the current user" path on load.
 *
 * Returns the endpoint on success, or null if the browser withheld permission.
 * Assumes support + non-denied permission were checked by the caller.
 */
async function subscribeAndPersist(adapter: PushApiAdapter): Promise<string | null> {
  const cfg = await adapter.pushConfig();
  if (!cfg.enabled || !cfg.vapidPublicKey) {
    throw new Error('Push notifications are not configured on the server yet.');
  }

  // Already-granted returns immediately without a prompt — so the silent
  // restore path never surfaces the browser permission dialog.
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return null;

  const reg = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey),
  });

  const raw = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
    throw new Error('Browser returned an incomplete subscription.');
  }

  await adapter.pushSubscribe({
    endpoint: raw.endpoint,
    p256dh: raw.keys.p256dh,
    auth: raw.keys.auth,
    user_agent: navigator.userAgent.slice(0, 500),
  });

  // Leave the worker a note so it can heal a rotated subscription later.
  await storePushConfigForSw({
    apiBase: API_BASE,
    vapidKey: cfg.vapidPublicKey,
    endpoint: raw.endpoint,
  });

  return raw.endpoint;
}

export function usePushSubscription(adapter: PushApiAdapter = clientsApi) {
  const [status, setStatus] = useState<PushStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  // Adapter is a stable module singleton (clientsApi / workspacesApi), but read
  // it through a ref so the mount-once restore never re-runs if its identity
  // changes.
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupported()) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        // Blocked at the browser level — NOT a user "turn off". Keep the intent
        // flag so push restores itself if they re-allow the site later.
        if (!cancelled) setStatus('denied');
        return;
      }

      let existing: PushSubscription | null = null;
      try {
        const reg = await navigator.serviceWorker.getRegistration(SW_URL);
        existing = reg ? await reg.pushManager.getSubscription() : null;
      } catch {
        existing = null;
      }
      if (cancelled) return;

      // Nothing the user asked for, and nothing live → truly off.
      if (!existing && !readIntent()) {
        setStatus('idle');
        return;
      }

      // Either a subscription is already live, or the user previously enabled
      // push on this device (intent set) but the browser dropped it. Both cases
      // resolve the same way: (re)subscribe idempotently, which restores a
      // dropped subscription AND re-associates the endpoint with whoever is
      // logged in now. Permission is already 'granted' or 'default' here — a
      // 'granted' subscribe never prompts; a 'default' one only runs when intent
      // is set, i.e. the user opted in before.
      try {
        const ep = await subscribeAndPersist(adapterRef.current);
        if (cancelled) return;
        if (ep) {
          writeIntent(true);
          setEndpoint(ep);
          setStatus('subscribed');
        } else {
          // Browser withheld permission — fall back to whatever is live.
          setEndpoint(existing?.endpoint ?? null);
          setStatus(existing ? 'subscribed' : 'idle');
        }
      } catch {
        // Backend/registration hiccup — trust the live browser state so we
        // never show "off" when a subscription actually exists.
        if (cancelled) return;
        setEndpoint(existing?.endpoint ?? null);
        setStatus(existing ? 'subscribed' : 'idle');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported()) return;
    setBusy(true);
    try {
      const ep = await subscribeAndPersist(adapter);
      if (ep) {
        // Record the intent so it survives logout and self-heals on reload.
        writeIntent(true);
        setEndpoint(ep);
        setStatus('subscribed');
      } else {
        // Browser withheld permission (blocked or dismissed).
        setStatus(Notification.permission === 'denied' ? 'denied' : 'idle');
      }
    } finally {
      setBusy(false);
    }
  }, [adapter]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported()) return;
    setBusy(true);
    try {
      // Explicit user opt-out — clear the intent so we don't silently restore it.
      writeIntent(false);
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await sub.unsubscribe();
        await adapter.pushUnsubscribe(sub.endpoint).catch(() => {});
      } else if (endpoint) {
        await adapter.pushUnsubscribe(endpoint).catch(() => {});
      }
      setEndpoint(null);
      setStatus('idle');
    } finally {
      setBusy(false);
    }
  }, [endpoint, adapter]);

  return { status, busy, subscribe, unsubscribe };
}