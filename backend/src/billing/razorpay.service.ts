import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';

/**
 * Thin wrapper around the official Razorpay Node SDK.
 *
 * Lives between our controllers and Razorpay's API surface. The SDK
 * call shapes change across major versions; isolating them here means
 * everything else in the codebase calls *our* method names, and version
 * bumps stop on this file.
 *
 * When RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET aren't set, every method
 * throws 503 — same posture as the webhook service. Lets the platform
 * boot in environments without billing configured.
 */
@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private readonly client: Razorpay | null;
  readonly keyId: string | undefined;

  constructor(config: ConfigService) {
    this.keyId = config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = config.get<string>('RAZORPAY_KEY_SECRET');

    if (!this.keyId || !keySecret) {
      this.logger.warn(
        'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set - checkout endpoints will return 503 until configured.',
      );
      this.client = null;
    } else {
      this.client = new Razorpay({ key_id: this.keyId, key_secret: keySecret });
      this.logger.log(`Razorpay client ready (key=${this.keyId.slice(0, 12)}...).`);
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Create a one-time order. Used for top-ups, ad-hoc charges, anything
   * the user explicitly pays once. `notes` get echoed back on the webhook
   * and on the payment object — we use them to attribute the payment to
   * the right workspace and bucket without an extra DB round-trip.
   */
  async createOrder(params: {
    amountPaise: number;
    receipt?: string;
    notes: Record<string, string>;
  }) {
    const client = this.requireClient();
    return client.orders.create({
      amount: params.amountPaise,
      currency: 'INR',
      receipt: params.receipt,
      notes: params.notes,
      // `payment_capture: 1` (the SDK default) means Razorpay captures
      // the payment automatically the moment the customer authorizes,
      // so we don't have to make a separate capture call.
    });
  }

  /**
   * Create a recurring subscription on Razorpay's books. Caller must have
   * already created the *plan* in Razorpay's Dashboard (or via API) and
   * be passing the resulting `plan_<id>`. We don't auto-create plans
   * here because their pricing/period config has long-term tax + accounting
   * consequences — explicit is better.
   */
  async createSubscription(params: {
    razorpayPlanId: string;
    /**
     * Number of billing cycles. For monthly plans, 12 = one year of
     * billing; the customer can cancel any time before then.
     * Razorpay requires this field; we send a high number for "forever".
     */
    totalCount?: number;
    /** Razorpay will issue invoices for every billing cycle. */
    customerNotify?: 0 | 1;
    /**
     * One-time charges billed with the subscription's FIRST invoice — used for
     * the onboarding setup fee, so the buyer pays plan + setup in one checkout
     * and it never recurs. Callers MUST guarantee idempotency (see
     * workspaces.setup_fee_paid_at) — Razorpay will happily charge an add-on
     * every time a subscription is created.
     */
    addons?: Array<{ name: string; amountPaise: number }>;
    /**
     * Units of the plan billed each cycle — used by quantifiable add-ons (3 extra
     * seats = one subscription with quantity 3, billed 3x the unit price).
     */
    quantity?: number;
    notes: Record<string, string>;
  }) {
    const client = this.requireClient();
    return client.subscriptions.create({
      plan_id: params.razorpayPlanId,
      total_count: params.totalCount ?? 120, // ~10 years of monthly billing
      customer_notify: params.customerNotify ?? 1,
      ...(params.quantity && params.quantity > 1 ? { quantity: params.quantity } : {}),
      ...(params.addons?.length
        ? {
            addons: params.addons.map((a) => ({
              item: { name: a.name, amount: a.amountPaise, currency: 'INR' },
            })),
          }
        : {}),
      notes: params.notes,
    });
  }

  /**
   * Cancel a Razorpay subscription. `cancelAtCycleEnd: true` lets the
   * user keep using the plan until their paid period ends; false cuts
   * them off immediately.
   */
  async cancelSubscription(razorpaySubscriptionId: string, cancelAtCycleEnd = true) {
    const client = this.requireClient();
    return client.subscriptions.cancel(razorpaySubscriptionId, cancelAtCycleEnd);
  }

  /**
   * Change the plan on an existing subscription (upgrade/downgrade). Razorpay
   * applies it either immediately (prorating the current cycle) or at the next
   * cycle boundary, per `scheduleChangeAt`. The subscription.updated webhook
   * reconciles the new plan + amount back into our row.
   */
  async updateSubscription(
    razorpaySubscriptionId: string,
    params: { razorpayPlanId: string; scheduleChangeAt: 'now' | 'cycle_end' },
  ) {
    const client = this.requireClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (client.subscriptions as any).update(razorpaySubscriptionId, {
      plan_id: params.razorpayPlanId,
      schedule_change_at: params.scheduleChangeAt,
      // Prorate the current cycle when the change applies immediately.
      remaining_count: undefined,
    });
  }

  /**
   * Refund a captured payment — full when `amountPaise` is omitted, otherwise a
   * partial refund of that many paise. Razorpay fires refund.created /
   * refund.processed webhooks afterwards, which our webhook handler uses to
   * reconcile the payment row's refunded amount + status.
   */
  async refundPayment(razorpayPaymentId: string, amountPaise?: number) {
    const client = this.requireClient();
    const opts = amountPaise && amountPaise > 0 ? { amount: amountPaise } : {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (client.payments as any).refund(razorpayPaymentId, opts);
  }

  /**
   * Verify the payment signature returned by Razorpay Checkout after a
   * successful payment. Razorpay computes HMAC-SHA256(order_id|payment_id, key_secret)
   * and sends it back as razorpay_signature. We reproduce it server-side
   * — if they match, the payment is authentic.
   *
   * Throws 401 on mismatch. Caller can rely on a successful return =
   * cryptographic proof the user paid.
   */
  verifyPaymentSignature(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): void {
    const config = this.requireSecret();
    const body = `${params.razorpayOrderId}|${params.razorpayPaymentId}`;
    const expected = createHmac('sha256', config.keySecret).update(body).digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(params.razorpaySignature, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn(
        `Payment signature mismatch - order=${params.razorpayOrderId} payment=${params.razorpayPaymentId}`,
      );
      throw new UnauthorizedException('Invalid payment signature');
    }
  }

  /**
   * Verify the signature returned by Razorpay Checkout on a *subscription*
   * payment. Different signature scheme — HMAC of payment_id|subscription_id,
   * not order_id|payment_id.
   */
  verifySubscriptionSignature(params: {
    razorpayPaymentId: string;
    razorpaySubscriptionId: string;
    razorpaySignature: string;
  }): void {
    const config = this.requireSecret();
    const body = `${params.razorpayPaymentId}|${params.razorpaySubscriptionId}`;
    const expected = createHmac('sha256', config.keySecret).update(body).digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(params.razorpaySignature, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn(
        `Subscription signature mismatch - payment=${params.razorpayPaymentId} subscription=${params.razorpaySubscriptionId}`,
      );
      throw new UnauthorizedException('Invalid subscription signature');
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // internals
  // ────────────────────────────────────────────────────────────────────
  private requireClient(): Razorpay {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Razorpay not configured. Set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET.',
      );
    }
    return this.client;
  }

  private requireSecret(): { keySecret: string } {
    // ConfigService doesn't expose private state once read; cache via
    // closure. Lazy so cold-boot doesn't read env before the client check.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secret = (this.client as any)?.api?.options?.key_secret as string | undefined;
    if (!this.client || !secret) {
      throw new ServiceUnavailableException(
        'Razorpay not configured. Set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET.',
      );
    }
    return { keySecret: secret };
  }
}