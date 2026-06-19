import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useScope } from '@/hooks/useScope';
import { SirahLoader } from '@/design-system';

/**
 * Gate for owner-only workspace pages (billing, subscription, team,
 * organizations). Managers/coaches are redirected to the dashboard — the
 * backend enforces this too, but this keeps them out of a page that would
 * otherwise just error. Super admins pass.
 *
 * The phase handling mirrors RequireRole: we must NOT decide until the session
 * AND scope are definitively resolved, otherwise a fresh hook instance (whose
 * session state starts "unknown", query disabled, data undefined) would bounce
 * the real owner away before scope ever loads.
 */
export function RequireWorkspaceOwner({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { hasSession, sessionUnknown, data: scope, isLoading, isError } = useScope();

  // Session still resolving — wait.
  if (sessionUnknown) return <SirahLoader />;
  // Definitely signed out — let the outer auth guard handle it.
  if (!hasSession) return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  // Signed in but scope not loaded yet — wait.
  if (isLoading || (!scope && !isError)) return <SirahLoader />;
  // Scope errored — don't hard-block; the backend still enforces on the API.
  if (isError || !scope) return <>{children}</>;

  const isOwner = scope.workspaceRole === 'owner' || scope.isSuperAdmin;
  if (!isOwner) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
