import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface AuditEntry {
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceLabel?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface ListAuditQuery {
  /** Filter by action prefix, e.g. 'workspace.' to see all workspace events. */
  actionPrefix?: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Write one audit row. Never throws — audit failures must not break the request. */
  async write(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.admin_audit_log.create({
        data: {
          actor_id:       entry.actorId,
          actor_email:    entry.actorEmail,
          action:         entry.action,
          resource_type:  entry.resourceType ?? null,
          resource_id:    entry.resourceId ?? null,
          resource_label: entry.resourceLabel ?? null,
          // Prisma's Json input type rejects bare Record<string, unknown>;
          // serialize-then-parse coerces into InputJsonValue cleanly.
          details: entry.details ? JSON.parse(JSON.stringify(entry.details)) : undefined,
          ip_address:     entry.ipAddress ?? null,
          user_agent:     entry.userAgent ?? null,
          request_id:     entry.requestId ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`Audit write failed (action=${entry.action}): ${(err as Error).message}`);
    }
  }

  async list(q: ListAuditQuery) {
    const limit  = q.limit  ?? 50;
    const offset = q.offset ?? 0;

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        actor_id: string | null;
        actor_email: string | null;
        action: string;
        resource_type: string | null;
        resource_id: string | null;
        resource_label: string | null;
        details: unknown;
        ip_address: string | null;
        created_at: Date;
        total_count: bigint;
      }>
    >(
      `SELECT id, actor_id, actor_email, action, resource_type, resource_id,
              resource_label, details, ip_address, created_at,
              COUNT(*) OVER() AS total_count
         FROM public.admin_audit_log
        WHERE ($1::text IS NULL OR action LIKE $1 || '%')
          AND ($2::uuid IS NULL OR actor_id = $2)
          AND ($3::text IS NULL OR resource_type = $3)
          AND ($4::uuid IS NULL OR resource_id = $4)
        ORDER BY created_at DESC
        LIMIT $5 OFFSET $6`,
      q.actionPrefix ?? null,
      q.actorId ?? null,
      q.resourceType ?? null,
      q.resourceId ?? null,
      limit,
      offset,
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        actor_id: r.actor_id,
        actor_email: r.actor_email,
        action: r.action,
        resource_type: r.resource_type,
        resource_id: r.resource_id,
        resource_label: r.resource_label,
        details: r.details,
        ip_address: r.ip_address,
        created_at: r.created_at,
      })),
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,
      limit,
      offset,
    };
  }
}
