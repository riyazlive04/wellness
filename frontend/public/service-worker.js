// Service Worker for Push Notifications - Sheizen Wellness

const APP_NAME = 'Sheizen AI Nutritionist';
const DEFAULT_ICON = '/icon-192.png';
const DEFAULT_BADGE = '/favicon.ico';
const DEFAULT_URL = '/dashboard';

self.addEventListener('install', (event) => {
  console.log('[SW] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activated');
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('[SW] Push event with no data');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    // Fallback if payload isn't valid JSON
    data = {
      title: APP_NAME,
      body: event.data.text() || 'You have a new notification',
      url: DEFAULT_URL,
    };
  }

  const title = data.title || APP_NAME;
  const options = {
    body: data.body || '',
    icon: data.icon || DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    // Use tag to group/replace similar notifications (prevents duplicates)
    tag: data.tag || `sheizen-${Date.now()}`,
    // Renotify even if tag matches (vibrate again)
    renotify: true,
    data: {
      url: data.url || DEFAULT_URL,
      notificationId: data.id || null,
      timestamp: data.timestamp || Date.now(),
    },
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    vibrate: [200, 100, 200],
    // Keep notification visible until user interacts (desktop)
    requireInteraction: true,
    // Show timestamp
    timestamp: data.timestamp || Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Get the URL to open (defaults to /dashboard)
  const relativeUrl = event.notification.data?.url || DEFAULT_URL;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to find an existing window/tab of our app and focus it
      for (const client of clientList) {
        try {
          const clientUrl = new URL(client.url);
          // Check if this client belongs to our app (same origin)
          if (clientUrl.origin === self.location.origin) {
            // Navigate the existing window to the target URL and focus it
            client.navigate(relativeUrl);
            return client.focus();
          }
        } catch (e) {
          // Skip invalid URLs
        }
      }

      // No existing window found - open a new one
      // Construct full URL from the service worker's origin
      const fullUrl = new URL(relativeUrl, self.location.origin).href;
      return clients.openWindow(fullUrl);
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  // Notification dismissed without action
  console.log('[SW] Notification closed');
});
