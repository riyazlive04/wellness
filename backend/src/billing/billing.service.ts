import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  InvoiceListItem,
  MonthlyRevenuePoint,
  PaymentListItem,
  PaymentStatus,
  PlanRevenueBreakdown,
  RevenueSnapshot,
  SubscriptionAnalytics,
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
  /** Inclusive IST date range, YYYY-MM-DD. */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Totals across the whole filtered set, not just the page returned. */
export interface PaymentsSummary {
  captured_inr: number;
  captured_count: number;
  refunded_inr: number;
  failed_count: number;
}

interface ListInvoicesParams {
  status?: string;
  workspaceId?: string;
  limit?: number;
  offset?: number;
}

const PAISE_PER_INR = 100;
/** Prices include 18% GST. */
const GST_RATE = 0.18;

/**
 * Each practice's one current paid subscription: active, not the ₹1 test
 * coupon, not a NUSI-own / complimentary practice, not a closed practice.
 * `monthly_paise` spreads a yearly price over 12 months.
 */
const PAID_SUBS = `
  SELECT DISTINCT ON (s.workspace_id)
         s.workspace_id, s.plan_key, s.billing_cycle,
         CASE WHEN s.billing_cycle = 'annual' THEN s.amount_paise / 12.0 ELSE s.amount_paise END AS monthly_paise
    FROM public.subscriptions s
    JOIN public.workspaces w ON w.id = s.workspace_id
   WHERE s.status = 'active' AND NOT s.is_test
     AND NOT w.billing_exempt AND w.status <> 'deleted'
   ORDER BY s.workspace_id, s.created_at DESC`;

/** What a payment `p` was for (Razorpay notes.kind); renewals carry none. */
const KIND = `p.metadata->'notes'->>'kind'`;
/** A payment's amount after refunds, in paise. */
const NET = `(p.amount_paise - COALESCE(p.amount_refunded_paise, 0))`;
/** NUSI's own income: captured, not a practice store sale, not an exempt practice. Needs `w` joined to `p`. */
const NUSI_INCOME = `p.status IN ('captured', 'refunded')
  AND COALESCE(${KIND}, '') <> 'product'
  AND NOT COALESCE(w.billing_exempt, false)`;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────
  // Revenue — what NUSI actually earns.
  //
  // Rules shared by every figure below (super admin audit, 2026-10-14):
  //  - MRR comes from each practice's one current paid subscription, with a
  //    yearly price spread over 12 months; the ₹1 test coupon and NUSI's own /
  //    complimentary practices (workspaces.billing_exempt) are left out.
  //  - Revenue is captured NUSI income minus refunds. Practice store sales
  //    (a client buying a practice's product, notes.kind='product') go through
  //    NUSI's Razorpay but are the practice's money, so they're reported apart.
  //  - Prices include 18% GST; each money figure also comes "excl. GST".
  //  - Months are Indian months (Asia/Kolkata).
  // ─────────────────────────────────────────────────────────────────
  async revenueSnapshot(): Promise<RevenueSnapshot> {
    const [pay] = await this.prisma.$queryRawUnsafe<
      Array<{
        total_paise: bigint;
        last_30d_paise: bigint;
        sub_30d_paise: bigint;
        topup_30d_paise: bigint;
        other_30d_paise: bigint;
        store_30d_paise: bigint;
        failed_30d: bigint;
      }>
    >(`
      SELECT
        COALESCE(SUM(${NET}) FILTER (WHERE ${NUSI_INCOME}), 0)::bigint AS total_paise,
        COALESCE(SUM(${NET}) FILTER (WHERE ${NUSI_INCOME} AND p.captured_at >= now() - interval '30 days'), 0)::bigint AS last_30d_paise,
        COALESCE(SUM(${NET}) FILTER (WHERE ${NUSI_INCOME} AND p.captured_at >= now() - interval '30 days'
                                     AND COALESCE(${KIND}, 'subscription') = 'subscription'), 0)::bigint AS sub_30d_paise,
        COALESCE(SUM(${NET}) FILTER (WHERE ${NUSI_INCOME} AND p.captured_at >= now() - interval '30 days'
                                     AND ${KIND} = 'topup'), 0)::bigint AS topup_30d_paise,
        COALESCE(SUM(${NET}) FILTER (WHERE ${NUSI_INCOME} AND p.captured_at >= now() - interval '30 days'
                                     AND ${KIND} NOT IN ('subscription', 'topup')), 0)::bigint AS other_30d_paise,
        COALESCE(SUM(${NET}) FILTER (WHERE p.status IN ('captured', 'refunded') AND ${KIND} = 'product'
                                     AND p.captured_at >= now() - interval '30 days'), 0)::bigint AS store_30d_paise,
        COUNT(*) FILTER (WHERE p.status = 'failed' AND COALESCE(p.failed_at, p.created_at) >= now() - interval '30 days')::bigint AS failed_30d
      FROM public.payments p
      LEFT JOIN public.workspaces w ON w.id = p.workspace_id
    `);

    const [subs] = await this.prisma.$queryRawUnsafe<
      Array<{ mrr_paise: number | null; active: bigint; past_due: bigint; cancelled_30d: bigint; checkouts_open: bigint; trialing: bigint }>
    >(`
      WITH paid AS (${PAID_SUBS})
      SELECT
        (SELECT COALESCE(SUM(monthly_paise), 0)::float FROM paid) AS mrr_paise,
        (SELECT COUNT(*) FROM paid)::bigint AS active,
        (SELECT COUNT(DISTINCT s.workspace_id) FROM public.subscriptions s JOIN public.workspaces w ON w.id = s.workspace_id
          WHERE s.status IN ('halted', 'pending') AND NOT s.is_test AND NOT w.billing_exempt)::bigint AS past_due,
        (SELECT COUNT(DISTINCT s.workspace_id) FROM public.subscriptions s JOIN public.workspaces w ON w.id = s.workspace_id
          WHERE s.status = 'cancelled' AND NOT s.is_test AND NOT w.billing_exempt
            AND COALESCE(s.cancelled_at, s.ended_at, s.updated_at) >= now() - interval '30 days')::bigint AS cancelled_30d,
        -- Checkouts started but not paid yet (Razorpay 'created' / 'authenticated'), last 30 days.
        (SELECT COUNT(DISTINCT s.workspace_id) FROM public.subscriptions s JOIN public.workspaces w ON w.id = s.workspace_id
          WHERE s.status IN ('created', 'authenticated') AND NOT s.is_test AND NOT w.billing_exempt
            AND s.created_at >= now() - interval '30 days'
            AND NOT EXISTS (SELECT 1 FROM paid WHERE paid.workspace_id = s.workspace_id))::bigint AS checkouts_open,
        -- Real free trials: practices still inside their 14 days with no paid plan.
        (SELECT COUNT(*) FROM public.workspaces w
          WHERE w.status = 'active' AND NOT w.billing_exempt AND w.trial_ends_at > now()
            AND NOT EXISTS (SELECT 1 FROM paid WHERE paid.workspace_id = w.id))::bigint AS trialing
    `);

    const inr = (paise: bigint | number | null | undefined) => Number(paise ?? 0) / PAISE_PER_INR;
    const mrr = inr(subs?.mrr_paise);
    const total = inr(pay?.total_paise);
    const last30 = inr(pay?.last_30d_paise);

    return {
      total_inr: round2(total),
      total_net_inr: exGst(total),
      last_30d_inr: round2(last30),
      last_30d_net_inr: exGst(last30),
      last_30d_by_kind: {
        subscription_inr: round2(inr(pay?.sub_30d_paise)),
        topup_inr: round2(inr(pay?.topup_30d_paise)),
        other_inr: round2(inr(pay?.other_30d_paise)),
      },
      store_sales_30d_inr: round2(inr(pay?.store_30d_paise)),
      mrr_inr: round2(mrr),
      mrr_net_inr: exGst(mrr),
      arr_inr: round2(mrr * 12),
      arr_net_inr: exGst(mrr * 12),
      active_subs: Number(subs?.active ?? 0n),
      trialing_subs: Number(subs?.trialing ?? 0n),
      checkouts_open: Number(subs?.checkouts_open ?? 0n),
      past_due_subs: Number(subs?.past_due ?? 0n),
      cancelled_30d: Number(subs?.cancelled_30d ?? 0n),
      failed_payments: Number(pay?.failed_30d ?? 0n),
    };
  }

  /** NUSI income (after refunds, incl. GST) over the last N days — same rules as revenueSnapshot. */
  async incomeSince(days: number): Promise<number> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<{ paise: bigint }>>(
      `SELECT COALESCE(SUM(${NET}), 0)::bigint AS paise
         FROM public.payments p LEFT JOIN public.workspaces w ON w.id = p.workspace_id
        WHERE ${NUSI_INCOME} AND p.captured_at >= now() - ($1 || ' days')::interval`,
      String(Math.max(1, Math.min(3650, Math.floor(days)))),
    );
    return round2(Number(r?.paise ?? 0n) / PAISE_PER_INR);
  }

  /** MRR by plan, from each practice's current paid subscription. */
  async revenueByPlan(): Promise<PlanRevenueBreakdown[]> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ plan_key: string; active_count: bigint; mrr_paise: number | null }>>(`
      WITH paid AS (${PAID_SUBS})
      SELECT plan_key, COUNT(*)::bigint AS active_count, COALESCE(SUM(monthly_paise), 0)::float AS mrr_paise
        FROM paid
    GROUP BY plan_key
    ORDER BY mrr_paise DESC
    `);
    return rows.map((r) => {
      const mrr = Number(r.mrr_paise ?? 0) / PAISE_PER_INR;
      return { plan_key: r.plan_key, active_count: Number(r.active_count), mrr_inr: round2(mrr), mrr_net_inr: exGst(mrr) };
    });
  }

  /** NUSI income per Indian month for the last N months, empty months included. */
  async monthlyRevenue(months = 12): Promise<MonthlyRevenuePoint[]> {
    const m = Math.max(1, Math.min(36, months));
    const rows = await this.prisma.$queryRawUnsafe<Array<{ month: string; revenue_paise: bigint; payment_count: bigint }>>(
      `
      WITH months AS (
        SELECT generate_series(
                 date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') - ($1 || ' months')::interval,
                 date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata'),
                 interval '1 month'
               ) AS m
      )
      SELECT to_char(months.m, 'YYYY-MM-DD') AS month,
             COALESCE(SUM(${NET}), 0)::bigint AS revenue_paise,
             COUNT(p.id)::bigint AS payment_count
        FROM months
        -- Filter the payments before joining, so a month whose only payments are
        -- excluded still shows (as zero) instead of disappearing.
        LEFT JOIN (
          SELECT p.* FROM public.payments p
            LEFT JOIN public.workspaces w ON w.id = p.workspace_id
           WHERE ${NUSI_INCOME}
        ) p ON date_trunc('month', p.captured_at AT TIME ZONE 'Asia/Kolkata') = months.m
    GROUP BY months.m
    ORDER BY months.m ASC
      `,
      String(m - 1),
    );
    return rows.map((r) => {
      const revenue = Number(r.revenue_paise ?? 0n) / PAISE_PER_INR;
      return { month: r.month, revenue_inr: round2(revenue), revenue_net_inr: exGst(revenue), payment_count: Number(r.payment_count) };
    });
  }

  /**
   * Retention: churn, trial → paid conversion and ARPA.
   *  - churn (90d) = paying practices that cancelled in the last 90 days ÷ paying
   *    practices at the start of those 90 days.
   *  - conversion = practices that ever paid ÷ practices whose trial has ended
   *    (or that paid early). Exempt and deleted practices are left out.
   */
  async subscriptionAnalytics(): Promise<SubscriptionAnalytics> {
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        active: bigint;
        mrr_paise: number | null;
        cancelled_90d: bigint;
        active_at_start: bigint;
        ever_paid: bigint;
        decided: bigint;
        lifetime_paise: bigint;
      }>
    >(`
      WITH paid AS (${PAID_SUBS}),
      real_subs AS (
        SELECT s.* FROM public.subscriptions s JOIN public.workspaces w ON w.id = s.workspace_id
         WHERE NOT s.is_test AND NOT w.billing_exempt
           -- current_period_start is set only once a first charge went through.
           AND s.current_period_start IS NOT NULL
      ),
      payers AS (SELECT DISTINCT workspace_id FROM real_subs)
      SELECT
        (SELECT COUNT(*) FROM paid)::bigint AS active,
        (SELECT COALESCE(SUM(monthly_paise), 0)::float FROM paid) AS mrr_paise,
        (SELECT COUNT(DISTINCT workspace_id) FROM real_subs
          WHERE status = 'cancelled' AND COALESCE(cancelled_at, ended_at, updated_at) >= now() - interval '90 days')::bigint AS cancelled_90d,
        (SELECT COUNT(DISTINCT workspace_id) FROM real_subs
          WHERE current_period_start <= now() - interval '90 days'
            AND COALESCE(cancelled_at, ended_at, 'infinity'::timestamptz) > now() - interval '90 days')::bigint AS active_at_start,
        (SELECT COUNT(*) FROM payers p JOIN public.workspaces w ON w.id = p.workspace_id WHERE w.status <> 'deleted')::bigint AS ever_paid,
        (SELECT COUNT(*) FROM public.workspaces w
          WHERE w.status <> 'deleted' AND NOT w.billing_exempt
            AND (w.trial_ends_at <= now() OR EXISTS (SELECT 1 FROM payers WHERE payers.workspace_id = w.id)))::bigint AS decided,
        (SELECT COALESCE(SUM(${NET}), 0) FROM public.payments p LEFT JOIN public.workspaces w ON w.id = p.workspace_id
          WHERE ${NUSI_INCOME})::bigint AS lifetime_paise
    `);

    const active = Number(row?.active ?? 0n);
    const cancelled90 = Number(row?.cancelled_90d ?? 0n);
    const atStart = Number(row?.active_at_start ?? 0n);
    const everPaid = Number(row?.ever_paid ?? 0n);
    const decided = Number(row?.decided ?? 0n);
    const mrr = Number(row?.mrr_paise ?? 0) / PAISE_PER_INR;
    const lifetime = Number(row?.lifetime_paise ?? 0n) / PAISE_PER_INR;

    return {
      active_subs: active,
      cancelled_90d: cancelled90,
      active_at_start_90d: atStart,
      churn_rate_90d: atStart > 0 ? round2(Math.min(100, (cancelled90 / atStart) * 100)) : 0,
      retention_rate_90d: atStart > 0 ? round2(Math.max(0, 100 - (cancelled90 / atStart) * 100)) : 0,
      ever_paid_workspaces: everPaid,
      total_workspaces: decided,
      trial_conversion_rate: decided > 0 ? round2((everPaid / decided) * 100) : 0,
      arpa_inr: active > 0 ? round2(mrr / active) : 0,
      arpa_net_inr: active > 0 ? exGst(mrr / active) : 0,
      lifetime_revenue_inr: round2(lifetime),
    };
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
    const rows = await this.prisma.$queryRawUnsafe<Array<SubscriptionListItem & { metadata?: unknown }>>(
      `SELECT s.*,
              w.name AS workspace_name,
              w.billing_exempt,
              u.email AS owner_email
         FROM public.subscriptions s
         LEFT JOIN public.workspaces w ON w.id = s.workspace_id
         LEFT JOIN auth.users u        ON u.id = w.owner_id
         ${whereSql}
        ORDER BY s.created_at DESC
        LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      ...vals,
    );

    return { items: rows.map(withoutMetadata), total: Number(countRow?.n ?? 0n), limit, offset };
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
    return withoutMetadata(rows[0]);
  }

  // ─────────────────────────────────────────────────────────────────
  // Payments — list (with failed / dunning filter)
  // ─────────────────────────────────────────────────────────────────
  async listPayments(
    params: ListPaymentsParams = {},
  ): Promise<{ items: PaymentListItem[]; total: number; limit: number; offset: number; summary: PaymentsSummary }> {
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
    // Indian dates: a payment at 11pm IST belongs to that day, not to the
    // next one in UTC.
    if (params.from) {
      vals.push(params.from);
      where.push(`(p.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $${vals.length}::date`);
    }
    if (params.to) {
      vals.push(params.to);
      where.push(`(p.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $${vals.length}::date`);
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
    const rows = await this.prisma.$queryRawUnsafe<Array<PaymentListItem & { metadata?: unknown }>>(
      `SELECT p.*,
              ${KIND} AS kind,
              w.name AS workspace_name
         FROM public.payments p
         LEFT JOIN public.workspaces w ON w.id = p.workspace_id
         ${whereSql}
        ORDER BY COALESCE(p.captured_at, p.failed_at, p.created_at) DESC
        LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      ...vals,
    );

    // Totals for the whole filtered set, not just the page on screen —
    // otherwise "₹4,000 captured" would silently mean "on these 50 rows".
    const [sums] = await this.prisma.$queryRawUnsafe<Array<{
      captured_paise: bigint | null; captured_count: bigint;
      refunded_paise: bigint | null; failed_count: bigint;
    }>>(
      `SELECT
         COALESCE(SUM(p.amount_paise) FILTER (WHERE p.status = 'captured'), 0)::bigint AS captured_paise,
         COUNT(*) FILTER (WHERE p.status = 'captured')::bigint AS captured_count,
         COALESCE(SUM(p.amount_paise) FILTER (WHERE p.status = 'refunded'), 0)::bigint AS refunded_paise,
         COUNT(*) FILTER (WHERE p.status = 'failed')::bigint AS failed_count
         FROM public.payments p
         LEFT JOIN public.workspaces w ON w.id = p.workspace_id
         ${whereSql}`,
      ...vals.slice(0, vals.length - 2),
    );

    return {
      items: rows.map(withoutMetadata),
      total: Number(countRow?.n ?? 0n),
      limit,
      offset,
      summary: {
        captured_inr: Number(sums?.captured_paise ?? 0n) / 100,
        captured_count: Number(sums?.captured_count ?? 0n),
        refunded_inr: Number(sums?.refunded_paise ?? 0n) / 100,
        failed_count: Number(sums?.failed_count ?? 0n),
      },
    };
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

/** Drop the raw Razorpay entity (payer email, contact, card / UPI details) from list rows. */
function withoutMetadata<T extends object>(row: T): T {
  const { metadata: _metadata, ...rest } = row as T & { metadata?: unknown };
  return rest as T;
}

/** An amount that includes 18% GST, without it. */
function exGst(inclusive: number): number {
  return round2(inclusive / (1 + GST_RATE));
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}