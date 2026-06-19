import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useScope } from '@/hooks/useScope';
import { SirahLoader } from '@/design-system';

/**
 * Gate for owner-only workspace pages (billing, subscription, team,
 * organizations). Managers/coaches are redirected to the dashboard — the
 * backend enforces this too, but this keeps them out of a page that would
 * otherwise just error. Super admins pass.
 */
export function RequireWorkspaceOwner({ children }: { children: ReactNode }) {
  const { data: scope, isLoading } = useScope();
  if (isLoading) return <SirahLoader />;
  const isOwner = scope?.workspaceRole === 'owner' || !!scope?.isSuperAdmin;
  if (!isOwner) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
