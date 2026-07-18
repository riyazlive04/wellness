import { api } from '@/lib/api';

// ─── Types — mirror backend/src/activity-log/activity-log.types.ts

export type ActorRole = 'super_admin' | 'owner' | 'nutritionist' | 'client' | 'anonymous';
export type ActivityAction = 'create' | 'update' | 'delete' | 'invoke';

export interface ActivityLogRow {
  id: string;
  workspace_id: string | null;
  actor_user_id: string | null;
  actor_role: ActorRole | null;
  http_method: string;
  route: string;
  entity_type: string | null;
  entity_id: string | null;
  action: ActivityAction;
  request_id: string | null;
  status_code: number;
  latency_ms: number | null;
  ip: string | null;
  user_agent: string | null;
  payload: unknown | null;
  error_message: string | null;
  created_at: string;
  actor_email?: string | null;
  /** Actor's display name, resolved from their profile server-side. */
  actor_name?: string | null;
}

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const activityLogApi = {
  listForWorkspace: (params: {
    limit?: number;
    offset?: number;
    actor?: string;
    entityType?: string;
    action?: ActivityAction;
    search?: string;
  } = {}) =>
    api.get<ActivityLogRow[]>(`/api/v1/workspaces/me/activity${qs(params)}`),

  listGlobal: (params: { limit?: number; offset?: number } = {}) =>
    api.get<ActivityLogRow[]>(`/api/v1/admin/activity${qs(params)}`),
};
