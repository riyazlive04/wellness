import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./mobile-fixes.css";

// Register service worker for push notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('[SW] Registered with scope:', registration.scope);

        // Check for updates immediately and periodically
        registration.update();
        setInterval(() => registration.update(), 60 * 60 * 1000); // hourly

        // When a new SW is found, activate it immediately
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                console.log('[SW] Updated and activated');
              }
            });
          }
        });
      })
      .catch(error => {
        console.error('[SW] Registration failed:', error);
      });
  });

  // When the controlling SW changes (new version took over), reload for consistency
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// Cross-tab notification listener (runs immediately, no React dependencies)
// When admin tab sets localStorage 'sheizen-notify', this fires in the client tab
window.addEventListener('storage', (e: StorageEvent) => {
  if (e.key === 'sheizen-notify' && e.newValue) {
    try {
      const { title, body } = JSON.parse(e.newValue);
      if (title && body && 'Notification' in window && Notification.permission === 'granted') {
        // Use service worker on mobile, basic Notification on desktop
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(title, { body, icon: '/icon-192.png', tag: `sheizen-${Date.now()}`, vibrate: [200, 100, 200] });
          }).catch(() => {});
        } else {
          try {
            const n = new Notification(title, { body, icon: '/icon-192.png', tag: `sheizen-${Date.now()}` });
            n.onclick = () => { window.focus(); n.close(); };
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error('[Notify] storage event error:', err);
    }
  }
});

createRoot(document.getElementById("root")!).render(<App />);
