import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PATH_METADATA } from '@nestjs/common/constants';
import type { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ActivityLogService } from './activity-log.service';
import {
  ACTIVITY_RECORDED_EVENT,
  type ActivityAction,
  type ActivityRecordedEvent,
  type ActorRole,
} from './activity-log.types';

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * ActivityLogInterceptor — the single instrumentation point that implements
 * the Application Flow's "Activity Logging" + "Analytics" stages.
 *
 * Pipeline:
 *   1. After every successful mutation (POST/PATCH/PUT/DELETE), write a row
 *      to activity_logs with actor, route, entity, latency, status.
 *   2. On error: write a failure row with status_code >= 400 and error_message.
 *   3. Emit an ACTIVITY_RECORDED_EVENT — async fan-out to Notification +
 *      Analytics handlers (and future Automation rule evaluator). The fan-out
 *      is FIRE-AND-FORGET; handler errors never affect the response.
 *
 * Skipped:
 *   - GET (reads) — too noisy, and the user picked "every mutation" scope
 *   - Public routes (decorated @Public) — auth endpoints, webhooks signed by us
 *   - Webhook receivers — they record their own audit via webhook_events
 *
 * Latency budget: writing + event dispatch happens AFTER the response stream
 * fires its first tap, so it does not block the user's response.
 */
@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly activityLog: ActivityLogService,
    private readonly events: EventEmitter2,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { id?: string; user?: AuthUser }>();
    const res = context.switchToHttp().getResponse<Response>();

    if (!shouldLog(req)) {
      return next.handle();
    }
    if (this.isPublicRoute(context)) {
      return next.handle();
    }

    const start = Date.now();
    const route = this.resolveRouteTemplate(context, req);
    const action = inferAction(req);
    const { entityType, entityId } = inferEntity(context, route, req);

    return next.handle().pipe(
      tap(() => {
        // Run the write + emit asynchronously so we don't add latency
        // to the response. setImmediate yields back to the event loop.
        setImmediate(() => {
          void this.persistAndEmit({
            req,
            res,
            route,
            action,
            entityType,
            entityId,
            latency: Date.now() - start,
            error: null,
          });
        });
      }),
      catchError((err: unknown) => {
        const statusOverride = extractHttpStatus(err);
        setImmediate(() => {
          void this.persistAndEmit({
            req,
            res,
            route,
            action,
            entityType,
            entityId,
            latency: Date.now() - start,
            error: err instanceof Error ? err : new Error('Unknown error'),
            statusOverride,
          });
        });
        return throwError(() => err);
      }),
    );
  }

  // ────────────────────────────────────────────────────────────────────

  private async persistAndEmit(args: {
    req: Request & { id?: string; user?: AuthUser };
    res: Response;
    route: string;
    action: ActivityAction;
    entityType: string | null;
    entityId: string | null;
    latency: number;
    error: Error | null;
    statusOverride?: number;
  }): Promise<void> {
    const { req, res, route, action, entityType, entityId, latency, error, statusOverride } = args;
    const user = req.user;
    const actorRole = resolveActorRole(user);
    const statusCode = error ? (statusOverride ?? 500) : res.statusCode;

    const id = await this.activityLog.write({
      workspace_id: user?.workspaceId ?? null,
      organization_id: user?.organizationId ?? null,
      actor_user_id: user?.id ?? null,
      actor_role: actorRole,
      http_method: req.method,
      route,
      entity_type: entityType,
      entity_id: entityId,
      action,
      request_id: req.id ?? null,
      status_code: statusCode,
      latency_ms: latency,
      ip: extractClientIp(req),
      user_agent: req.headers['user-agent'] ?? null,
      payload: req.body ?? null,
      error_message: error ? error.message : null,
    });

    if (!id || error) {
      // Don't emit on errors — handlers should reason about successful flows.
      // Failure rows are still persisted (for the audit trail), they just
      // don't trigger downstream notifications or analytics bumps.
      return;
    }

    const event: ActivityRecordedEvent = {
      id,
      workspace_id: user?.workspaceId ?? null,
      actor_user_id: user?.id ?? null,
      actor_role: actorRole,
      http_method: req.method,
      route,
      entity_type: entityType,
      entity_id: entityId,
      action,
      status_code: statusCode,
      latency_ms: latency,
      created_at: new Date().toISOString(),
    };
    try {
      this.events.emit(ACTIVITY_RECORDED_EVENT, event);
    } catch (err) {
      this.logger.warn(`Event dispatch failed: ${(err as Error).message}`);
    }
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return !!this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  /**
   * Build the route TEMPLATE (e.g. '/workspaces/me/recipes/:id') from the
   * controller decorator + handler decorator. We prefer this to req.path
   * because the template aggregates cleanly across thousands of resolved ids
   * in the activity feed.
   */
  private resolveRouteTemplate(context: ExecutionContext, req: Request): string {
    try {
      const handler = context.getHandler();
      const klass = context.getClass();
      const controllerPath = (this.reflector.get<string | string[]>(PATH_METADATA, klass) ?? '') as
        | string
        | string[];
      const handlerPath = (this.reflector.get<string | string[]>(PATH_METADATA, handler) ?? '') as
        | string
        | string[];
      const ctrl = Array.isArray(controllerPath) ? controllerPath[0] : controllerPath;
      const hdlr = Array.isArray(handlerPath) ? handlerPath[0] : handlerPath;
      const joined = `/${[ctrl, hdlr].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
      return joined === '/' ? req.path : joined;
    } catch {
      return req.path;
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function shouldLog(req: Request): boolean {
  // Skip read methods, OPTIONS preflights, and the webhook receivers
  // (which already get their own webhook_events row).
  if (!MUTATION_METHODS.has(req.method)) return false;
  if (req.path.startsWith('/api/webhooks')) return false;
  if (req.path.startsWith('/api/v1/webhooks')) return false;
  return true;
}

function inferAction(req: Request): ActivityAction {
  switch (req.method) {
    case 'POST':   return 'create';
    case 'PATCH':
    case 'PUT':    return 'update';
    case 'DELETE': return 'delete';
    default:       return 'invoke';
  }
}

/**
 * Infer entity_type from the route template's last meaningful segment, and
 * entity_id from the resolved URL path's matching position. Best-effort —
 * the route template wins, but if it doesn't have an :id, we leave entity_id
 * null (it's fine, the actor + route still identify what happened).
 */
function inferEntity(
  _context: ExecutionContext,
  route: string,
  req: Request,
): { entityType: string | null; entityId: string | null } {
  // Strip leading /api/v1/ noise.
  const cleaned = route.replace(/^\/api(\/v\d+)?\//, '').replace(/^\//, '');
  if (!cleaned) return { entityType: null, entityId: null };

  const segments = cleaned.split('/').filter(Boolean);
  // entity_type = last non-parameter segment, singularised on common shapes.
  let entityType: string | null = null;
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (!s.startsWith(':')) {
      entityType = singularise(s);
      break;
    }
  }

  // entity_id = req.params value matching the last :param in the route.
  let entityId: string | null = null;
  const paramNames = segments.filter((s) => s.startsWith(':')).map((s) => s.slice(1));
  const params = (req.params ?? {}) as Record<string, string>;
  for (const name of [...paramNames].reverse()) {
    const v = params[name];
    if (v) {
      entityId = String(v);
      break;
    }
  }
  return { entityType, entityId };
}

function singularise(s: string): string {
  if (s.endsWith('ies')) return s.slice(0, -3) + 'y';
  if (s.endsWith('ses')) return s.slice(0, -2);
  if (s.endsWith('s'))  return s.slice(0, -1);
  return s;
}

function resolveActorRole(user: AuthUser | undefined): ActorRole {
  if (!user) return 'anonymous';
  if (user.isSuperAdmin) return 'super_admin';
  if (user.workspaceRole === 'owner') return 'owner';
  if (user.workspaceRole === 'nutritionist') return 'nutritionist';
  if (user.isClient) return 'client';
  // Other workspace roles (assistant_nutritionist, receptionist, coach, support)
  // collapse to nutritionist for the feed's actor_role coarse label.
  if (user.workspaceRole) return 'nutritionist';
  return 'anonymous';
}

function extractClientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  return req.ip ?? null;
}

function extractHttpStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'getStatus' in err && typeof (err as { getStatus?: unknown }).getStatus === 'function') {
    try {
      return Number((err as { getStatus: () => number }).getStatus());
    } catch {
      return undefined;
    }
  }
  return undefined;
}
