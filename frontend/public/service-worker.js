// service-worker.js — self-destruct.
//
// During the NUSI rebuild this SW was caching stale JS chunks in dev,
// hiding fixes from the browser. This replacement is a kill-switch:
//   1. Activates immediately on install (skipWaiting), takes over all tabs.
//   2. Deletes every CacheStorage entry.
//   3. Unregisters itself.
//   4. Reloads each controlled client so they pull fresh chunks.
//
// After running once on a given browser, the SW is gone and the page loads
// straight from the dev server. Push notifications (the original reason this
// SW existed) can be re-added later via a fresh service-worker-v2.js path
// once we have a working production build with the right caching strategy.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (err) {
      console.warn('[sw self-destruct] cache cleanup failed:', err);
    }

    try {
      await self.registration.unregister();
    } catch (err) {
      console.warn('[sw self-destruct] unregister failed:', err);
    }

    // Reload every page this SW is controlling so they pull fresh chunks.
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try { client.navigate(client.url); } catch { /* ignore */ }
      }
    } catch (err) {
      console.warn('[sw self-destruct] client reload failed:', err);
    }
  })());
});

// Never intercept fetches. Fall through to browser default = no caching.
self.addEventListener('fetch', () => { /* no-op */ });