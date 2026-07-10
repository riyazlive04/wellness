import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { api, ApiError } from '@/lib/api';

export type Tier = 'super_admin' | 'workspace' | 'client' | 'unaffiliated';

export interface Scope {
  userId: string;
  email?: string;
  tier: Tier;
  workspaceId: string | null;
  workspaceRole: string | null;
  /** Effective plan key of the primary workspace — drives feature gating. */
  plan: string | null;
  isSuperAdmin: boolean;
  isClient: boolean;
  appRoles: string[];
  /** Effective fine-grained permissions (`resource.action`) — drives UI gating. */
  permissions: string[];
}

/**
 * Resolved RBAC scope of the signed-in user. Frontend uses this to decide
 * which shell to render (Super Admin / Workspace / Client) and which links
 * to show. Backend independently enforces — this is UX-only.
 *
 * Returns `null` when the user is not signed in. Suspended/refreshing while
 * Supabase resolves the session is reflected via `isLoading`.
 */
/** `null` = still resolving the Supabase session; `true`/`false` = resolved. */
export type SessionState = boolean | null;

export function useScope(): UseQueryResult<Scope | null, ApiError> & {
  /** true once we've definitively heard from Supabase that a session exists. */
  hasSession: boolean;
  /** Session state is still resolving (Supabase getSession hasn't returned yet). */
  sessionUnknown: boolean;
} {
  const [hasSession, setHasSession] = useState<SessionState>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const query = useQuery<Scope | null, ApiError>({
    queryKey: ['scope', hasSession],
    enabled: hasSession === true,
    staleTime: 5 * 60 * 1000,
    // retry: 1 (instead of TanStack's default 3) — this hook gates every
    // route guard, so a long retry chain leaves the user staring at the
    // SirahLoader for 30+ seconds when the backend is down. One retry
    // catches transient blips; the rest surfaces fast as an error so
    // RequireRole can fall through to children and the user sees a real
    // page (or a clear error banner) instead of an indefinite spinner.
    retry: 1,
    queryFn: async () => {
      if (!hasSession) return null;
      return api.get<Scope>('/api/v1/auth/me/scope');
    },
  });

  return {
    ...query,
    hasSession: hasSession === true,
    sessionUnknown: hasSession === null,
  };
}
