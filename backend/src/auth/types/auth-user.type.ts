/**
 * The shape of req.user after JWT validation. Built by JwtStrategy.validate().
 *
 * Three SIRAH LIFE tiers map to fields here:
 *   - Super Admin    → isSuperAdmin=true (regardless of workspace membership)
 *   - Workspace user → workspaceId + workspaceRole set
 *   - Client         → workspaceId set, workspaceRole=null, isClient=true
 *
 * workspaceId may be null only for super admins who don't belong to any
 * workspace, or for freshly-signed-up users who haven't created/joined one.
 */
export interface AuthUser {
  /** Supabase auth.users.id (uuid) */
  id: string;
  email?: string;
  /** Supabase JWT `role` claim — usually 'authenticated'. NOT the SIRAH role. */
  jwtRole: string;
  /** True if user has the `super_admin` row in public.user_roles. */
  isSuperAdmin: boolean;
  /**
   * Primary workspace the user belongs to. Resolved from
   * public.workspace_members (oldest active membership wins).
   */
  workspaceId: string | null;
  /** Role inside the workspace. null for super_admins / unaffiliated users. */
  workspaceRole: WorkspaceMemberRole | null;
  /** Legacy app_role values: admin / client / manager / super_admin. */
  appRoles: string[];
  /** Any appRole is 'client' — gates the client portal. */
  isClient: boolean;
}

export type WorkspaceMemberRole =
  | 'owner'
  | 'nutritionist'
  | 'assistant_nutritionist'
  | 'receptionist'
  | 'coach'
  | 'support';

export interface SupabaseJwtPayload {
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  role?: string;
  email?: string;
  app_metadata?: {
    workspace_id?: string;
    org_id?: string;
    roles?: string[];
    [key: string]: unknown;
  };
  user_metadata?: Record<string, unknown>;
}
