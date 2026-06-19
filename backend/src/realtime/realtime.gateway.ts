import { Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  ACTIVITY_RECORDED_EVENT,
  type ActivityRecordedEvent,
} from '../activity-log/activity-log.types';
import {
  REALTIME_CHANNELS,
  REALTIME_EVENTS,
  SESSION_REVOKED_EVENT,
  type RealtimeActivityEvent,
  type RealtimeNotificationEvent,
  type RealtimeSessionRevokedEvent,
} from './realtime.types';
import { RealtimeAuthService } from './realtime-auth.service';

/**
 * RealtimeGateway — Application Flow's "Real-time synchronization" stage.
 *
 * Handshake: client passes a Supabase JWT in `auth.token` (Socket.IO v4 idiom).
 * On accept, we join two rooms:
 *   - workspace:{id}  — if the user has a workspace membership
 *   - platform        — if the user is super admin
 *
 * Subscribes to the in-process ACTIVITY_RECORDED_EVENT (from the EventEmitter)
 * and emits a 'activity' event into the appropriate room. Notifications
 * (allow-listed in NotificationHandler) are also broadcast — but emit
 * happens here, not in the handler, so all WS dispatch is centralised.
 *
 * CORS: we accept connections from the FRONTEND_ORIGIN env (Vite dev server
 * runs on http://localhost:4000); fall back to the same-origin in prod.
 */
@WebSocketGateway({
  path: '/api/realtime',
  cors: {
    origin: (process.env.FRONTEND_ORIGIN ?? 'http://localhost:4000').split(','),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly auth: RealtimeAuthService) {}

  onModuleInit(): void {
    this.logger.log('Realtime gateway ready on /api/realtime');
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = extractToken(socket);
      const user = await this.auth.resolveSocketUser(token);

      socket.data.user = user;
      if (user.workspace_id) {
        const room = REALTIME_CHANNELS.workspaceRoom(user.workspace_id);
        await socket.join(room);
      }
      if (user.is_super_admin) {
        await socket.join(REALTIME_CHANNELS.platformRoom);
      }
      // Per-session room — so a remote "sign out this device" reaches exactly
      // this socket (and not the user's other devices).
      const sessionId = sessionIdFromToken(token);
      if (sessionId) {
        socket.data.sessionId = sessionId;
        await socket.join(REALTIME_CHANNELS.sessionRoom(sessionId));
      }
      socket.emit('connected', {
        workspace_id: user.workspace_id,
        is_super_admin: user.is_super_admin,
      });
    } catch (err) {
      this.logger.warn(`Handshake rejected: ${(err as Error).message}`);
      socket.emit('error', { message: 'auth_failed' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    // Socket.IO removes from rooms automatically; nothing to do.
    socket.data = {};
  }

  // ── Event subscription — ACTIVITY_RECORDED_EVENT → broadcast ────

  // A session was revoked from Settings → Security. Tell that one device to
  // sign itself out immediately (rather than waiting for token expiry).
  @OnEvent(SESSION_REVOKED_EVENT)
  onSessionRevoked(payload: RealtimeSessionRevokedEvent): void {
    this.server
      .to(REALTIME_CHANNELS.sessionRoom(payload.session_id))
      .emit(REALTIME_EVENTS.sessionRevoked, payload);
  }

  @OnEvent(ACTIVITY_RECORDED_EVENT)
  broadcastActivity(event: ActivityRecordedEvent): void {
    const payload: RealtimeActivityEvent = {
      id: event.id,
      workspace_id: event.workspace_id,
      actor_user_id: event.actor_user_id,
      actor_role: event.actor_role,
      http_method: event.http_method,
      route: event.route,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      action: event.action,
      status_code: event.status_code,
      latency_ms: event.latency_ms,
      created_at: event.created_at,
    };

    if (event.workspace_id) {
      this.server
        .to(REALTIME_CHANNELS.workspaceRoom(event.workspace_id))
        .emit(REALTIME_EVENTS.activity, payload);
    }
    // Platform feed — super admin sees everything
    this.server.to(REALTIME_CHANNELS.platformRoom).emit(REALTIME_EVENTS.activity, payload);

    // Allow-listed notifications fan out as a separate channel so the UI
    // can toast them without dipping into the firehose.
    if (event.workspace_id && isNotifiable(event)) {
      const notif: RealtimeNotificationEvent = {
        workspace_id: event.workspace_id,
        title: `New ${event.entity_type}`,
        body: `${event.actor_role} ${event.action}d entity ${event.entity_id ?? ''}`.trim(),
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        actor_role: event.actor_role,
        created_at: event.created_at,
      };
      this.server
        .to(REALTIME_CHANNELS.workspaceRoom(event.workspace_id))
        .emit(REALTIME_EVENTS.notification, notif);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function extractToken(socket: Socket): string {
  const fromAuth = (socket.handshake.auth as { token?: string } | undefined)?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;
  const fromQuery = socket.handshake.query?.token;
  if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;
  const authHeader = socket.handshake.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

/** Best-effort decode of the Supabase `session_id` claim (token already verified). */
function sessionIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    return (payload.session_id as string) ?? null;
  } catch {
    return null;
  }
}

function isNotifiable(event: ActivityRecordedEvent): boolean {
  if (!event.entity_type) return false;
  const key = `${event.entity_type}:${event.action}`;
  return [
    'client:create',
    'invite:create',
    'recipe:create',
    'appointment:create',
    'program:create',
  ].includes(key);
}
