/**
 * Realtime Gateway — typed events sent over the WebSocket.
 *
 * Channels (Socket.IO rooms):
 *   - workspace:{id}   — every member of a workspace receives mutations
 *   - platform        — super admin only; cross-workspace feed
 *
 * Event names emitted to clients:
 *   - 'activity'       — every ActivityRecordedEvent (subset of fields)
 *   - 'notification'   — high-signal events from NotificationHandler
 *                        (allow-listed: client/invite/recipe/appointment/program creates)
 */

export interface RealtimeActivityEvent {
  id: string;
  workspace_id: string | null;
  actor_user_id: string | null;
  actor_role: string;
  http_method: string;
  route: string;
  entity_type: string | null;
  entity_id: string | null;
  action: 'create' | 'update' | 'delete' | 'invoke';
  status_code: number;
  latency_ms: number;
  created_at: string;
}

export interface RealtimeNotificationEvent {
  workspace_id: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_role: string;
  created_at: string;
}

/** Pushed to a single revoked login session so that device signs itself out. */
export interface RealtimeSessionRevokedEvent {
  session_id: string;
}

export const REALTIME_CHANNELS = {
  workspaceRoom: (id: string) => `workspace:${id}`,
  platformRoom: 'platform',
  /** One room per login session — lets us target exactly one device. */
  sessionRoom: (sessionId: string) => `session:${sessionId}`,
};

export const REALTIME_EVENTS = {
  activity:        'activity',
  notification:    'notification',
  sessionRevoked:  'session.revoked',
};

/** In-process EventEmitter event raised when a session is revoked. */
export const SESSION_REVOKED_EVENT = 'session.revoked';
