import { api } from '@/lib/api';

/**
 * Settings the practice connects itself: its AI, its video calls and its own
 * WhatsApp number. Mirrors the web's aiKey, videoKey and connections APIs.
 * Keys are never returned, only their last 4 characters.
 */

export type AiProvider = 'gemini' | 'openai';

export interface AiKeyView {
  provider: AiProvider | null;
  last4: string | null;
  status: 'connected' | 'error' | 'missing';
  last_error: string | null;
  last_tested_at: string | null;
  /** NUSI's AI comes with the practice's plan (paid plans and live trials). */
  included?: boolean;
  /** Which key AI calls use right now. */
  source?: 'own' | 'nusi' | 'none';
}

/** Which AI the practice is on, for servers that predate `source`. */
export function aiSource(v: AiKeyView | undefined): 'own' | 'nusi' | 'none' {
  if (!v) return 'none';
  return v.source ?? (v.status === 'missing' ? 'none' : 'own');
}

export const aiKeyApi = {
  get: () => api.get<AiKeyView>('/api/v1/workspaces/me/ai-key'),
  save: (provider: AiProvider, key: string) =>
    api.put<AiKeyView>('/api/v1/workspaces/me/ai-key', { body: { provider, key } }),
  test: () => api.post<AiKeyView>('/api/v1/workspaces/me/ai-key/test'),
  remove: () => api.delete<{ removed: boolean }>('/api/v1/workspaces/me/ai-key'),
};

export interface VideoKeyView {
  /** 'own' = the practice's Daily.co account (no plan hours used); 'nusi' = NUSI's, using the plan's hours. */
  source: 'own' | 'nusi';
  status: 'missing' | 'connected' | 'error';
  last4: string | null;
  domain: string | null;
  last_error: string | null;
  last_tested_at: string | null;
}

export const videoKeyApi = {
  get: () => api.get<VideoKeyView>('/api/v1/workspaces/me/video-key'),
  save: (key: string) => api.put<VideoKeyView>('/api/v1/workspaces/me/video-key', { body: { key } }),
  test: () => api.post<VideoKeyView>('/api/v1/workspaces/me/video-key/test'),
  remove: () => api.delete<{ removed: boolean }>('/api/v1/workspaces/me/video-key'),
};

export interface WhatsappStatus {
  status: 'disconnected' | 'pending' | 'connected' | 'error';
  /** A data: URL of the QR code to scan while linking. */
  qr?: string | null;
  number?: string | null;
  profileName?: string | null;
  /** Client reminders (appointments, meal plans) go out from this number. */
  notify_clients?: boolean;
}

export const whatsappApi = {
  status: () => api.get<WhatsappStatus>('/api/v1/workspaces/me/connections/whatsapp/status'),
  connect: () =>
    api.post<{ status: string; qr: string | null }>('/api/v1/workspaces/me/connections/whatsapp/connect', { body: {} }),
  disconnect: () => api.delete<{ ok: boolean }>('/api/v1/workspaces/me/connections/whatsapp'),
  setNotifyClients: (enabled: boolean) =>
    api.put<unknown>('/api/v1/workspaces/me/connections/whatsapp/notify-clients', { body: { enabled } }),
  sendTest: () =>
    api.post<{ whatsapp?: { ok: boolean; reason: string } }>('/api/v1/notifications/test', {
      body: { channels: ['whatsapp'] },
    }),
};
