import { api } from '@/lib/api';
import type { ChannelKey, EventKey, QuietHours } from '../types';

export type ChannelToggles = Record<ChannelKey, boolean>;

/** Mirrors the backend NotificationPreferences shape (round-trips as-is). */
export interface NotificationPreferences {
  channels: ChannelToggles;
  events: Partial<Record<EventKey, ChannelToggles>>;
  quietHours: QuietHours;
  tzOffsetMinutes: number | null;
}

/** Per-channel outcome of a verification test send. */
export type TestSendResult = Record<'email' | 'whatsapp', { ok: boolean; reason: string } | undefined>;

export const notificationPreferencesApi = {
  get: () => api.get<NotificationPreferences>('/api/v1/notifications/preferences'),
  update: (prefs: NotificationPreferences) =>
    api.put<NotificationPreferences>('/api/v1/notifications/preferences', { body: prefs }),
  /** Fire a test notification to the caller's own email / WhatsApp to verify delivery. */
  sendTest: (channels: Array<'email' | 'whatsapp'>) =>
    api.post<TestSendResult>('/api/v1/notifications/test', { body: { channels } }),
};
