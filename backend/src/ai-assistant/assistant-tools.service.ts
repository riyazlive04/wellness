import { Injectable, Logger } from '@nestjs/common';
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import { PrismaService } from '../database/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type { AssistantType } from './assistant.types';

/**
 * AssistantToolsService — the retrieval layer that makes the assistant able to
 * answer *any* question, not just a fixed snapshot (Module 6 — AI Action /
 * Context). Each assistant gets a set of read-only, role-scoped "tools" the
 * model can call via Gemini function-calling: the model decides which query it
 * needs, we run scoped SQL, feed the rows back, and it answers grounded in them.
 *
 * SECURITY: every tool is scoped to the caller — clinical tools filter by
 * workspace_id, wellness tools resolve the caller's own client row, executive
 * tools require super admin (enforced by resolveAssistantType upstream). Tools
 * never write.
 */
@Injectable()
export class AssistantToolsService {
  private readonly logger = new Logger(AssistantToolsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Function declarations for the model (what tools it may call). */
  declarations(type: AssistantType): FunctionDeclaration[] {
    return this.tools(type).map((t) => t.declaration);
  }

  /** Execute a tool the model asked for. Read-only + scoped; never throws to the loop. */
  async execute(
    user: AuthUser,
    type: AssistantType,
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const tool = this.tools(type).find((t) => t.declaration.name === name);
    if (!tool) return { error: `Unknown tool: ${name}` };
    try {
      return await tool.run(user, args);
    } catch (err) {
      this.logger.warn(`tool ${name} failed: ${(err as Error).message}`);
      return { error: (err as Error).message };
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Registry
  // ──────────────────────────────────────────────────────────────────
  private tools(type: AssistantType): ToolImpl[] {
    if (type === 'clinical') return this.clinicalTools();
    if (type === 'wellness') return this.wellnessTools();
    return this.executiveTools();
  }

  // ── Clinical (workspace-scoped) ───────────────────────────────────
  private clinicalTools(): ToolImpl[] {
    const ws = (u: AuthUser) => {
      if (!u.workspaceId) throw new Error('No workspace in context.');
      return u.workspaceId;
    };
    return [
      {
        declaration: decl('search_clients', 'Find clients in this workspace by name/email, or list recent ones.', {
          query: str('Name or email fragment to search for (optional).'),
          limit: int('Max rows (default 20).'),
        }),
        run: async (u, a) => this.prisma.$queryRawUnsafe(
          `SELECT id, name, email, goals, target_kcal, activity_level, status, onboarded_at
             FROM public.clients
            WHERE workspace_id = $1::uuid
              AND ($2::text IS NULL OR name ILIKE '%'||$2||'%' OR email ILIKE '%'||$2||'%')
            ORDER BY name LIMIT $3`,
          ws(u), strArg(a.query), limit(a.limit, 20, 50)),
      },
      {
        declaration: decl('get_client', 'Full detail for one client: profile, recent meals, latest compliance, plans, next appointment.', {
          client_id: str('The client id (uuid).'),
        }, ['client_id']),
        run: async (u, a) => {
          const wid = ws(u);
          const cid = String(a.client_id);
          const [profile] = await this.prisma.$queryRawUnsafe<unknown[]>(
            `SELECT id, name, email, goals, target_kcal, activity_level, allergies, medical_conditions, food_preferences, status
               FROM public.clients WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`, cid, wid);
          if (!profile) return { error: 'Client not found in your workspace.' };
          const meals = await this.prisma.$queryRawUnsafe(
            `SELECT meal_type, meal_name, kcal, logged_at FROM public.meal_logs
              WHERE client_id = $1::uuid ORDER BY logged_at DESC LIMIT 8`, cid);
          const [compliance] = await this.prisma.$queryRawUnsafe<unknown[]>(
            `SELECT overall_compliance, week_start FROM public.meal_compliance
              WHERE client_id = $1::uuid ORDER BY week_start DESC LIMIT 1`, cid);
          const plans = await this.prisma.$queryRawUnsafe(
            `SELECT week_number, status, total_kcal, start_date FROM public.weekly_plans
              WHERE client_id = $1::uuid ORDER BY start_date DESC LIMIT 5`, cid);
          const [nextAppt] = await this.prisma.$queryRawUnsafe<unknown[]>(
            `SELECT scheduled_at, kind, mode FROM public.appointments
              WHERE client_id = $1::uuid AND scheduled_at >= now() AND status='scheduled'
              ORDER BY scheduled_at LIMIT 1`, cid);
          return { profile, recent_meals: meals, latest_compliance: compliance ?? null, plans, next_appointment: nextAppt ?? null };
        },
      },
      {
        declaration: decl('list_programs', 'List weekly plans (a client\'s "program") in this workspace, optionally filtered by status.', {
          status: str("Filter: 'published' or 'draft' (optional)."),
          limit: int('Max rows (default 20).'),
        }),
        run: async (u, a) => this.prisma.$queryRawUnsafe(
          `SELECT wp.id, c.name AS client, wp.week_number, wp.status, wp.total_kcal, wp.start_date, wp.end_date
             FROM public.weekly_plans wp LEFT JOIN public.clients c ON c.id = wp.client_id
            WHERE wp.workspace_id = $1::uuid
              AND ($2::text IS NULL OR wp.status = $2)
            ORDER BY wp.start_date DESC LIMIT $3`,
          ws(u), strArg(a.status), limit(a.limit, 20, 50)),
      },
      {
        declaration: decl('list_appointments', 'List appointments in this workspace.', {
          when: str("'today', 'upcoming', or 'past' (default 'upcoming')."),
          limit: int('Max rows (default 20).'),
        }),
        run: async (u, a) => {
          const when = strArg(a.when) ?? 'upcoming';
          const filter = when === 'today' ? `a.scheduled_at::date = now()::date`
            : when === 'past' ? `a.scheduled_at < now()` : `a.scheduled_at >= now()`;
          return this.prisma.$queryRawUnsafe(
            `SELECT a.scheduled_at, a.kind, a.mode, a.status, c.name AS client
               FROM public.appointments a LEFT JOIN public.clients c ON c.id = a.client_id
              WHERE a.workspace_id = $1::uuid AND ${filter}
              ORDER BY a.scheduled_at ${when === 'past' ? 'DESC' : 'ASC'} LIMIT $2`,
            ws(u), limit(a.limit, 20, 50));
        },
      },
      {
        declaration: decl('list_recipes', 'Search the workspace recipe library.', {
          query: str('Name fragment (optional).'),
          limit: int('Max rows (default 20).'),
        }),
        run: async (u, a) => this.prisma.$queryRawUnsafe(
          `SELECT id, name, category, servings, is_published FROM public.workspace_recipes
            WHERE workspace_id = $1::uuid
              AND ($2::text IS NULL OR name ILIKE '%'||$2||'%')
            ORDER BY name LIMIT $3`,
          ws(u), strArg(a.query), limit(a.limit, 20, 50)),
      },
      {
        declaration: decl('workspace_stats', 'Aggregate counts for the workspace: clients, programs, recipes, appointments today.', {}),
        run: async (u) => {
          const wid = ws(u);
          const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
            `SELECT
               (SELECT count(*) FROM public.clients WHERE workspace_id=$1::uuid AND status::text='active') AS active_clients,
               (SELECT count(*) FROM public.weekly_plans WHERE workspace_id=$1::uuid) AS programs,
               (SELECT count(*) FROM public.weekly_plans WHERE workspace_id=$1::uuid AND status='published') AS programs_published,
               (SELECT count(*) FROM public.workspace_recipes WHERE workspace_id=$1::uuid AND is_published=true) AS recipes,
               (SELECT count(*) FROM public.appointments WHERE workspace_id=$1::uuid AND scheduled_at::date=now()::date AND status='scheduled') AS appts_today`,
            wid);
          return mapNums(r);
        },
      },
    ];
  }

  // ── Wellness (own client record) ──────────────────────────────────
  private wellnessTools(): ToolImpl[] {
    const myClient = async (u: AuthUser): Promise<string> => {
      const [c] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`, u.id);
      if (!c) throw new Error('No client profile for this user.');
      return c.id;
    };
    return [
      {
        declaration: decl('my_profile', 'My profile: goals, target calories, activity level, preferences.', {}),
        run: async (u) => {
          const [p] = await this.prisma.$queryRawUnsafe<unknown[]>(
            `SELECT name, goals, target_kcal, activity_level, allergies, food_preferences
               FROM public.clients WHERE user_id = $1::uuid LIMIT 1`, u.id);
          return p ?? { error: 'No profile yet.' };
        },
      },
      {
        declaration: decl('my_meals', 'My logged meals for a day (default today).', {
          date: str("Date YYYY-MM-DD (optional, default today)."),
        }),
        run: async (u, a) => {
          const cid = await myClient(u);
          const date = strArg(a.date);
          return this.prisma.$queryRawUnsafe(
            `SELECT meal_type, meal_name, kcal, logged_at FROM public.meal_logs
              WHERE client_id = $1::uuid AND logged_at::date = COALESCE($2::date, now()::date)
              ORDER BY logged_at`, cid, date);
        },
      },
      {
        declaration: decl('my_progress', 'My recent weekly compliance history.', {}),
        run: async (u) => {
          const cid = await myClient(u);
          return this.prisma.$queryRawUnsafe(
            `SELECT week_start, overall_compliance, photo_compliance, calorie_accuracy
               FROM public.meal_compliance WHERE client_id = $1::uuid
              ORDER BY week_start DESC LIMIT 8`, cid);
        },
      },
      {
        declaration: decl('my_program', 'My current weekly plan (program).', {}),
        run: async (u) => {
          const cid = await myClient(u);
          return this.prisma.$queryRawUnsafe(
            `SELECT week_number, status, total_kcal, start_date, end_date FROM public.weekly_plans
              WHERE client_id = $1::uuid ORDER BY start_date DESC LIMIT 3`, cid);
        },
      },
      {
        declaration: decl('my_appointments', 'My upcoming appointments.', {}),
        run: async (u) => {
          const cid = await myClient(u);
          return this.prisma.$queryRawUnsafe(
            `SELECT scheduled_at, kind, mode, status FROM public.appointments
              WHERE client_id = $1::uuid AND scheduled_at >= now() AND status='scheduled'
              ORDER BY scheduled_at LIMIT 5`, cid);
        },
      },
      {
        declaration: decl('my_goals', 'My wellness goals and their progress.', {}),
        run: async (u) => {
          const cid = await myClient(u);
          return this.prisma.$queryRawUnsafe(
            `SELECT title, category, status, current_value, target_value, unit, target_date
               FROM public.wellness_goals WHERE client_id = $1::uuid
              ORDER BY (status='active') DESC, created_at DESC LIMIT 50`, cid);
        },
      },
      {
        declaration: decl('my_habits', 'My habits, whether done today, and completions in the last 7 days.', {}),
        run: async (u) => {
          const cid = await myClient(u);
          return this.prisma.$queryRawUnsafe(
            `SELECT h.title, h.cadence,
                    EXISTS(SELECT 1 FROM public.wellness_habit_logs l WHERE l.habit_id=h.id AND l.log_date=current_date) AS done_today,
                    (SELECT count(*) FROM public.wellness_habit_logs l WHERE l.habit_id=h.id AND l.log_date >= current_date-6) AS done_last_7
               FROM public.wellness_habits h
              WHERE h.client_id = $1::uuid AND h.active = true
              ORDER BY h.sort_order, h.created_at`, cid);
        },
      },
      {
        declaration: decl('my_journal', 'My recent journal entries (excerpts).', {}),
        run: async (u) => {
          const cid = await myClient(u);
          return this.prisma.$queryRawUnsafe(
            `SELECT entry_date, title, left(body, 200) AS excerpt, mood
               FROM public.wellness_journal WHERE client_id = $1::uuid
              ORDER BY entry_date DESC, created_at DESC LIMIT 10`, cid);
        },
      },
    ];
  }

  // ── Executive (platform-wide) ─────────────────────────────────────
  private executiveTools(): ToolImpl[] {
    return [
      {
        declaration: decl('search_workspaces', 'Find workspaces by name, or list recent ones, with plan + status.', {
          query: str('Name fragment (optional).'),
          limit: int('Max rows (default 20).'),
        }),
        run: async (_u, a) => this.prisma.$queryRawUnsafe(
          `SELECT id, name, plan, status, trial_ends_at, created_at FROM public.workspaces
            WHERE ($1::text IS NULL OR name ILIKE '%'||$1||'%')
            ORDER BY created_at DESC LIMIT $2`,
          strArg(a.query), limit(a.limit, 20, 50)),
      },
      {
        declaration: decl('revenue', 'Revenue figures: total, last-N-days, MRR, ARR.', {
          days: int('Window in days for recent revenue (default 30).'),
        }),
        run: async (_u, a) => {
          const days = limit(a.days, 30, 365);
          const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
            `SELECT
               (SELECT COALESCE(SUM(amount_paise),0) FROM public.payments WHERE status='captured') AS total_paise,
               (SELECT COALESCE(SUM(amount_paise),0) FROM public.payments WHERE status='captured' AND captured_at >= now() - ($1||' days')::interval) AS window_paise,
               (SELECT COALESCE(SUM(amount_paise),0) FROM public.subscriptions WHERE status='active') AS mrr_paise`,
            String(days));
          return { total_inr: paise(r?.total_paise), [`last_${days}d_inr`]: paise(r?.window_paise), mrr_inr: paise(r?.mrr_paise), arr_inr: paise(r?.mrr_paise) * 12 };
        },
      },
      {
        declaration: decl('list_trials', 'Workspaces on trial, optionally expiring within N days.', {
          within_days: int('Only those expiring within N days (optional).'),
        }),
        run: async (_u, a) => {
          const within = a.within_days != null ? limit(a.within_days, 7, 365) : null;
          return this.prisma.$queryRawUnsafe(
            `SELECT id, name, trial_ends_at FROM public.workspaces
              WHERE plan='trial'
                AND ($1::int IS NULL OR trial_ends_at <= now() + ($1||' days')::interval)
              ORDER BY trial_ends_at ASC LIMIT 50`,
            within == null ? null : String(within));
        },
      },
      {
        declaration: decl('payment_failures', 'Recent failed payments needing attention.', {
          days: int('Window in days (default 30).'),
        }),
        run: async (_u, a) => this.prisma.$queryRawUnsafe(
          `SELECT p.amount_paise, p.error_description, p.created_at, w.name AS workspace
             FROM public.payments p LEFT JOIN public.workspaces w ON w.id = p.workspace_id
            WHERE p.status='failed' AND COALESCE(p.failed_at,p.created_at) >= now() - ($1||' days')::interval
            ORDER BY COALESCE(p.failed_at,p.created_at) DESC LIMIT 50`,
          String(limit(a.days, 30, 365))),
      },
      {
        declaration: decl('ai_usage', 'AI usage + cost over a window.', {
          days: int('Window in days (default 7).'),
        }),
        run: async (_u, a) => {
          const days = limit(a.days, 7, 90);
          const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
            `SELECT count(*) AS calls, count(*) FILTER (WHERE status='error') AS errors,
                    COALESCE(SUM(cost_micro_inr),0) AS cost_micro
               FROM public.ai_usage_events WHERE created_at >= now() - ($1||' days')::interval`,
            String(days));
          return { window_days: days, calls: num(r?.calls), errors: num(r?.errors), cost_inr: Math.round(num(r?.cost_micro) / 1_000_000 * 100) / 100 };
        },
      },
      {
        declaration: decl('platform_stats', 'Headline platform counts: workspaces, active subs, trials.', {}),
        run: async () => {
          const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
            `SELECT
               (SELECT count(*) FROM public.workspaces) AS workspaces,
               (SELECT count(*) FROM public.workspaces WHERE status='active') AS active_workspaces,
               (SELECT count(*) FROM public.subscriptions WHERE status='active') AS active_subs,
               (SELECT count(*) FROM public.workspaces WHERE plan='trial') AS trials`);
          return mapNums(r);
        },
      },
    ];
  }
}

interface ToolImpl {
  declaration: FunctionDeclaration;
  run: (user: AuthUser, args: Record<string, unknown>) => Promise<unknown>;
}

// ── declaration helpers ─────────────────────────────────────────────
function decl(
  name: string,
  description: string,
  props: Record<string, { type: SchemaType; description: string }>,
  required: string[] = [],
): FunctionDeclaration {
  return {
    name,
    description,
    parameters: Object.keys(props).length
      ? { type: SchemaType.OBJECT, properties: props, required }
      : { type: SchemaType.OBJECT, properties: {} },
  } as FunctionDeclaration;
}
const str = (description: string) => ({ type: SchemaType.STRING, description });
const int = (description: string) => ({ type: SchemaType.NUMBER, description });

// ── arg + value helpers ─────────────────────────────────────────────
function strArg(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function limit(v: unknown, dflt: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.max(1, Math.min(max, Math.floor(n)));
}
function num(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'bigint' ? Number(v) : v;
}
function paise(v: bigint | number | null | undefined): number {
  return Math.round(num(v) / 100);
}
function mapNums(r: Record<string, bigint> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (r) for (const k of Object.keys(r)) out[k] = num(r[k]);
  return out;
}
