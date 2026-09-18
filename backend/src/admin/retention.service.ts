import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BILLING_GRACE_DAYS, UNPAID_CHECKOUT_HOURS } from '../billing/plans';

/**
 * Abandoned-trial retention — read-only view (phase 1).
 *
 * Policy: a workspace whose 14-day trial ended and which never bought a plan
 * keeps its data for RETENTION_MONTHS, then it is deleted. This service only
 * *reports* who is due; nothing here deletes anything. The purge job and the
 * warning emails build on this same query so the admin list and what actually
 * happens can never disagree.
 *
 * A workspace is "abandoned" only when it has no subscription that billing
 * would still honour — a failed payment inside the billing grace window is a
 * paying customer with a card problem, not an abandoned trial. A checkout that
 * was opened and never paid ('created', older than UNPAID_CHECKOUT_HOURS) is
 * abandoned, and must match resolveWorkspacePlan() exactly or a workspace could
 * be locked out yet never collected, or collected while still entitled.
 */

export const RETENTION_MONTHS = 6;

export interface PurgeCandidate {
  workspaceId: string;
  name: string;
  slug: string | null;
  status: string;
  ownerEmail: string | null;
  trialEndedAt: string;
  /** trial end + RETENTION_MONTHS. */
  dueAt: string;
  /** Negative once the date has passed. */
  daysUntilDue: number;
  clients: number;
  programs: number;
  members: number;
}

export interface PurgeQueue {
  retentionMonths: number;
  /** Everything that will eventually be deleted unless a plan is bought. */
  items: PurgeCandidate[];
  /** Subset already past their date — what a purge run would take today. */
  dueNow: number;
}

interface QueueRow {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  owner_email: string | null;
  trial_ends_at: Date;
  due_at: Date;
  days_until_due: number;
  clients: bigint;
  programs: bigint;
  members: bigint;
}

@Injectable()
export class RetentionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Workspaces whose trial lapsed without a plan, ordered by how soon their
   * data is due to go.
   */
  async purgeQueue(): Promise<PurgeQueue> {
    const rows = await this.prisma.$queryRawUnsafe<QueueRow[]>(
      `SELECT w.id,
              w.name,
              w.slug,
              w.status,
              (SELECT u.email
                 FROM public.workspace_members m
                 JOIN auth.users u ON u.id = m.user_id
                WHERE m.workspace_id = w.id AND m.role = 'owner'
                ORDER BY m.created_at ASC LIMIT 1)          AS owner_email,
              w.trial_ends_at,
              (w.trial_ends_at + ($1 || ' months')::interval) AS due_at,
              EXTRACT(DAY FROM (w.trial_ends_at + ($1 || ' months')::interval) - now())::int
                                                            AS days_until_due,
              (SELECT count(*) FROM public.clients c
                WHERE c.workspace_id = w.id)                AS clients,
              (SELECT count(*) FROM public.program_templates p
                WHERE p.workspace_id = w.id)                AS programs,
              (SELECT count(*) FROM public.workspace_members m
                WHERE m.workspace_id = w.id)                AS members
         FROM public.workspaces w
        WHERE w.trial_ends_at IS NOT NULL
          AND w.trial_ends_at <= now()
          AND coalesce(w.plan, 'trial') = 'trial'
          AND NOT EXISTS (
                SELECT 1 FROM public.subscriptions s
                 WHERE s.workspace_id = w.id
                   AND (
                     s.status IN ('active', 'authenticated', 'trialing')
                     OR (s.status = 'created'
                         AND s.created_at > now() - ($3 || ' hours')::interval)
                     OR (s.status IN ('halted', 'pending')
                         AND s.current_period_end IS NOT NULL
                         AND s.current_period_end > now() - ($2 || ' days')::interval)
                   )
              )
        ORDER BY due_at ASC`,
      String(RETENTION_MONTHS),
      String(BILLING_GRACE_DAYS),
      String(UNPAID_CHECKOUT_HOURS),
    );

    const items: PurgeCandidate[] = rows.map((r) => ({
      workspaceId: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      ownerEmail: r.owner_email,
      trialEndedAt: r.trial_ends_at.toISOString(),
      dueAt: r.due_at.toISOString(),
      daysUntilDue: Number(r.days_until_due),
      clients: Number(r.clients),
      programs: Number(r.programs),
      members: Number(r.members),
    }));

    return {
      retentionMonths: RETENTION_MONTHS,
      items,
      dueNow: items.filter((i) => new Date(i.dueAt).getTime() <= Date.now()).length,
    };
  }
}
