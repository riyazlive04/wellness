import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AssistantGeminiService } from '../ai-assistant/assistant-gemini.service';

/**
 * AnalyticsService — Module 10 Reports & Analytics Engine (workspace scope).
 * Consolidates client growth, engagement, nutrition trends, program performance,
 * AI usage and revenue into one BI surface, plus an AI insight narrative. The
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
    private readonly gemini: AssistantGeminiService,
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
          AND created_at >= date_trunc('month', now()) - (($2 - 1)||' months')::interval
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
         FROM generate_series(current_date - ($2 - 1), current_date, interval '1 day') g
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
         FROM generate_series(current_date - ($2 - 1), current_date, interval '1 day') g ORDER BY g`,
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

  /** AI narrative: turn the metrics into 3-5 insights + recommendations. */
  async insights(workspaceId: string): Promise<{ insights: string }> {
    const [overview, growth, nutrition, programs] = await Promise.all([
      this.overview(workspaceId),
      this.clientGrowth(workspaceId, 6),
      this.nutritionTrends(workspaceId, 30),
      this.programPerformance(workspaceId),
    ]);
    const text = await this.gemini.summarize({
      assistantType: 'clinical',
      systemPrompt:
        'You are a practice-analytics advisor for a nutrition clinic. Given these workspace metrics, write 3-5 short, specific insights and recommendations to grow the practice and improve client outcomes. Call out trends, risks, and opportunities. Plain text, one insight per line starting with "•".',
      prompt: JSON.stringify({ overview, client_growth: growth, nutrition_30d: nutrition, programs }),
      workspaceId,
      fallback:
        '• Keep onboarding momentum — follow up with clients who haven’t logged a meal in 7 days.\n• Nudge clients on active programs below 60% progress with a quick check-in.\n• Your AI tools are in use — lean on Plate Vision to lift logging consistency.',
    });
    return { insights: text };
  }
}

export interface OverviewKpis {
  total_clients: number; active_clients: number; new_clients_month: number; active_7d: number;
  active_programs: number; avg_program_progress: number; ai_calls_month: number; messages_7d: number; mrr_inr: number;
}
export interface NutritionTrends {
  protein_g: number; carb_g: number; fat_g: number; avg_daily_kcal: number; meal_count: number;
}
