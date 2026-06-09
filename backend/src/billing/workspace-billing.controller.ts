import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { findPlan, findTopup, PLANS, TOPUPS, type PlanKey, type TopupKey } from './plans';
import { RazorpayService } from './razorpay.service';
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

/**
 * Workspace-side billing endpoints — what a workspace owner calls when
 * they're upgrading their plan or topping up.
 *
 * All endpoints are JWT-guarded; we resolve the workspace from the user's
 * scope and attach `workspace_id` to Razorpay `notes` so the webhook can
 * route updates back to the right tenant.
 */
@UseGuards(JwtAuthGuard)
@Controller('billing/me')
export class WorkspaceBillingController {
  private readonly logger = new Logger(WorkspaceBillingController.name);

  constructor(
    private readonly razorpay: RazorpayService,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly config: ConfigService,
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
  @Get('plans')
  listPlans() {
    return {
      plans: PLANS,
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

    const razorpayPlanId = this.config.get<string>(plan.razorpayPlanIdEnv);
    if (!razorpayPlanId) {
      throw new BadRequestException(
        `Plan "${plan.key}" is not provisioned in Razorpay. Create the plan in Razorpay Dashboard, then set ${plan.razorpayPlanIdEnv} in env.`,
      );
    }

    const subscription = await this.razorpay.createSubscription({
      razorpayPlanId,
      notes: {
        workspace_id: workspaceId,
        plan_key: plan.key,
        kind: 'subscription',
        amount_paise: String(plan.priceInr * 100),
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
      plan.priceInr * 100,
    );

    this.logger.log(
      `Created subscription ${subscription.id} (workspace=${workspaceId}, plan=${plan.key})`,
    );

    return {
      subscriptionId: subscription.id,
      planKey: plan.key,
      amountPaise: plan.priceInr * 100,
      razorpayKeyId: this.razorpay.keyId,
    };
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
}