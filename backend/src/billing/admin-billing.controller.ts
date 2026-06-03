import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { BillingService } from './billing.service';
import { ListInvoicesQuery } from './dto/list-invoices.query';
import { ListPaymentsQuery } from './dto/list-payments.query';
import { ListSubscriptionsQuery } from './dto/list-subscriptions.query';

/**
 * Admin reads over billing data. Mutations (refunds, manual retries) come in
 * Phase 2.5 once we have a confirmed Razorpay account.
 */
@ApiTags('Admin · Billing')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/billing', version: '1' })
export class AdminBillingController {
  constructor(private readonly billing: BillingService) {}

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
  @ApiOperation({ summary: 'List payments — filter by status (captured / failed / refunded ...).' })
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
}