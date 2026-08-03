/**
 * Activity Log + Application Flow events.
 *
 * One canonical event — ActivityRecorded — is emitted by the interceptor
 * after every successful write request. Notification / Analytics / future
 * Automation handlers subscribe and fan-out from there.
 *
 * Keep the event SMALL — handlers should be able to process it without
 * re-querying the DB for context. If a handler needs more, it queries.
 */

export type ActorRole =
  | 'super_admin'
  | 'owner'
  | 'nutritionist'
  | 'client'
  | 'anonymous';

export type ActivityAction = 'create' | 'update' | 'delete' | 'invoke';

/**
 * Emitted by ActivityLogInterceptor on every successful mutation. The DB
 * row has already been written before this event fires — handlers can
 * trust the id field references a persisted row.
 *
 * Channel name: 'activity.recorded'.
 */
export interface ActivityRecordedEvent {
  /** Primary key of the activity_logs row just written. */
  id: string;

  workspace_id: string | null;
  actor_user_id: string | null;
  actor_role: ActorRole;

  http_method: string;
  route: string;
  entity_type: string | null;
  entity_id: string | null;
  action: ActivityAction;

  status_code: number;
  latency_ms: number;

  /** ISO 8601, matches the DB row. */
  created_at: string;
}

export const ACTIVITY_RECORDED_EVENT = 'activity.recorded';

/** Shape persisted to activity_logs. */
export interface ActivityLogWriteInput {
  workspace_id: string | null;
  organization_id: string | null;
  actor_user_id: string | null;
  actor_role: ActorRole;
  http_method: string;
  route: string;
  entity_type: string | null;
  entity_id: string | null;
  /** Human name of the affected entity (e.g. the client's name), if a handler set one. */
  entity_label?: string | null;
  action: ActivityAction;
  request_id: string | null;
  status_code: number;
  latency_ms: number;
  ip: string | null;
  user_agent: string | null;
  payload: unknown | null;
  error_message: string | null;
}

/** Shape returned to UI. */
export interface ActivityLogRow {
  id: string;
  workspace_id: string | null;
  actor_user_id: string | null;
  actor_role: ActorRole | null;
  http_method: string;
  route: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  action: ActivityAction;
  request_id: string | null;
  status_code: number;
  latency_ms: number | null;
  ip: string | null;
  user_agent: string | null;
  payload: unknown | null;
  error_message: string | null;
  created_at: string;
  /** Hydrated at read time from the actor's profile (see enrichActors). */
  actor_email?: string | null;
  /** Actor's display name, hydrated at read time. Falls back to email/role in the UI. */
  actor_name?: string | null;
}
