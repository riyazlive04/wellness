import { api } from '@/lib/api';

export type ConnectionChannel = 'email' | 'whatsapp';
export type ConnectionStatus = 'disconnected' | 'pending' | 'connected' | 'error';

/** Secret-free view of a workspace channel connection. */
export interface ConnectionView {
  channel: ConnectionChannel;
  provider: string | null;
  status: ConnectionStatus;
  identity: string | null;
  has_secret: boolean;
  last_error: string | null;
  last_tested_at: string | null;
  /** WhatsApp only: client reminders are sent from this number. */
  notify_clients?: boolean;
  /**
   * WhatsApp only: which number sends. 'platform' is NUSI's official Meta
   * sender and needs nothing linked; 'own' is the practice's own number via
   * Evolution. Older servers omit it, so a missing value means 'platform'.
   */
  sender?: 'platform' | 'own';
}

export interface SaveEmailResult {
  view: ConnectionView;
  test: { ok: boolean; error?: string };
}

export interface WhatsappStatus {
  status: ConnectionStatus | 'disconnected';
  qr?: string | null;
  number?: string | null;
  profileName?: string | null;
  /** Client reminders (appointments, meal plans) go out from this number. */
  notify_clients?: boolean;
}

export const connectionsApi = {
  list: () => api.get<ConnectionView[]>('/api/v1/workspaces/me/connections'),
  saveEmail: (body: { apiKey: string; fromEmail: string; fromName?: string }) =>
    api.put<SaveEmailResult>('/api/v1/workspaces/me/connections/email', { body }),
  testEmail: () =>
    api.post<{ ok: boolean; error?: string }>('/api/v1/workspaces/me/connections/email/test', { body: {} }),
  disconnect: (channel: ConnectionChannel) =>
    api.delete<{ ok: boolean }>(`/api/v1/workspaces/me/connections/${channel}`),

  // WhatsApp (per-workspace Evolution instance)
  connectWhatsapp: () =>
    api.post<{ status: string; qr: string | null; code: string | null }>('/api/v1/workspaces/me/connections/whatsapp/connect', { body: {} }),
  whatsappStatus: () =>
    api.get<WhatsappStatus>('/api/v1/workspaces/me/connections/whatsapp/status'),
  setNotifyClients: (enabled: boolean) =>
    api.put<ConnectionView>('/api/v1/workspaces/me/connections/whatsapp/notify-clients', { body: { enabled } }),
};
