/** Roles inside an organization. Mirrors the CHECK constraint in SQL. */
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
  /** Number of active workspaces attached. */
  workspace_count: number;
  /** Number of active members. */
  member_count: number;
  /** Caller's role inside this org — convenience for the UI. */
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

export interface CreateOrgInput {
  name: string;
  slug: string;
  description?: string | null;
  brand_color?: string | null;
  billing_email?: string | null;
}

export interface UpdateOrgInput {
  name?: string;
  slug?: string;
  description?: string | null;
  brand_color?: string | null;
  logo_url?: string | null;
  billing_email?: string | null;
}

/** One location's rollup line in the franchise dashboard. */
export interface FranchiseWorkspaceRow {
  id: string;
  name: string;
  plan: string;
  clients: number;
  newThisMonth: number;
  team: number;
  mrrInr: number;
}

/** Cross-location aggregate for an organization (the "Franchise dashboard"). */
export interface FranchiseDashboard {
  totals: { locations: number; clients: number; newThisMonth: number; team: number; mrrInr: number };
  workspaces: FranchiseWorkspaceRow[];
}
