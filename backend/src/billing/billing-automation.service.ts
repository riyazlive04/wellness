import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BillingNotificationService } from './billing-notification.service';
import { BILLING_GRACE_DAYS, RENEWAL_REMINDER_DAYS, TRIAL_REMINDER_DAYS } from './plans';

/**
 * BillingAutomationService — the event-driven jobs that keep the subscription
 * lifecycle moving without manual intervention (Module 3 — Trial Management,
 * Renewal Management, Payment-Failure Recovery).
 *
 * Each run* method is idempotent: notifications use `dedupeKey`, and the
 * downgrade UPDATE only flips a row once. That means the scheduler can run them
 * daily (or an admin can trigger them on demand) with no risk of duplicate
 * nudges or double downgrades.
 *
 * Enforcement note: actual plan restriction lives in LimitsService.resolvePlan,
 * which keeps a halted subscription's plan during the BILLING_GRACE_DAYS window
 * and drops to trial limits after. This service handles the *communication* and
 * the terminal *downgrade* bookkeeping.
 */
@Injectable()
export class BillingAutomationService {
  private readonly logger = new Logger(BillingAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: BillingNotificationService,
  ) {}

  /** Run every job. Returns a per-job count summary (used by the admin trigger). */
  async runAll(): Promise<AutomationSummary> {
    const [trialReminders, trialExpiries, renewalReminders, dunning, downgrades] = await Promise.all([
      this.runTrialReminders(),
      this.runTrialExpiries(),
      this.runRenewalReminders(),
      this.runDunning(),
      this.runDowngrades(),
    ]);
    const summary = { trialReminders, trialExpiries, renewalReminders, dunning, downgrades };
    this.logger.log(`Billing automation run complete: ${JSON.stringify(summary)}`);
    return summary;
  }

  // ── Trial management ───────────────────────────────────────────────

  /** Nudge workspaces whose trial ends within TRIAL_REMINDER_DAYS. */
  async runTrialReminders(): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<TrialRow[]>(
      `SELECT w.id AS workspace_id, w.trial_ends_at,
              to_char(w.trial_ends_at, 'YYYY-MM-DD') AS day
         FROM public.workspaces w
        WHERE w.status = 'active'
          AND w.plan = 'trial'
          AND w.trial_ends_at IS NOT NULL
          AND w.trial_ends_at > now()
          AND w.trial_ends_at <= now() + ($1 || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM public.subscriptions s
             WHERE s.workspace_id = w.id
               AND s.status IN ('active','authenticated','created','halted','pending')
          )`,
      String(TRIAL_REMINDER_DAYS),
    );
    let emitted = 0;
    for (const r of rows) {
      const days = daysUntil(r.trial_ends_at);
      const ok = await this.notifications.emit({
        workspaceId: r.workspace_id,
        type: 'trial_expiring',
        severity: 'warning',
        title: days <= 1 ? 'Your trial ends tomorrow' : `Your trial ends in ${days} days`,
        body: 'Subscribe now to keep your clients, AI quota, and data without interruption.',
        actionUrl: '/subscription',
        dedupeKey: `trial_expiring:${r.workspace_id}:${r.day}`,
      });
      if (ok) emitted++;
    }
    return emitted;
  }

  /** Notify workspaces whose trial has just lapsed (still no subscription). */
  async runTrialExpiries(): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<TrialRow[]>(
      `SELECT w.id AS workspace_id, w.trial_ends_at,
              to_char(w.trial_ends_at, 'YYYY-MM-DD') AS day
         FROM public.workspaces w
        WHERE w.status = 'active'
          AND w.plan = 'trial'
          AND w.trial_ends_at IS NOT NULL
          AND w.trial_ends_at < now()
          AND w.trial_ends_at > now() - interval '30 days'
          AND NOT EXISTS (
            SELECT 1 FROM public.subscriptions s
             WHERE s.workspace_id = w.id
               AND s.status IN ('active','authenticated','created','halted','pending')
          )`,
    );
    let emitted = 0;
    for (const r of rows) {
      const ok = await this.notifications.emit({
        workspaceId: r.workspace_id,
        type: 'trial_expired',
        severity: 'critical',
        title: 'Your free trial has ended',
        body: 'Your workspace is now on trial limits. Subscribe to restore full capacity.',
        actionUrl: '/subscription',
        dedupeKey: `trial_expired:${r.workspace_id}:${r.day}`,
      });
      if (ok) emitted++;
    }
    return emitted;
  }

  // ── Renewal management ─────────────────────────────────────────────

  /** Remind active subscribers of an upcoming renewal charge. */
  async runRenewalReminders(): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<RenewalRow[]>(
      `SELECT s.id AS subscription_id, s.workspace_id, s.plan_key, s.current_period_end,
              to_char(s.current_period_end, 'YYYY-MM-DD') AS period_day
         FROM public.subscriptions s
        WHERE s.status IN ('active','authenticated')
          AND s.cancelled_at IS NULL
          AND s.current_period_end IS NOT NULL
          AND s.current_period_end > now()
          AND s.current_period_end <= now() + ($1 || ' days')::interval`,
      String(RENEWAL_REMINDER_DAYS),
    );
    let emitted = 0;
    for (const r of rows) {
      const days = daysUntil(r.current_period_end);
      const ok = await this.notifications.emit({
        workspaceId: r.workspace_id,
        type: 'renewal_reminder',
        severity: 'info',
        title: days <= 1 ? 'Your plan renews tomorrow' : `Your plan renews in ${days} days`,
        body: `Your ${r.plan_key} plan will renew automatically. No action needed if your card is up to date.`,
        actionUrl: '/billing',
        dedupeKey: `renewal_reminder:${r.subscription_id}:${r.period_day}`,
      });
      if (ok) emitted++;
    }
    return emitted;
  }

  // ── Payment-failure recovery (dunning) ─────────────────────────────

  /**
   * Escalating reminders for subscriptions whose renewal failed (halted/pending)
   * and are still inside the grace window. Razorpay retries the charge itself;
   * we drive the customer communication at day 1 / 3 / 7 / 13.
   */
  async runDunning(): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<DunningRow[]>(
      `SELECT s.id AS subscription_id, s.workspace_id, s.plan_key,
              to_char(s.current_period_end, 'YYYY-MM-DD') AS period_day,
              floor(EXTRACT(EPOCH FROM (now() - s.current_period_end)) / 86400)::int AS days_past
         FROM public.subscriptions s
        WHERE s.status IN ('halted','pending')
          AND s.current_period_end IS NOT NULL
          AND s.current_period_end < now()
          AND s.current_period_end > now() - ($1 || ' days')::interval`,
      String(BILLING_GRACE_DAYS),
    );
    const milestones = [1, 3, 7, 13];
    let emitted = 0;
    for (const r of rows) {
      const milestone = highestReached(milestones, r.days_past);
      if (milestone === null) continue;
      const graceLeft = Math.max(0, BILLING_GRACE_DAYS - r.days_past);
      const ok = await this.notifications.emit({
        workspaceId: r.workspace_id,
        type: 'payment_failed',
        severity: 'critical',
        title: 'Action needed — renewal payment failed',
        body: `We couldn't charge your card for the ${r.plan_key} plan. ${graceLeft} day${graceLeft === 1 ? '' : 's'} of grace left before your workspace is downgraded. Update your payment method to keep full access.`,
        actionUrl: '/billing',
        dedupeKey: `dunning:${r.subscription_id}:${r.period_day}:${milestone}`,
        metadata: { days_past: r.days_past, grace_left: graceLeft, milestone },
      });
      if (ok) emitted++;
    }
    return emitted;
  }

  // ── Terminal downgrade ─────────────────────────────────────────────

  /**
   * Downgrade subscriptions whose grace window has fully elapsed: flip them to
   * 'expired' so LimitsService stops counting them and the workspace falls back
   * to trial limits. One-shot per subscription (the WHERE excludes already-
   * expired rows).
   */
  async runDowngrades(): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; workspace_id: string; plan_key: string }>>(
      `UPDATE public.subscriptions
          SET status = 'expired', ended_at = now(), updated_at = now()
        WHERE status IN ('halted','pending')
          AND current_period_end IS NOT NULL
          AND current_period_end <= now() - ($1 || ' days')::interval
        RETURNING id, workspace_id, plan_key`,
      String(BILLING_GRACE_DAYS),
    );
    for (const r of rows) {
      await this.notifications.emit({
        workspaceId: r.workspace_id,
        type: 'trial_expired',
        severity: 'critical',
        title: 'Workspace downgraded after failed payments',
        body: `Your ${r.plan_key} subscription lapsed after the grace period. You're now on trial limits — re-subscribe any time to restore full access.`,
        actionUrl: '/subscription',
        dedupeKey: `downgraded:${r.id}`,
      });
    }
    if (rows.length) this.logger.warn(`Downgraded ${rows.length} subscription(s) past grace.`);
    return rows.length;
  }
}

export interface AutomationSummary {
  trialReminders: number;
  trialExpiries: number;
  renewalReminders: number;
  dunning: number;
  downgrades: number;
}

interface TrialRow {
  workspace_id: string;
  trial_ends_at: string;
  day: string;
}
interface RenewalRow {
  subscription_id: string;
  workspace_id: string;
  plan_key: string;
  current_period_end: string;
  period_day: string;
}
interface DunningRow {
  subscription_id: string;
  workspace_id: string;
  plan_key: string;
  period_day: string;
  days_past: number;
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Highest milestone <= daysPast, or null if none reached yet. */
function highestReached(milestones: number[], daysPast: number): number | null {
  let hit: number | null = null;
  for (const m of milestones) if (daysPast >= m) hit = m;
  return hit;
}
