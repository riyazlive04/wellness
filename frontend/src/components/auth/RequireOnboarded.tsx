import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { SirahLoader } from '@/design-system';
import { clientsApi } from '@/modules/workspace/api/clients';

/**
 * Client-portal gate. Sits INSIDE <RequireClient> and bounces the user
 * to /portal/onboarding when their `clients.onboarded_at` is still NULL.
 *
 * The /portal/onboarding route itself must NOT be wrapped in this gate
 * (otherwise it would redirect to itself forever).
 *
 * Behaviour:
 *   - Still loading profile → show SirahLoader (don't flash gated content).
 *   - Profile error          → fall through to children. Backend will gate
 *                              the actual API calls and the user can still
 *                              navigate to /portal/onboarding via the URL.
 *   - onboarded_at IS NULL   → redirect to /portal/onboarding.
 *   - otherwise              → render the wrapped routes.
 */
export function RequireOnboarded({ children }: { children: ReactNode }) {
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
  if (!profileQ.data.onboarded_at) {
    return <Navigate to="/portal/onboarding" replace />;
  }
  return <>{children}</>;
}