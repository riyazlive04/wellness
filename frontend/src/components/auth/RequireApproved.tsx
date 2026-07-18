import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { SirahLoader } from '@/design-system';
import { clientsApi } from '@/modules/workspace/api/clients';

/**
 * Client-portal gate for the join-link flow. Sits INSIDE <RequireClient> and
 * OUTSIDE <RequireOnboarded>: a client who has not been approved yet must not
 * reach onboarding, let alone the portal.
 *
 * The /portal/pending route itself must NOT be wrapped in this gate (it would
 * redirect to itself forever).
 *
 * Status meanings on clients.status:
 *   - 'pending'  → requested via the join link, owner hasn't decided
 *   - 'inactive' → owner rejected the request (nothing else writes this)
 * Both land on the waiting screen, which tells them which one they are.
 *
 * Profile errors fall through to children, matching RequireOnboarded: the
 * backend gates the real API calls anyway, and a transient blip shouldn't
 * strand a legitimate client.
 */
export function RequireApproved({ children }: { children: ReactNode }) {
  const profileQ = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => clientsApi.myProfile(),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  if (profileQ.isLoading) {
    return <SirahLoader />;
  }
  if (profileQ.isError || !profileQ.data) {
    return <>{children}</>;
  }
  const status = profileQ.data.status;
  if (status === 'pending' || status === 'inactive') {
    return <Navigate to="/portal/pending" replace />;
  }
  return <>{children}</>;
}
