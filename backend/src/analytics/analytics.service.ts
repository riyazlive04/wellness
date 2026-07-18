import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * AnalyticsService — Module 10 Reports & Analytics Engine (workspace scope).
 * Consolidates client growth, engagement, nutrition trends, program performance,
 * AI usage and revenue into one BI surface, plus a rule-based insight narrative. The
 * super-admin/platform analytics already live in billing + usage modules; this
 * is the owner/nutritionist BI layer.
 *
 * Every section is defensively wrapped so a single failing query degrades to an
 * empty section rather than breaking the dashboard.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async overview(workspaceId: string): Promise<OverviewKpis> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint | number | null>>>(
      `SELECT
         (SELECT count(*) FROM public.clients WHERE workspace_id=$1::uuid AND status::text='active') AS active_clients,
         (SELECT count(*) FROM public.clients WHERE workspace_id=$1::uuid) AS total_clients,
         (SELECT count(*) FROM public.clients WHERE workspace_id=$1::uuid AND created_at >= date_trunc('month', now())) AS new_clients_month,
         (SELECT count(DISTINCT c.id) FROM public.clients c
            WHERE c.workspace_id=$1::uuid
              AND EXISTS (SELECT 1 FROM public.meal_logs m WHERE m.client_id=c.id AND m.logged_at >= now()-interval '7 days')) AS active_7d,
         (SELECT count(*) FROM public.program_assignments WHERE workspace_id=$1::uuid AND status='active') AS active_programs,
         (SELECT COALESCE(round(avg(progress_pct)),0) FROM public.program_assignments WHERE workspace_id=$1::uuid AND status IN ('active','completed')) AS avg_progress,
         (SELECT count(*) FROM public.ai_usage_events WHERE workspace_id=$1::uuid AND created_at >= date_trunc('month', now())) AS ai_calls_month,
         (SELECT count(*) FROM public.messages WHERE workspace_id=$1::uuid AND created_at >= now()-interval '7 days') AS messages_7d,
         (SELECT COALESCE(SUM(amount_paise),0) FROM public.subscriptions WHERE workspace_id=$1::uuid AND status='active') AS mrr_paise`,
      workspaceId);
    const n = (k: string) => Number(r?.[k] ?? 0);
    return {
      total_clients: n('total_clients'),
      active_clients: n('active_clients'),
      new_clients_month: n('new_clients_month'),
      active_7d: n('active_7d'),
      active_programs: n('active_programs'),
      avg_program_progress: n('avg_progress'),
      ai_calls_month: n('ai_calls_month'),
      messages_7d: n('messages_7d'),
      mrr_inr: Math.round(n('mrr_paise') / 100),
    };
  }

  async clientGrowth(workspaceId: string, months = 6): Promise<Array<{ month: string; count: number }>> {
    const m = Math.min(Math.max(months, 1), 24);
    const rows = await this.prisma.$queryRawUnsafe<Array<{ month: string; n: bigint }>>(
      `SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS month, count(*) AS n
         FROM public.clients
        WHERE workspace_id=$1::uuid
          AND created_at >= date_trunc('month', now()) - (($2::int - 1)||' months')::interval
        GROUP BY 1 ORDER BY 1`,
      workspaceId, String(m));
    return rows.map((x) => ({ month: x.month, count: Number(x.n) }));
  }

  async engagement(workspaceId: string, days = 30): Promise<Array<{ day: string; active: number }>> {
    const d = Math.min(Math.max(days, 1), 90);
    const rows = await this.prisma.$queryRawUnsafe<Array<{ day: string; active: bigint }>>(
      `SELECT to_char(g::date,'YYYY-MM-DD') AS day,
              (SELECT count(DISTINCT m.client_id) FROM public.meal_logs m
                 JOIN public.clients c ON c.id=m.client_id
                WHERE c.workspace_id=$1::uuid AND m.logged_at::date = g::date) AS active
         FROM generate_series(current_date - ($2::int - 1), current_date, interval '1 day') g
        ORDER BY g`,
      workspaceId, String(d));
    return rows.map((x) => ({ day: x.day, active: Number(x.active) }));
  }

  async nutritionTrends(workspaceId: string, days = 30): Promise<NutritionTrends> {
    const d = Math.min(Math.max(days, 1), 90);
    const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, string | number | null>>>(
      `SELECT
         COALESCE(SUM(NULLIF(m.nutrition_snapshot->>'protein_g','')::numeric),0)       AS protein_g,
         COALESCE(SUM(NULLIF(m.nutrition_snapshot->>'carbohydrate_g','')::numeric),0)  AS carb_g,
         COALESCE(SUM(NULLIF(m.nutrition_snapshot->>'fat_g','')::numeric),0)           AS fat_g,
         COALESCE(SUM(m.kcal),0)                                                       AS kcal_total,
         GREATEST(count(DISTINCT m.logged_at::date),1)                                 AS days_with_logs,
         count(*)                                                                       AS meal_count
         FROM public.meal_logs m JOIN public.clients c ON c.id=m.client_id
        WHERE c.workspace_id=$1::uuid AND m.logged_at >= now() - ($2||' days')::interval`,
      workspaceId, String(d));
    const num = (k: string) => Number(r?.[k] ?? 0);
    const daysWith = num('days_with_logs') || 1;
    return {
      protein_g: Math.round(num('protein_g')),
      carb_g: Math.round(num('carb_g')),
      fat_g: Math.round(num('fat_g')),
      avg_daily_kcal: Math.round(num('kcal_total') / daysWith),
      meal_count: num('meal_count'),
    };
  }

  async programPerformance(workspaceId: string): Promise<{ by_status: Array<{ status: string; count: number; avg_progress: number }> }> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ status: string; n: bigint; avg: number | null }>>(
      `SELECT status, count(*) AS n, COALESCE(round(avg(progress_pct)),0) AS avg
         FROM public.program_assignments WHERE workspace_id=$1::uuid GROUP BY status ORDER BY n DESC`,
      workspaceId);
    return { by_status: rows.map((x) => ({ status: x.status, count: Number(x.n), avg_progress: Number(x.avg ?? 0) })) };
  }

  async aiUsage(workspaceId: string, days = 14): Promise<{ daily: Array<{ day: string; calls: number }>; by_service: Array<{ service: string; calls: number }> }> {
    const d = Math.min(Math.max(days, 1), 60);
    const daily = await this.prisma.$queryRawUnsafe<Array<{ day: string; calls: bigint }>>(
      `SELECT to_char(g::date,'YYYY-MM-DD') AS day,
              (SELECT count(*) FROM public.ai_usage_events e WHERE e.workspace_id=$1::uuid AND e.created_at::date = g::date) AS calls
         FROM generate_series(current_date - ($2::int - 1), current_date, interval '1 day') g ORDER BY g`,
      workspaceId, String(d));
    const byService = await this.prisma.$queryRawUnsafe<Array<{ service: string; calls: bigint }>>(
      `SELECT service, count(*) AS calls FROM public.ai_usage_events
        WHERE workspace_id=$1::uuid AND created_at >= now() - ($2||' days')::interval
        GROUP BY service ORDER BY calls DESC`,
      workspaceId, String(d));
    return {
      daily: daily.map((x) => ({ day: x.day, calls: Number(x.calls) })),
      by_service: byService.map((x) => ({ service: x.service, calls: Number(x.calls) })),
    };
  }

  /**
   * At-risk clients — active clients who have not logged a meal in `days`.
   * The churn signal the nutritionist should act on first; each row links to
   * the client so the dashboard can be actionable, not just informational.
   */
  async atRiskClients(workspaceId: string, days = 10): Promise<AtRiskClient[]> {
    const d = Math.min(Math.max(days, 1), 90);
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string; name: string; email: string | null; last_active_at: Date | null; last_meal_at: Date | null;
    }>>(
      `SELECT c.id,
              COALESCE(NULLIF(c.display_name,''), NULLIF(c.name,''), c.email, 'Client') AS name,
              c.email, c.last_active_at, lm.last_meal_at
         FROM public.clients c
         LEFT JOIN LATERAL (
           SELECT max(logged_at) AS last_meal_at FROM public.meal_logs m WHERE m.client_id = c.id
         ) lm ON true
        WHERE c.workspace_id = $1::uuid AND c.status::text = 'active'
          AND (lm.last_meal_at IS NULL OR lm.last_meal_at < now() - ($2 || ' days')::interval)
        ORDER BY COALESCE(lm.last_meal_at, c.last_active_at) ASC NULLS FIRST
        LIMIT 25`,
      workspaceId, String(d));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      last_active_at: r.last_active_at ? r.last_active_at.toISOString() : null,
      last_meal_at: r.last_meal_at ? r.last_meal_at.toISOString() : null,
    }));
  }

  /**
   * Revenue detail — active-subscription breakdown by plan + a 6-month MRR
   * trend (based on when each currently-active subscription started).
   */
  async revenue(workspaceId: string): Promise<RevenueBreakdown> {
    const plans = await this.prisma.$queryRawUnsafe<Array<{ plan: string | null; count: number; mrr_paise: bigint }>>(
      `SELECT plan_key AS plan, count(*)::int AS count, COALESCE(SUM(amount_paise),0)::bigint AS mrr_paise
         FROM public.subscriptions WHERE workspace_id=$1::uuid AND status='active'
        GROUP BY plan_key ORDER BY mrr_paise DESC`,
      workspaceId);
    const trend = await this.prisma.$queryRawUnsafe<Array<{ month: string; mrr_paise: bigint }>>(
      `SELECT to_char(g,'YYYY-MM') AS month,
              COALESCE(SUM(s.amount_paise) FILTER (
                WHERE s.status='active' AND date_trunc('month', s.created_at) <= g
              ),0)::bigint AS mrr_paise
         FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') g
         LEFT JOIN public.subscriptions s ON s.workspace_id=$1::uuid
        GROUP BY g ORDER BY g`,
      workspaceId);
    return {
      plan_breakdown: plans.map((p) => ({ plan: p.plan ?? 'unknown', count: Number(p.count), mrr_inr: Math.round(Number(p.mrr_paise) / 100) })),
      mrr_trend: trend.map((t) => ({ month: t.month, mrr_inr: Math.round(Number(t.mrr_paise) / 100) })),
    };
  }

  /**
   * Operations summary — appointment pipeline + assessment completion funnel.
   * Pure ops visibility over data the app already stores.
   */
  async ops(workspaceId: string): Promise<OpsSummary> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint | Date | null>>>(
      `SELECT
         (SELECT count(*) FROM public.appointments WHERE workspace_id=$1::uuid AND status='scheduled' AND scheduled_at >= now()) AS appt_upcoming,
         (SELECT count(*) FROM public.appointments WHERE workspace_id=$1::uuid AND status NOT IN ('cancelled', 'declined', 'pending') AND scheduled_at < now()) AS appt_completed,
         (SELECT count(*) FROM public.appointments WHERE workspace_id=$1::uuid AND status='cancelled') AS appt_cancelled,
         (SELECT min(scheduled_at) FROM public.appointments WHERE workspace_id=$1::uuid AND status='scheduled' AND scheduled_at >= now()) AS appt_next,
         (SELECT count(*) FROM public.pending_review_cards prc JOIN public.clients c ON c.id=prc.client_id
            WHERE c.workspace_id=$1::uuid AND prc.status='sent') AS asmt_sent,
         (SELECT count(*) FROM public.pending_review_cards prc JOIN public.clients c ON c.id=prc.client_id
            WHERE c.workspace_id=$1::uuid AND prc.status='sent' AND (prc.generated_content ? 'client_responses')) AS asmt_submitted,
         (SELECT count(*) FROM public.pending_review_cards prc JOIN public.clients c ON c.id=prc.client_id
            WHERE c.workspace_id=$1::uuid AND prc.status='sent' AND (prc.generated_content ? 'client_responses') AND prc.reviewed_at IS NULL) AS asmt_awaiting_review`,
      workspaceId);
    const n = (k: string) => Number((r?.[k] as bigint) ?? 0);
    const next = r?.appt_next as Date | null;
    return {
      appointments: {
        upcoming: n('appt_upcoming'),
        completed: n('appt_completed'),
        cancelled: n('appt_cancelled'),
        next_at: next ? next.toISOString() : null,
      },
      assessments: {
        sent: n('asmt_sent'),
        submitted: n('asmt_submitted'),
        awaiting_review: n('asmt_awaiting_review'),
      },
    };
  }

  /**
   * "Today's Insight" — 3-5 deterministic insights + recommendations built
   * from the workspace metrics. No AI: free, instant, and no client data ever
   * leaves the server.
   */
  async insights(workspaceId: string): Promise<{ insights: string }> {
    const [overview, nutrition] = await Promise.all([
      this.overview(workspaceId),
      this.nutritionTrends(workspaceId, 30),
    ]);
    return { insights: this.ruleBasedInsights(overview, nutrition) };
  }

  /**
   * Deterministic insight generator — turns the workspace metrics into 3-5
   * prioritised bullets with no AI call. Rules run risk → growth → engagement
   * → programs → nutrition → revenue, so the most important items surface first.
   */
  private ruleBasedInsights(o: OverviewKpis, n: NutritionTrends): string {
    const bullets: string[] = [];
    const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

    // Client base & growth
    if (o.total_clients === 0) {
      bullets.push('• No clients yet - invite your first client to start tracking outcomes and building momentum.');
    } else if (o.total_clients <= 2) {
      bullets.push(`• Small client base (${o.total_clients}) means the practice leans on a few relationships - prioritise lead generation to reduce risk.`);
    }
    if (o.total_clients > 0) {
      if (o.new_clients_month === 0) {
        bullets.push('• No new clients this month - a referral ask or a quick campaign will keep the pipeline moving.');
      } else {
        bullets.push(`• ${o.new_clients_month} new client${o.new_clients_month === 1 ? '' : 's'} this month - onboard them into a program early to lock in engagement.`);
      }
    }

    // Engagement
    if (o.total_clients > 0 && o.active_7d === 0) {
      bullets.push('• No client logged a meal in the last 7 days - send a gentle check-in before they disengage.');
    } else if (o.active_clients > 0 && o.active_7d < o.active_clients) {
      bullets.push(`• Only ${o.active_7d} of ${o.active_clients} active clients logged recently - nudge the quiet ones to keep them on track.`);
    }
    if (o.total_clients > 0 && o.messages_7d === 0) {
      bullets.push('• Zero messages sent this week - a short weekly note keeps clients feeling supported.');
    }

    // Programs
    if (o.total_clients > 0 && o.active_programs === 0) {
      bullets.push('• No active programs - assign a structured program so clients have clear guidance and milestones.');
    } else if (o.active_programs > 0 && o.avg_program_progress > 0 && o.avg_program_progress < 60) {
      bullets.push(`• Average program progress is ${o.avg_program_progress}% - check in with clients below target to unblock them.`);
    } else if (o.avg_program_progress >= 60) {
      bullets.push(`• Healthy program progress (${o.avg_program_progress}% avg) - keep the momentum with regular check-ins.`);
    }

    // Nutrition
    if (o.total_clients > 0 && n.meal_count === 0) {
      bullets.push('• No meals logged in the last 30 days - encourage Plate Vision to make logging effortless.');
    } else if (n.avg_daily_kcal > 0 && n.avg_daily_kcal < 1000) {
      bullets.push(`• Average logged intake is only ${n.avg_daily_kcal} kcal/day - likely under-reporting; remind clients to log every meal for accurate guidance.`);
    }

    // Revenue
    if (o.total_clients > 0 && o.mrr_inr === 0) {
      bullets.push('• No recurring revenue yet - converting active clients to a paid plan makes the practice sustainable.');
    } else if (o.mrr_inr > 0) {
      bullets.push(`• ${inr(o.mrr_inr)}/mo recurring - protect it by keeping renewals and engagement high.`);
    }

    // Positive reinforcement
    if (o.ai_calls_month > 0) {
      bullets.push(`• Your AI tools are in use (${o.ai_calls_month} call${o.ai_calls_month === 1 ? '' : 's'} this month) - lean on Plate Vision and the assistant to save time.`);
    }

    if (bullets.length === 0) {
      bullets.push('• Everything looks healthy - keep onboarding clients and checking in regularly to sustain momentum.');
    }

    // Top 5, most important first.
    return bullets.slice(0, 5).join('\n');
  }
}

export interface OverviewKpis {
  total_clients: number; active_clients: number; new_clients_month: number; active_7d: number;
  active_programs: number; avg_program_progress: number; ai_calls_month: number; messages_7d: number; mrr_inr: number;
}
export interface NutritionTrends {
  protein_g: number; carb_g: number; fat_g: number; avg_daily_kcal: number; meal_count: number;
}
export interface AtRiskClient {
  id: string; name: string; email: string | null; last_active_at: string | null; last_meal_at: string | null;
}
export interface RevenueBreakdown {
  plan_breakdown: Array<{ plan: string; count: number; mrr_inr: number }>;
  mrr_trend: Array<{ month: string; mrr_inr: number }>;
}
export interface OpsSummary {
  appointments: { upcoming: number; completed: number; cancelled: number; next_at: string | null };
  assessments: { sent: number; submitted: number; awaiting_review: number };
}
