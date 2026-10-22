import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingNotificationService } from './billing-notification.service';
import { BILLING_GRACE_DAYS, RENEWAL_REMINDER_DAYS, TRIAL_REMINDER_DAYS } from './plans';
import { TRIAL_WARN_DAYS, TrialService } from './trial.service';

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
    private readonly appNotifications: NotificationsService,
    private readonly trials: TrialService,
  ) {}

  /** The run in progress, if any: the daily cron and an admin's manual run must not overlap. */
  private running: Promise<AutomationSummary> | null = null;

  /** Run every job. Returns a per-job count summary (used by the admin trigger). */
  runAll(): Promise<AutomationSummary> {
    if (this.running) return this.running;
    this.running = this.runAllNow().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runAllNow(): Promise<AutomationSummary> {
    const [trialReminders, trialWarnings, trialExpiries, renewalReminders, dunning, downgrades, planChanges] = await Promise.all([
      // Deliberately not runTrialReminders(): runTrialWarnings below covers
      // the same practices with correct day counts and real channels.
      Promise.resolve(0),
      this.runTrialWarnings(),
      this.runTrialExpiries(),
      this.runRenewalReminders(),
      this.runDunning(),
      this.runDowngrades(),
      this.applyScheduledPlanChanges(),
    ]);
    const summary = { trialReminders, trialWarnings, trialExpiries, renewalReminders, dunning, downgrades, planChanges };
    this.logger.log(`Billing automation run complete: ${JSON.stringify(summary)}`);
    return summary;
  }

  // ── Trial management ───────────────────────────────────────────────

  /** Nudge workspaces whose trial ends within TRIAL_REMINDER_DAYS. */
  /**
   * Superseded by runTrialWarnings, which warns on fixed 7/3/1/0-day buckets
   * in IST and actually reaches the practice by email and WhatsApp.
   *
   * This one fired every day inside the window, wrote an in-app notice only,
   * and counted days with Math.ceil on elapsed milliseconds — so on 22 Oct it
   * told a practice with 2 days left that it had 3, the day after the correct
   * warning had already gone out. Kept callable for the admin "run now"
   * trigger, but no longer part of the daily run.
   */
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

  /**
   * Email and WhatsApp a practice before its trial ends, and on the day it
   * does.
   *
   * The in-app notice above is only a row in a bell dropdown: a nutritionist
   * who does not sign in is never told their practice is about to lock. This
   * reaches them where they actually are, and carries a payment link they can
   * use without signing in at all.
   *
   * Idempotent per practice per day through the same dedupe row the in-app
   * notice uses, so a re-run or a second instance cannot send twice.
   */
  async runTrialWarnings(): Promise<number> {
    let sent = 0;
    // Warn ahead of time, then once more on the day it lapses.
    for (const days of [...TRIAL_WARN_DAYS, 0]) {
      let rows;
      try {
        rows = await this.trials.endingIn(days);
      } catch (err) {
        this.logger.warn(`Trial warning query failed for day ${days}: ${(err as Error).message}`);
        continue;
      }

      for (const row of rows) {
        const day = row.trial_ends_at.toISOString().slice(0, 10);
        // Claim the send first: if this returns false another run already did it.
        const claimed = await this.notifications.emit({
          workspaceId: row.workspace_id,
          type: days === 0 ? 'trial_expired' : 'trial_expiring',
          severity: days <= 1 ? 'critical' : 'warning',
          title: days === 0 ? 'Your trial ends today' : `Your trial ends in ${days} day${days === 1 ? '' : 's'}`,
          body: 'Subscribe to keep your clients, AI quota and data without interruption.',
          actionUrl: '/billing',
          dedupeKey: `trial_warn:${row.workspace_id}:${day}:${days}`,
        });
        if (!claimed) continue;

        try {
          const out = await this.trials.warn(row, days === 0 ? 'ended' : 'ending');
          if (out.email || out.whatsapp) sent++;
          // Record what actually went. The row is claimed before sending, so
          // without this the admin screen can only infer the channels from
          // the key — and would show "email + WhatsApp" for a send where
          // WhatsApp silently failed.
          await this.notifications.markChannels(
            row.workspace_id,
            `trial_warn:${row.workspace_id}:${day}:${days}`,
            { email: out.email, whatsapp: out.whatsapp, in_app: true },
          );
          this.logger.log(
            `Trial warning (${days}d) for ${row.name}: email=${out.email} whatsapp=${out.whatsapp}`,
          );
        } catch (err) {
          this.logger.warn(`Trial warning failed for ${row.name}: ${(err as Error).message}`);
        }

        // Tell the super admins too, so a lapse can be chased before it happens.
        if (days <= 3) {
          await this.appNotifications.notifySuperAdmins(row.workspace_id, {
            type: 'billing',
            title: days === 0 ? `${row.name}: trial ends today` : `${row.name}: trial ends in ${days} days`,
            body: 'No subscription yet. Worth a call before they are locked out.',
            url: `/admin/workspaces/${row.workspace_id}`,
          });
        }
      }
    }
    return sent;
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
              to_char(s.current_period_end, 'YYYY-MM-DD') AS period_day,
              COALESCE((s.metadata->>'manual_renewal')::boolean, false) AS manual_renewal
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
      // A plan paid once by link or order does NOT renew itself. Telling that
      // practice "no action needed" would leave them locked out on the day it
      // ends, having done exactly what we told them.
      const ok = await this.notifications.emit({
        workspaceId: r.workspace_id,
        type: 'renewal_reminder',
        severity: r.manual_renewal ? 'warning' : 'info',
        title: r.manual_renewal
          ? days <= 1
            ? 'Your plan ends tomorrow — pay to keep access'
            : `Your plan ends in ${days} days — pay to keep access`
          : days <= 1
            ? 'Your plan renews tomorrow'
            : `Your plan renews in ${days} days`,
        body: r.manual_renewal
          ? `Your ${r.plan_key} plan was paid for one period and does not renew by itself. `
            + 'Pay again from Billing to keep your clients, plans and AI without interruption.'
          : `Your ${r.plan_key} plan will renew automatically. No action needed if your card is up to date.`,
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
        title: 'Action needed - renewal payment failed',
        body: `We couldn't charge your card for the ${r.plan_key} plan. ${graceLeft} day${graceLeft === 1 ? '' : 's'} of grace left before your workspace is downgraded. Update your payment method to keep full access.`,
        actionUrl: '/billing',
        dedupeKey: `dunning:${r.subscription_id}:${r.period_day}:${milestone}`,
        metadata: { days_past: r.days_past, grace_left: graceLeft, milestone },
      });
      if (ok) emitted++;
      // Alert super-admins once, at the first dunning milestone, so platform ops
      // sees failing renewals without getting pinged at every milestone.
      if (ok && milestone === milestones[0]) {
        void this.appNotifications.notifySuperAdmins(r.workspace_id, {
          type: 'billing:payment_failed',
          title: '⚠️ Workspace payment failed',
          body: `A ${r.plan_key} renewal payment failed. ${graceLeft} day${graceLeft === 1 ? '' : 's'} of grace left before downgrade.`,
          url: `/admin/workspaces/${r.workspace_id}`,
          tag: `billing-failed-${r.subscription_id}`,
        });
      }
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
        body: `Your ${r.plan_key} subscription lapsed after the grace period. You're now on trial limits - re-subscribe any time to restore full access.`,
        actionUrl: '/subscription',
        dedupeKey: `downgraded:${r.id}`,
      });
    }
    if (rows.length) this.logger.warn(`Downgraded ${rows.length} subscription(s) past grace.`);
    return rows.length;
  }

  // ── Scheduled plan changes (downgrades that take effect at cycle end) ──

  /**
   * Apply pending downgrades whose effective date (the old cycle end) has passed.
   * Set by POST /billing/me/change-plan for downgrades; we hold the higher plan
   * until the paid cycle ends, then swap plan_key/amount and clear the marker.
   */
  async applyScheduledPlanChanges(): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; workspace_id: string; plan_key: string; amount_paise: string | number; razorpay_plan_id: string | null }>
    >(
      `UPDATE public.subscriptions s
          SET plan_key        = (s.metadata->'pending_plan_change'->>'plan_key'),
              amount_paise     = (s.metadata->'pending_plan_change'->>'amount_paise')::bigint,
              razorpay_plan_id = (s.metadata->'pending_plan_change'->>'razorpay_plan_id'),
              metadata         = s.metadata - 'pending_plan_change',
              billing_cycle    = 'monthly',
              updated_at       = now()
        WHERE s.metadata ? 'pending_plan_change'
          AND (s.metadata->'pending_plan_change'->>'effective_at')::timestamptz <= now()
          AND s.status IN ('active','authenticated')
        RETURNING s.id, s.workspace_id, s.plan_key, s.amount_paise, s.razorpay_plan_id`,
    );
    for (const r of rows) {
      await this.notifications.emit({
        workspaceId: r.workspace_id,
        type: 'subscription_activated',
        severity: 'info',
        title: `Your plan is now ${r.plan_key}`,
        body: 'Your scheduled plan change has taken effect for the new billing cycle.',
        actionUrl: '/subscription',
        dedupeKey: `plan_change_applied:${r.id}:${r.plan_key}`,
      });
    }
    if (rows.length) this.logger.log(`Applied ${rows.length} scheduled plan change(s).`);
    return rows.length;
  }
}

export interface AutomationSummary {
  trialReminders: number;
  /** Email + WhatsApp warnings actually sent. */
  trialWarnings: number;
  trialExpiries: number;
  renewalReminders: number;
  dunning: number;
  downgrades: number;
  planChanges: number;
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
  /** Paid once (link or one-off order): it will not renew by itself. */
  manual_renewal: boolean;
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
