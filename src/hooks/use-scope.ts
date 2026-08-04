/**
 * Resolved RBAC scope of the signed-in user.
 *
 * Ported from the web `useScope` (frontend/src/hooks/useScope.ts). The backend
 * is the single source of truth: `/auth/me/scope` returns the tier, plan,
 * server-resolved `features[]` and effective fine-grained `permissions[]`.
 *
 * Mobile differences:
 *   - Session comes from the app's AuthProvider rather than a local
 *     getSession/onAuthStateChange pair (the provider already owns that).
 *   - `AbortSignal.timeout` is not available in the Hermes/RN runtime, so the
 *     15s guard is built from an AbortController + setTimeout.
 *
 * This is UX-only gating; the backend independently enforces every rule.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useAuth } from '@/contexts/auth-context';
import { api, type ApiError } from '@/lib/api';

export type Tier = 'super_admin' | 'workspace' | 'client' | 'unaffiliated';

export interface Scope {
  userId: string;
  email?: string;
  tier: Tier;
  workspaceId: string | null;
  workspaceRole: string | null;
  /** Effective plan key of the primary workspace. */
  plan: string | null;
  /** ISO date the free trial ends, or null when not on a trial. */
  trialEndsAt: string | null;
  /**
   * Features this plan unlocks, resolved by the backend with the same map its
   * FeaturesGuard enforces. Prefer this over deriving from `plan` — see
   * featuresOf() in plan-capabilities.ts for why the local mirror is a
   * deploy-window fallback only.
   */
  features?: string[];
  isSuperAdmin: boolean;
  isClient: boolean;
  appRoles: string[];
  /** Effective fine-grained permissions (`resource.action`) — drives UI gating. */
  permissions: string[];
}

const SCOPE_TIMEOUT_MS = 15_000;

async function fetchScope(): Promise<Scope> {
  // 15s cap: this query gates the whole owner shell. Without it a hung backend
  // parks the user on a spinner indefinitely. RN has no AbortSignal.timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCOPE_TIMEOUT_MS);
  try {
    return await api.get<Scope>('/api/v1/auth/me/scope', { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `null` while signed out. Errors surface rather than retrying forever, so the
 * shell can show a real message instead of an endless spinner.
 */
export function useScope(): UseQueryResult<Scope | null, ApiError> {
  const { session } = useAuth();
  return useQuery<Scope | null, ApiError>({
    queryKey: ['scope', session?.user?.id ?? null],
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: fetchScope,
  });
}
