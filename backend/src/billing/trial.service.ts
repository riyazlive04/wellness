import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MailService } from '../mail/mail.service';
import { PrismaService } from '../database/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { RazorpayService } from './razorpay.service';
import { findPlan, PLANS } from './plans';

/** Days before expiry that a practice is warned. */
export const TRIAL_WARN_DAYS = [7, 3, 1] as const;
/** Fallback when platform_config has no value. */
export const DEFAULT_TRIAL_DAYS = 14;
/** A payment link is good for this long. */
const LINK_VALID_DAYS = 7;

export interface TrialRow {
  workspace_id: string;
  name: string;
  trial_ends_at: Date;
  days_left: number;
  owner_email: string | null;
  owner_phone: string | null;
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
              (w.trial_ends_at::date - now()::date)::int AS days_left,
              u.email AS owner_email,
              COALESCE(NULLIF(w.contact_phone, ''), u.phone) AS owner_phone
         FROM public.workspaces w
         LEFT JOIN auth.users u ON u.id = w.owner_id
        WHERE w.status = 'active'
          AND w.plan = 'trial'
          AND NOT w.billing_exempt
          AND w.trial_ends_at IS NOT NULL
          AND (w.trial_ends_at::date - now()::date) = $1
          AND NOT EXISTS (
            SELECT 1 FROM public.subscriptions s
             WHERE s.workspace_id = w.id
               AND s.status IN ('active','authenticated','created','halted','pending')
          )`,
      days,
    );
  }

  /**
   * A Razorpay payment link for a plan, payable without signing in.
   *
   * Checkout alone cannot be sent anywhere: it only runs inside a logged-in
   * browser. A link can go in an email or a WhatsApp message, which is what
   * a practice whose trial just lapsed actually needs.
   *
   * Returns null when Razorpay is unconfigured, so a reminder still sends
   * without one rather than failing outright.
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

  /** Warn one practice by email and WhatsApp. Returns which channels went. */
  async warn(row: TrialRow, kind: 'ending' | 'ended'): Promise<{ email: boolean; whatsapp: boolean }> {
    const starter = PLANS[0];
    const link = await this.paymentLink(row.workspace_id, starter.key, {
      email: row.owner_email, phone: row.owner_phone, name: row.name,
    });
    const payUrl = link ?? `${BASE(this.config)}/billing`;

    const days = Math.max(0, row.days_left);
    const when =
      kind === 'ended' ? 'has ended'
        : days === 0 ? 'ends today'
        : days === 1 ? 'ends tomorrow'
        : `ends in ${days} days`;

    const subject = kind === 'ended'
      ? `Your NUSI trial has ended — ${row.name}`
      : `Your NUSI trial ${when} — ${row.name}`;

    const email = row.owner_email
      ? await this.mail.send({ to: row.owner_email, subject, html: emailHtml(row, when, kind, payUrl) })
      : false;

    const text = kind === 'ended'
      ? `Your NUSI trial for ${row.name} has ended, so your practice is locked until you subscribe. `
        + `Your data is safe and nothing is lost — your clients can still use their app as normal.\n\n`
        + `Subscribe here: ${payUrl}`
      : `Your NUSI trial for ${row.name} ${when}. Subscribe to keep your clients, plans and data without interruption.\n\n`
        + `Pay here: ${payUrl}`;

    const whatsapp = row.owner_phone
      ? await this.whatsapp.sendPlatformText({ to: row.owner_phone, text }).catch(() => false)
      : false;

    return { email, whatsapp };
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

    // Extending counts from today when the trial has already lapsed, so
    // "+7 days" always means seven usable days rather than seven days from
    // a date that has passed.
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ ends: string; left: number }>>(
      opts.until
        ? `UPDATE public.workspaces
              SET trial_ends_at = $2::date + time '23:59', plan = 'trial', updated_at = now()
            WHERE id = $1::uuid
            RETURNING to_char(trial_ends_at, 'YYYY-MM-DD') AS ends,
                      (trial_ends_at::date - now()::date)::int AS left`
        : `UPDATE public.workspaces
              SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now()) + ($2 || ' days')::interval,
                  plan = 'trial', updated_at = now()
            WHERE id = $1::uuid
            RETURNING to_char(trial_ends_at, 'YYYY-MM-DD') AS ends,
                      (trial_ends_at::date - now()::date)::int AS left`,
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

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
