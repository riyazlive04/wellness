import { api } from '@/lib/api';
import type { ActivityAction, ActivityLogRow } from '@/lib/owner/api/activity-log';

export type OrgRole = 'org_owner' | 'org_admin' | 'org_viewer';
export type OrgMemberStatus = 'active' | 'invited' | 'revoked';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand_color: string | null;
  logo_url: string | null;
  billing_email: string | null;
  created_at: string;
  updated_at: string;
  workspace_count: number;
  member_count: number;
  my_role: OrgRole;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  email: string | null;
  role: OrgRole;
  status: OrgMemberStatus;
  invited_by: string | null;
  joined_at: string;
}

export interface OrganizationWorkspace {
  id: string;
  name: string;
  organization_id: string;
  created_at: string;
}

export interface FranchiseWorkspaceRow {
  id: string;
  name: string;
  plan: string;
  clients: number;
  newThisMonth: number;
  team: number;
  mrrInr: number;
}

export interface FranchiseDashboard {
  totals: { locations: number; clients: number; newThisMonth: number; team: number; mrrInr: number };
  workspaces: FranchiseWorkspaceRow[];
}

export interface CreateOrgInput {
  name: string;
  slug: string;
  description?: string;
  brand_color?: string;
  billing_email?: string;
}

export type UpdateOrgInput = Partial<CreateOrgInput> & { logo_url?: string | null };

export const organizationsApi = {
  list: () =>
    api.get<OrganizationSummary[]>('/api/v1/organizations'),

  get: (id: string) =>
    api.get<OrganizationSummary>(`/api/v1/organizations/${id}`),

  create: (body: CreateOrgInput) =>
    api.post<OrganizationSummary>('/api/v1/organizations', { body }),

  update: (id: string, body: UpdateOrgInput) =>
    api.patch<OrganizationSummary>(`/api/v1/organizations/${id}`, { body }),

  remove: (id: string) =>
    api.delete<{ id: string }>(`/api/v1/organizations/${id}`),

  listMembers: (id: string) =>
    api.get<OrganizationMember[]>(`/api/v1/organizations/${id}/members`),

  addMember: (id: string, body: { email: string; role: OrgRole }) =>
    api.post<OrganizationMember>(`/api/v1/organizations/${id}/members`, { body }),

  updateMember: (id: string, memberId: string, body: { role: OrgRole }) =>
    api.patch<OrganizationMember>(`/api/v1/organizations/${id}/members/${memberId}`, { body }),

  removeMember: (id: string, memberId: string) =>
    api.delete<{ id: string }>(`/api/v1/organizations/${id}/members/${memberId}`),

  listWorkspaces: (id: string) =>
    api.get<OrganizationWorkspace[]>(`/api/v1/organizations/${id}/workspaces`),

  dashboard: (id: string) =>
    api.get<FranchiseDashboard>(`/api/v1/organizations/${id}/dashboard`),

  attachWorkspace: (id: string, workspaceId: string) =>
    api.post<OrganizationWorkspace>(`/api/v1/organizations/${id}/workspaces/attach`, {
      body: { workspace_id: workspaceId },
    }),

  detachWorkspace: (id: string, workspaceId: string) =>
    api.delete<{ id: string }>(`/api/v1/organizations/${id}/workspaces/${workspaceId}`),

  listActivity: (
    id: string,
    params: {
      limit?: number;
      offset?: number;
      workspaceId?: string;
      actor?: string;
      entityType?: string;
      action?: ActivityAction;
      search?: string;
    } = {},
  ) =>
    api.get<ActivityLogRow[]>(`/api/v1/organizations/${id}/activity${orgQs(params)}`),
};

function orgQs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  org_owner:  'Owner',
  org_admin:  'Admin',
  org_viewer: 'Viewer',
};
