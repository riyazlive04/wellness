import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { ActivityLogRow, ActivityLogWriteInput } from './activity-log.types';

const MAX_PAYLOAD_BYTES = 8 * 1024;
const REDACTED_FIELDS: ReadonlyArray<string> = [
  'password', 'old_password', 'new_password', 'token', 'access_token',
  'refresh_token', 'secret', 'api_key', 'authorization', 'cookie',
];

/**
 * ActivityLogService — write side + read side for the activity feed.
 *
 * write() is called by the global ActivityLogInterceptor; never by user code.
 * Payloads are deep-cloned, PII-redacted, and size-capped before write to
 * keep the table bounded and to avoid leaking secrets into the feed.
 */
@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist one activity row. Returns the new row id, or null if the write
   * failed (we never throw — the interceptor must NEVER take down a request
   * because of a logging failure).
   */
  async write(input: ActivityLogWriteInput): Promise<string | null> {
    try {
      const payload = sanitizePayload(input.payload);
      const row = await this.prisma.activity_logs.create({
        data: {
          workspace_id: input.workspace_id,
          organization_id: input.organization_id,
          actor_user_id: input.actor_user_id,
          actor_role: input.actor_role,
          http_method: input.http_method,
          route: input.route,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          entity_label: input.entity_label ?? null,
          action: input.action,
          request_id: input.request_id,
          status_code: input.status_code,
          latency_ms: input.latency_ms,
          ip: input.ip,
          user_agent: input.user_agent,
          payload: payload == null ? Prisma.DbNull : (payload as Prisma.InputJsonValue),
          error_message: input.error_message,
        },
        select: { id: true },
      });
      return row.id;
    } catch (err) {
      // Never break the request because of a logging failure.
      this.logger.warn(
        `Failed to write activity_log row: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Feed for a workspace. Optional filters narrow by actor, entity, action,
   * or a free-text search on route. Newest first; bounded by `limit` and
   * `offset`.
   */
  async listForWorkspace(
    workspaceId: string,
    opts: {
      limit?: number;
      offset?: number;
      actorUserId?: string;
      entityType?: string;
      action?: string;
      search?: string;
    } = {},
  ): Promise<ActivityLogRow[]> {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);
    const where: Record<string, unknown> = { workspace_id: workspaceId };
    if (opts.actorUserId) where.actor_user_id = opts.actorUserId;
    if (opts.entityType) where.entity_type = opts.entityType;
    if (opts.action) where.action = opts.action;
    if (opts.search?.trim()) {
      where.route = { contains: opts.search.trim(), mode: 'insensitive' };
    }

    const rows = await this.prisma.activity_logs.findMany({
      where,
      orderBy: [{ created_at: 'desc' }],
      take: limit,
      skip: offset,
    });
    return this.enrichActors(rows.map(toRow));
  }

  /**
   * Audit feed for an organization — every row whose organization_id matches,
   * spanning all of the org's workspaces. Membership is asserted by the caller
   * (OrganizationsController) before this runs; we still scope by
   * organization_id here as defence-in-depth.
   *
   * Supports an optional workspaceId to drill into a single workspace within
   * the org, plus the same actor/entity/action/search narrowing as the
   * workspace feed.
   */
  async listForOrganization(
    organizationId: string,
    opts: {
      limit?: number;
      offset?: number;
      workspaceId?: string;
      actorUserId?: string;
      entityType?: string;
      action?: string;
      search?: string;
    } = {},
  ): Promise<ActivityLogRow[]> {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);
    const where: Record<string, unknown> = { organization_id: organizationId };
    if (opts.workspaceId) where.workspace_id = opts.workspaceId;
    if (opts.actorUserId) where.actor_user_id = opts.actorUserId;
    if (opts.entityType) where.entity_type = opts.entityType;
    if (opts.action) where.action = opts.action;
    if (opts.search?.trim()) {
      where.route = { contains: opts.search.trim(), mode: 'insensitive' };
    }

    const rows = await this.prisma.activity_logs.findMany({
      where,
      orderBy: [{ created_at: 'desc' }],
      take: limit,
      skip: offset,
    });
    return this.enrichActors(rows.map(toRow));
  }

  /** Platform-wide feed for super admin. */
  async listGlobal(opts: { limit?: number; offset?: number } = {}): Promise<ActivityLogRow[]> {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);
    const rows = await this.prisma.activity_logs.findMany({
      orderBy: [{ created_at: 'desc' }],
      take: limit,
      skip: offset,
    });
    return this.enrichActors(rows.map(toRow));
  }

  /**
   * Attach each row's actor NAME and EMAIL by resolving actor_user_id, so the
   * feed reads "Salman Dietician did X" rather than just the role "Owner".
   *
   * The name is not in one place: `profiles` is largely unpopulated, so we read
   * the real sources in one batch query — a client's own name where the actor
   * is a client, else the name from the auth user's metadata, with the email as
   * the universal fallback (every actor has one). Rows with no actor (system
   * writes) or nothing resolvable are left as-is; the UI falls back to the role.
   */
  private async enrichActors(rows: ActivityLogRow[]): Promise<ActivityLogRow[]> {
    const ids = [...new Set(rows.map((r) => r.actor_user_id).filter((v): v is string => !!v))];
    if (ids.length === 0) return rows;

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const found = await this.prisma.$queryRawUnsafe<Array<{ id: string; name: string | null; email: string | null }>>(
      `SELECT u.id::text AS id,
              COALESCE(
                NULLIF(cl.name, ''),
                NULLIF(u.raw_user_meta_data->>'full_name', ''),
                NULLIF(u.raw_user_meta_data->>'name', '')
              ) AS name,
              u.email
         FROM auth.users u
         LEFT JOIN public.clients cl ON cl.user_id = u.id
        WHERE u.id::text IN (${placeholders})`,
      ...ids,
    );
    const byId = new Map(found.map((f) => [f.id, f]));
    return rows.map((r) => {
      const f = r.actor_user_id ? byId.get(r.actor_user_id) : undefined;
      return f ? { ...r, actor_name: f.name ?? null, actor_email: f.email ?? null } : r;
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Deep clone with REDACTED replacements for sensitive keys.
 * Caps size at MAX_PAYLOAD_BYTES; returns a truncation marker if exceeded.
 */
function sanitizePayload(p: unknown): unknown | null {
  if (p == null) return null;
  let cleaned: unknown;
  try {
    cleaned = deepRedact(p);
  } catch {
    return { _redaction_failed: true };
  }
  let json: string;
  try {
    json = JSON.stringify(cleaned);
  } catch {
    return { _serialization_failed: true };
  }
  if (json.length > MAX_PAYLOAD_BYTES) {
    return { _truncated: true, _bytes: json.length, _preview: json.slice(0, 1024) };
  }
  return cleaned;
}

function deepRedact(input: unknown, depth = 0): unknown {
  if (depth > 8) return '[deep]';
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map((v) => deepRedact(v, depth + 1));
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (REDACTED_FIELDS.some((field) => k.toLowerCase().includes(field))) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = deepRedact(v, depth + 1);
      }
    }
    return out;
  }
  return input;
}

interface RawActivityRow {
  id: string;
  workspace_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  http_method: string;
  route: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  action: string;
  request_id: string | null;
  status_code: number;
  latency_ms: number | null;
  ip: string | null;
  user_agent: string | null;
  payload: unknown;
  error_message: string | null;
  created_at: Date;
}

function toRow(r: RawActivityRow): ActivityLogRow {
  return {
    id: r.id,
    workspace_id: r.workspace_id,
    actor_user_id: r.actor_user_id,
    actor_role: r.actor_role as ActivityLogRow['actor_role'],
    http_method: r.http_method,
    route: r.route,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    entity_label: r.entity_label,
    action: r.action as ActivityLogRow['action'],
    request_id: r.request_id,
    status_code: r.status_code,
    latency_ms: r.latency_ms,
    ip: r.ip,
    user_agent: r.user_agent,
    payload: r.payload,
    error_message: r.error_message,
    created_at: r.created_at.toISOString(),
  };
}
