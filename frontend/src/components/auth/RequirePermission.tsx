import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { SirahLoader } from '@/design-system';
import { useScope } from '@/hooks/useScope';

/**
 * Route guard for owner-delegatable areas (Billing, Team, Subscription).
 *
 * Renders children if the caller is the workspace owner / super admin, OR their
 * effective permissions include `perm` — so an owner can delegate an otherwise
 * owner-only area to a manager via the permission toggles. Everyone else is
 * bounced to their dashboard. Backend independently enforces the same
 * permission on the endpoints; this guard is UX-only.
 */
export function RequirePermission({ perm, children }: { perm: string; children: ReactNode }) {
  const location = useLocation();
  const { hasSession, sessionUnknown, data: scope, isLoading, isError } = useScope();

  if (sessionUnknown) return <SirahLoader />;
  if (!hasSession) return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  // Signed in but scope not resolved yet — wait rather than bounce.
  if (isLoading || (!scope && !isError)) return <SirahLoader />;
  // Scope errored — fall through; the backend still gates the actual calls.
  if (isError || !scope) return <>{children}</>;

  const allowed =
    scope.isSuperAdmin ||
    scope.workspaceRole === 'owner' ||
    (scope.permissions ?? []).includes(perm);

  if (!allowed) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
