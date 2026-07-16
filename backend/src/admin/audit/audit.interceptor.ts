import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuthUser } from '../../auth/types/auth-user.type';
import { AUDIT_KEY, AuditMetadata } from './audit.decorator';
import { AuditService } from './audit.service';

/**
 * Global interceptor that writes one audit row per request whose handler is
 * decorated with @Audit({...}). Logs ONLY on successful responses (after the
 * controller resolves). Failures aren't audited here — they're already
 * captured by AllExceptionsFilter.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMetadata | undefined>(
      AUDIT_KEY,
      context.getHandler(),
    );
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const user = (req as Request & { user?: AuthUser }).user;
    const params = (req.params ?? {}) as Record<string, string>;
    // Snapshot the one id field now: a handler is free to mutate req.body, and
    // this tap runs after it returns.
    const bodyId = meta.resourceIdBody
      ? (req.body as Record<string, unknown> | undefined)?.[meta.resourceIdBody]
      : undefined;

    return next.handle().pipe(
      tap((result: unknown) => {
        const resourceId =
          (meta.resourceIdParam ? params[meta.resourceIdParam] : undefined) ??
          (typeof bodyId === 'string' ? bodyId : undefined);

        // Try to surface a human label from common shapes:
        //   { data: { name, email, label } } | { name, email, label }
        const r = (result as { data?: unknown } | undefined)?.data ?? result;
        const obj = r as Record<string, unknown> | undefined;
        const label =
          (typeof obj?.name  === 'string' && obj.name) ||
          (typeof obj?.email === 'string' && obj.email) ||
          (typeof obj?.label === 'string' && obj.label) ||
          undefined;

        void this.audit.write({
          actorId:       user?.id ?? null,
          actorEmail:    user?.email ?? null,
          action:        meta.action,
          resourceType:  meta.resourceType,
          resourceId:    resourceId ?? null,
          resourceLabel: label,
          details: {
            method: req.method,
            path:   req.originalUrl,
            // Body is intentionally NOT logged — would leak PII.
            //
            // Impersonation context, when present. Without this an action a
            // super admin takes while pinned to someone else's workspace is
            // indistinguishable from that workspace's own staff doing it —
            // the row would name the actor but not the borrowed authority.
            ...(user?.isImpersonating
              ? { impersonating: true, impersonatedWorkspaceId: user.workspaceId ?? null }
              : {}),
          },
          ipAddress: (req.ip ?? req.socket?.remoteAddress) ?? null,
          userAgent: req.get('user-agent') ?? null,
          requestId: (req as Request & { id?: string }).id ?? null,
        });
      }),
    );
  }
}
