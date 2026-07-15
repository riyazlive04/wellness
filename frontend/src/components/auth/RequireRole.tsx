import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { SirahLoader } from '@/design-system';
import { useScope, type Tier } from '@/hooks/useScope';

interface RequireRoleProps {
  /** Allowed tiers. Default: any signed-in user. */
  allow?: Tier[];
  /**
   * Path to redirect unauthenticated users to. Default `/auth`. Pass empty
   * string to render the fallback instead of redirecting.
   */
  unauthenticatedTo?: string;
  /**
   * Path to redirect signed-in users to when their tier isn't in `allow`.
   * Defaults to the "home" of their tier (super_admin -> /admin,
   * workspace -> /dashboard, client -> /portal).
   */
  forbiddenTo?: string;
  /** What to render while the scope is loading. Defaults to the SIRAH LIFE loader. */
  fallback?: ReactNode;
  children: ReactNode;
}

const TIER_HOME: Record<Tier, string> = {
  super_admin:   '/admin',
  workspace:     '/dashboard',
  client:        '/portal',
  unaffiliated:  '/onboarding',
};

/**
 * Route guard. Tiers map 1:1 to SIRAH LIFE's 3 levels (+ unaffiliated for
 * users who haven't joined a workspace yet). Backend independently enforces;
 * this guard is UX-only.
 *
 * Usage:
 *   <RequireRole allow={['workspace']}>
 *     <OwnerDashboard />
 *   </RequireRole>
 */
export function RequireRole({
  allow,
  unauthenticatedTo = '/auth',
  forbiddenTo,
  fallback,
  children,
}: RequireRoleProps): JSX.Element {
  const location = useLocation();
  const { hasSession, sessionUnknown, data: scope, isLoading, isError } = useScope();

  // Phase 1: Supabase session is STILL resolving (first ~100-300ms after
  // page load, also right after sign-in before getSession returns).
  // Showing the loader instead of redirecting prevents a race where the
  // guard bounces the user to /auth before the fresh session is observed.
  if (sessionUnknown) {
    return <>{fallback ?? <SirahLoader />}</>;
  }

  // Phase 2: definitely no session — redirect to /auth.
  if (!hasSession) {
    return unauthenticatedTo
      ? <Navigate to={unauthenticatedTo} state={{ from: location.pathname }} replace />
      : <>{fallback ?? null}</>;
  }

  // Phase 3: signed-in but scope still resolving.
  if (isLoading || (!scope && !isError)) {
    return <>{fallback ?? <SirahLoader />}</>;
  }

  // Phase 3: scope errored — fall through to children (backend will gate
  // again on the actual API calls). Surface the error visually upstream.
  if (isError || !scope) {
    return <>{children}</>;
  }

  // Phase 4: tier check
  if (!allow || allow.length === 0 || allow.includes(scope.tier)) {
    return <>{children}</>;
  }

  return <Navigate to={forbiddenTo ?? TIER_HOME[scope.tier]} replace />;
}

/** Shortcut: super_admin only. */
export const RequireSuperAdmin = ({ children, ...rest }: Omit<RequireRoleProps, 'allow'>) =>
  <RequireRole allow={['super_admin']} {...rest}>{children}</RequireRole>;

/**
 * Shortcut: workspace owner / member (any role inside a workspace).
 * Super admins are NOT included — they get bounced to /admin instead.
 * A future "impersonate workspace" feature can override per-route.
 */
export const RequireWorkspace = ({ children, ...rest }: Omit<RequireRoleProps, 'allow'>) =>
  <RequireRole allow={['workspace']} {...rest}>{children}</RequireRole>;

/** Shortcut: client only. */
export const RequireClient = ({ children, ...rest }: Omit<RequireRoleProps, 'allow'>) =>
  <RequireRole allow={['client']} {...rest}>{children}</RequireRole>;
