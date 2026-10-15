import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminService } from '../admin/admin.service';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../database/prisma.service';
import { UsageService } from '../usage/usage.service';

const n = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0) || 0);

/**
 * Everything the super admin home page shows, in one request. Each block is
 * fetched independently; a block that fails comes back null instead of
 * failing the whole page.
 */
@Injectable()
export class AdminOverviewService {
  private readonly logger = new Logger(AdminOverviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly admin: AdminService,
    private readonly billing: BillingService,
    private readonly usage: UsageService,
  ) {}

  async overview() {
    const safe = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch (err) { this.logger.warn(`overview ${name} failed: ${(err as Error).message}`); return null; }
    };
    const [stats, revenue, monthly, byPlan, analytics, totals, onboarding, practices, growth, engagement, ai, trials, verification, leads, activity, health, setupFees] = await Promise.all([
      safe('stats', () => this.admin.stats()),
      safe('revenue', () => this.billing.revenueSnapshot()),
      safe('monthly', () => this.billing.monthlyRevenue(12)),
      safe('byPlan', () => this.billing.revenueByPlan()),
      safe('analytics', () => this.billing.subscriptionAnalytics()),
      safe('totals', () => this.totals()),
      safe('onboarding', () => this.onboarding()),
      safe('practices', () => this.practices()),
      safe('growth', () => this.growth()),
      safe('engagement', () => this.engagement()),
      safe('ai', () => this.ai()),
      safe('trials', () => this.trialsEnding()),
      safe('verification', () => this.verification()),
      safe('leads', () => this.leads()),
      safe('activity', () => this.activity()),
      safe('health', () => this.health()),
      safe('setupFees', () => this.setupFees()),
    ]);
    return { generated_at: new Date().toISOString(), stats, revenue, monthly, by_plan: byPlan, analytics, totals, onboarding, practices, growth, engagement, ai, trials, verification, leads, activity, health, setup_fees: setupFees };
  }

  /** One-time setup fees collected: through Razorpay and recorded by hand (UPI, bank, cash). */
  private async setupFees() {
    const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
      `SELECT COALESCE(SUM(amount_inr), 0) AS total,
              COALESCE(SUM(amount_inr) FILTER (WHERE paid_at > now() - interval '30 days'), 0) AS last_30d,
              COALESCE(SUM(amount_inr) FILTER (WHERE razorpay_subscription_id LIKE 'manual:%'), 0) AS manual_total,
              COUNT(*) AS count
         FROM public.workspace_setup_fee_payments`,
    );
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; workspace_id: string; workspace_name: string; plan_key: string; amount_inr: number; paid_at: Date; method: string | null }>>(
      `SELECT p.razorpay_subscription_id AS id, p.workspace_id, w.name AS workspace_name, p.plan_key, p.amount_inr, p.paid_at, p.method
         FROM public.workspace_setup_fee_payments p JOIN public.workspaces w ON w.id = p.workspace_id
        ORDER BY p.paid_at DESC LIMIT 50`,
    );
    return {
      total_inr: n(r?.total), last_30d_inr: n(r?.last_30d), manual_total_inr: n(r?.manual_total), count: n(r?.count),
      rows: rows.map((x) => ({ ...x, amount_inr: n(x.amount_inr), method: x.method ?? 'razorpay' })),
    };
  }

  private async totals() {
    const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
      `SELECT COUNT(*) FILTER (WHERE c.status = 'active')                                         AS clients,
              COUNT(*) FILTER (WHERE c.status = 'active' AND c.created_at > now() - interval '30 days') AS clients_new_30d,
              COUNT(*) FILTER (WHERE c.status = 'active' AND c.created_at BETWEEN now() - interval '60 days' AND now() - interval '30 days') AS clients_prev_30d
         FROM public.clients c JOIN public.workspaces w ON w.id = c.workspace_id
        WHERE w.status <> 'deleted'`,
    );
    return { clients: n(r?.clients), clients_new_30d: n(r?.clients_new_30d), clients_prev_30d: n(r?.clients_prev_30d) };
  }

  private async onboarding() {
    const counts = await this.prisma.$queryRawUnsafe<Array<{ status: string; c: bigint }>>(
      `SELECT status, COUNT(*) AS c FROM public.practice_onboarding WHERE status <> 'cancelled' GROUP BY status`,
    );
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; name: string; status: string; sections: Record<string, { status: string }>; expires_at: Date; last_activity_at: Date }>>(
      `SELECT id, name, status, sections, expires_at, last_activity_at FROM public.practice_onboarding
        WHERE status NOT IN ('cancelled', 'approved') ORDER BY (status = 'submitted') DESC, last_activity_at DESC LIMIT 5`,
    );
    const keys = ['account', 'practice', 'branding', 'meals', 'clients', 'billing'];
    return {
      counts: Object.fromEntries(counts.map((c) => [c.status, n(c.c)])),
      rows: rows.map((r) => ({
        id: r.id, name: r.name, status: r.status, expires_at: r.expires_at, last_activity_at: r.last_activity_at,
        sections: keys.map((k) => r.sections?.[k]?.status ?? 'none'),
      })),
    };
  }

  /** Every practice, deleted ones included, for the Workspaces directory page. */
  directory() {
    return this.practices(true);
  }

  private async practices(includeDeleted = false) {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT w.id, w.name, w.status, w.plan, w.trial_ends_at, w.billing_exempt, w.city, w.created_at, w.contact_phone,
              (SELECT COUNT(DISTINCT m.user_id) FROM public.workspace_members m WHERE m.workspace_id = w.id AND m.status = 'active') AS members,
              (SELECT v.status FROM public.workspace_verifications v WHERE v.workspace_id = w.id LIMIT 1) AS verification,
              (SELECT COUNT(*) FROM public.messages m WHERE m.workspace_id = w.id AND m.created_at > now() - interval '7 days') AS messages_7d,
              u.email AS owner_email, COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '') AS owner_name,
              (SELECT s.plan_key FROM public.subscriptions s WHERE s.workspace_id = w.id AND s.status = 'active' AND NOT s.is_test ORDER BY s.created_at DESC LIMIT 1) AS paid_plan,
              (SELECT p.plan_key FROM public.workspace_setup_fee_payments p WHERE p.workspace_id = w.id ORDER BY p.paid_at DESC LIMIT 1) AS setup_plan,
              (SELECT SUM(p.amount_inr) FROM public.workspace_setup_fee_payments p WHERE p.workspace_id = w.id) AS setup_paid_inr,
              (SELECT COUNT(*) FROM public.clients c WHERE c.workspace_id = w.id AND c.status = 'active') AS clients,
              (SELECT COUNT(*) FROM public.clients c WHERE c.workspace_id = w.id AND c.last_active_at > now() - interval '7 days') AS active_7d,
              (SELECT COUNT(*) FROM public.meal_logs m WHERE m.workspace_id = w.id AND m.logged_at > now() - interval '7 days') AS meals_7d,
              (SELECT COUNT(*) FROM public.ai_usage_events a WHERE a.workspace_id = w.id AND a.created_at > now() - interval '30 days' AND a.status <> 'error') AS ai_calls_30d,
              GREATEST(
                (SELECT MAX(c.last_active_at) FROM public.clients c WHERE c.workspace_id = w.id),
                (SELECT MAX(m.created_at) FROM public.messages m WHERE m.workspace_id = w.id),
                (SELECT MAX(ml.logged_at) FROM public.meal_logs ml WHERE ml.workspace_id = w.id),
                w.updated_at
              ) AS last_active
         FROM public.workspaces w
         LEFT JOIN auth.users u ON u.id = w.owner_id
        WHERE (${includeDeleted ? 'TRUE' : "w.status <> 'deleted'"})
        ORDER BY (w.status = 'deleted'), (w.status = 'suspended'), last_active DESC NULLS LAST
        LIMIT 500`,
    );
    const quotas = await this.usage.topWorkspaces(500).catch(() => []);
    const quota = new Map(quotas.map((q) => [q.workspace_id, q]));
    return rows.map((r) => {
      const q = quota.get(String(r.id));
      const aiCalls = n(r.ai_calls_30d);
      const limit = q?.quota_limit ?? null;
      const createdDays = (Date.now() - new Date(String(r.created_at)).getTime()) / 86_400_000;
      const active = n(r.active_7d) > 0 || n(r.meals_7d) > 0;
      const health = r.status === 'deleted' ? 'deleted' : r.status === 'suspended' ? 'suspended' : createdDays < 7 ? 'new' : active ? 'good' : 'quiet';
      return {
        id: r.id, name: r.name, status: r.status, city: r.city, owner_name: r.owner_name, owner_email: r.owner_email,
        kind: r.paid_plan ? 'paying' : r.billing_exempt ? 'free' : r.plan === 'trial' ? 'trial' : 'other',
        plan: r.paid_plan ?? r.plan, trial_ends_at: r.trial_ends_at,
        setup_plan: (r.setup_plan as string | null) ?? null, setup_paid_inr: n(r.setup_paid_inr),
        clients: n(r.clients), active_7d: n(r.active_7d), meals_7d: n(r.meals_7d), messages_7d: n(r.messages_7d),
        members: n(r.members), verification: (r.verification as string | null) ?? 'unsubmitted', phone: (r.contact_phone as string | null) ?? null, created_at: r.created_at,
        ai_calls_30d: aiCalls, ai_limit: limit, ai_pct: limit ? Math.min(100, Math.round((aiCalls / limit) * 100)) : null,
        last_active: r.last_active, health,
      };
    });
  }

  private async growth() {
    const weekly = await this.prisma.$queryRawUnsafe<Array<{ week: string; c: bigint }>>(
      `SELECT to_char(g.wk, 'YYYY-MM-DD') AS week,
              (SELECT COUNT(*) FROM public.workspaces w
                WHERE date_trunc('week', w.created_at AT TIME ZONE 'Asia/Kolkata') = g.wk) AS c
         FROM generate_series(date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata')) - interval '11 weeks',
                              date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata')), interval '1 week') AS g(wk)
        ORDER BY g.wk`,
    );
    const [f] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
      `SELECT (SELECT COUNT(*) FROM public.leads WHERE created_at > now() - interval '30 days') AS leads_30d,
              (SELECT COUNT(*) FROM public.practice_onboarding WHERE created_at > now() - interval '30 days' AND status <> 'cancelled') AS onboarding_30d,
              (SELECT COUNT(*) FROM public.practice_onboarding WHERE created_at > now() - interval '30 days' AND status IN ('submitted', 'approved')) AS onboarding_done_30d`,
    );
    return {
      weekly: weekly.map((w) => ({ week: w.week, count: n(w.c) })),
      leads_30d: n(f?.leads_30d), onboarding_30d: n(f?.onboarding_30d), onboarding_done_30d: n(f?.onboarding_done_30d),
    };
  }

  private async engagement() {
    const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
      `SELECT (SELECT COUNT(*) FROM public.clients WHERE last_active_at > now() - interval '7 days') AS active_clients,
              (SELECT COUNT(*) FROM public.meal_logs WHERE logged_at > now() - interval '7 days') AS meals,
              (SELECT COUNT(*) FROM public.messages WHERE created_at > now() - interval '7 days') AS messages,
              (SELECT COUNT(*) FROM public.appointments WHERE scheduled_at BETWEEN now() AND now() + interval '7 days' AND COALESCE(status, '') NOT IN ('cancelled', 'rejected')) AS appointments_next_7d,
              (SELECT COUNT(*) FROM public.notifications WHERE type IN ('water:reminder', 'meal:reminder', 'meal:log_reminder', 'coach:reminder') AND created_at > now() - interval '7 days') AS quick_reminders,
              (SELECT COUNT(*) FROM public.weekly_plans WHERE published_at > now() - interval '7 days') AS plans_published,
              (SELECT COUNT(DISTINCT client_id) FROM public.fcm_tokens WHERE client_id IS NOT NULL) AS push_phones`,
    );
    return Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, n(v)]));
  }

  private async ai() {
    const [snap, services, top] = await Promise.all([this.usage.snapshot(), this.usage.byService(), this.usage.topWorkspaces(5)]);
    const most = [...services].sort((a, b) => b.calls - a.calls)[0]?.service ?? null;
    return { snapshot: snap, most_used: most, top };
  }

  private async trialsEnding() {
    return this.prisma.$queryRawUnsafe<Array<{ id: string; name: string; trial_ends_at: Date; clients: bigint }>>(
      `SELECT w.id, w.name, w.trial_ends_at,
              (SELECT COUNT(*) FROM public.clients c WHERE c.workspace_id = w.id AND c.status = 'active') AS clients
         FROM public.workspaces w
        WHERE w.status = 'active' AND NOT w.billing_exempt AND w.trial_ends_at BETWEEN now() AND now() + interval '14 days'
          AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.workspace_id = w.id AND s.status = 'active' AND NOT s.is_test)
        ORDER BY w.trial_ends_at LIMIT 10`,
    ).then((rows) => rows.map((r) => ({ ...r, clients: n(r.clients) })));
  }

  private async verification() {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ status: string; c: bigint }>>(
      `SELECT COALESCE(v.status, 'unsubmitted') AS status, COUNT(*) AS c
         FROM public.workspaces w LEFT JOIN public.workspace_verifications v ON v.workspace_id = w.id
        WHERE w.status <> 'deleted' GROUP BY 1`,
    );
    return Object.fromEntries(rows.map((r) => [r.status, n(r.c)]));
  }

  private async leads() {
    const latest = await this.prisma.$queryRawUnsafe<Array<{ id: string; name: string; city: string | null; source: string | null; status: string | null; slot_start: Date | null; created_at: Date }>>(
      `SELECT id, name, city, source, status, slot_start, created_at FROM public.leads ORDER BY created_at DESC LIMIT 5`,
    );
    const [c] = await this.prisma.$queryRawUnsafe<Array<{ new: bigint; calls: bigint }>>(
      `SELECT COUNT(*) FILTER (WHERE COALESCE(status, 'new') = 'new') AS new,
              COUNT(*) FILTER (WHERE slot_start BETWEEN now() AND now() + interval '2 days') AS calls
         FROM public.leads`,
    );
    return { latest, new_count: n(c?.new), calls_soon: n(c?.calls) };
  }

  private async activity() {
    return this.prisma.$queryRawUnsafe<Array<{ at: Date; kind: string; text: string }>>(
      `SELECT * FROM (
         SELECT w.created_at AS at, 'practice' AS kind, 'New practice: ' || w.name AS text FROM public.workspaces w WHERE w.status <> 'deleted'
         UNION ALL SELECT o.submitted_at, 'onboarding', o.name || ' submitted practice onboarding' FROM public.practice_onboarding o WHERE o.submitted_at IS NOT NULL
         UNION ALL SELECT o.approved_at, 'approved', o.name || ' was approved, trial started' FROM public.practice_onboarding o WHERE o.approved_at IS NOT NULL
         UNION ALL SELECT l.created_at, 'lead', 'New lead: ' || l.name || COALESCE(' (' || l.city || ')', '') FROM public.leads l
         UNION ALL SELECT p.published_at, 'plan', w.name || ' published a meal plan' FROM public.weekly_plans p JOIN public.workspaces w ON w.id = p.workspace_id WHERE p.published_at IS NOT NULL
         UNION ALL SELECT c.created_at, 'client', w.name || ' added a client' FROM public.clients c JOIN public.workspaces w ON w.id = c.workspace_id
       ) e WHERE at > now() - interval '30 days' ORDER BY at DESC LIMIT 12`,
    );
  }

  private async health() {
    const t0 = Date.now();
    let dbUp = true;
    try { await this.prisma.$queryRawUnsafe('SELECT 1'); } catch { dbUp = false; }
    const latency = Date.now() - t0;
    const [w] = await this.prisma.$queryRawUnsafe<Array<{ events: bigint; errors: bigint; last: Date | null; ai_errors: bigint }>>(
      `SELECT (SELECT COUNT(*) FROM public.webhook_events WHERE received_at > now() - interval '24 hours') AS events,
              (SELECT COUNT(*) FROM public.webhook_events WHERE error IS NOT NULL AND received_at > now() - interval '24 hours') AS errors,
              (SELECT MAX(received_at) FROM public.webhook_events) AS last,
              (SELECT COUNT(*) FROM public.ai_usage_events WHERE status = 'error' AND created_at > now() - interval '24 hours') AS ai_errors`,
    ).catch(() => [{ events: 0n, errors: 0n, last: null, ai_errors: 0n }]);
    return {
      db: { up: dbUp, latency_ms: latency },
      push: !!this.config.get('FIREBASE_SERVICE_ACCOUNT'),
      email: !!this.config.get('RESEND_API_KEY'),
      payments: { keys: !!this.config.get('RAZORPAY_KEY_ID'), webhook_secret: !!this.config.get('RAZORPAY_WEBHOOK_SECRET'), last_webhook_at: w?.last ?? null, webhook_errors_24h: n(w?.errors), webhook_events_24h: n(w?.events) },
      ai: { configured: !!this.config.get('GEMINI_API_KEY'), errors_24h: n(w?.ai_errors) },
      uptime_seconds: Math.round(process.uptime()),
    };
  }
}
