/**
 * Nutritionist (workspace) shell context.
 *
 * Resolves everything the owner surfaces need to decide what to show:
 *   - `scope`        — server-resolved tier / plan / features / permissions
 *   - `isOwner`      — workspace owner or super admin (holds every permission)
 *   - `can(perm)`    — fine-grained permission check
 *   - `hasFeature()` — plan entitlement check
 *   - `nav`          — the nav map already filtered by both of the above
 *   - `badges`       — live attention counts for the tab/More badges
 *
 * The backend enforces all of this independently (RolesGuard + FeaturesGuard);
 * this context exists so the UI doesn't offer doors that open onto a 402/403.
 */
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useScope, type Scope } from '@/hooks/use-scope';
import { ownerClientsApi, type SidebarBadges } from '@/lib/owner/api/clients';
import { allowedOwnerItems, visibleOwnerNav, type NavGroup, type NavItem } from '@/lib/owner/nav';
import { featuresOf, type Feature } from '@/lib/plan-capabilities';

interface OwnerContextValue {
  scope: Scope | null;
  loading: boolean;
  error: unknown;
  refetchScope: () => void;
  isOwner: boolean;
  permissions: string[];
  features: Feature[];
  can: (permission?: string) => boolean;
  hasFeature: (feature?: Feature) => boolean;
  nav: NavGroup[];
  items: NavItem[];
  badges: SidebarBadges | undefined;
}

const OwnerContext = createContext<OwnerContextValue | undefined>(undefined);

/** Workspace roles that hold every permission implicitly. */
const OWNER_ROLES = ['owner', 'admin'];

export function OwnerProvider({ children }: { children: ReactNode }) {
  const scopeQ = useScope();
  const scope = scopeQ.data ?? null;

  const isOwner = !!scope && (scope.isSuperAdmin || OWNER_ROLES.includes(scope.workspaceRole ?? ''));
  const permissions = useMemo(() => scope?.permissions ?? [], [scope]);
  const features = useMemo(() => featuresOf(scope), [scope]);

  // Attention counts. Polled rather than pushed — matches the web sidebar and
  // keeps the badge honest without holding a socket open on mobile radio.
  const badgesQ = useQuery({
    queryKey: ['owner', 'sidebar-badges'],
    queryFn: () => ownerClientsApi.sidebarBadges(),
    enabled: !!scope && scope.tier !== 'client',
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const value = useMemo<OwnerContextValue>(() => {
    const can = (permission?: string) => {
      if (!permission) return true;
      if (isOwner) return true;
      return permissions.includes(permission);
    };
    const hasFeature = (feature?: Feature) => (feature ? features.includes(feature) : true);
    return {
      scope,
      loading: scopeQ.isLoading,
      error: scopeQ.error,
      refetchScope: () => void scopeQ.refetch(),
      isOwner,
      permissions,
      features,
      can,
      hasFeature,
      nav: visibleOwnerNav(isOwner, scope, permissions),
      items: allowedOwnerItems(isOwner, scope, permissions),
      badges: badgesQ.data,
    };
    // scopeQ identity changes each render; depend on the fields that matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, scopeQ.isLoading, scopeQ.error, isOwner, permissions, features, badgesQ.data]);

  return <OwnerContext.Provider value={value}>{children}</OwnerContext.Provider>;
}

export function useOwner(): OwnerContextValue {
  const ctx = useContext(OwnerContext);
  if (!ctx) throw new Error('useOwner must be used within an OwnerProvider');
  return ctx;
}
