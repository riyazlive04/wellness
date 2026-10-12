import { api } from '@/lib/api';

/** The practice's video calls as the backend shows them — never the key itself. */
export interface VideoKeyView {
  /** 'own' = the practice's Daily.co account (no plan hours used); 'nusi' = NUSI's, using the plan's hours. */
  source: 'own' | 'nusi';
  status: 'missing' | 'connected' | 'error';
  last4: string | null;
  /** The Daily.co subdomain the key belongs to. */
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
