import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { Audit } from '../admin/audit/audit.decorator';
import { PrismaService } from '../database/prisma.service';
import { BillingService } from './billing.service';
import { BillingAutomationService } from './billing-automation.service';
import { RazorpayService } from './razorpay.service';
import { ListInvoicesQuery } from './dto/list-invoices.query';
import { ListPaymentsQuery } from './dto/list-payments.query';
import { ListSubscriptionsQuery } from './dto/list-subscriptions.query';

class RefundPaymentDto {
  /** Partial refund amount in paise. Omit for a full refund. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amountPaise?: number;
}

/**
 * Admin reads over billing data, plus the privileged mutations: refunds and a
 * manual trigger for the billing automation jobs.
 */
@ApiTags('Admin · Billing')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/billing', version: '1' })
export class AdminBillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly razorpay: RazorpayService,
    private readonly automation: BillingAutomationService,
    private readonly prisma: PrismaService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // Revenue
  // ─────────────────────────────────────────────────────────────────
  @Get('revenue/snapshot')
  @ApiOperation({ summary: 'KPI block: MRR/ARR, total revenue, sub counts, failed payments.' })
  async revenueSnapshot() {
    return { data: await this.billing.revenueSnapshot() };
  }

  @Get('revenue/by-plan')
  @ApiOperation({ summary: 'MRR + active-sub split by plan tier.' })
  async revenueByPlan() {
    return { data: await this.billing.revenueByPlan() };
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Retention analytics: churn, trial conversion, ARPA.' })
  async analytics() {
    return { data: await this.billing.subscriptionAnalytics() };
  }

  @Get('revenue/monthly')
  @ApiOperation({ summary: 'Captured revenue bucketed by month (last 12 by default).' })
  async monthly(@Query('months') months?: string) {
    const m = months ? Number(months) : 12;
    return { data: await this.billing.monthlyRevenue(Number.isFinite(m) ? m : 12) };
  }

  // ─────────────────────────────────────────────────────────────────
  // Subscriptions
  // ─────────────────────────────────────────────────────────────────
  @Get('subscriptions')
  @ApiOperation({ summary: 'List subscriptions with status / plan / search filter.' })
  async subscriptions(@Query() q: ListSubscriptionsQuery) {
    return { data: await this.billing.listSubscriptions(q) };
  }

  @Get('subscriptions/:id')
  @ApiOperation({ summary: 'Single subscription detail.' })
  async subscription(@Param('id') id: string) {
    return { data: await this.billing.subscriptionDetail(id) };
  }

  // ─────────────────────────────────────────────────────────────────
  // Payments
  // ─────────────────────────────────────────────────────────────────
  @Get('payments')
  @ApiOperation({ summary: 'List payments - filter by status (captured / failed / refunded ...).' })
  async payments(@Query() q: ListPaymentsQuery) {
    return { data: await this.billing.listPayments(q) };
  }

  // ─────────────────────────────────────────────────────────────────
  // Invoices
  // ─────────────────────────────────────────────────────────────────
  @Get('invoices')
  @ApiOperation({ summary: 'List invoices with status filter.' })
  async invoices(@Query() q: ListInvoicesQuery) {
    return { data: await this.billing.listInvoices(q) };
  }

  // ─────────────────────────────────────────────────────────────────
  // Mutations — refunds + automation trigger
  // ─────────────────────────────────────────────────────────────────

  /**
   * Refund a captured payment (full, or partial via amountPaise). The
   * refund.* webhook reconciles the payment row afterwards.
   */
  @Post('payments/:id/refund')
  @HttpCode(200)
  @Audit({ action: 'billing.refund', resourceType: 'payment', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Refund a captured payment (full or partial).' })
  async refund(@Param('id') id: string, @Body() dto: RefundPaymentDto) {
    const [pay] = await this.prisma.$queryRawUnsafe<
      Array<{ razorpay_payment_id: string | null; amount_paise: bigint; amount_refunded_paise: bigint; status: string }>
    >(
      `SELECT razorpay_payment_id, amount_paise, amount_refunded_paise, status
         FROM public.payments WHERE id = $1::uuid LIMIT 1`,
      id,
    );
    if (!pay) throw new NotFoundException('Payment not found.');
    if (!pay.razorpay_payment_id) {
      throw new BadRequestException('Payment has no Razorpay payment id to refund.');
    }
    if (pay.status !== 'captured') {
      throw new BadRequestException(`Only captured payments can be refunded (status: ${pay.status}).`);
    }
    const refundable = Number(pay.amount_paise) - Number(pay.amount_refunded_paise);
    if (dto.amountPaise && dto.amountPaise > refundable) {
      throw new BadRequestException(`Refund exceeds refundable amount (${refundable} paise).`);
    }

    const refund = await this.razorpay.refundPayment(pay.razorpay_payment_id, dto.amountPaise);
    return { data: { refund } };
  }

  @Post('automation/run')
  @HttpCode(200)
  @Audit({ action: 'billing.automation.run', resourceType: 'platform' })
  @ApiOperation({ summary: 'Manually run the billing automation jobs (trial/renewal/dunning/downgrade).' })
  async runAutomation() {
    return { data: await this.automation.runAll() };
  }
}