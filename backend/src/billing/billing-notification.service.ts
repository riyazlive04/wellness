import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type BillingNotificationType =
  | 'subscription_activated'
  | 'subscription_cancelled'
  | 'renewal_reminder'
  | 'payment_success'
  | 'payment_failed'
  | 'payment_recovered'
  | 'trial_expiring'
  | 'trial_expired'
  | 'invoice_ready';

export type BillingNotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

export interface EmitNotificationInput {
  workspaceId: string;
  type: BillingNotificationType;
  severity?: BillingNotificationSeverity;
  title: string;
  body?: string;
  actionUrl?: string;
  /** When set, a partial unique index makes the emit idempotent (cron-safe). */
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
}

export interface BillingNotificationRow {
  id: string;
  workspace_id: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  action_url: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

/**
 * BillingNotificationService — emits and reads workspace-scoped billing
 * notifications (Module 3 — Notification System).
 *
 * Emission is best-effort and never throws into the caller: a notification
 * failing to write must not roll back a payment webhook or a cron job. When a
 * `dedupeKey` is provided the insert is idempotent (ON CONFLICT DO NOTHING
 * against the partial unique index), so a daily reminder job can run every day
 * and only the first emit for a given key lands.
 */
@Injectable()
export class BillingNotificationService {
  private readonly logger = new Logger(BillingNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Insert a notification. Returns true if a row was created (false on dedupe / error). */
  async emit(input: EmitNotificationInput): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        // The unique index is partial (WHERE dedupe_key IS NOT NULL), so the
        // ON CONFLICT arbiter must restate that predicate for Postgres to infer
        // it. Rows with a NULL dedupe_key skip the index entirely and always
        // insert (no dedup); rows with a key dedup against it.
        `INSERT INTO public.billing_notifications
           (workspace_id, type, severity, title, body, action_url, dedupe_key, metadata)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (workspace_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
         RETURNING id`,
        input.workspaceId,
        input.type,
        input.severity ?? 'info',
        input.title,
        input.body ?? '',
        input.actionUrl ?? null,
        input.dedupeKey ?? null,
        JSON.stringify(input.metadata ?? {}),
      );
      return rows.length > 0;
    } catch (err) {
      this.logger.warn(`Failed to emit billing notification (${input.type}): ${(err as Error).message}`);
      return false;
    }
  }

  /** Recent notifications for a workspace, newest first. */
  async listForWorkspace(workspaceId: string, limit = 50): Promise<BillingNotificationRow[]> {
    return this.prisma.$queryRawUnsafe<BillingNotificationRow[]>(
      `SELECT id, workspace_id, type, severity, title, body, action_url, metadata, read_at, created_at
         FROM public.billing_notifications
        WHERE workspace_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT $2`,
      workspaceId,
      Math.min(Math.max(limit, 1), 200),
    );
  }

  async unreadCount(workspaceId: string): Promise<number> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*) AS count FROM public.billing_notifications
        WHERE workspace_id = $1::uuid AND read_at IS NULL`,
      workspaceId,
    );
    return Number(row?.count ?? 0n);
  }

  async markRead(workspaceId: string, id: string): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.billing_notifications SET read_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND read_at IS NULL`,
      id,
      workspaceId,
    );
  }

  async markAllRead(workspaceId: string): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.billing_notifications SET read_at = now()
        WHERE workspace_id = $1::uuid AND read_at IS NULL`,
      workspaceId,
    );
  }
}
