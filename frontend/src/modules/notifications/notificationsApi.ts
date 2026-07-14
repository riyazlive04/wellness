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

export interface NotificationsSurface {
  /** React-query key prefix so staff/client feeds don't collide. */
  key: string;
  list: (limit?: number) => Promise<AppNotification[]>;
  unreadCount: () => Promise<number>;
  markRead: (id: string) => Promise<unknown>;
  markAllRead: () => Promise<unknown>;
}

function makeSurface(base: string, key: string): NotificationsSurface {
  return {
    key,
    list: (limit = 30) => api.get<AppNotification[]>(`${base}?limit=${limit}`),
    unreadCount: () => api.get<{ count: number }>(`${base}/unread-count`).then((r) => r.count),
    markRead: (id: string) => api.post(`${base}/${encodeURIComponent(id)}/read`),
    markAllRead: () => api.post(`${base}/read-all`),
  };
}

/** Client-portal notification category toggles (meal / water / appt / …). */
export type ClientNotificationCategories = Record<string, boolean>;
export const clientNotificationPrefsApi = {
  get: () =>
    api
      .get<{ categories: ClientNotificationCategories }>('/api/v1/me/notifications/preferences')
      .then((r) => r.categories),
  update: (categories: ClientNotificationCategories) =>
    api
      .put<{ categories: ClientNotificationCategories }>('/api/v1/me/notifications/preferences', {
        body: { categories },
      })
      .then((r) => r.categories),
};

/** Staff (workspace members) notification feed. */
export const staffNotifications = makeSurface('/api/v1/notifications', 'staff-notifications');
/** Client portal notification feed. */
export const clientNotifications = makeSurface('/api/v1/me/notifications', 'client-notifications');
/**
 * Super-admin notification feed. Reuses the staff `/notifications` endpoint
 * (resolved by recipient_user_id, which is the admin's own user id) but keeps a
 * distinct react-query key so it never collides with a staff feed in cache.
 */
export const adminNotifications = makeSurface('/api/v1/notifications', 'admin-notifications');
