import { api } from '@/lib/api';

/**
 * Tenancy — plan limits + team management (Module 2).
 * Mirrors backend/src/tenancy/*.
 */

export interface PlanLimits {
  maxClients: number | null;
  maxTeam: number | null;
  aiCallsPerMonth: number | null;
  maxStorageBytes: number | null;
}

export interface WorkspaceUsage {
  clients: number;
  team: number;
  aiCallsThisMonth: number;
  storageBytes: number;
}

export interface LimitsSnapshot {
  plan: string;
  limits: PlanLimits;
  usage: WorkspaceUsage;
  remaining: {
    clients: number | null;
    team: number | null;
    aiCallsThisMonth: number | null;
    storageBytes: number | null;
  };
}

export interface TeamMember {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  status: string;
  joined_at: string;
}

export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface TeamInvitePreview {
  workspace_name: string;
  role: string;
  invited_by_email: string | null;
  expires_at: string;
  valid: boolean;
  reason?: string;
}

export const INVITABLE_ROLES = [
  'manager', 'nutritionist', 'assistant_nutritionist', 'receptionist', 'coach', 'support',
] as const;

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  nutritionist: 'Nutritionist',
  assistant_nutritionist: 'Assistant',
  receptionist: 'Receptionist',
  coach: 'Coach',
  support: 'Support',
};

export const tenancyApi = {
  getLimits: () => api.get<LimitsSnapshot>('/api/v1/workspaces/me/limits'),

  listMembers: () => api.get<TeamMember[]>('/api/v1/workspaces/me/team/members'),
  /** Provision a staff login directly (email + password) — no invite email. */
  createMember: (body: { email: string; password: string; role: string }) =>
    api.post<{ user_id: string; email: string; role: string; created: boolean }>('/api/v1/workspaces/me/team/members', { body }),
  updateMemberRole: (id: string, role: string) =>
    api.patch<TeamMember>(`/api/v1/workspaces/me/team/members/${id}`, { body: { role } }),
  removeMember: (id: string) =>
    api.delete<{ id: string }>(`/api/v1/workspaces/me/team/members/${id}`),

  listInvites: () => api.get<WorkspaceInvite[]>('/api/v1/workspaces/me/team/invites'),
  invite: (body: { email: string; role: string; notes?: string }) =>
    api.post<WorkspaceInvite>('/api/v1/workspaces/me/team/invites', { body }),
  revokeInvite: (id: string) =>
    api.post<{ id: string }>(`/api/v1/workspaces/me/team/invites/${id}/revoke`, { body: {} }),
};

// ── Permissions ──────────────────────────────────────────────────────

export type OverrideEffect = 'grant' | 'deny';

export interface PermissionOverride {
  permission: string;
  effect: OverrideEffect;
}

export interface PermissionCatalog {
  permissions: string[];
  groups: Array<{ resource: string; label: string; permissions: string[] }>;
  roleDefaults: Record<string, string[]>;
}

export interface MemberPermissions {
  member_id: string;
  user_id: string;
  role: string;
  role_defaults: string[];
  overrides: PermissionOverride[];
  effective: string[];
}

export const PERMISSION_LABEL: Record<string, string> = {
  'clients.read': 'View clients',
  'clients.write': 'Edit clients',
  'clients.delete': 'Delete clients',
  'programs.read': 'View programs',
  'programs.write': 'Edit programs',
  'recipes.read': 'View recipes',
  'recipes.write': 'Edit recipes',
  'messaging.use': 'Messaging',
  'appointments.manage': 'Manage appointments',
  'ai.use': 'Use AI services',
  'analytics.view': 'View analytics',
  'reports.view': 'View reports',
  'automation.manage': 'Manage automation',
  'billing.manage': 'Manage billing',
  'team.manage': 'Manage team',
  'settings.manage': 'Manage settings',
  'audit.view': 'View audit log',
  'assessments.manage': 'Assessments',
  'food_library.view': 'Food library',
  'plate_review.use': 'Plate review',
  'ai_ecosystem.view': 'AI Ecosystem',
  'collaborate.use': 'Team chat',
  'community.use': 'Community',
  'announcements.manage': 'Announcements',
};

export const permissionsApi = {
  catalog: () => api.get<PermissionCatalog>('/api/v1/workspaces/me/permissions/catalog'),
  getMember: (memberId: string) =>
    api.get<MemberPermissions>(`/api/v1/workspaces/me/team/members/${memberId}/permissions`),
  setMember: (memberId: string, overrides: PermissionOverride[]) =>
    api.put<MemberPermissions>(`/api/v1/workspaces/me/team/members/${memberId}/permissions`, { body: { overrides } }),
};

export const teamInvitesApi = {
  preview: (token: string) => api.get<TeamInvitePreview>(`/api/v1/team-invites/${token}`),
  accept: (token: string) =>
    api.post<{ workspaceId: string; role: string; accepted: true }>(`/api/v1/team-invites/${token}/accept`, { body: {} }),
};

// ── Workspace switching + impersonation ──────────────────────────────

export interface MembershipOption {
  workspace_id: string;
  name: string;
  role: string;
  is_active: boolean;
}

export interface ActiveWorkspace {
  workspace_id: string;
  is_impersonation: boolean;
}

export const switchApi = {
  memberships: () => api.get<MembershipOption[]>('/api/v1/workspaces/me/memberships'),
  active: () => api.get<ActiveWorkspace | null>('/api/v1/workspaces/me/active'),
  switch: (workspaceId: string) =>
    api.post<ActiveWorkspace>('/api/v1/workspaces/me/switch', { body: { workspaceId } }),
  impersonate: (workspaceId: string) =>
    api.post<ActiveWorkspace>('/api/v1/admin/impersonate', { body: { workspaceId } }),
  stopImpersonating: () =>
    api.post<{ stopped: true }>('/api/v1/admin/impersonate/stop', { body: {} }),
};
