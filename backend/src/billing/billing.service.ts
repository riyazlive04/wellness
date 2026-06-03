import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  InvoiceListItem,
  MonthlyRevenuePoint,
  PaymentListItem,
  PaymentStatus,
  PlanRevenueBreakdown,
  RevenueSnapshot,
  SubscriptionListItem,
  SubscriptionStatus,
} from './billing.types';

interface ListSubscriptionsParams {
  status?: SubscriptionStatus | 'all';
  plan?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

interface ListPaymentsParams {
  status?: PaymentStatus | 'all';
  workspaceId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

interface ListInvoicesParams {
  status?: string;
  workspaceId?: string;
  limit?: number;
  offset?: number;
}

const PAISE_PER_INR = 100;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────
  // Revenue snapshot — small + cheap, used by AdminRevenue + Overview
  // ─────────────────────────────────────────────────────────────────
  async revenueSnapshot(): Promise<RevenueSnapshot> {
    const [totals] = await this.prisma.$queryRawUnsafe<
      Array<{
        total_paise: bigint | null;
        last_30d_paise: bigint | null;
        failed_count: bigint;
      }>
    >(`
      SELECT
        COALESCE(SUM(amount_paise) FILTER (WHERE status = 'captured'), 0)::bigint AS total_paise,
        COALESCE(SUM(amount_paise) FILTER (
          WHERE status = 'captured' AND captured_at >= now() - interval '30 days'
        ), 0)::bigint AS last_30d_paise,
        COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed_count
      FROM public.payments
    `);

    const [subAgg] = await this.prisma.$queryRawUnsafe<
      Array<{
        mrr_paise: bigint | null;
        active: bigint;
        trialing: bigint;
        past_due: bigint;
        cancelled_30d: bigint;
      }>
    >(`
      SELECT
        COALESCE(SUM(amount_paise) FILTER (WHERE status = 'active'), 0)::bigint AS mrr_paise,
        COUNT(*) FILTER (WHERE status = 'active')::bigint     AS active,
        COUNT(*) FILTER (WHERE status IN ('created','authenticated')
                          AND trial_ends_at > now())::bigint   AS trialing,
        COUNT(*) FILTER (WHERE status IN ('halted','pending'))::bigint AS past_due,
        COUNT(*) FILTER (
          WHERE status = 'cancelled' AND cancelled_at >= now() - interval '30 days'
        )::bigint AS cancelled_30d
      FROM public.subscriptions
    `);

    const total = Number(totals?.total_paise ?? 0n) / PAISE_PER_INR;
    const last30 = Number(totals?.last_30d_paise ?? 0n) / PAISE_PER_INR;
    const mrr = Number(subAgg?.mrr_paise ?? 0n) / PAISE_PER_INR;

    return {
      total_inr: round2(total),
      last_30d_inr: round2(last30),
      mrr_inr: round2(mrr),
      arr_inr: round2(mrr * 12),
      active_subs: Number(subAgg?.active ?? 0n),
      trialing_subs: Number(subAgg?.trialing ?? 0n),
      past_due_subs: Number(subAgg?.past_due ?? 0n),
      cancelled_30d: Number(subAgg?.cancelled_30d ?? 0n),
      failed_payments: Number(totals?.failed_count ?? 0n),
    };
  }

  /** Revenue split by plan_key — for the "where MRR is coming from" chart. */
  async revenueByPlan(): Promise<PlanRevenueBreakdown[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ plan_key: string; active_count: bigint; mrr_paise: bigint | null }>
    >(`
      SELECT plan_key,
             COUNT(*)::bigint                                              AS active_count,
             COALESCE(SUM(amount_paise), 0)::bigint                        AS mrr_paise
        FROM public.subscriptions
       WHERE status = 'active'
    GROUP BY plan_key
    ORDER BY mrr_paise DESC
    `);
    return rows.map((r) => ({
      plan_key: r.plan_key,
      active_count: Number(r.active_count),
      mrr_inr: round2(Number(r.mrr_paise ?? 0n) / PAISE_PER_INR),
    }));
  }

  /** Monthly revenue for the last 12 months — bucketed by captured_at. */
  async monthlyRevenue(months = 12): Promise<MonthlyRevenuePoint[]> {
    const m = Math.max(1, Math.min(36, months));
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ month: Date; revenue_paise: bigint | null; payment_count: bigint }>
    >(
      `
      SELECT date_trunc('month', captured_at)               AS month,
             COALESCE(SUM(amount_paise), 0)::bigint         AS revenue_paise,
             COUNT(*)::bigint                               AS payment_count
        FROM public.payments
       WHERE status = 'captured'
         AND captured_at >= date_trunc('month', now()) - ($1 || ' months')::interval
    GROUP BY 1
    ORDER BY 1 ASC
      `,
      String(m - 1),
    );
    return rows.map((r) => ({
      month: r.month.toISOString().slice(0, 10),
      revenue_inr: round2(Number(r.revenue_paise ?? 0n) / PAISE_PER_INR),
      payment_count: Number(r.payment_count),
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // Subscriptions — list + detail
  // ─────────────────────────────────────────────────────────────────
  async listSubscriptions(
    params: ListSubscriptionsParams = {},
  ): Promise<{ items: SubscriptionListItem[]; total: number; limit: number; offset: number }> {
    const limit = clamp(params.limit ?? 50, 1, 200);
    const offset = Math.max(0, params.offset ?? 0);
    const where: string[] = [];
    const vals: unknown[] = [];

    if (params.status && params.status !== 'all') {
      vals.push(params.status);
      where.push(`s.status = $${vals.length}`);
    }
    if (params.plan) {
      vals.push(params.plan);
      where.push(`s.plan_key = $${vals.length}`);
    }
    if (params.q) {
      vals.push(`%${params.q.toLowerCase()}%`);
      where.push(
        `(LOWER(w.name) LIKE $${vals.length} OR LOWER(COALESCE(u.email, '')) LIKE $${vals.length})`,
      );
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRow] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n
         FROM public.subscriptions s
         LEFT JOIN public.workspaces w ON w.id = s.workspace_id
         LEFT JOIN auth.users u        ON u.id = w.owner_id
         ${whereSql}`,
      ...vals,
    );

    vals.push(limit);
    vals.push(offset);
    const items = await this.prisma.$queryRawUnsafe<SubscriptionListItem[]>(
      `SELECT s.*,
              w.name AS workspace_name,
              u.email AS owner_email
         FROM public.subscriptions s
         LEFT JOIN public.workspaces w ON w.id = s.workspace_id
         LEFT JOIN auth.users u        ON u.id = w.owner_id
         ${whereSql}
        ORDER BY s.created_at DESC
        LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      ...vals,
    );

    return { items, total: Number(countRow?.n ?? 0n), limit, offset };
  }

  async subscriptionDetail(id: string): Promise<SubscriptionListItem> {
    const rows = await this.prisma.$queryRawUnsafe<SubscriptionListItem[]>(
      `SELECT s.*,
              w.name AS workspace_name,
              u.email AS owner_email
         FROM public.subscriptions s
         LEFT JOIN public.workspaces w ON w.id = s.workspace_id
         LEFT JOIN auth.users u        ON u.id = w.owner_id
        WHERE s.id = $1::uuid
        LIMIT 1`,
      id,
    );
    if (!rows.length) throw new NotFoundException('Subscription not found');
    return rows[0];
  }

  // ─────────────────────────────────────────────────────────────────
  // Payments — list (with failed / dunning filter)
  // ─────────────────────────────────────────────────────────────────
  async listPayments(
    params: ListPaymentsParams = {},
  ): Promise<{ items: PaymentListItem[]; total: number; limit: number; offset: number }> {
    const limit = clamp(params.limit ?? 50, 1, 200);
    const offset = Math.max(0, params.offset ?? 0);
    const where: string[] = [];
    const vals: unknown[] = [];

    if (params.status && params.status !== 'all') {
      vals.push(params.status);
      where.push(`p.status = $${vals.length}`);
    }
    if (params.workspaceId) {
      vals.push(params.workspaceId);
      where.push(`p.workspace_id = $${vals.length}::uuid`);
    }
    if (params.q) {
      vals.push(`%${params.q.toLowerCase()}%`);
      where.push(
        `(LOWER(p.email) LIKE $${vals.length} OR LOWER(COALESCE(w.name, '')) LIKE $${vals.length} OR p.razorpay_payment_id ILIKE $${vals.length})`,
      );
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRow] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n
         FROM public.payments p
         LEFT JOIN public.workspaces w ON w.id = p.workspace_id
         ${whereSql}`,
      ...vals,
    );

    vals.push(limit);
    vals.push(offset);
    const items = await this.prisma.$queryRawUnsafe<PaymentListItem[]>(
      `SELECT p.*,
              w.name AS workspace_name
         FROM public.payments p
         LEFT JOIN public.workspaces w ON w.id = p.workspace_id
         ${whereSql}
        ORDER BY COALESCE(p.captured_at, p.failed_at, p.created_at) DESC
        LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      ...vals,
    );

    return { items, total: Number(countRow?.n ?? 0n), limit, offset };
  }

  // ─────────────────────────────────────────────────────────────────
  // Invoices — list
  // ─────────────────────────────────────────────────────────────────
  async listInvoices(
    params: ListInvoicesParams = {},
  ): Promise<{ items: InvoiceListItem[]; total: number; limit: number; offset: number }> {
    const limit = clamp(params.limit ?? 50, 1, 200);
    const offset = Math.max(0, params.offset ?? 0);
    const where: string[] = [];
    const vals: unknown[] = [];

    if (params.status && params.status !== 'all') {
      vals.push(params.status);
      where.push(`i.status = $${vals.length}`);
    }
    if (params.workspaceId) {
      vals.push(params.workspaceId);
      where.push(`i.workspace_id = $${vals.length}::uuid`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRow] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n
         FROM public.invoices i
         LEFT JOIN public.workspaces w ON w.id = i.workspace_id
         ${whereSql}`,
      ...vals,
    );

    vals.push(limit);
    vals.push(offset);
    const items = await this.prisma.$queryRawUnsafe<InvoiceListItem[]>(
      `SELECT i.*, w.name AS workspace_name
         FROM public.invoices i
         LEFT JOIN public.workspaces w ON w.id = i.workspace_id
         ${whereSql}
        ORDER BY COALESCE(i.issued_at, i.created_at) DESC
        LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      ...vals,
    );

    return { items, total: Number(countRow?.n ?? 0n), limit, offset };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}