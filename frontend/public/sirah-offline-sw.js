// sirah-offline-sw.js — SIRAH LIFE offline + push service worker.
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

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(['/', '/index.html']).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
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
  const title = data.title || 'SIRAH LIFE';
  const options = {
    body: data.body || '',
    // Prefer the sender's/workspace's own logo when provided, else the SIRAH
    // brand logo (/icon-192.png is the legacy green-Z Sheizen mark).
    icon: data.icon || '/sirah-logo.png',
    badge: '/sirah-logo.png',
    image: data.image,
    tag: data.tag,
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
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
