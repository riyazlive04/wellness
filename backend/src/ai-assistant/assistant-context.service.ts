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
    await Promise.all([
    this.safe('workspaces', async () => {
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
    }),
    this.safe('platform_people', async () => {
      const [c] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE status::text = 'active') AS active
           FROM public.clients`,
      );
      data.clients_platform = { total: num(c?.total), active: num(c?.active) };

      const [m] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
        `SELECT count(*) AS total,
                count(DISTINCT user_id) AS people
           FROM public.workspace_members`,
      );
      const roles = await this.prisma.$queryRawUnsafe<Array<{ role: string; n: bigint }>>(
        `SELECT role::text AS role, count(*) AS n
           FROM public.workspace_members GROUP BY role ORDER BY n DESC`,
      );
      data.staff = {
        memberships: num(m?.total),
        people: num(m?.people),
        by_role: Object.fromEntries(roles.map((r) => [r.role, num(r.n)])),
      };
    }),
    // Ranking one workspace against another is the one comparison a super
    // admin can legitimately ask for, so the data is loaded rather than the
    // question refused.
    this.safe('top_workspaces', async () => {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ name: string; clients: bigint }>>(
        `SELECT w.name, count(c.id) AS clients
           FROM public.workspaces w
           LEFT JOIN public.clients c ON c.workspace_id = w.id
          GROUP BY w.id, w.name
          ORDER BY clients DESC, w.name
          LIMIT 5`,
      );
      data.top_workspaces = rows.map((r) => ({ name: r.name, clients: num(r.clients) }));
    }),
    this.safe('revenue', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
        `SELECT COALESCE(SUM(amount_paise) FILTER (WHERE status='captured' AND captured_at >= now()-interval '30 days'),0) AS rev_30d,
                count(*) FILTER (WHERE status='failed' AND COALESCE(failed_at,created_at) >= now()-interval '30 days') AS failed_30d
           FROM public.payments`,
      );
      data.revenue = { last_30d_inr: paiseToInr(r?.rev_30d), failed_payments_30d: num(r?.failed_30d) };
    }),
    this.safe('subscriptions', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
        `SELECT COALESCE(SUM(amount_paise),0) AS mrr, count(*) AS active_subs,
                count(*) FILTER (WHERE status IN ('halted','pending')) AS past_due
           FROM public.subscriptions WHERE status IN ('active','halted','pending')`,
      );
      data.subscriptions = { mrr_inr: paiseToInr(r?.mrr), active: num(r?.active_subs), past_due: num(r?.past_due) };
    }),
    this.safe('ai_usage', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
        `SELECT count(*) AS calls_24h, COALESCE(SUM(cost_micro_inr),0) AS cost_micro_24h,
                count(*) FILTER (WHERE status='error') AS errors_24h
           FROM public.ai_usage_events WHERE created_at >= now()-interval '24 hours'`,
      );
      data.ai_usage_24h = {
        calls: num(r?.calls_24h), errors: num(r?.errors_24h),
        cost_inr: Math.round((num(r?.cost_micro_24h) / 1_000_000) * 100) / 100,
      };
    }),
    ]);
    return { type: 'executive', data, promptText: jsonText('Platform snapshot', data) };
  }

  // ── Clinical (workspace) ──────────────────────────────────────────
  private async clinical(workspaceId: string | null): Promise<AssistantContext> {
    const data: Record<string, unknown> = {};
    if (!workspaceId) return { type: 'clinical', data, promptText: 'No workspace in context.' };

    // Run the sections concurrently — they're independent, so this collapses
    // ~6 sequential DB round-trips into one wait.
    await Promise.all([
    this.safe('appointments_today', async () => {
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
      // Counted separately from the list, which is capped. Reporting the
      // list's length as the total is right until a day has nine appointments.
      const [t] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM public.appointments
          WHERE workspace_id = $1::uuid AND scheduled_at::date = now()::date
            AND status = 'scheduled'`,
        workspaceId,
      );
      data.appointments_today_count = num(t?.n);
    }),
    this.safe('clients', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ active: bigint; onboarding: bigint }>>(
        `SELECT count(*) FILTER (WHERE status::text = 'active') AS active,
                count(*) FILTER (WHERE onboarded_at IS NULL) AS onboarding
           FROM public.clients WHERE workspace_id = $1::uuid`,
        workspaceId,
      );
      data.clients = { active: num(r?.active), onboarding: num(r?.onboarding) };
    }),
    this.safe('inactive_clients', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM public.clients c
          WHERE c.workspace_id = $1::uuid AND c.status::text = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM public.meal_logs m
               WHERE m.client_id = c.id AND m.logged_at >= now() - interval '3 days')`,
        workspaceId,
      );
      data.clients_no_logs_3d = num(r?.n);
    }),
    this.safe('attention_clients', async () => {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ name: string | null; last_log: Date | null; days: number | null }>>(
        `SELECT c.name,
                max(m.logged_at) AS last_log,
                EXTRACT(day FROM now() - max(m.logged_at))::int AS days
           FROM public.clients c
           LEFT JOIN public.meal_logs m ON m.client_id = c.id
          WHERE c.workspace_id = $1::uuid AND c.status::text = 'active'
          GROUP BY c.id, c.name
         HAVING max(m.logged_at) IS NULL OR max(m.logged_at) < now() - interval '3 days'
          ORDER BY max(m.logged_at) ASC NULLS FIRST
          LIMIT 10`,
        workspaceId,
      );
      data.clients_needing_attention = rows.map((r) => ({
        client: r.name,
        last_logged: r.last_log,
        days_since_last_log: r.last_log ? r.days : 'never logged',
      }));
      // The list stops at ten; the count must not.
      const [t] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM public.clients c
          WHERE c.workspace_id = $1::uuid AND c.status::text = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM public.meal_logs m
               WHERE m.client_id = c.id AND m.logged_at >= now() - interval '3 days')`,
        workspaceId,
      );
      data.clients_needing_attention_total = num(t?.n);
    }),
    this.safe('pending_reviews', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM public.pending_review_cards
          WHERE workspace_id = $1::uuid AND status = 'pending'`,
        workspaceId,
      );
      data.pending_reviews = num(r?.n);
    }),
    this.safe('programs', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ total: bigint; published: bigint; draft: bigint }>>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE status = 'published') AS published,
                count(*) FILTER (WHERE status = 'draft') AS draft
           FROM public.weekly_plans WHERE workspace_id = $1::uuid`,
        workspaceId,
      );
      data.programs = { total: num(r?.total), published: num(r?.published), draft: num(r?.draft) };
    }),
    this.safe('recipes', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM public.workspace_recipes WHERE workspace_id = $1::uuid AND is_published = true`,
        workspaceId,
      );
      data.recipes_published = num(r?.n);
    }),
    ]);
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

    await Promise.all([
    this.safe('today_meals', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ cnt: bigint; kcal: bigint }>>(
        `SELECT count(*) AS cnt, COALESCE(SUM(kcal),0) AS kcal
           FROM public.meal_logs WHERE client_id = $1::uuid AND logged_at::date = now()::date`,
        clientId,
      );
      data.today = { meals_logged: num(r?.cnt), kcal_logged: num(r?.kcal) };
    }),
    this.safe('compliance', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ overall_compliance: number | null; week_start: Date }>>(
        `SELECT overall_compliance, week_start FROM public.meal_compliance
          WHERE client_id = $1::uuid ORDER BY week_start DESC LIMIT 1`,
        clientId,
      );
      if (r) data.latest_week_compliance = r.overall_compliance;
    }),
    this.safe('next_appointment', async () => {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ scheduled_at: Date; kind: string | null; mode: string | null }>>(
        `SELECT scheduled_at, kind, mode FROM public.appointments
          WHERE client_id = $1::uuid AND scheduled_at >= now() AND status = 'scheduled'
          ORDER BY scheduled_at LIMIT 1`,
        clientId,
      );
      if (r) data.next_appointment = { at: r.scheduled_at, kind: r.kind, mode: r.mode };
    }),
    ]);
    return { type: 'wellness', data, promptText: jsonText('Your day so far', data) };
  }

  private async safe(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`context section "${label}" failed: ${(err as Error).message}`);
    }
  }

  /**
   * Detail for whichever clients the question actually names.
   *
   * The standing snapshot is deliberately aggregate - it cannot carry every
   * client's history, and most questions do not need it. But "how is Priya
   * doing?" is unanswerable without her record, so the client is resolved from
   * the question text and only that client's detail is loaded.
   *
   * Returns null when no name matches, which is the common case: the caller
   * then falls back to the snapshot alone.
   */
  async clientFocus(workspaceId: string | null, question: string): Promise<string | null> {
    if (!workspaceId || !question?.trim()) return null;

    const roster = await this.candidateClients(workspaceId, question);
    const matches = matchClients(roster, question);
    if (!matches.length) return null;

    const blocks = await Promise.all(
      matches.map(async (m) => jsonText(`Client "${m.name}"`, await this.oneClient(m.id))),
    );
    const text = blocks.filter(Boolean).join('\n');
    return text || null;
  }

  /**
   * The same records as clientFocus, handed back as data.
   *
   * clientFocus serializes for a prompt; this returns the fields, because the
   * deterministic answer builder does its own formatting and cannot read a
   * JSON blob back out of a string.
   */
  async clientData(
    workspaceId: string | null,
    question: string,
  ): Promise<Array<{ name: string; data: Record<string, unknown> }>> {
    if (!workspaceId || !question?.trim()) return [];
    const roster = await this.candidateClients(workspaceId, question);
    const matches = matchClients(roster, question);
    return Promise.all(
      matches.map(async (m) => ({ name: m.name, data: await this.oneClient(m.id) })),
    );
  }

  /**
   * Clients the question could plausibly be naming.
   *
   * Loading the whole roster to match names in memory is fine at two clients
   * and wasteful at two thousand, so the obvious non-matches are discarded in
   * SQL first. The precise word-boundary rules still run afterwards on what
   * comes back - this only narrows the candidates, it does not decide them.
   */
  private async candidateClients(
    workspaceId: string,
    question: string,
  ): Promise<Array<{ id: string; name: string | null }>> {
    const flat = question.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const words = Array.from(new Set(flat.split(' ').filter((w) => w.length >= 3)));
    if (!words.length) return [];
    return this.prisma.$queryRawUnsafe<Array<{ id: string; name: string | null }>>(
      `SELECT id, name FROM public.clients
        WHERE workspace_id = $1::uuid AND name IS NOT NULL
          AND (lower(split_part(name, ' ', 1)) = ANY($2::text[])
               OR lower(name) = ANY($2::text[])
               OR position(lower(name) IN $3) > 0)
        LIMIT 25`,
      workspaceId, words, flat,
    );
  }

  /** Every section is independently guarded: one missing table must not cost the whole answer. */
  private async oneClient(clientId: string): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};

    await Promise.all([
      this.safe('client_profile', async () => {
        const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT age, gender::text AS gender, goals, target_kcal, height_cm,
                  last_weight, status::text AS status, allergies, medical_conditions,
                  activity_level, onboarded_at, last_active_at
             FROM public.clients WHERE id = $1::uuid`,
          clientId,
        );
        if (r) data.profile = r;
      }),

      // Adherence is the real question behind most "how is X doing" asks, so
      // this counts days-with-a-log out of 14 rather than raw meals - twenty
      // meals across two days is not the same as logging every day.
      this.safe('client_logging', async () => {
        const [r] = await this.prisma.$queryRawUnsafe<Array<{ days: bigint; meals: bigint; avg_kcal: number | null }>>(
          `SELECT count(DISTINCT logged_at::date) AS days,
                  count(*) AS meals,
                  round(avg(NULLIF(kcal, 0)))::int AS avg_kcal
             FROM public.meal_logs
            WHERE client_id = $1::uuid AND logged_at >= now() - interval '14 days'`,
          clientId,
        );
        const [last] = await this.prisma.$queryRawUnsafe<Array<{ last_log: Date | null }>>(
          `SELECT max(logged_at) AS last_log FROM public.meal_logs WHERE client_id = $1::uuid`,
          clientId,
        );
        data.logging_14d = {
          days_logged_of_14: num(r?.days),
          meals: num(r?.meals),
          avg_kcal_per_logged_meal: r?.avg_kcal ?? null,
          last_log_ever: last?.last_log ?? null,
        };
      }),

      this.safe('client_program', async () => {
        data.programs = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT name, status, progress_pct, start_date, end_date,
                  duration_weeks AS duration_count, duration_unit
             FROM public.program_assignments
            WHERE client_id = $1::uuid
            ORDER BY (status = 'active') DESC, start_date DESC LIMIT 2`,
          clientId,
        );
      }),

      // Two points, so the model can state a direction instead of a bare number.
      this.safe('client_measurements', async () => {
        const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT recorded_at, waist_inches, hip_inches, chest_inches, arm_inches, thigh_inches
             FROM public.client_measurements
            WHERE client_id = $1::uuid
            ORDER BY recorded_at DESC LIMIT 2`,
          clientId,
        );
        if (rows.length) data.measurements_latest_two = rows;
      }),

      this.safe('client_appointments', async () => {
        data.appointments_nearest = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT scheduled_at, kind, mode, status
             FROM public.appointments
            WHERE client_id = $1::uuid
            ORDER BY abs(EXTRACT(epoch FROM scheduled_at - now())) ASC LIMIT 3`,
          clientId,
        );
      }),

      this.safe('client_reviews', async () => {
        const [r] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*) AS n FROM public.pending_review_cards
            WHERE client_id = $1::uuid AND status = 'pending'`,
          clientId,
        );
        data.pending_reviews = num(r?.n);
      }),
    ]);

    return data;
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

/**
 * Resolve client names out of a free-text question.
 *
 * Matching lives here rather than in SQL so the rules stay legible and no user
 * text is ever interpolated into a pattern. A full name beats a first name, and
 * first names under three characters are ignored - short tokens collide with
 * ordinary words too easily to be worth the false match.
 */
function matchClients(
  roster: Array<{ id: string; name: string | null }>,
  question: string,
): Array<{ id: string; name: string }> {
  const flatten = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const q = ' ' + flatten(question) + ' ';
  const full: Array<{ id: string; name: string }> = [];
  const first: Array<{ id: string; name: string }> = [];

  for (const c of roster) {
    const name = (c.name ?? '').trim();
    if (!name) continue;
    const flat = flatten(name);
    if (!flat) continue;

    if (q.includes(' ' + flat + ' ')) {
      full.push({ id: c.id, name });
      continue;
    }
    const one = flat.split(' ')[0];
    if (one.length >= 3 && q.includes(' ' + one + ' ')) first.push({ id: c.id, name });
  }

  // Capped: a question naming half the roster would crowd out the passages.
  return [...full, ...first].slice(0, 3);
}
