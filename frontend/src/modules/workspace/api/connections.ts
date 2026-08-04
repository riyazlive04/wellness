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
}

export interface SaveEmailResult {
  view: ConnectionView;
  test: { ok: boolean; error?: string };
}

export const connectionsApi = {
  list: () => api.get<ConnectionView[]>('/api/v1/workspaces/me/connections'),
  saveEmail: (body: { apiKey: string; fromEmail: string; fromName?: string }) =>
    api.put<SaveEmailResult>('/api/v1/workspaces/me/connections/email', { body }),
  testEmail: () =>
    api.post<{ ok: boolean; error?: string }>('/api/v1/workspaces/me/connections/email/test', { body: {} }),
  disconnect: (channel: ConnectionChannel) =>
    api.delete<{ ok: boolean }>(`/api/v1/workspaces/me/connections/${channel}`),
};
