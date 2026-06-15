import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type { AssistantType } from './assistant.types';

/**
 * AssistantContextService — gathers the role-scoped facts an assistant reasons
 * over (Module 6 — AI Context Management). Each assistant only ever sees data
 * within its permission boundary:
 *   executive → platform-wide aggregates (super admin)
 *   clinical  → the caller's workspace operations
 *   wellness  → the caller's own client record
 *
 * Every sub-query is wrapped so a single failure degrades to a null section
 * rather than breaking the whole brief/chat — the assistant simply has less to
 * work with, never an error.
 */
@Injectable()
export class AssistantContextService {
  private readonly logger = new Logger(AssistantContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  async build(user: AuthUser, type: AssistantType): Promise<AssistantContext> {
    switch (type) {
      case 'executive':
        return this.executive();
      case 'clinical':
        return this.clinical(user.workspaceId);
      case 'wellness':
        return this.wellness(user.id);
    }
  }

  // ── Executive (platform) ──────────────────────────────────────────
  private async executive(): Promise<AssistantContext> {
    const data: Record<string, unknown> = {};
    await this.safe('workspaces', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE status = 'active') AS active,
                count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS new_7d,
                count(*) FILTER (WHERE plan = 'trial' AND trial_ends_at BETWEEN now() AND now() + interval '7 days') AS trials_expiring_7d
           FROM public.workspaces`,
      );
      data.workspaces = {
        total: num(r?.total), active: num(r?.active),
        new_last_7d: num(r?.new_7d), trials_expiring_7d: num(r?.trials_expiring_7d),
      };
    });
    await this.safe('revenue', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
        `SELECT COALESCE(SUM(amount_paise) FILTER (WHERE status='captured' AND captured_at >= now()-interval '30 days'),0) AS rev_30d,
                count(*) FILTER (WHERE status='failed' AND COALESCE(failed_at,created_at) >= now()-interval '30 days') AS failed_30d
           FROM public.payments`,
      );
      data.revenue = { last_30d_inr: paiseToInr(r?.rev_30d), failed_payments_30d: num(r?.failed_30d) };
    });
    await this.safe('subscriptions', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
        `SELECT COALESCE(SUM(amount_paise),0) AS mrr, count(*) AS active_subs,
                count(*) FILTER (WHERE status IN ('halted','pending')) AS past_due
           FROM public.subscriptions WHERE status IN ('active','halted','pending')`,
      );
      data.subscriptions = { mrr_inr: paiseToInr(r?.mrr), active: num(r?.active_subs), past_due: num(r?.past_due) };
    });
    await this.safe('ai_usage', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
        `SELECT count(*) AS calls_24h, COALESCE(SUM(cost_micro_inr),0) AS cost_micro_24h,
                count(*) FILTER (WHERE status='error') AS errors_24h
           FROM public.ai_usage_events WHERE created_at >= now()-interval '24 hours'`,
      );
      data.ai_usage_24h = {
        calls: num(r?.calls_24h), errors: num(r?.errors_24h),
        cost_inr: Math.round((num(r?.cost_micro_24h) / 1_000_000) * 100) / 100,
      };
    });
    return { type: 'executive', data, promptText: jsonText('Platform snapshot', data) };
  }

  // ── Clinical (workspace) ──────────────────────────────────────────
  private async clinical(workspaceId: string | null): Promise<AssistantContext> {
    const data: Record<string, unknown> = {};
    if (!workspaceId) return { type: 'clinical', data, promptText: 'No workspace in context.' };

    await this.safe('appointments_today', async () => {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ scheduled_at: Date; kind: string | null; mode: string | null; name: string | null }>>(
        `SELECT a.scheduled_at, a.kind, a.mode, c.name
           FROM public.appointments a
           LEFT JOIN public.clients c ON c.id = a.client_id
          WHERE a.workspace_id = $1::uuid
            AND a.scheduled_at::date = now()::date
            AND a.status = 'scheduled'
          ORDER BY a.scheduled_at LIMIT 8`,
        workspaceId,
      );
      data.appointments_today = rows.map((r) => ({
        at: r.scheduled_at, client: r.name, kind: r.kind, mode: r.mode,
      }));
      data.appointments_today_count = rows.length;
    });
    await this.safe('clients', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ active: bigint; onboarding: bigint }>>(
        `SELECT count(*) FILTER (WHERE status::text = 'active') AS active,
                count(*) FILTER (WHERE onboarded_at IS NULL) AS onboarding
           FROM public.clients WHERE workspace_id = $1::uuid`,
        workspaceId,
      );
      data.clients = { active: num(r?.active), onboarding: num(r?.onboarding) };
    });
    await this.safe('inactive_clients', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM public.clients c
          WHERE c.workspace_id = $1::uuid AND c.status::text = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM public.meal_logs m
               WHERE m.client_id = c.id AND m.logged_at >= now() - interval '3 days')`,
        workspaceId,
      );
      data.clients_no_logs_3d = num(r?.n);
    });
    await this.safe('pending_reviews', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM public.pending_review_cards
          WHERE workspace_id = $1::uuid AND status = 'pending'`,
        workspaceId,
      );
      data.pending_reviews = num(r?.n);
    });
    await this.safe('programs', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ total: bigint; published: bigint; draft: bigint }>>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE status = 'published') AS published,
                count(*) FILTER (WHERE status = 'draft') AS draft
           FROM public.weekly_plans WHERE workspace_id = $1::uuid`,
        workspaceId,
      );
      data.programs = { total: num(r?.total), published: num(r?.published), draft: num(r?.draft) };
    });
    await this.safe('recipes', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM public.workspace_recipes WHERE workspace_id = $1::uuid AND is_published = true`,
        workspaceId,
      );
      data.recipes_published = num(r?.n);
    });
    return { type: 'clinical', data, promptText: jsonText('Workspace operations today', data) };
  }

  // ── Wellness (client) ─────────────────────────────────────────────
  private async wellness(userId: string): Promise<AssistantContext> {
    const data: Record<string, unknown> = {};
    let clientId: string | null = null;

    await this.safe('client', async () => {
      const [c] = await this.prisma.$queryRawUnsafe<Array<{ id: string; name: string | null; goals: string | null; target_kcal: number | null; activity_level: string | null }>>(
        `SELECT id, name, goals, target_kcal, activity_level
           FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
        userId,
      );
      if (c) {
        clientId = c.id;
        data.profile = { name: c.name, goals: c.goals, target_kcal: c.target_kcal, activity_level: c.activity_level };
      }
    });
    if (!clientId) return { type: 'wellness', data, promptText: 'No client profile found for this user yet.' };

    await this.safe('today_meals', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ cnt: bigint; kcal: bigint }>>(
        `SELECT count(*) AS cnt, COALESCE(SUM(kcal),0) AS kcal
           FROM public.meal_logs WHERE client_id = $1::uuid AND logged_at::date = now()::date`,
        clientId,
      );
      data.today = { meals_logged: num(r?.cnt), kcal_logged: num(r?.kcal) };
    });
    await this.safe('compliance', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ overall_compliance: number | null; week_start: Date }>>(
        `SELECT overall_compliance, week_start FROM public.meal_compliance
          WHERE client_id = $1::uuid ORDER BY week_start DESC LIMIT 1`,
        clientId,
      );
      if (r) data.latest_week_compliance = r.overall_compliance;
    });
    await this.safe('next_appointment', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ scheduled_at: Date; kind: string | null; mode: string | null }>>(
        `SELECT scheduled_at, kind, mode FROM public.appointments
          WHERE client_id = $1::uuid AND scheduled_at >= now() AND status = 'scheduled'
          ORDER BY scheduled_at LIMIT 1`,
        clientId,
      );
      if (r) data.next_appointment = { at: r.scheduled_at, kind: r.kind, mode: r.mode };
    });
    return { type: 'wellness', data, promptText: jsonText('Your day so far', data) };
  }

  private async safe(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`context section "${label}" failed: ${(err as Error).message}`);
    }
  }
}

export interface AssistantContext {
  type: AssistantType;
  data: Record<string, unknown>;
  /** Compact serialization handed to the model. */
  promptText: string;
}

function num(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'bigint' ? Number(v) : v;
}
function paiseToInr(v: bigint | number | null | undefined): number {
  return Math.round(num(v) / 100);
}
function jsonText(heading: string, data: Record<string, unknown>): string {
  return `${heading}:\n${JSON.stringify(data, null, 0)}`;
}
