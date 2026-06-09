import { useCallback, useEffect, useState } from 'react';
import { clientsApi } from '@/modules/workspace/api/clients';

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
 *   - The service worker lives at /sirah-sw.js (in public/). We register
 *     against that path so it controls the whole origin.
 */

const SW_URL = '/sirah-sw.js';

type PushStatus = 'loading' | 'unsupported' | 'denied' | 'idle' | 'subscribed';

function isSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
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

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupported()) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setStatus('denied');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration(SW_URL);
        if (!reg) {
          if (!cancelled) setStatus('idle');
          return;
        }
        const existing = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (existing) {
          setEndpoint(existing.endpoint);
          setStatus('subscribed');
        } else {
          setStatus('idle');
        }
      } catch {
        if (!cancelled) setStatus('idle');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported()) return;
    setBusy(true);
    try {
      const cfg = await clientsApi.pushConfig();
      if (!cfg.enabled || !cfg.vapidPublicKey) {
        throw new Error('Push notifications are not configured on the server yet.');
      }

      // Permission first — Notification.requestPermission is what surfaces the
      // browser prompt. Already-granted returns immediately.
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'idle');
        return;
      }

      // Register the SW idempotently.
      const reg = await navigator.serviceWorker.register(SW_URL);
      await navigator.serviceWorker.ready;

      // Subscribe with our VAPID key.
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey),
      });

      // PushSubscription exposes the keys as ArrayBuffers; we convert to
      // base64url strings the backend expects.
      const raw = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
      if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
        throw new Error('Browser returned an incomplete subscription.');
      }

      await clientsApi.pushSubscribe({
        endpoint: raw.endpoint,
        p256dh: raw.keys.p256dh,
        auth: raw.keys.auth,
        user_agent: navigator.userAgent.slice(0, 500),
      });

      setEndpoint(raw.endpoint);
      setStatus('subscribed');
    } finally {
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!isSupported()) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await sub.unsubscribe();
        await clientsApi.pushUnsubscribe(sub.endpoint).catch(() => {});
      } else if (endpoint) {
        await clientsApi.pushUnsubscribe(endpoint).catch(() => {});
      }
      setEndpoint(null);
      setStatus('idle');
    } finally {
      setBusy(false);
    }
  }, [endpoint]);

  return { status, busy, subscribe, unsubscribe };
}