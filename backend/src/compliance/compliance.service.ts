import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  ComplianceSnapshot,
  DeletionRequestRow,
  DeletionStatus,
  DsarExport,
  RequestChannel,
} from './compliance.types';

interface ListParams {
  status?: DeletionStatus | 'all';
  limit?: number;
  offset?: number;
}

interface CreateRequestInput {
  targetEmail: string;
  targetUserId?: string | null;
  workspaceId?: string | null;
  requestedBy: string | null;
  requestedByEmail: string | null;
  channel: RequestChannel;
  reason?: string | null;
}

// Tables that contain user-attributable data we should export under DSAR.
// Order = how they appear in the export. Each entry: table → user-id column.
const USER_OWNED_TABLES: Array<{ table: string; col: string }> = [
  { table: 'public.workspace_members',  col: 'user_id' },
  { table: 'public.user_roles',         col: 'user_id' },
  { table: 'public.ai_usage_events',    col: 'user_id' },
  { table: 'public.admin_audit_log',    col: 'actor_id' },
];

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────
  // KPIs
  // ─────────────────────────────────────────────────────────────────
  async snapshot(): Promise<ComplianceSnapshot> {
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        pending: bigint;
        in_review: bigint;
        completed: bigint;
        overdue: bigint;
        avg_days: number | null;
      }>
    >(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::bigint     AS pending,
        COUNT(*) FILTER (WHERE status = 'in_review')::bigint   AS in_review,
        COUNT(*) FILTER (WHERE status = 'completed')::bigint   AS completed,
        COUNT(*) FILTER (WHERE status IN ('pending','in_review') AND due_by < now())::bigint AS overdue,
        AVG(EXTRACT(EPOCH FROM (processed_at - created_at)) / 86400) FILTER (
          WHERE status = 'completed' AND processed_at >= now() - interval '30 days'
        )::float AS avg_days
      FROM public.deletion_requests
    `);
    return {
      pending_count: Number(row?.pending ?? 0n),
      in_review_count: Number(row?.in_review ?? 0n),
      completed_count: Number(row?.completed ?? 0n),
      overdue_count: Number(row?.overdue ?? 0n),
      avg_resolution_days: row?.avg_days != null ? Math.round(row.avg_days * 10) / 10 : null,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Deletion requests
  // ─────────────────────────────────────────────────────────────────
  async listDeletionRequests(
    params: ListParams = {},
  ): Promise<{ items: DeletionRequestRow[]; total: number; limit: number; offset: number }> {
    const limit = clamp(params.limit ?? 50, 1, 200);
    const offset = Math.max(0, params.offset ?? 0);
    const vals: unknown[] = [];
    let where = '';
    if (params.status && params.status !== 'all') {
      vals.push(params.status);
      where = `WHERE d.status = $${vals.length}`;
    }
    const [countRow] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n FROM public.deletion_requests d ${where}`,
      ...vals,
    );
    vals.push(limit);
    vals.push(offset);
    const items = await this.prisma.$queryRawUnsafe<DeletionRequestRow[]>(
      `
      SELECT d.*, w.name AS workspace_name
        FROM public.deletion_requests d
        LEFT JOIN public.workspaces w ON w.id = d.workspace_id
        ${where}
       ORDER BY d.created_at DESC
       LIMIT $${vals.length - 1} OFFSET $${vals.length}
      `,
      ...vals,
    );
    return { items, total: Number(countRow?.n ?? 0n), limit, offset };
  }

  async createRequest(input: CreateRequestInput): Promise<DeletionRequestRow> {
    const rows = await this.prisma.$queryRawUnsafe<DeletionRequestRow[]>(
      `
      INSERT INTO public.deletion_requests
        (target_user_id, target_email, workspace_id, requested_by, requested_by_email,
         request_channel, reason)
      VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7)
      RETURNING *,
        (SELECT name FROM public.workspaces WHERE id = workspace_id) AS workspace_name
      `,
      input.targetUserId ?? null,
      input.targetEmail,
      input.workspaceId ?? null,
      input.requestedBy,
      input.requestedByEmail,
      input.channel,
      input.reason ?? null,
    );
    return rows[0];
  }

  async setStatus(
    id: string,
    next: DeletionStatus,
    processedBy: string | null,
    notes?: string | null,
  ): Promise<DeletionRequestRow> {
    const completing = next === 'completed' || next === 'rejected';
    const rows = await this.prisma.$queryRawUnsafe<DeletionRequestRow[]>(
      `
      UPDATE public.deletion_requests
         SET status = $2,
             processing_notes = COALESCE($3, processing_notes),
             processed_at = CASE WHEN $4::bool THEN now() ELSE processed_at END,
             processed_by = CASE WHEN $4::bool THEN $5::uuid ELSE processed_by END
       WHERE id = $1::uuid
   RETURNING *,
             (SELECT name FROM public.workspaces WHERE id = workspace_id) AS workspace_name
      `,
      id,
      next,
      notes ?? null,
      completing,
      processedBy,
    );
    if (!rows.length) throw new NotFoundException('Deletion request not found');
    return rows[0];
  }

  // ─────────────────────────────────────────────────────────────────
  // DSAR — Data Subject Access Request
  // ─────────────────────────────────────────────────────────────────
  /**
   * Returns every row across known user-owned tables. Backend-resolved tables
   * only — no client-supplied SQL. Auth metadata pulled from auth.users by id.
   */
  async dsarExport(targetUserId: string): Promise<DsarExport> {
    // Pull auth.users record first; doubles as existence check.
    const [user] = await this.prisma.$queryRawUnsafe<Array<{ id: string; email: string | null; created_at: Date }>>(
      `SELECT id, email, created_at FROM auth.users WHERE id = $1::uuid`,
      targetUserId,
    );
    if (!user) throw new NotFoundException('User not found');

    const data: Record<string, unknown[]> = {
      'auth.users': [{ id: user.id, email: user.email, created_at: user.created_at }],
    };

    for (const { table, col } of USER_OWNED_TABLES) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<unknown[]>(
          `SELECT * FROM ${table} WHERE ${col} = $1::uuid`,
          targetUserId,
        );
        data[table] = rows;
      } catch (err) {
        this.logger.warn(`DSAR ${table} read failed: ${(err as Error).message}`);
        data[table] = [];
      }
    }

    return {
      generated_at: new Date().toISOString(),
      target_user_id: targetUserId,
      target_email: user.email ?? '',
      data,
    };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}