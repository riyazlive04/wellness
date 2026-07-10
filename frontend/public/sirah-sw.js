/* eslint-disable */
/**
 * SIRAH LIFE service worker — handles incoming web-push notifications and
 * relays them to the OS notification center. Kept dependency-free so it can
 * run independently of the React bundle (browsers spawn this in a separate
 * thread before the app is loaded).
 */

self.addEventListener('install', (event) => {
  // Activate immediately — clients shouldn't have to refresh to get a fresh SW.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'SIRAH', body: 'You have a new update.', url: '/portal' };
  try {
    const json = event.data ? event.data.json() : null;
    if (json) payload = { ...payload, ...json };
  } catch (e) {
    // Plain-text push or bad payload — fall back to defaults.
    try {
      const text = event.data ? event.data.text() : '';
      if (text) payload.body = text;
    } catch {}
  }

  const options = {
    body: payload.body,
    // Prefer the sender's/workspace logo from the payload; fall back to the
    // SIRAH brand logo. (The old /favicon-512.png path didn't exist → no icon;
    // /icon-192.png is the legacy green-Z Sheizen mark → wrong brand.)
    icon: payload.icon || '/sirah-logo.png',
    badge: '/sirah-logo.png',
    image: payload.image || undefined,
    data: { url: payload.url || '/portal' },
    tag: payload.tag || undefined,
    renotify: !!payload.renotify,
    requireInteraction: !!payload.requireInteraction,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'SIRAH', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/portal';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab on the same origin if there is one.
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open a new tab.
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});