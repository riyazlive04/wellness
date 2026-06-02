import { api } from '@/lib/api';

export interface PlatformStats {
  workspaces: {
    total: number;
    active: number;
    suspended: number;
    deleted: number;
    trial: number;
    trialExpiringSoon: number;
    createdLast30d: number;
  };
  members: {
    total: number;
    owners: number;
  };
}

export interface AdminWorkspaceListItem {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  status: 'active' | 'suspended' | 'deleted';
  trial_ends_at: string;
  created_at: string;
  owner_id: string;
  owner_email: string | null;
  member_count: number;
}

export interface ListWorkspacesResult {
  items: AdminWorkspaceListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListWorkspacesParams {
  status?: 'active' | 'suspended' | 'deleted' | 'all';
  plan?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

function buildListUrl(params: ListWorkspacesParams): string {
  const sp = new URLSearchParams();
  if (params.status) sp.set('status', params.status);
  if (params.plan)   sp.set('plan', params.plan);
  if (params.q)      sp.set('q', params.q);
  if (params.limit  !== undefined) sp.set('limit', String(params.limit));
  if (params.offset !== undefined) sp.set('offset', String(params.offset));
  const s = sp.toString();
  return s ? `/api/v1/admin/workspaces?${s}` : '/api/v1/admin/workspaces';
}

export const adminApi = {
  stats: () => api.get<PlatformStats>('/api/v1/admin/workspaces/stats'),

  listWorkspaces: (params: ListWorkspacesParams = {}) =>
    api.get<ListWorkspacesResult>(buildListUrl(params)),

  suspend: (id: string) =>
    api.post<{ id: string; status: 'suspended' }>(`/api/v1/admin/workspaces/${id}/suspend`),

  activate: (id: string) =>
    api.post<{ id: string; status: 'active' }>(`/api/v1/admin/workspaces/${id}/activate`),

  softDelete: (id: string) =>
    api.delete<{ id: string; status: 'deleted' }>(`/api/v1/admin/workspaces/${id}`),
};
