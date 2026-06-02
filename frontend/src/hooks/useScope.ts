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
  isSuperAdmin: boolean;
  isClient: boolean;
  appRoles: string[];
}

/**
 * Resolved RBAC scope of the signed-in user. Frontend uses this to decide
 * which shell to render (Super Admin / Workspace / Client) and which links
 * to show. Backend independently enforces — this is UX-only.
 *
 * Returns `null` when the user is not signed in. Suspended/refreshing while
 * Supabase resolves the session is reflected via `isLoading`.
 */
export function useScope(): UseQueryResult<Scope | null, ApiError> & { hasSession: boolean } {
  const [hasSession, setHasSession] = useState<boolean | null>(null);

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
    queryFn: async () => {
      if (!hasSession) return null;
      return api.get<Scope>('/api/v1/auth/me/scope');
    },
  });

  return { ...query, hasSession: hasSession === true };
}
