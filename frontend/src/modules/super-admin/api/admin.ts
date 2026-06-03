import { api } from '@/lib/api';

// ──────────────────────────────────────────────────────────────────
// Stats + workspaces
// ──────────────────────────────────────────────────────────────────

export interface PlatformStats {
  workspaces: { total: number; active: number; suspended: number; deleted: number; trial: number; trialExpiringSoon: number; createdLast30d: number };
  members: { total: number; owners: number };
}

export interface AdminWorkspaceListItem {
  id: string; name: string; slug: string | null; plan: string;
  status: 'active' | 'suspended' | 'deleted';
  trial_ends_at: string; created_at: string;
  owner_id: string; owner_email: string | null;
  member_count: number;
}

export interface AdminWorkspaceDetail extends AdminWorkspaceListItem {
  contact_email: string | null; contact_phone: string | null;
  city: string | null; country_code: string | null;
  gstin: string | null; pan: string | null;
  members: Array<{ user_id: string; email: string | null; role: string; status: string; joined_at: string }>;
  counts: { members: number; clients: number; programs: number; appointments: number; meal_logs: number; assessments: number };
}

export interface ListWorkspacesResult { items: AdminWorkspaceListItem[]; total: number; limit: number; offset: number }
export interface ListWorkspacesParams { status?: 'active' | 'suspended' | 'deleted' | 'all'; plan?: string; q?: string; limit?: number; offset?: number }

// ──────────────────────────────────────────────────────────────────
// Users + team
// ──────────────────────────────────────────────────────────────────

export interface AdminUserListItem {
  id: string; email: string | null;
  created_at: string; last_sign_in_at: string | null;
  banned: boolean; banned_until: string | null;
  workspace_count: number; roles: string[];
}
export interface ListUsersResult { items: AdminUserListItem[]; total: number; limit: number; offset: number }

export interface AdminTeamMember {
  id: string; email: string | null;
  created_at: string; granted_at: string;
}

// ──────────────────────────────────────────────────────────────────
// Announcements
// ──────────────────────────────────────────────────────────────────

export interface Announcement {
  id: string; title: string; body: string;
  severity: 'info' | 'warning' | 'critical';
  target_workspace_ids: string[] | null;
  published_at: string | null;
  starts_at: string; ends_at: string | null;
  dismissible: boolean;
  created_by: string | null; created_at: string; updated_at: string;
}

export interface ActiveAnnouncement {
  id: string; title: string; body: string;
  severity: 'info' | 'warning' | 'critical';
  dismissible: boolean;
  starts_at: string; ends_at: string | null;
}

export interface UpsertAnnouncementPayload {
  title: string; body: string;
  severity?: 'info' | 'warning' | 'critical';
  target_workspace_ids?: string[];
  starts_at?: string; ends_at?: string;
  dismissible?: boolean;
}

// ──────────────────────────────────────────────────────────────────
// Config + audit
// ──────────────────────────────────────────────────────────────────

export interface PlatformPlan { id: string; name: string; monthly_inr: number; ai_calls: number; features: string[] }
export interface PlatformConfig {
  id: number; trial_days: number;
  plans: PlatformPlan[];
  feature_flags: Record<string, unknown>;
  ai_quotas: Record<string, number>;
  updated_at: string; updated_by: string | null;
}

export interface AuditEntry {
  id: string;
  actor_id: string | null; actor_email: string | null;
  action: string;
  resource_type: string | null; resource_id: string | null; resource_label: string | null;
  details: unknown;
  ip_address: string | null;
  created_at: string;
}
export interface ListAuditResult { items: AuditEntry[]; total: number; limit: number; offset: number }

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function buildQs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ──────────────────────────────────────────────────────────────────
// API surface
// ──────────────────────────────────────────────────────────────────

export const adminApi = {
  // Stats + workspaces
  stats: () => api.get<PlatformStats>('/api/v1/admin/workspaces/stats'),

  listWorkspaces: (params: ListWorkspacesParams = {}) =>
    api.get<ListWorkspacesResult>(`/api/v1/admin/workspaces${buildQs({
      status: params.status === 'all' ? undefined : params.status,
      plan: params.plan, q: params.q, limit: params.limit, offset: params.offset,
    })}`),
  workspaceDetail: (id: string) => api.get<AdminWorkspaceDetail>(`/api/v1/admin/workspaces/${id}`),
  suspend:    (id: string) => api.post<{ id: string; status: 'suspended' }>(`/api/v1/admin/workspaces/${id}/suspend`),
  activate:   (id: string) => api.post<{ id: string; status: 'active' }>(`/api/v1/admin/workspaces/${id}/activate`),
  softDelete: (id: string) => api.delete<{ id: string; status: 'deleted' }>(`/api/v1/admin/workspaces/${id}`),

  // Users
  listUsers: (params: { q?: string; limit?: number; offset?: number } = {}) =>
    api.get<ListUsersResult>(`/api/v1/admin/users${buildQs(params)}`),
  resetPassword: (id: string) => api.post<{ id: string; email: string; sent: true }>(`/api/v1/admin/users/${id}/reset-password`),
  banUser:       (id: string) => api.post<{ id: string; banned: true }>(`/api/v1/admin/users/${id}/ban`),
  unbanUser:     (id: string) => api.post<{ id: string; banned: false }>(`/api/v1/admin/users/${id}/unban`),

  // Team
  listTeam: () => api.get<{ items: AdminTeamMember[] }>('/api/v1/admin/team'),
  inviteSuperAdmin: (email: string, password: string) =>
    api.post<{ id: string; email: string; granted: true }>('/api/v1/admin/team/invite', { body: { email, password } }),
  revokeSuperAdmin: (id: string) => api.post<{ id: string; revoked: true }>(`/api/v1/admin/team/${id}/revoke`),

  // Announcements
  listAnnouncements:   () => api.get<{ items: Announcement[] }>('/api/v1/admin/announcements'),
  createAnnouncement:  (p: UpsertAnnouncementPayload) => api.post<Announcement>('/api/v1/admin/announcements', { body: p }),
  updateAnnouncement:  (id: string, p: UpsertAnnouncementPayload) => api.patch<Announcement>(`/api/v1/admin/announcements/${id}`, { body: p }),
  publishAnnouncement:   (id: string) => api.post<Announcement>(`/api/v1/admin/announcements/${id}/publish`),
  unpublishAnnouncement: (id: string) => api.post<Announcement>(`/api/v1/admin/announcements/${id}/unpublish`),
  deleteAnnouncement:    (id: string) => api.delete<{ id: string; deleted: true }>(`/api/v1/admin/announcements/${id}`),
  activeAnnouncements:   () => api.get<{ items: ActiveAnnouncement[] }>('/api/v1/announcements/active'),

  // Config
  getConfig:    () => api.get<PlatformConfig>('/api/v1/admin/config'),
  updateConfig: (p: Partial<PlatformConfig>) => api.patch<PlatformConfig>('/api/v1/admin/config', { body: p }),

  // Audit
  listAudit: (params: { actionPrefix?: string; actorId?: string; resourceType?: string; resourceId?: string; limit?: number; offset?: number } = {}) =>
    api.get<ListAuditResult>(`/api/v1/admin/audit${buildQs(params)}`),
};
