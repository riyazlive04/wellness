import { api } from '@/lib/api';
import type { PushApiAdapter } from '@/hooks/usePushSubscription';

interface PushConfig {
  vapidPublicKey: string | null;
  enabled: boolean;
}

/**
 * Push subscription adapter for platform super-admins. Same handshake as the
 * client and staff adapters, but hits /admin/push/* — subscriptions are stored
 * against the admin's user id only (no workspace/client), so
 * NotificationsService.notifySuperAdmins() reaches these devices.
 */
export const adminPushApi: PushApiAdapter = {
  pushConfig: () => api.get<PushConfig>('/api/v1/admin/push/config'),
  pushSubscribe: (body) =>
    api.post<{ subscribed: true }>('/api/v1/admin/push/subscribe', { body }),
  pushUnsubscribe: (endpoint) =>
    api.post<{ unsubscribed: true }>('/api/v1/admin/push/unsubscribe', { body: { endpoint } }),
};
