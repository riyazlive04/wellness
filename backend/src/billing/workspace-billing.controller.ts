import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { findPlan, findTopup, PLANS, TOPUPS, type PlanKey, type TopupKey } from './plans';
import { ADDONS, addonsForPlan, findAddon, type AddonKey } from './addons';
import { activeAddons } from './workspace-addons';
import { resolveWorkspacePlan } from './resolve-plan';
import { RazorpayService } from './razorpay.service';
import { InvoiceService } from './invoice.service';
import { BillingNotificationService } from './billing-notification.service';
import { computeProration } from './billing-proration';
import type { SubscriptionRow } from './billing.types';

class CreateOrderDto {
  @IsString() @IsNotEmpty()
  @IsIn(TOPUPS.map((t) => t.key))
  topupKey!: TopupKey;
}

class CreateSubscriptionDto {
  @IsString() @IsNotEmpty()
  @IsIn(PLANS.map((p) => p.key))
  planKey!: PlanKey;

  /** Billing cycle. Omitted = monthly, so existing callers keep working. */
  @IsOptional() @IsString() @IsIn(['monthly', 'annual'])
  cycle?: 'monthly' | 'annual';
}

class ChangePlanDto {
  @IsString() @IsNotEmpty()
  @IsIn(PLANS.map((p) => p.key))
  planKey!: PlanKey;
}

class DevActivateDto {
  @IsString() @IsNotEmpty()
  @IsIn([...PLANS.map((p) => p.key), 'trial'])
  planKey!: string;
}

class VerifyPaymentDto {
  @IsString() @IsNotEmpty() razorpayOrderId!: string;
  @IsString() @IsNotEmpty() razorpayPaymentId!: string;
  @IsString() @IsNotEmpty() razorpaySignature!: string;
  @IsString() @IsNotEmpty() topupKey!: string;
}

class VerifySubscriptionDto {
  @IsString() @IsNotEmpty() razorpayPaymentId!: string;
  @IsString() @IsNotEmpty() razorpaySubscriptionId!: string;
  @IsString() @IsNotEmpty() razorpaySignature!: string;
}

class AddonSubscribeDto {
  @IsString() @IsNotEmpty()
  @IsIn(ADDONS.map((a) => a.key))
  addonKey!: AddonKey;

  /**
   * Units to buy (quantifiable add-ons only). Capped so a typo can't turn into
   * a 500-seat recurring charge.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  quantity?: number;
}

class AddonCancelDto {
  @IsString() @IsNotEmpty()
  @IsIn(ADDONS.map((a) => a.key))
  addonKey!: AddonKey;
}

/**
 * Workspace-side billing endpoints — what a workspace owner calls when
 * they're upgrading their plan or topping up.
 *
 * All endpoints are JWT-guarded; we resolve the workspace from the user's
 * scope and attach `workspace_id` to Razorpay `notes` so the webhook can
 * route updates back to the right tenant.
 */
@UseGuards(JwtAuthGuard)
@RequirePermission('billing.manage') // owner (holds all permissions) or a manager the owner granted billing access
@Controller('billing/me')
export class WorkspaceBillingController {
  private readonly logger = new Logger(WorkspaceBillingController.name);

  constructor(
    private readonly razorpay: RazorpayService,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly config: ConfigService,
    private readonly invoices: InvoiceService,
    private readonly notifications: BillingNotificationService,
  ) {}

  // ────────────────────────────────────────────────────────────────────
  // Read endpoints
  // ────────────────────────────────────────────────────────────────────

  /**
   * Plan catalog. Public-ish (any signed-in user) — fine because everything
   * here is also baked into the marketing copy on the landing page.
   *
   * The `razorpayKeyId` field is the public test/live key the frontend's
   * Razorpay Checkout SDK needs to render. It is NOT a secret.
   */
  /**
   * The setup fee to charge on THIS subscription, in paise — or null if none.
   *
   * Returns null when: the plan has no fee, the workspace already paid it, or
   * we can't read the marker (e.g. the migration hasn't run). Failing to NULL is
   * deliberate: not charging a fee is recoverable, wrongly charging money is not.
   */
  private async pendingSetupFeePaise(
    workspaceId: string,
    plan: { key: string; name: string; setupFeeInr?: number },
  ): Promise<number | null> {
    if (!plan.setupFeeInr) return null;
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ paid_at: Date | null }>>(
        `SELECT setup_fee_paid_at AS paid_at FROM public.workspaces WHERE id = $1::uuid LIMIT 1`,
        workspaceId,
      );
      if (!rows.length) return null;
      if (rows[0].paid_at) return null; // already paid - never charge twice
      return plan.setupFeeInr * 100;
    } catch (err) {
      this.logger.warn(
        `Skipping setup fee for workspace=${workspaceId}: cannot read workspaces.setup_fee_paid_at ` +
          `(run the 20260714120000_workspace_setup_fee migration). ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** Stamp the setup fee as paid. Best-effort: never fail the payment flow. */
  private async markSetupFeePaid(workspaceId: string): Promise<void> {
    try {
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.workspaces
            SET setup_fee_paid_at = now()
          WHERE id = $1::uuid AND setup_fee_paid_at IS NULL`,
        workspaceId,
      );
    } catch (err) {
      this.logger.warn(`Could not stamp setup_fee_paid_at (workspace=${workspaceId}): ${(err as Error).message}`);
    }
  }

  // ── Recurring add-ons ───────────────────────────────────────────────

  /** Add-on catalog for this workspace's plan + what it already has active. */
  @Get('addons')
  async listAddons() {
    const workspaceId = this.tenant.requireWorkspaceId();
    const plan = await resolveWorkspacePlan(this.prisma, workspaceId);
    return {
      data: {
        // Hides add-ons the plan already includes (don't sell Scale Pro white-label).
        catalog: addonsForPlan(plan),
        active: await activeAddons(this.prisma, workspaceId),
      },
    };
  }

  /**
   * Start a recurring add-on. Each add-on is its OWN Razorpay subscription so it
   * can be cancelled without touching the base plan. The workspace_addons row is
   * written by the webhook once Razorpay confirms — never here, or an abandoned
   * checkout would grant free quota.
   */
  @Post('addons/subscribe')
  async subscribeAddon(@Body() dto: AddonSubscribeDto, @CurrentUser() user: AuthUser) {
    const workspaceId = this.tenant.requireWorkspaceId();
    const addon = findAddon(dto.addonKey);
    if (!addon) throw new NotFoundException(`Unknown add-on: ${dto.addonKey}`);

    const plan = await resolveWorkspacePlan(this.prisma, workspaceId);
    if (addon.includedInPlans?.includes(plan)) {
      throw new BadRequestException(`Your ${plan} plan already includes ${addon.name}.`);
    }

    const quantity = addon.quantifiable ? (dto.quantity ?? 1) : 1;
    const razorpayPlanId = this.config.get<string>(addon.razorpayPlanIdEnv);
    if (!razorpayPlanId) {
      throw new BadRequestException(
        `Add-on "${addon.key}" is not provisioned in Razorpay. Create a ₹${addon.priceInr}/month plan, then set ${addon.razorpayPlanIdEnv} in env.`,
      );
    }

    const subscription = await this.razorpay.createSubscription({
      razorpayPlanId,
      quantity,
      notes: {
        workspace_id: workspaceId,
        kind: 'addon', // routes the webhook to workspace_addons, not subscriptions
        addon_key: addon.key,
        quantity: String(quantity),
        amount_paise: String(addon.priceInr * quantity * 100),
        user_email: user.email ?? '',
      },
    });

    this.logger.log(
      `Created add-on subscription ${subscription.id} (workspace=${workspaceId}, addon=${addon.key} x${quantity})`,
    );
    return {
      subscriptionId: subscription.id,
      addonKey: addon.key,
      quantity,
      amountPaise: addon.priceInr * quantity * 100,
      razorpayKeyId: this.razorpay.keyId,
    };
  }

  /** Cancel an add-on at cycle end — they keep the quota they paid for. */
  @Post('addons/cancel')
  @HttpCode(200)
  async cancelAddon(@Body() dto: AddonCancelDto) {
    const workspaceId = this.tenant.requireWorkspaceId();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ razorpay_subscription_id: string | null }>>(
      `SELECT razorpay_subscription_id FROM public.workspace_addons
        WHERE workspace_id = $1::uuid AND addon_key = $2 AND status = 'active' LIMIT 1`,
      workspaceId,
      dto.addonKey,
    );
    if (!rows.length) throw new NotFoundException(`No active "${dto.addonKey}" add-on to cancel.`);

    if (rows[0].razorpay_subscription_id) {
      await this.razorpay.cancelSubscription(rows[0].razorpay_subscription_id, true);
    }
    // Mark pending-cancel locally; the webhook flips it to cancelled at period
    // end. Keep status 'active' so the quota they've paid for isn't yanked mid-cycle.
    this.logger.log(`Add-on ${dto.addonKey} cancel requested (workspace=${workspaceId})`);
    return { data: { addonKey: dto.addonKey, cancelAtCycleEnd: true } };
  }

  @Get('plans')
  listPlans() {
    return {
      // Sellable tiers only — retired plans stay resolvable by findPlan() (so
      // grandfathered subscribers keep their quotas) but are never offered.
      // aiCreditsPerMonth is surfaced from limits so the pricing cards can show
      // the credit allowance without shipping the whole limits object.
      plans: PLANS.map((p) => ({ ...p, aiCreditsPerMonth: p.limits.aiCallsPerMonth })),
      topups: TOPUPS,
      razorpayKeyId: this.razorpay.keyId ?? null,
      razorpayConfigured: this.razorpay.isConfigured(),
    };
  }

  /**
   * Current subscription for the calling user's workspace. Returns null
   * if they're on the implicit free/trial tier.
   */
  @Get('subscription')
  async currentSubscription() {
    const workspaceId = this.tenant.requireWorkspaceId();
    const rows = await this.prisma.$queryRawUnsafe<SubscriptionRow[]>(
      `
      SELECT *
        FROM public.subscriptions
       WHERE workspace_id = $1::uuid
         AND status NOT IN ('cancelled', 'expired', 'completed')
       ORDER BY created_at DESC
       LIMIT 1
      `,
      workspaceId,
    );
    return { subscription: rows[0] ?? null };
  }

  /**
   * Invoice history for the caller's workspace. Drives the Billing page table
   * and the per-invoice PDF (rendered client-side from the detail payload).
   */
  @Get('invoices')
  async listInvoices() {
    const workspaceId = this.tenant.requireWorkspaceId();
    return { invoices: await this.invoices.listForWorkspace(workspaceId) };
  }

  /**
   * Single invoice + a derived GST breakdown + supplier details. The frontend
   * uses this to render and download a GST-compliant PDF.
   */
  @Get('invoices/:id')
  async getInvoice(@Param('id') id: string) {
    const workspaceId = this.tenant.requireWorkspaceId();
    return { invoice: await this.invoices.getForWorkspace(workspaceId, id) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Billing notifications (in-app billing event feed)
  // ────────────────────────────────────────────────────────────────────

  @Get('notifications')
  async listNotifications() {
    const workspaceId = this.tenant.requireWorkspaceId();
    const [notifications, unread] = await Promise.all([
      this.notifications.listForWorkspace(workspaceId),
      this.notifications.unreadCount(workspaceId),
    ]);
    return { notifications, unread };
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  async markAllNotificationsRead() {
    const workspaceId = this.tenant.requireWorkspaceId();
    await this.notifications.markAllRead(workspaceId);
    return { ok: true };
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  async markNotificationRead(@Param('id') id: string) {
    const workspaceId = this.tenant.requireWorkspaceId();
    await this.notifications.markRead(workspaceId, id);
    return { ok: true };
  }

  // ────────────────────────────────────────────────────────────────────
  // Mutations — orders + subscriptions
  // ────────────────────────────────────────────────────────────────────

  /**
   * One-time order for a top-up (extra AI calls, extra clients). Returns the
   * Razorpay order_id + the amount so the frontend's Checkout modal can open.
   */
  @Post('orders')
  async createOrder(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    const workspaceId = this.tenant.requireWorkspaceId();
    const topup = findTopup(dto.topupKey);
    if (!topup) throw new NotFoundException(`Unknown topup: ${dto.topupKey}`);

    const amountPaise = topup.priceInr * 100;
    const order = await this.razorpay.createOrder({
      amountPaise,
      receipt: `topup-${workspaceId.slice(0, 8)}-${Date.now()}`,
      notes: {
        workspace_id: workspaceId,
        topup_key: topup.key,
        kind: 'topup',
        user_email: user.email ?? '',
      },
    });

    this.logger.log(
      `Created topup order ${order.id} (workspace=${workspaceId}, topup=${topup.key}, amount=₹${topup.priceInr})`,
    );

    return {
      orderId: order.id,
      amountPaise,
      currency: 'INR',
      topup: { key: topup.key, name: topup.name, priceInr: topup.priceInr },
      razorpayKeyId: this.razorpay.keyId,
    };
  }

  /**
   * Create a recurring subscription. The Razorpay `plan_id` must be
   * pre-configured (Razorpay Dashboard → Subscriptions → Plans) and the
   * resulting id stashed in env (e.g. RAZORPAY_PLAN_ID_PRO=plan_XYZ).
   */
  @Post('subscribe')
  async createSubscription(
    @Body() dto: CreateSubscriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const workspaceId = this.tenant.requireWorkspaceId();
    const plan = findPlan(dto.planKey);
    if (!plan) throw new NotFoundException(`Unknown plan: ${dto.planKey}`);

    // Monthly vs annual are SEPARATE Razorpay plans — pick the right id + price.
    const cycle = dto.cycle ?? 'monthly';
    const isAnnual = cycle === 'annual';
    if (isAnnual && (plan.priceInrAnnual == null || !plan.razorpayPlanIdEnvAnnual)) {
      throw new BadRequestException(`Plan "${plan.key}" is not sold annually.`);
    }
    const planIdEnv = isAnnual ? plan.razorpayPlanIdEnvAnnual! : plan.razorpayPlanIdEnv;
    const priceInr = isAnnual ? plan.priceInrAnnual! : plan.priceInr;

    const razorpayPlanId = this.config.get<string>(planIdEnv);
    if (!razorpayPlanId) {
      throw new BadRequestException(
        `Plan "${plan.key}" (${cycle}) is not provisioned in Razorpay. Create the plan in Razorpay Dashboard, then set ${planIdEnv} in env.`,
      );
    }

    // One-time onboarding fee, billed with the FIRST invoice via a Razorpay
    // add-on. Only attached when this workspace has never paid it, so
    // cancel → re-subscribe can't double-charge.
    const setupFee = await this.pendingSetupFeePaise(workspaceId, plan);

    const subscription = await this.razorpay.createSubscription({
      razorpayPlanId,
      addons: setupFee ? [{ name: `${plan.name} setup fee`, amountPaise: setupFee }] : undefined,
      notes: {
        workspace_id: workspaceId,
        plan_key: plan.key,
        kind: 'subscription',
        billing_cycle: cycle,
        amount_paise: String(priceInr * 100),
        setup_fee_paise: String(setupFee ?? 0),
        user_email: user.email ?? '',
      },
    });

    // Pre-seed our own subscriptions row in 'created' state. The webhook
    // will flip it to 'active' once Razorpay confirms the first charge.
    await this.prisma.$queryRawUnsafe(
      `
      INSERT INTO public.subscriptions (
        workspace_id, razorpay_subscription_id, razorpay_plan_id,
        plan_key, status, amount_paise, currency
      ) VALUES ($1::uuid, $2, $3, $4, 'created', $5, 'INR')
      ON CONFLICT (razorpay_subscription_id) DO NOTHING
      `,
      workspaceId,
      subscription.id,
      razorpayPlanId,
      plan.key,
      priceInr * 100,
    );

    this.logger.log(
      `Created subscription ${subscription.id} (workspace=${workspaceId}, plan=${plan.key}, cycle=${cycle})`,
    );

    return {
      subscriptionId: subscription.id,
      planKey: plan.key,
      amountPaise: priceInr * 100,
      razorpayKeyId: this.razorpay.keyId,
    };
  }

  /**
   * DEV / LOCAL ONLY — switch the workspace's plan WITHOUT payment.
   *
   * Hard-guarded: returns 403 the moment Razorpay is configured, so it can
   * NEVER bypass a real checkout in staging/production — it only exists to let
   * you exercise plan-based feature gating (nav hide, 402 feature_locked)
   * locally before payments are wired. Writes workspaces.plan directly;
   * resolvePlan picks it up since there's no active subscription to override.
   * Accepts the three plans plus 'trial' (to reset).
   */
  @Post('dev-activate-plan')
  @HttpCode(200)
  async devActivatePlan(@Body() dto: DevActivateDto) {
    if (this.razorpay.isConfigured()) {
      throw new ForbiddenException(
        'Payments are configured - plans can only be changed through checkout.',
      );
    }
    if (dto.planKey !== 'trial' && !findPlan(dto.planKey)) {
      throw new NotFoundException(`Unknown plan: ${dto.planKey}`);
    }
    const workspaceId = this.tenant.requireWorkspaceId();
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.workspaces SET plan = $2, updated_at = now() WHERE id = $1::uuid`,
      workspaceId,
      dto.planKey,
    );
    this.logger.warn(
      `[dev] Workspace ${workspaceId.slice(0, 8)} plan set to "${dto.planKey}" without payment (Razorpay unconfigured).`,
    );
    return { ok: true, plan: dto.planKey };
  }

  /**
   * Verify a one-time order payment. Frontend calls this from the Razorpay
   * Checkout success handler. We re-compute the HMAC server-side and only
   * record the payment if it matches.
   */
  @Post('verify')
  @HttpCode(200)
  async verifyPayment(@Body() dto: VerifyPaymentDto) {
    const workspaceId = this.tenant.requireWorkspaceId();

    this.razorpay.verifyPaymentSignature({
      razorpayOrderId: dto.razorpayOrderId,
      razorpayPaymentId: dto.razorpayPaymentId,
      razorpaySignature: dto.razorpaySignature,
    });

    // Don't write the payment row here — the webhook will do that with
    // the full payment entity. We just confirm to the frontend that the
    // signature is valid so it can show a success screen immediately
    // instead of waiting for the webhook to arrive.
    this.logger.log(
      `Verified topup payment (workspace=${workspaceId}, payment=${dto.razorpayPaymentId})`,
    );

    return { verified: true, workspaceId };
  }

  /**
   * Verify a subscription's first payment. Same idea as `/verify` but with
   * the subscription signature scheme (payment_id|subscription_id).
   */
  @Post('verify-subscription')
  @HttpCode(200)
  async verifySubscription(@Body() dto: VerifySubscriptionDto) {
    const workspaceId = this.tenant.requireWorkspaceId();

    this.razorpay.verifySubscriptionSignature({
      razorpayPaymentId: dto.razorpayPaymentId,
      razorpaySubscriptionId: dto.razorpaySubscriptionId,
      razorpaySignature: dto.razorpaySignature,
    });

    // The signature proved the first charge went through — that charge included
    // the setup-fee add-on if one was attached, so stamp it paid. Idempotent
    // (only updates when NULL), so re-verification can't reopen the fee.
    await this.markSetupFeePaid(workspaceId);

    this.logger.log(
      `Verified subscription payment (workspace=${workspaceId}, sub=${dto.razorpaySubscriptionId})`,
    );

    return { verified: true, workspaceId };
  }

  /**
   * Cancel the active subscription at the end of the current billing
   * cycle (so the user keeps using the plan until their paid period
   * ends — no goodwill loss). The webhook then flips status to 'cancelled'.
   */
  @Post('cancel')
  @HttpCode(200)
  async cancel() {
    const workspaceId = this.tenant.requireWorkspaceId();
    const rows = await this.prisma.$queryRawUnsafe<{ razorpay_subscription_id: string | null }[]>(
      `SELECT razorpay_subscription_id
         FROM public.subscriptions
        WHERE workspace_id = $1::uuid
          AND status IN ('active', 'authenticated', 'pending', 'halted')
        ORDER BY created_at DESC LIMIT 1`,
      workspaceId,
    );
    const subId = rows[0]?.razorpay_subscription_id;
    if (!subId) throw new NotFoundException('No active subscription to cancel.');

    await this.razorpay.cancelSubscription(subId, true);
    this.logger.log(`Cancelled subscription ${subId} (workspace=${workspaceId}) at cycle end`);
    return { cancelled: true, razorpaySubscriptionId: subId };
  }

  // ────────────────────────────────────────────────────────────────────
  // Plan change — upgrade / downgrade with proration
  // ────────────────────────────────────────────────────────────────────

  /**
   * Preview a plan change: returns the estimated proration (credit, charge,
   * timing) so the UI can confirm before committing. Read-only — no money moves.
   */
  @Get('change-plan/preview')
  async changePlanPreview(@Query('planKey') planKey: string) {
    const workspaceId = this.tenant.requireWorkspaceId();
    const plan = findPlan(planKey);
    if (!plan) throw new NotFoundException(`Unknown plan: ${planKey}`);

    const sub = await this.activeSubscription(workspaceId);
    if (!sub?.razorpay_subscription_id) {
      throw new BadRequestException('No active subscription to change. Subscribe to a plan first.');
    }
    if (sub.plan_key === plan.key) {
      throw new BadRequestException('That is already your current plan.');
    }

    const est = this.estimate(sub, plan.priceInr * 100);
    return { preview: { ...est, currentPlanKey: sub.plan_key, targetPlanKey: plan.key, targetPlanName: plan.name } };
  }

  /**
   * Execute a plan change. Upgrades apply immediately (Razorpay prorates the
   * current cycle and charges the difference); downgrades are scheduled for the
   * next cycle so the customer keeps what they already paid for. The
   * subscription.updated webhook reconciles, and we optimistically reflect the
   * change in our row so plan limits update right away.
   */
  @Post('change-plan')
  @HttpCode(200)
  async changePlan(@Body() dto: ChangePlanDto) {
    const workspaceId = this.tenant.requireWorkspaceId();
    const plan = findPlan(dto.planKey);
    if (!plan) throw new NotFoundException(`Unknown plan: ${dto.planKey}`);

    const sub = await this.activeSubscription(workspaceId);
    if (!sub?.razorpay_subscription_id) {
      throw new BadRequestException('No active subscription to change. Subscribe to a plan first.');
    }
    if (sub.plan_key === plan.key) {
      throw new BadRequestException('That is already your current plan.');
    }

    const razorpayPlanId = this.config.get<string>(plan.razorpayPlanIdEnv);
    if (!razorpayPlanId) {
      throw new BadRequestException(
        `Plan "${plan.key}" is not provisioned in Razorpay. Set ${plan.razorpayPlanIdEnv} in env.`,
      );
    }

    const est = this.estimate(sub, plan.priceInr * 100);

    await this.razorpay.updateSubscription(sub.razorpay_subscription_id, {
      razorpayPlanId,
      scheduleChangeAt: est.timing,
    });

    if (est.timing === 'now') {
      // Immediate (upgrade / same): reflect new plan now so limits update.
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.subscriptions
            SET plan_key = $1, amount_paise = $2, razorpay_plan_id = $3, updated_at = now()
          WHERE id = $4::uuid`,
        plan.key,
        plan.priceInr * 100,
        razorpayPlanId,
        sub.id,
      );
    } else {
      // Downgrade: keep the current (higher) plan until cycle end; record the
      // pending change. The automation job applies it once the period rolls over.
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.subscriptions
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'pending_plan_change',
                  jsonb_build_object(
                    'plan_key', $1::text,
                    'razorpay_plan_id', $2::text,
                    'amount_paise', $3::bigint,
                    'effective_at', $4::text
                  )
                ),
                updated_at = now()
          WHERE id = $5::uuid`,
        plan.key,
        razorpayPlanId,
        plan.priceInr * 100,
        sub.current_period_end ?? new Date().toISOString(),
        sub.id,
      );
    }

    await this.notifications.emit({
      workspaceId,
      type: est.direction === 'upgrade' ? 'subscription_activated' : 'subscription_cancelled',
      severity: est.direction === 'upgrade' ? 'success' : 'info',
      title: est.direction === 'upgrade' ? `Upgraded to ${plan.name}` : `Scheduled downgrade to ${plan.name}`,
      body:
        est.timing === 'now'
          ? `Your plan changed to ${plan.name} immediately. ${est.immediateChargePaise > 0 ? `A prorated charge of ₹${Math.round(est.immediateChargePaise / 100).toLocaleString('en-IN')} applies.` : ''}`
          : `Your plan will switch to ${plan.name} at the end of the current cycle. You keep your current plan until then.`,
      actionUrl: '/subscription',
    });

    this.logger.log(`Plan change (workspace=${workspaceId}, ${sub.plan_key}→${plan.key}, ${est.timing})`);
    return { changed: true, timing: est.timing, direction: est.direction, preview: est };
  }

  // ── internals ────────────────────────────────────────────────────────

  private async activeSubscription(workspaceId: string): Promise<SubscriptionRow | null> {
    const rows = await this.prisma.$queryRawUnsafe<SubscriptionRow[]>(
      `SELECT * FROM public.subscriptions
        WHERE workspace_id = $1::uuid
          AND status IN ('active','authenticated','pending','halted')
        ORDER BY created_at DESC LIMIT 1`,
      workspaceId,
    );
    return rows[0] ?? null;
  }

  private estimate(sub: SubscriptionRow, newPricePaise: number) {
    const oldPricePaise =
      Number(sub.amount_paise ?? 0) || (findPlan(sub.plan_key)?.priceInr ?? 0) * 100;
    return computeProration({
      oldPricePaise,
      newPricePaise,
      periodStart: sub.current_period_start ? new Date(sub.current_period_start) : null,
      periodEnd: sub.current_period_end ? new Date(sub.current_period_end) : null,
    });
  }
}