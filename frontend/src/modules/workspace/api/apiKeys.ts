import { api } from '@/lib/api';

/** Non-secret view of a key (list). */
export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** POST response — carries the plaintext key ONCE. */
export interface CreatedApiKey {
  id: string;
  name: string;
  key: string;
  key_prefix: string;
  created_at: string;
}

export const apiKeysApi = {
  list: () => api.get<ApiKeyRow[]>('/api/v1/workspaces/me/api-keys'),
  create: (name: string) =>
    api.post<CreatedApiKey>('/api/v1/workspaces/me/api-keys', { body: { name } }),
  revoke: (id: string) => api.delete<{ id: string }>(`/api/v1/workspaces/me/api-keys/${id}`),
};
