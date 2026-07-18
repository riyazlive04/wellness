import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { InvoiceService } from './invoice.service';
import { BillingNotificationService } from './billing-notification.service';
import { findTopup } from './plans';
import { findAddon } from './addons';

/**
 * Razorpay webhook receiver. Verifies the X-Razorpay-Signature HMAC,
 * dedupes by event id, then upserts payments / subscriptions / invoices.
 *
 * Idempotency: every event is recorded in `webhook_events`. A unique
 * (source, external_event_id) index makes replays a no-op.
 */
@Injectable()
export class RazorpayWebhookService {
  private readonly logger = new Logger(RazorpayWebhookService.name);
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoiceService,
    private readonly notifications: BillingNotificationService,
    config: ConfigService,
  ) {
    this.webhookSecret = config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!this.webhookSecret) {
      this.logger.warn(
        'RAZORPAY_WEBHOOK_SECRET not set - webhook endpoint will return 503 until configured.',
      );
    }
  }

  /**
   * Main entry. Called by the webhook controller with raw body + signature.
   * Returns { received: true } on success — Razorpay only needs a 200.
   */
  async handle(rawBody: Buffer, signature: string | undefined, eventIdHeader: string | undefined) {
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException(
        'Razorpay webhook not configured. Set RAZORPAY_WEBHOOK_SECRET.',
      );
    }
    if (!signature) {
      throw new BadRequestException('Missing X-Razorpay-Signature header');
    }

    const signatureValid = this.verifySignature(rawBody, signature, this.webhookSecret);
    if (!signatureValid) {
      // Log and record but refuse to process. Returning 400 tells Razorpay
      // to retry only if it's a transient signature issue (it won't be).
      this.logger.warn(`Webhook signature verification failed (event_id=${eventIdHeader})`);
      throw new BadRequestException('Invalid signature');
    }

    let event: RazorpayEvent;
    try {
      event = JSON.parse(rawBody.toString('utf8')) as RazorpayEvent;
    } catch {
      throw new BadRequestException('Webhook body is not valid JSON');
    }

    const externalId = eventIdHeader || event.id || `${event.event}:${event.created_at}`;

    // Dedup insert. ON CONFLICT DO NOTHING means a replay returns 0 rows.
    const inserted = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO public.webhook_events
         (source, external_event_id, event_type, payload, signature_valid)
       VALUES ('razorpay', $1, $2, $3::jsonb, true)
       ON CONFLICT (source, external_event_id) DO NOTHING
       RETURNING id`,
      externalId,
      event.event,
      JSON.stringify(event),
    );

    if (!inserted.length) {
      this.logger.log(`Replay ignored: event_id=${externalId} type=${event.event}`);
      return { received: true, deduplicated: true };
    }

    const wehId = inserted[0].id;

    try {
      await this.dispatch(event);
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.webhook_events SET processed_at = now() WHERE id = $1::uuid`,
        wehId,
      );
      return { received: true, deduplicated: false };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Webhook handler failed (${event.event}): ${msg}`);
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.webhook_events SET error = $1 WHERE id = $2::uuid`,
        msg.slice(0, 1000),
        wehId,
      );
      // Re-throw so Razorpay retries — handler is idempotent so retry is safe.
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Signature verification — HMAC-SHA256 over the raw body
  // ─────────────────────────────────────────────────────────────────
  private verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  // ─────────────────────────────────────────────────────────────────
  // Event dispatch
  // ─────────────────────────────────────────────────────────────────
  private async dispatch(event: RazorpayEvent): Promise<void> {
    switch (event.event) {
      case 'payment.captured':
      case 'payment.authorized':
      case 'payment.failed':
        await this.handlePayment(event);
        break;
      case 'subscription.activated':
      case 'subscription.charged':
      case 'subscription.completed':
      case 'subscription.updated':
      case 'subscription.pending':
      case 'subscription.halted':
      case 'subscription.cancelled':
      case 'subscription.paused':
      case 'subscription.resumed':
        await this.handleSubscription(event);
        break;
      case 'invoice.paid':
      case 'invoice.partially_paid':
      case 'invoice.expired':
        await this.handleInvoice(event);
        break;
      case 'refund.created':
      case 'refund.processed':
        await this.handleRefund(event);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.event}`);
    }
  }

  private async handlePayment(event: RazorpayEvent): Promise<void> {
    const p = event.payload.payment?.entity;
    if (!p) return;
    const workspaceId = resolveWorkspaceId(p.notes);
    if (!workspaceId) {
      this.logger.warn(`payment ${p.id} missing workspace_id in notes - skipping`);
      return;
    }
    const status = mapPaymentStatus(p.status, event.event);
    const capturedAt = status === 'captured' ? new Date(p.created_at * 1000) : null;
    const failedAt = status === 'failed' ? new Date(p.created_at * 1000) : null;

    const upserted = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `
      INSERT INTO public.payments (
        workspace_id, razorpay_payment_id, razorpay_order_id, razorpay_invoice_id,
        amount_paise, currency, status, method, description, email, contact,
        error_code, error_description, captured_at, failed_at, metadata
      ) VALUES (
        $1::uuid, $2, $3, $4,
        $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16::jsonb
      )
      ON CONFLICT (razorpay_payment_id) DO UPDATE SET
        status              = EXCLUDED.status,
        amount_paise        = EXCLUDED.amount_paise,
        method              = EXCLUDED.method,
        error_code          = EXCLUDED.error_code,
        error_description   = EXCLUDED.error_description,
        captured_at         = COALESCE(EXCLUDED.captured_at, public.payments.captured_at),
        failed_at           = COALESCE(EXCLUDED.failed_at,   public.payments.failed_at),
        metadata            = EXCLUDED.metadata
      RETURNING id
      `,
      workspaceId,
      p.id,
      p.order_id ?? null,
      p.invoice_id ?? null,
      p.amount,
      p.currency ?? 'INR',
      status,
      p.method ?? null,
      p.description ?? null,
      p.email ?? null,
      p.contact ?? null,
      p.error_code ?? null,
      p.error_description ?? null,
      capturedAt,
      failedAt,
      JSON.stringify(p),
    );

    const amountInr = Math.round((p.amount ?? 0) / 100);

    // Generate a GST invoice for captured top-up payments (subscription charges
    // are invoiced by Razorpay directly via the invoice.* events). Best-effort —
    // a failure here must not fail the webhook, since the payment is already saved.
    if (status === 'captured' && upserted[0]?.id) {
      // Deliver what the customer just bought. Until this existed, a credit-pack
      // purchase took the money and granted nothing — the quota never moved.
      await this.grantTopupCredits(workspaceId, p.id, p.notes);

      let invoiceId: string | null = null;
      try {
        invoiceId = await this.invoices.ensureInvoiceForPayment(upserted[0].id);
      } catch (err) {
        this.logger.warn(`Invoice generation skipped for payment ${p.id}: ${(err as Error).message}`);
      }
      await this.notifications.emit({
        workspaceId,
        type: 'payment_success',
        severity: 'success',
        title: `Payment received - ₹${amountInr.toLocaleString('en-IN')}`,
        body: 'Your payment was processed successfully. Thank you!',
        actionUrl: '/billing',
        dedupeKey: `payment_success:${p.id}`,
      });
      if (invoiceId) {
        await this.notifications.emit({
          workspaceId,
          type: 'invoice_ready',
          severity: 'info',
          title: 'A new invoice is available',
          body: 'Your GST invoice is ready to download from the Billing page.',
          actionUrl: '/billing',
          dedupeKey: `invoice_ready:${invoiceId}`,
          metadata: { invoice_id: invoiceId },
        });
      }
    }

    if (status === 'failed') {
      await this.notifications.emit({
        workspaceId,
        type: 'payment_failed',
        severity: 'critical',
        title: 'Payment failed',
        body: p.error_description
          ? `We couldn't process your payment: ${p.error_description}`
          : "We couldn't process your payment. Please update your card to avoid service interruption.",
        actionUrl: '/billing',
        dedupeKey: `payment_failed:${p.id}`,
      });
    }
  }

  /**
   * Credit a purchased AI top-up pack (1 credit = 1 AI call).
   *
   * Only fires for orders that carry a `topup_key` note — subscription charges
   * don't have one. The grant lifts the workspace's allowance for the cycle it
   * was bought in (LimitsService sums grants for the current month).
   *
   * Idempotent via the UNIQUE payment_id: Razorpay replays webhooks, and
   * ON CONFLICT DO NOTHING means a replay can't mint free credits.
   *
   * Best-effort by design — the payment is already recorded, so a failure here
   * must not fail the webhook (Razorpay would retry the whole event).
   */
  private async grantTopupCredits(
    workspaceId: string,
    paymentId: string,
    notes: Record<string, string | undefined> | undefined,
  ): Promise<void> {
    const topupKey = notes?.topup_key;
    if (!topupKey) return; // not a top-up (e.g. a subscription charge)

    const topup = findTopup(topupKey);
    if (!topup) {
      this.logger.warn(`payment ${paymentId}: unknown topup_key "${topupKey}" - no credits granted`);
      return;
    }
    // Client-slot packs aren't credits; only AI packs grant here.
    if (topup.unitLabel !== 'credits') return;

    try {
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO public.workspace_credit_grants (workspace_id, credits, topup_key, payment_id)
         VALUES ($1::uuid, $2, $3, $4)
         ON CONFLICT (payment_id) DO NOTHING`,
        workspaceId,
        topup.units,
        topup.key,
        paymentId,
      );
      this.logger.log(
        `Granted ${topup.units} AI credits to workspace=${workspaceId} (payment=${paymentId}, pack=${topup.key})`,
      );
    } catch (err) {
      // Most likely the migration hasn't run. Loud, because the customer PAID.
      this.logger.error(
        `PAID BUT NOT GRANTED - ${topup.units} credits for workspace=${workspaceId} ` +
          `(payment=${paymentId}). Run the workspace_credit_grants migration and grant manually. ` +
          `${(err as Error).message}`,
      );
    }
  }

  /**
   * Upsert the workspace_addons row behind an add-on subscription.
   *
   * This is what actually delivers a recurring add-on: LimitsService reads
   * workspace_addons to lift quotas, so without this row the customer pays and
   * gets nothing. Written ONLY from the webhook — never at checkout — so an
   * abandoned payment can't grant free quota.
   *
   * ON CONFLICT (workspace_id, addon_key): re-subscribing or changing quantity
   * updates the same row rather than stacking duplicates.
   */
  private async handleAddonSubscription(
    workspaceId: string,
    s: { id: string; status?: string; quantity?: number; current_end?: number; notes?: Record<string, string | undefined> },
  ): Promise<void> {
    const addonKey = s.notes?.addon_key;
    const addon = addonKey ? findAddon(addonKey) : undefined;
    if (!addon) {
      this.logger.warn(`addon subscription ${s.id}: unknown addon_key "${addonKey}" - nothing granted`);
      return;
    }
    const status = s.status ?? 'created';
    // Only these mean "they're paying and should have it". halted/cancelled/
    // paused stop granting (activeAddons filters on status + period end).
    const granting = status === 'active' || status === 'authenticated';
    const quantity = Number(s.quantity ?? s.notes?.quantity ?? 1) || 1;
    const periodEnd = s.current_end ? new Date(s.current_end * 1000) : null;

    try {
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO public.workspace_addons (
           workspace_id, addon_key, quantity, status, razorpay_subscription_id, current_period_end, updated_at
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, now())
         ON CONFLICT (workspace_id, addon_key) DO UPDATE SET
           quantity                 = EXCLUDED.quantity,
           status                   = EXCLUDED.status,
           razorpay_subscription_id = EXCLUDED.razorpay_subscription_id,
           current_period_end       = EXCLUDED.current_period_end,
           updated_at               = now()`,
        workspaceId,
        addon.key,
        quantity,
        granting ? 'active' : status,
        s.id,
        periodEnd,
      );
      this.logger.log(
        `Add-on ${addon.key} x${quantity} → ${granting ? 'active' : status} (workspace=${workspaceId}, sub=${s.id})`,
      );
    } catch (err) {
      this.logger.error(
        `PAID BUT NOT GRANTED - add-on ${addon.key} for workspace=${workspaceId} (sub=${s.id}). ` +
          `Run the workspace_addons migration. ${(err as Error).message}`,
      );
    }
  }

  private async handleSubscription(event: RazorpayEvent): Promise<void> {
    const s = event.payload.subscription?.entity;
    if (!s) return;
    const workspaceId = resolveWorkspaceId(s.notes);
    if (!workspaceId) {
      this.logger.warn(`subscription ${s.id} missing workspace_id in notes - skipping`);
      return;
    }

    // Add-ons are separate subscriptions and belong in workspace_addons. Letting
    // them fall through would write an add-on key into public.subscriptions and
    // clobber the workspace's actual plan.
    if (s.notes?.kind === 'addon') {
      await this.handleAddonSubscription(workspaceId, s);
      return;
    }

    const planKey = s.notes?.plan_key ?? 'unknown';
    const status = (s.status ?? 'created') as string;
    const cancelledAt = status === 'cancelled' && s.ended_at
      ? new Date(s.ended_at * 1000)
      : null;

    await this.prisma.$queryRawUnsafe(
      `
      INSERT INTO public.subscriptions (
        workspace_id, razorpay_subscription_id, razorpay_plan_id, razorpay_customer_id,
        plan_key, status,
        current_period_start, current_period_end, trial_ends_at,
        amount_paise, currency,
        started_at, cancelled_at, ended_at, metadata
      ) VALUES (
        $1::uuid, $2, $3, $4,
        $5, $6,
        $7, $8, $9,
        $10, $11,
        $12, $13, $14, $15::jsonb
      )
      ON CONFLICT (razorpay_subscription_id) DO UPDATE SET
        status                = EXCLUDED.status,
        current_period_start  = EXCLUDED.current_period_start,
        current_period_end    = EXCLUDED.current_period_end,
        amount_paise          = EXCLUDED.amount_paise,
        cancelled_at          = COALESCE(EXCLUDED.cancelled_at, public.subscriptions.cancelled_at),
        ended_at              = COALESCE(EXCLUDED.ended_at,     public.subscriptions.ended_at),
        metadata              = EXCLUDED.metadata
      `,
      workspaceId,
      s.id,
      s.plan_id ?? null,
      s.customer_id ?? null,
      planKey,
      status,
      s.current_start ? new Date(s.current_start * 1000) : null,
      s.current_end ? new Date(s.current_end * 1000) : null,
      s.expire_by ? new Date(s.expire_by * 1000) : null,
      // Razorpay subscriptions do not include amount on the subscription
      // entity directly — it lives on the plan. We accept the value if the
      // workspace embedded it in notes.amount_paise, else null.
      s.notes?.amount_paise ? Number(s.notes.amount_paise) : null,
      'INR',
      s.start_at ? new Date(s.start_at * 1000) : null,
      cancelledAt,
      s.ended_at ? new Date(s.ended_at * 1000) : null,
      JSON.stringify(s),
    );

    if (event.event === 'subscription.activated') {
      await this.notifications.emit({
        workspaceId,
        type: 'subscription_activated',
        severity: 'success',
        title: `Your ${planKey} subscription is active`,
        body: 'Welcome aboard! Your plan limits are now applied to this workspace.',
        actionUrl: '/subscription',
        dedupeKey: `subscription_activated:${s.id}`,
      });
    } else if (event.event === 'subscription.cancelled') {
      await this.notifications.emit({
        workspaceId,
        type: 'subscription_cancelled',
        severity: 'warning',
        title: 'Your subscription was cancelled',
        body: 'You can re-subscribe any time from the Subscription page.',
        actionUrl: '/subscription',
        dedupeKey: `subscription_cancelled:${s.id}`,
      });
    } else if (event.event === 'subscription.halted' || event.event === 'subscription.pending') {
      await this.notifications.emit({
        workspaceId,
        type: 'payment_failed',
        severity: 'critical',
        title: 'Subscription payment issue',
        body: 'Your latest renewal could not be charged. Update your payment method to keep your plan active.',
        actionUrl: '/billing',
        dedupeKey: `subscription_halted:${s.id}:${s.current_end ?? 0}`,
      });
    }
  }

  private async handleInvoice(event: RazorpayEvent): Promise<void> {
    const inv = event.payload.invoice?.entity;
    if (!inv) return;
    const workspaceId = resolveWorkspaceId(inv.notes);
    if (!workspaceId) {
      this.logger.warn(`invoice ${inv.id} missing workspace_id in notes - skipping`);
      return;
    }
    const status = (inv.status ?? 'issued') as string;
    const paidAt = status === 'paid' && inv.paid_at
      ? new Date(inv.paid_at * 1000)
      : null;

    await this.prisma.$queryRawUnsafe(
      `
      INSERT INTO public.invoices (
        workspace_id, razorpay_invoice_id, invoice_number,
        amount_paise, gst_amount_paise, status, currency,
        period_start, period_end, due_at, issued_at, paid_at,
        customer_name, customer_email, customer_gstin, pdf_url, metadata
      ) VALUES (
        $1::uuid, $2, $3,
        $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17::jsonb
      )
      ON CONFLICT (razorpay_invoice_id) DO UPDATE SET
        status            = EXCLUDED.status,
        amount_paise      = EXCLUDED.amount_paise,
        paid_at           = COALESCE(EXCLUDED.paid_at, public.invoices.paid_at),
        pdf_url           = COALESCE(EXCLUDED.pdf_url, public.invoices.pdf_url),
        metadata          = EXCLUDED.metadata
      `,
      workspaceId,
      inv.id,
      inv.invoice_number ?? null,
      inv.amount ?? 0,
      inv.tax_amount ?? 0,
      status,
      inv.currency ?? 'INR',
      inv.billing_start ? new Date(inv.billing_start * 1000) : null,
      inv.billing_end ? new Date(inv.billing_end * 1000) : null,
      inv.expire_by ? new Date(inv.expire_by * 1000) : null,
      inv.issued_at ? new Date(inv.issued_at * 1000) : null,
      paidAt,
      inv.customer_details?.name ?? null,
      inv.customer_details?.email ?? null,
      inv.customer_details?.gstin ?? null,
      inv.short_url ?? null,
      JSON.stringify(inv),
    );
  }

  private async handleRefund(event: RazorpayEvent): Promise<void> {
    const r = event.payload.refund?.entity;
    if (!r?.payment_id) return;
    await this.prisma.$queryRawUnsafe(
      `
      UPDATE public.payments
         SET amount_refunded_paise = COALESCE(amount_refunded_paise, 0) + $1,
             status                = CASE
                                       WHEN COALESCE(amount_refunded_paise, 0) + $1 >= amount_paise
                                         THEN 'refunded'
                                       ELSE status
                                     END
       WHERE razorpay_payment_id = $2
      `,
      r.amount ?? 0,
      r.payment_id,
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// Razorpay event shape (the bits we actually read)
// ─────────────────────────────────────────────────────────────────
interface RazorpayEvent {
  id?: string;
  event: string;
  created_at: number;
  payload: {
    payment?: { entity: RazorpayPaymentEntity };
    subscription?: { entity: RazorpaySubscriptionEntity };
    invoice?: { entity: RazorpayInvoiceEntity };
    refund?: { entity: RazorpayRefundEntity };
  };
}

interface RazorpayPaymentEntity {
  id: string;
  amount: number;
  currency?: string;
  status: string;
  order_id?: string | null;
  invoice_id?: string | null;
  method?: string;
  description?: string;
  email?: string;
  contact?: string;
  error_code?: string;
  error_description?: string;
  created_at: number;
  notes?: Record<string, string | undefined>;
}

interface RazorpaySubscriptionEntity {
  id: string;
  plan_id?: string;
  customer_id?: string;
  status?: string;
  current_start?: number;
  current_end?: number;
  start_at?: number;
  ended_at?: number;
  expire_by?: number;
  notes?: Record<string, string | undefined>;
}

interface RazorpayInvoiceEntity {
  id: string;
  invoice_number?: string;
  amount?: number;
  tax_amount?: number;
  status?: string;
  currency?: string;
  billing_start?: number;
  billing_end?: number;
  expire_by?: number;
  issued_at?: number;
  paid_at?: number;
  short_url?: string;
  customer_details?: { name?: string; email?: string; gstin?: string };
  notes?: Record<string, string | undefined>;
}

interface RazorpayRefundEntity {
  id: string;
  payment_id?: string;
  amount?: number;
}

function resolveWorkspaceId(
  notes: Record<string, string | undefined> | undefined,
): string | null {
  const id = notes?.workspace_id;
  if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) return id;
  return null;
}

function mapPaymentStatus(
  raw: string | undefined,
  eventType: string,
): 'created' | 'authorized' | 'captured' | 'refunded' | 'failed' {
  if (eventType === 'payment.failed') return 'failed';
  if (eventType === 'payment.captured') return 'captured';
  if (eventType === 'payment.authorized') return 'authorized';
  const v = (raw ?? '').toLowerCase();
  if (v === 'captured' || v === 'authorized' || v === 'refunded' || v === 'failed' || v === 'created') {
    return v;
  }
  return 'created';
}