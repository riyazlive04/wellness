import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MailService } from '../mail/mail.service';
import { PrismaService } from '../database/prisma.service';
import { WasiService } from '../whatsapp/wasi.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { RazorpayService } from './razorpay.service';
import { findPlan, PLANS, UNPAID_CHECKOUT_HOURS } from './plans';

/**
 * Days before expiry that a practice is warned.
 *
 * 7 is the early notice; then every day of the final three, so nobody reaches
 * their last day having heard nothing since day 3. Day 0 — the day it lapses
 * — is appended by the job.
 */
export const TRIAL_WARN_DAYS = [7, 3, 2, 1] as const;
/** Fallback when platform_config has no value. */
export const DEFAULT_TRIAL_DAYS = 14;
/** A payment link is good for this long. */
const LINK_VALID_DAYS = 7;
/**
 * Practices are Indian, so "which day is it" and "end of day" must both mean
 * IST. Comparing UTC dates made a trial set to end 24 Oct read as 25 Oct to
 * the practice, and expire at 05:29 their time.
 */
const TZ = 'Asia/Kolkata';

export interface TrialRow {
  workspace_id: string;
  name: string;
  trial_ends_at: Date;
  days_left: number;
  owner_email: string | null;
  owner_phone: string | null;
  owner_name: string | null;
}

const BASE = (c: ConfigService) =>
  (c.get<string>('PUBLIC_APP_URL') ?? c.get<string>('APP_PUBLIC_URL') ?? 'https://nusi.in').replace(/\/+$/, '');

/**
 * Trials: warning a practice before one ends, letting an admin extend one,
 * and generating a Razorpay link they can pay from without signing in.
 *
 * Expiry itself is enforced elsewhere — TrialGuard returns 402 the moment
 * trial_ends_at passes. This service is about making sure nobody is
 * surprised by that, and can act on it easily.
 */
@Injectable()
export class TrialService {
  private readonly logger = new Logger(TrialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly whatsapp: WhatsappService,
    private readonly wasi: WasiService,
    private readonly razorpay: RazorpayService,
  ) {}

  /**
   * How long a new practice's trial runs. Reads the super admin's setting,
   * which until now was saved and then ignored — every practice got the
   * hardcoded 14 days regardless of what the admin screen said.
   */
  async trialDays(): Promise<number> {
    try {
      const row = await this.prisma.platform_config.findUnique({ where: { id: 1 } });
      // Guard the null/'' cases explicitly: Number(null) and Number('') are both
      // 0, which would otherwise pass the range check and silently give every
      // new practice a zero-day trial — locked out the moment it is created.
      const raw: unknown = row?.trial_days;
      if (raw !== null && raw !== undefined && raw !== '') {
        const n = Number(raw);
        if (Number.isInteger(n) && n >= 0 && n <= 365) return n;
      }
    } catch (err) {
      this.logger.warn(`Could not read trial_days, using ${DEFAULT_TRIAL_DAYS}: ${(err as Error).message}`);
    }
    return DEFAULT_TRIAL_DAYS;
  }

  /** Practices this many days from the end of their trial, with no subscription. */
  async endingIn(days: number): Promise<TrialRow[]> {
    return this.prisma.$queryRawUnsafe<TrialRow[]>(
      `SELECT w.id AS workspace_id, w.name, w.trial_ends_at,
              ((w.trial_ends_at AT TIME ZONE '${TZ}')::date
                 - (now() AT TIME ZONE '${TZ}')::date)::int AS days_left,
              u.email AS owner_email,
              COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''),
                       NULLIF(u.raw_user_meta_data->>'name','')) AS owner_name,
              COALESCE(NULLIF(w.contact_phone, ''), u.phone) AS owner_phone
         FROM public.workspaces w
         LEFT JOIN auth.users u ON u.id = w.owner_id
        WHERE w.status = 'active'
          AND w.plan = 'trial'
          AND NOT w.billing_exempt
          AND w.trial_ends_at IS NOT NULL
          AND ((w.trial_ends_at AT TIME ZONE '${TZ}')::date
                 - (now() AT TIME ZONE '${TZ}')::date) = $1
          AND NOT EXISTS (
            -- Matches resolveWorkspacePlan: an abandoned checkout ('created',
            -- never paid) counts only for UNPAID_CHECKOUT_HOURS. Without that
            -- window a practice that once opened the Razorpay page and closed
            -- it would never be warned again.
            SELECT 1 FROM public.subscriptions s
             WHERE s.workspace_id = w.id
               AND (
                 s.status IN ('active','authenticated','halted','pending')
                 OR (s.status = 'created'
                     AND s.created_at > now() - ($2 || ' hours')::interval)
               )
          )`,
      days,
      String(UNPAID_CHECKOUT_HOURS),
    );
  }

  /**
   * A Razorpay payment link for a plan, payable without signing in.
   *
   * Checkout alone cannot be sent anywhere: it only runs inside a logged-in
   * browser. A link can go in an email or a WhatsApp message, which is what
   * a practice whose trial just lapsed actually needs.
   *
   * Returns null when Razorpay is unconfigured, so a caller can fall back
   * rather than failing outright.
   *
   * The notes carry `kind: 'trial_conversion'` and the plan, which is what
   * the webhook's fulfilTrialConversion keys on to create the subscription
   * row and unlock the practice. Changing those notes without changing that
   * handler would take the money and unlock nothing.
   */
  async paymentLink(
    workspaceId: string,
    planKey: string,
    opts: { email?: string | null; phone?: string | null; name?: string | null } = {},
  ): Promise<string | null> {
    const plan = findPlan(planKey);
    if (!plan) throw new BadRequestException(`Unknown plan: ${planKey}`);
    if (!this.razorpay.isConfigured()) return null;

    try {
      const link = await this.razorpay.createPaymentLink({
        amountPaise: plan.priceInr * 100,
        description: `NUSI ${plan.name} — first month`,
        referenceId: `ws-${workspaceId.slice(0, 8)}-${Date.now()}`,
        expiresInSeconds: LINK_VALID_DAYS * 24 * 3600,
        customer: {
          name: opts.name ?? undefined,
          email: opts.email ?? undefined,
          contact: opts.phone ?? undefined,
        },
        notes: { workspace_id: workspaceId, plan_key: plan.key, kind: 'trial_conversion' },
      });
      return link.short_url ?? null;
    } catch (err) {
      // A reminder without a link is still worth sending.
      this.logger.warn(`Payment link failed for ${workspaceId}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Trials heading for conversion, soonest first — the practices that will
   * become subscriptions, or lapse.
   *
   * Same predicate as endingIn() so the admin screen and the reminder job
   * cannot disagree about who is in the pipeline, but over a window rather
   * than one exact day. Each row carries what they will actually be charged:
   * the plan they paid a setup fee for, with that fee not charged twice.
   */
  async converting(withinDays = 14): Promise<Array<{
    workspace_id: string; name: string; owner_email: string | null;
    days_left: number; trial_ends_at: string;
    plan_key: string | null; next_charge_inr: number | null;
    last_warned_days: number | null;
  }>> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      workspace_id: string; name: string; owner_email: string | null;
      days_left: number; trial_ends_at: string;
      plan_key: string | null; setup_paid_inr: number | null; last_warned_days: number | null;
    }>>(
      `SELECT w.id AS workspace_id, w.name,
              u.email AS owner_email,
              ((w.trial_ends_at AT TIME ZONE '${TZ}')::date
                 - (now() AT TIME ZONE '${TZ}')::date)::int AS days_left,
              to_char(w.trial_ends_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS trial_ends_at,
              (SELECT f.plan_key FROM public.workspace_setup_fee_payments f
                WHERE f.workspace_id = w.id ORDER BY f.paid_at DESC LIMIT 1) AS plan_key,
              (SELECT SUM(f.amount_inr)::int FROM public.workspace_setup_fee_payments f
                WHERE f.workspace_id = w.id) AS setup_paid_inr,
              (SELECT MAX(split_part(n.dedupe_key, ':', 4))::int
                 FROM public.billing_notifications n
                WHERE n.workspace_id = w.id AND n.dedupe_key LIKE 'trial_warn:%') AS last_warned_days
         FROM public.workspaces w
         LEFT JOIN auth.users u ON u.id = w.owner_id
        WHERE w.status = 'active' AND w.plan = 'trial' AND NOT w.billing_exempt
          AND w.trial_ends_at IS NOT NULL
          AND ((w.trial_ends_at AT TIME ZONE '${TZ}')::date
                 - (now() AT TIME ZONE '${TZ}')::date) <= $1
          AND NOT EXISTS (
            SELECT 1 FROM public.subscriptions s
             WHERE s.workspace_id = w.id
               AND (s.status IN ('active','authenticated','halted','pending')
                    OR (s.status = 'created' AND s.created_at > now() - ($2 || ' hours')::interval))
          )
        ORDER BY days_left ASC`,
      withinDays,
      String(UNPAID_CHECKOUT_HOURS),
    );

    return rows.map((r) => {
      const plan = r.plan_key ? findPlan(r.plan_key) : undefined;
      return {
        workspace_id: r.workspace_id,
        name: r.name,
        owner_email: r.owner_email,
        days_left: r.days_left,
        trial_ends_at: r.trial_ends_at,
        plan_key: plan?.key ?? null,
        // The setup fee was already paid, so the first charge is the plan
        // price alone — the number to quote them.
        next_charge_inr: plan ? plan.priceInr : null,
        last_warned_days: r.last_warned_days,
      };
    });
  }

  /**
   * Every reminder sent to one practice, newest first — the record behind the
   * admin's reminders panel, so "did they actually hear from us?" is answered
   * by looking rather than by reading the database.
   */
  async remindersFor(workspaceId: string): Promise<Array<{
    title: string; sent_at: string; days_bucket: number | null; source: string;
    channels: { email: boolean; whatsapp: boolean; in_app: boolean };
  }>> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      title: string; created_at: Date; dedupe_key: string | null;
      channels: { email?: boolean; whatsapp?: boolean; in_app?: boolean } | null;
    }>>(
      `SELECT title, created_at, dedupe_key, metadata->'channels' AS channels
         FROM public.billing_notifications
        WHERE workspace_id = $1::uuid
          AND type IN ('trial_expiring', 'trial_expired')
        ORDER BY created_at DESC
        LIMIT 20`,
      workspaceId,
    );
    return rows.map((r) => {
      // trial_warn:<ws>:<day>:<bucket> is the job that emails and WhatsApps;
      // trial_expiring:<ws>:<day> was the older in-app-only one.
      const parts = (r.dedupe_key ?? '').split(':');
      const isWarn = parts[0] === 'trial_warn';
      // Recorded outcome where we have it. Rows sent before channels were
      // recorded fall back to what the key implies — stated as such rather
      // than presented as fact.
      const ch = r.channels
        ? { email: !!r.channels.email, whatsapp: !!r.channels.whatsapp, in_app: r.channels.in_app !== false }
        : { email: isWarn, whatsapp: isWarn, in_app: true };
      const went = [ch.email && 'email', ch.whatsapp && 'WhatsApp', ch.in_app && 'in-app'].filter(Boolean);
      return {
        title: r.title,
        sent_at: r.created_at.toISOString(),
        days_bucket: isWarn ? Number(parts[3]) : null,
        source: went.length ? went.join(' + ') + (r.channels ? '' : ' (not recorded)') : 'nothing sent',
        channels: ch,
      };
    });
  }

  /**
   * Every practice on trial, with its reminder history — the platform-wide
   * view behind the Reminders page.
   *
   * Answers "who has not heard from us" without opening each practice in
   * turn, which is how a missed warning stays missed.
   */
  async reminderBoard(): Promise<Array<{
    workspace_id: string; name: string; owner_email: string | null; owner_phone: string | null;
    days_left: number; trial_ends_at: string; plan_key: string | null; next_charge_inr: number | null;
    sent: Array<{ title: string; sent_at: string; days_bucket: number | null; source: string }>;
  }>> {
    const practices = await this.prisma.$queryRawUnsafe<Array<{
      workspace_id: string; name: string; owner_email: string | null; owner_phone: string | null;
      days_left: number; trial_ends_at: string; plan_key: string | null;
    }>>(
      `SELECT w.id AS workspace_id, w.name,
              u.email AS owner_email,
              COALESCE(NULLIF(w.contact_phone, ''), u.phone) AS owner_phone,
              ((w.trial_ends_at AT TIME ZONE '${TZ}')::date
                 - (now() AT TIME ZONE '${TZ}')::date)::int AS days_left,
              to_char(w.trial_ends_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS trial_ends_at,
              (SELECT f.plan_key FROM public.workspace_setup_fee_payments f
                WHERE f.workspace_id = w.id ORDER BY f.paid_at DESC LIMIT 1) AS plan_key
         FROM public.workspaces w
         LEFT JOIN auth.users u ON u.id = w.owner_id
        WHERE w.status = 'active' AND w.plan = 'trial' AND NOT w.billing_exempt
          AND w.trial_ends_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.subscriptions s
             WHERE s.workspace_id = w.id
               AND (s.status IN ('active','authenticated','halted','pending')
                    OR (s.status = 'created' AND s.created_at > now() - ($1 || ' hours')::interval))
          )
        ORDER BY days_left ASC`,
      String(UNPAID_CHECKOUT_HOURS),
    );

    return Promise.all(practices.map(async (p) => {
      const plan = p.plan_key ? findPlan(p.plan_key) : undefined;
      return {
        ...p,
        next_charge_inr: plan ? plan.priceInr : null,
        sent: await this.remindersFor(p.workspace_id),
      };
    }));
  }

  /**
   * Send this practice's trial reminder now, from the admin screen.
   *
   * Claims the same dedupe row the scheduled job would, so a manual send and
   * the 9am run cannot both reach the practice on the same day. Returns which
   * channels actually went, rather than claiming success blindly.
   */
  async sendNow(workspaceId: string, only?: 'email' | 'whatsapp'): Promise<{
    sent: boolean; email: boolean; whatsapp: boolean; reason?: string;
  }> {
    const [row] = await this.prisma.$queryRawUnsafe<TrialRow[]>(
      `SELECT w.id AS workspace_id, w.name, w.trial_ends_at,
              ((w.trial_ends_at AT TIME ZONE '${TZ}')::date
                 - (now() AT TIME ZONE '${TZ}')::date)::int AS days_left,
              u.email AS owner_email,
              COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''),
                       NULLIF(u.raw_user_meta_data->>'name','')) AS owner_name,
              COALESCE(NULLIF(w.contact_phone, ''), u.phone) AS owner_phone
         FROM public.workspaces w
         LEFT JOIN auth.users u ON u.id = w.owner_id
        WHERE w.id = $1::uuid AND w.status <> 'deleted'`,
      workspaceId,
    );
    if (!row) throw new NotFoundException('Practice not found.');
    if (!row.trial_ends_at) return { sent: false, email: false, whatsapp: false, reason: 'No trial date set.' };

    const out = await this.warn(row, row.days_left <= 0 ? 'ended' : 'ending', only);
    const sent = out.email || out.whatsapp;

    // Claim the same row the 9am job would, so a manual send today cannot be
    // repeated by the scheduled run. ON CONFLICT DO NOTHING: if the job has
    // already been through, this simply records nothing new.
    if (sent) {
      const day = row.trial_ends_at.toISOString().slice(0, 10);
      const bucket = Math.max(0, row.days_left);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO public.billing_notifications
           (workspace_id, type, severity, title, body, action_url, dedupe_key, metadata)
         VALUES ($1::uuid, $2, $3, $4, $5, '/billing', $6, $7::jsonb)
         ON CONFLICT (workspace_id, dedupe_key) WHERE dedupe_key IS NOT NULL
         DO UPDATE SET metadata = public.billing_notifications.metadata || EXCLUDED.metadata`,
        workspaceId,
        row.days_left <= 0 ? 'trial_expired' : 'trial_expiring',
        row.days_left <= 1 ? 'critical' : 'warning',
        row.days_left <= 0 ? 'Your trial has ended' : `Your trial ends in ${bucket} day${bucket === 1 ? '' : 's'}`,
        'Subscribe to keep your clients, AI quota and data without interruption.',
        `trial_warn:${workspaceId}:${day}:${bucket}`,
        JSON.stringify({ manual: true, channels: { email: out.email, whatsapp: out.whatsapp, in_app: true } }),
      ).catch((err) => this.logger.warn(`Could not record manual reminder: ${(err as Error).message}`));
    }
    this.logger.log(
      `Manual trial reminder for ${row.name}: email=${out.email} whatsapp=${out.whatsapp}`,
    );
    return {
      sent,
      ...out,
      reason: sent ? undefined : 'No email or phone on file for the owner.',
    };
  }

  /** Warn one practice by email and WhatsApp. Returns which channels went. */
  async warn(
    row: TrialRow,
    kind: 'ending' | 'ended',
    /** Limit to one channel; omitted means every channel available. */
    only?: 'email' | 'whatsapp',
  ): Promise<{ email: boolean; whatsapp: boolean }> {
    // A Razorpay link so a practice can pay without signing in, which is what
    // a locked-out owner actually needs. The webhook's fulfilTrialConversion
    // creates the subscription row on payment, so paying the link really does
    // unlock them — without that it would take the money and change nothing.
    //
    // A link is a one-off charge and sets up no auto-renewal, so it buys one
    // month and the renewal reminders then point at Billing. Falls back to the
    // billing page when Razorpay is unconfigured or the call fails; TrialGuard
    // keeps `billing` open while locked, so that URL works either way.
    const billingUrl = `${BASE(this.config)}/billing`;
    const starter = PLANS[0];
    const link = await this.paymentLink(row.workspace_id, starter.key, {
      email: row.owner_email,
      phone: row.owner_phone,
      name: row.name,
    });
    const payUrl = link ?? billingUrl;

    const days = Math.max(0, row.days_left);
    const when =
      kind === 'ended' ? 'has ended'
        : days === 0 ? 'ends today'
        : days === 1 ? 'ends tomorrow'
        : `ends in ${days} days`;

    const subject = kind === 'ended'
      ? `Your NUSI trial has ended — ${row.name}`
      : `Your NUSI trial ${when} — ${row.name}`;

    const email = row.owner_email && only !== 'whatsapp'
      ? await this.mail.send({ to: row.owner_email, subject, html: emailHtml(row, when, kind, payUrl) })
      : false;

    const text = kind === 'ended'
      ? `Your NUSI trial for ${row.name} has ended, so your practice is locked until you subscribe. `
        + `Your data is safe and nothing is lost — your clients can still use their app as normal.\n\n`
        + `Subscribe here: ${payUrl}`
      : `Your NUSI trial for ${row.name} ${when}. Subscribe to keep your clients, plans and data without interruption.\n\n`
        + `Pay here: ${payUrl}`;

    const whatsapp = row.owner_phone && only !== 'email'
      ? await this.sendWhatsapp(row, days, when, payUrl, text)
      : false;

    return { email, whatsapp };
  }

  /**
   * WhatsApp through the official API first, falling back to NUSI's own
   * number.
   *
   * Wasi is Meta's Business API: always up, no handset to keep linked, but it
   * can only START a conversation with a template Meta has approved — hence
   * the fixed parameters rather than the free text below. Evolution drives
   * NUSI's own number and sends anything, but stops the moment that phone
   * goes offline for a fortnight, which is exactly how it was found broken.
   *
   * Set WASI_TEMPLATE_TRIAL_ENDING / _ENDED once the templates are approved;
   * until then this falls straight through to Evolution and nothing changes.
   */
  private async sendWhatsapp(
    row: TrialRow,
    days: number,
    when: string,
    payUrl: string,
    text: string,
  ): Promise<boolean> {
    const to = row.owner_phone!;
    // Every NUSI template opens "Hi {{customer_name}}," so this must never be
    // blank. Names are stored as typed ("syed abuthahir"), which reads wrong
    // at the start of a message; fall back to the practice name.
    const customerName = titleCase(row.owner_name) || row.name;
    const template = this.config.get<string>(
      days <= 0 ? 'WASI_TEMPLATE_TRIAL_ENDED' : 'WASI_TEMPLATE_TRIAL_ENDING',
    );
    if (template && this.wasi.enabled) {
      const ok = await this.wasi
        .sendTemplate(to, template, {
          customer_name: customerName,
          practice_name: row.name,
          days_left: String(Math.max(0, days)),
          ends_on: when,
          pay_url: payUrl,
        })
        .catch(() => false);
      if (ok) return true;
      this.logger.warn(`Wasi trial template failed for ${row.name}; falling back to NUSI's number.`);
    }
    return this.whatsapp.sendPlatformText({ to, text }).catch(() => false);
  }

  /**
   * Move a practice's trial end date. Used by a super admin to give a
   * practice more time — previously only possible by editing the database.
   */
  async extend(
    workspaceId: string,
    opts: { days?: number; until?: string; reason?: string },
    byUserId: string,
  ): Promise<{ trial_ends_at: string; days_left: number }> {
    if (!opts.days && !opts.until) {
      throw new BadRequestException('Give either a number of days or a date.');
    }

    const [ws] = await this.prisma.$queryRawUnsafe<Array<{ id: string; trial_ends_at: Date | null }>>(
      `SELECT id, trial_ends_at FROM public.workspaces WHERE id = $1::uuid AND status <> 'deleted'`,
      workspaceId,
    );
    if (!ws) throw new NotFoundException('Practice not found.');

    // Adding counts from today when the trial has already lapsed, so "+7 days"
    // always means seven usable days rather than seven days from a date that
    // has passed. Subtracting counts from the current end date instead: "-7"
    // means "take a week off what they have", and clamping to today would
    // quietly refuse to shorten a trial at all.
    //
    // Both paths land on 23:59 of the final day. Without that, adding an
    // interval carried the original sign-up time along, so a trial could
    // expire at 06:04 — hours earlier than the date on screen implies.
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ ends: string; left: number }>>(
      opts.until
        ? `UPDATE public.workspaces
              SET trial_ends_at = ($2::date + time '23:59') AT TIME ZONE '${TZ}',
                  plan = 'trial', updated_at = now()
            WHERE id = $1::uuid
            RETURNING to_char(trial_ends_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS ends,
                      ((trial_ends_at AT TIME ZONE '${TZ}')::date
                         - (now() AT TIME ZONE '${TZ}')::date)::int AS left`
        : `UPDATE public.workspaces
              SET trial_ends_at = ((((CASE
                                        WHEN $2::int < 0 THEN COALESCE(trial_ends_at, now())
                                        ELSE GREATEST(COALESCE(trial_ends_at, now()), now())
                                      END) AT TIME ZONE '${TZ}' + ($2 || ' days')::interval)::date
                                     + time '23:59') AT TIME ZONE '${TZ}',
                  plan = 'trial', updated_at = now()
            WHERE id = $1::uuid
            RETURNING to_char(trial_ends_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS ends,
                      ((trial_ends_at AT TIME ZONE '${TZ}')::date
                         - (now() AT TIME ZONE '${TZ}')::date)::int AS left`,
      workspaceId,
      opts.until ?? String(opts.days),
    );

    this.logger.log(
      `Trial for workspace=${workspaceId} now ends ${row.ends} (by user=${byUserId}` +
        `${opts.reason ? `, reason: ${opts.reason}` : ''})`,
    );
    return { trial_ends_at: row.ends, days_left: row.left };
  }
}

/** Plain, readable HTML — no images, so it renders anywhere. */
function emailHtml(row: TrialRow, when: string, kind: 'ending' | 'ended', payUrl: string): string {
  const head = kind === 'ended' ? 'Your trial has ended' : `Your trial ${when}`;
  const body = kind === 'ended'
    ? `Your NUSI trial for <b>${esc(row.name)}</b> has ended, so your practice is locked until you subscribe.
       <br><br>Nothing is lost. Your clients, plans and records are exactly where you left them, and your
       clients can still use their app as normal. Subscribing unlocks everything immediately.`
    : `Your NUSI trial for <b>${esc(row.name)}</b> ${when}. Subscribe to keep your clients, plans,
       AI credits and data without interruption.`;

  return `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:19px;font-weight:600;letter-spacing:-.02em;color:#0c0c0c">NUSI</div>
    <div style="margin-top:22px;background:#fff;border:1px solid #ededea;border-radius:14px;padding:26px">
      <h1 style="margin:0;font-size:21px;font-weight:600;letter-spacing:-.02em;color:#0c0c0c">${esc(head)}</h1>
      <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#5a5a56">${body}</p>
      <a href="${esc(payUrl)}" style="display:inline-block;margin-top:22px;background:#436F17;color:#fff;
         text-decoration:none;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:500">Subscribe now</a>
      <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#9b9b9b">
        Or sign in and open Billing. Any questions, just reply to this email.
      </p>
    </div>
    <p style="margin:18px 0 0;font-size:12px;color:#9b9b9b">NUSI by Sirah Digital · support@sirahdigital.in</p>
  </div></body></html>`;
}

/** "syed abuthahir" -> "Syed Abuthahir". Blank in, blank out. */
function titleCase(name: string | null): string {
  if (!name) return '';
  return name.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
