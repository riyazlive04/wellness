/** Client notifications feed. Ported from web notifications makeSurface. */
import { api } from '@/lib/api';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

const BASE = '/api/v1/me/notifications';

export const notificationsApi = {
  list: (limit = 40) => api.get<AppNotification[]>(`${BASE}?limit=${limit}`),
  unreadCount: () => api.get<{ count: number }>(`${BASE}/unread-count`).then((r) => r.count),
  markRead: (id: string) => api.post(`${BASE}/${encodeURIComponent(id)}/read`),
  markAllRead: () => api.post(`${BASE}/read-all`),

  /**
   * Register this device's raw FCM registration token so the backend can push
   * to it via the Firebase Admin SDK. Backend endpoint to be added (see
   * docs/FIREBASE_PUSH_SETUP.md). Fails gracefully until then.
   */
  registerDevice: (token: string, platform = 'android') =>
    api.post<{ ok: true }>('/api/v1/me/push/device', { body: { token, platform, provider: 'fcm' } }),
  unregisterDevice: (token: string) =>
    api.post<{ ok: true }>('/api/v1/me/push/device/remove', { body: { token } }),
};
