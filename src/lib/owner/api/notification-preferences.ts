import { api } from '@/lib/api';
import type { ChannelKey, EventKey, QuietHours } from '@/lib/owner/types/notifications';

export type ChannelToggles = Record<ChannelKey, boolean>;

/** Mirrors the backend NotificationPreferences shape (round-trips as-is). */
export interface NotificationPreferences {
  channels: ChannelToggles;
  events: Partial<Record<EventKey, ChannelToggles>>;
  quietHours: QuietHours;
  tzOffsetMinutes: number | null;
}

export const notificationPreferencesApi = {
  get: () => api.get<NotificationPreferences>('/api/v1/notifications/preferences'),
  update: (prefs: NotificationPreferences) =>
    api.put<NotificationPreferences>('/api/v1/notifications/preferences', { body: prefs }),
};
