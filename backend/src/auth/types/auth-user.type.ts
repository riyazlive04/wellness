export interface AuthUser {
  id: string;
  email?: string;
  role: string;
  orgId?: string;
  appRoles: string[];
}

export interface SupabaseJwtPayload {
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  role?: string;
  email?: string;
  app_metadata?: {
    org_id?: string;
    roles?: string[];
    [key: string]: unknown;
  };
  user_metadata?: Record<string, unknown>;
}
