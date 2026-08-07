// sirah-offline-sw.js — NUSI offline + push service worker.
//
// Strategy:
//   - Navigations (SPA routes): network-first, falling back to the cached app
//     shell ('/') when offline, so an installed PWA opens without a connection.
//   - Same-origin static assets (/assets/*, images, fonts): cache-first with
//     background revalidate (stale-while-revalidate).
//   - /api/* : never cached (always network) — data + mutations stay fresh.
//   - Web push: shows notifications and focuses/opens the right URL on click.
//
// Bump VERSION to invalidate old caches on deploy.

const VERSION = 'sirah-v1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

// Survives version bumps on purpose — it holds what we need to re-subscribe
// after the browser rotates a push subscription. Deliberately NOT prefixed with
// VERSION, so `activate` must skip it explicitly when reaping old caches.
const PUSH_CFG_CACHE = 'sirah-push-config';
const PUSH_CFG_URL = '/__sirah-push-config';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(['/', '/index.html']).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => !k.startsWith(VERSION) && k !== PUSH_CFG_CACHE)
        .map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // only same-origin
  if (url.pathname.startsWith('/api/')) return;     // never cache API

  // SPA navigations → network-first, offline-fallback to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match('/index.html'))),
    );
    return;
  }

  // Static assets → cache-first, revalidate in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// ── Web push ─────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* non-JSON payload */ }
  const title = data.title || 'NUSI';
  const url = data.url || '/';

  // Action buttons — chat/message notifications get a "Reply" affordance;
  // everything gets "Open". (Windows/Chrome shows up to 2 buttons.) The
  // notificationclick handler routes every action to the notification's url.
  const actions = data.actions
    || (/chat|messaging/i.test(url)
        ? [{ action: 'reply', title: 'Reply' }, { action: 'open', title: 'Open' }]
        : [{ action: 'open', title: 'Open' }]);

  const options = {
    body: data.body || '',
    // Prefer the sender's/workspace's own logo when provided, else the SIRAH
    // brand logo (/icon-192.png is the legacy green-Z Sheizen mark).
    icon: data.icon || '/sirah-logo.png',
    badge: '/sirah-logo.png',
    image: data.image,
    tag: data.tag,
    actions,
    data: { url },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Push subscription rotation ───────────────────────────────────────
// Browsers silently re-issue push subscriptions (key rollover, storage
// pressure, long idle) — Chrome on Android especially. When that happens the
// old endpoint starts returning 410 and the device goes quiet FOREVER unless
// we re-subscribe here. Without this handler push slowly "turns itself off".
//
// This worker can't read import.meta.env, and in prod the API is a different
// origin (Vercel → Render), so usePushSubscription stashes { apiBase, vapidKey,
// endpoint } in a cache at subscribe time and we read it back here.

async function readPushConfig() {
  try {
    const cache = await caches.open(PUSH_CFG_CACHE);
    const res = await cache.match(PUSH_CFG_URL);
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

async function writePushConfig(cfg) {
  try {
    const cache = await caches.open(PUSH_CFG_CACHE);
    await cache.put(
      PUSH_CFG_URL,
      new Response(JSON.stringify(cfg), { headers: { 'Content-Type': 'application/json' } }),
    );
  } catch { /* non-fatal — rotation just won't have a cached hint next time */ }
}

function b64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = self.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const cfg = await readPushConfig();
    // The retiring endpoint identifies our row server-side. Browsers don't all
    // populate oldSubscription, so fall back to the one we cached at subscribe.
    const oldEndpoint =
      (event.oldSubscription && event.oldSubscription.endpoint) || (cfg && cfg.endpoint) || null;

    // Some browsers hand us the replacement; otherwise mint one with the same
    // VAPID key (from the old subscription if present, else our cached copy).
    let sub = event.newSubscription || null;
    if (!sub) {
      const key =
        (event.oldSubscription
          && event.oldSubscription.options
          && event.oldSubscription.options.applicationServerKey)
        || (cfg && cfg.vapidKey ? b64ToUint8Array(cfg.vapidKey) : null);
      if (!key) return; // nothing to re-subscribe with
      try {
        sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      } catch {
        return;
      }
    }
    if (!sub || !oldEndpoint || !cfg || !cfg.apiBase) return;

    const json = sub.toJSON();
    if (!json.keys || !json.keys.p256dh || !json.keys.auth) return;

    try {
      await fetch(`${cfg.apiBase}/api/v1/push/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_endpoint: oldEndpoint,
          endpoint: sub.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        }),
      });
    } catch { /* offline — the sub still works; next rotation retries */ }

    // Remember the new endpoint so a FUTURE rotation can still identify us.
    await writePushConfig({ ...cfg, endpoint: sub.endpoint });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) { client.navigate(target).catch(() => {}); return client.focus(); }
      }
      return self.clients.openWindow(target);
    }),
  );
});
