import { api } from '@/lib/api';

// ──────────────────────────────────────────────────────────────────
// Types — kept in sync with backend/src/clients/clients.types.ts
// ──────────────────────────────────────────────────────────────────

export type ClientStatus = 'active' | 'paused' | 'archived' | 'completed' | string;
export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface ClientListItem {
  id: string;
  user_id: string | null;
  workspace_id: string;
  name: string;
  email: string;
  phone: string | null;
  status: ClientStatus | null;
  program_type: string | null;
  target_kcal: number | null;
  last_weight: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListClientsResult {
  items: ClientListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ClientInviteRow {
  id: string;
  workspace_id: string;
  email: string;
  name: string | null;
  token: string;
  invited_by: string;
  status: InviteStatus;
  accepted_user_id: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvitePreview {
  id: string;
  workspace_name: string;
  workspace_slug: string | null;
  inviter_email: string | null;
  email: string;
  expires_at: string;
  status: InviteStatus;
  is_expired: boolean;
}

export interface ClientProfile {
  id: string;
  user_id: string;
  workspace_id: string;
  workspace_name: string | null;
  name: string;
  email: string;
  phone: string | null;
  age: number | null;
  gender: string | null;
  goals: string | null;
  target_kcal: number | null;
  program_type: string | null;
  status: ClientStatus | null;
}

export interface ClientMealLog {
  id: string;
  meal_type: string;
  meal_name: string | null;
  kcal: number | null;
  photo_url: string | null;
  notes: string | null;
  logged_at: string;
}

export interface ClientMessage {
  id: string;
  sender_type: 'system' | 'admin' | 'client';
  message_type: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

export interface ClientProgram {
  id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  total_kcal: number | null;
  status: string | null;
  published_at: string | null;
}

// ──────────────────────────────────────────────────────────────────
// API surface
// ──────────────────────────────────────────────────────────────────

function buildQs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const clientsApi = {
  // Workspace-admin endpoints
  list: (params: { q?: string; status?: string; limit?: number; offset?: number } = {}) =>
    api.get<ListClientsResult>(`/api/v1/workspaces/me/clients${buildQs(params)}`),
  listInvites: () => api.get<{ items: ClientInviteRow[] }>('/api/v1/workspaces/me/clients/invites'),
  invite: (body: { email: string; name?: string; notes?: string }) =>
    api.post<ClientInviteRow>('/api/v1/workspaces/me/clients/invite', { body }),
  revokeInvite: (id: string) =>
    api.post<ClientInviteRow>(`/api/v1/workspaces/me/clients/invites/${id}/revoke`),

  // Public invite preview + accept
  previewInvite: (token: string) =>
    api.get<InvitePreview>(`/api/v1/invites/${token}`, { skipAuth: true }),
  acceptInvite: (token: string) =>
    api.post<{ workspaceId: string; clientId: string; accepted: true }>(`/api/v1/invites/${token}/accept`),

  // Client-self endpoints
  myProfile:  () => api.get<ClientProfile>('/api/v1/me/profile'),
  myMeals:    (days = 7) => api.get<ClientMealLog[]>(`/api/v1/me/meals${buildQs({ days })}`),
  myMessages: (limit = 50) => api.get<ClientMessage[]>(`/api/v1/me/messages${buildQs({ limit })}`),
  myProgram:  () => api.get<ClientProgram | null>('/api/v1/me/program'),
};