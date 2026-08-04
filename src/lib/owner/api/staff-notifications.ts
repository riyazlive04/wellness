/**
 * Staff notification feed.
 *
 * The web owner Notifications page only edits delivery preferences; the feed
 * behind `/api/v1/notifications` (NotificationsController, keyed by user id
 * rather than client id) exists but has no web surface yet. The mobile shell
 * shows it, because a bell badge with nothing behind it is worse than no bell.
 *
 * Same row shape as the client feed in @/lib/notifications-api — the backend
 * serves both from one table.
 */
import { api } from '@/lib/api';
import type { AppNotification } from '@/lib/notifications-api';

const BASE = '/api/v1/notifications';

export const staffNotificationsApi = {
  list: (limit = 40) => api.get<AppNotification[]>(`${BASE}?limit=${limit}`),
  unreadCount: () => api.get<{ count: number }>(`${BASE}/unread-count`).then((r) => r.count),
  markRead: (id: string) => api.post<{ ok: true }>(`${BASE}/${encodeURIComponent(id)}/read`),
  markAllRead: () => api.post<{ ok: true }>(`${BASE}/read-all`),
};

export type { AppNotification };
