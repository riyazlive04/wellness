import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AssistantGeminiService } from '../ai-assistant/assistant-gemini.service';

/**
 * WellnessService — the Client Wellness Operating System (Module 7): structured
 * goals, custom habits with streaks, a personal journal (with optional AI
 * reflection), and a unified wellness timeline. Everything is scoped to the
 * caller's client row (clients.user_id = JWT user id), mirroring the rest of the
 * /me/* surface.
 */
@Injectable()
export class WellnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: AssistantGeminiService,
  ) {}

  /** Resolve the caller's client id, or 404. */
  private async clientId(userId: string): Promise<string> {
    const [c] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!c) throw new NotFoundException('No client profile linked to this user.');
    return c.id;
  }

  // ── Goals ───────────────────────────────────────────────────────────
  async listGoals(userId: string): Promise<GoalRow[]> {
    const cid = await this.clientId(userId);
    return this.prisma.$queryRawUnsafe<GoalRow[]>(
      `SELECT * FROM public.wellness_goals WHERE client_id = $1::uuid
        ORDER BY (status='active') DESC, created_at DESC`,
      cid,
    );
  }

  async createGoal(userId: string, dto: CreateGoalDto): Promise<GoalRow> {
    const cid = await this.clientId(userId);
    const [row] = await this.prisma.$queryRawUnsafe<GoalRow[]>(
      `INSERT INTO public.wellness_goals
         (client_id, title, description, category, target_value, current_value, unit, target_date)
       VALUES ($1::uuid, $2, $3, $4, $5, COALESCE($6,0), $7, $8::date)
       RETURNING *`,
      cid, dto.title.trim(), dto.description ?? null, dto.category ?? 'lifestyle',
      dto.targetValue ?? null, dto.currentValue ?? null, dto.unit ?? null, dto.targetDate ?? null,
    );
    return row;
  }

  async updateGoal(userId: string, id: string, dto: UpdateGoalDto): Promise<GoalRow> {
    const cid = await this.clientId(userId);
    await this.requireGoal(cid, id);
    // Auto-stamp achieved_at when status flips to achieved.
    const [row] = await this.prisma.$queryRawUnsafe<GoalRow[]>(
      `UPDATE public.wellness_goals SET
         title         = COALESCE($3, title),
         description   = COALESCE($4, description),
         category      = COALESCE($5, category),
         target_value  = COALESCE($6, target_value),
         current_value = COALESCE($7, current_value),
         unit          = COALESCE($8, unit),
         target_date   = COALESCE($9::date, target_date),
         status        = COALESCE($10, status),
         achieved_at   = CASE WHEN $10 = 'achieved' AND achieved_at IS NULL THEN now()
                              WHEN $10 = 'active' THEN NULL ELSE achieved_at END,
         updated_at    = now()
       WHERE id = $1::uuid AND client_id = $2::uuid
       RETURNING *`,
      id, cid, dto.title ?? null, dto.description ?? null, dto.category ?? null,
      dto.targetValue ?? null, dto.currentValue ?? null, dto.unit ?? null,
      dto.targetDate ?? null, dto.status ?? null,
    );
    return row;
  }

  async deleteGoal(userId: string, id: string): Promise<void> {
    const cid = await this.clientId(userId);
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.wellness_goals WHERE id = $1::uuid AND client_id = $2::uuid`, id, cid);
  }

  private async requireGoal(cid: string, id: string): Promise<void> {
    const [g] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.wellness_goals WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1`, id, cid);
    if (!g) throw new NotFoundException('Goal not found.');
  }

  // ── Habits ──────────────────────────────────────────────────────────
  async listHabits(userId: string): Promise<HabitView[]> {
    const cid = await this.clientId(userId);
    const habits = await this.prisma.$queryRawUnsafe<HabitRow[]>(
      `SELECT * FROM public.wellness_habits WHERE client_id = $1::uuid AND active = true
        ORDER BY sort_order, created_at`, cid);
    if (!habits.length) return [];

    const logs = await this.prisma.$queryRawUnsafe<Array<{ habit_id: string; d: string }>>(
      `SELECT habit_id, to_char(log_date,'YYYY-MM-DD') AS d
         FROM public.wellness_habit_logs
        WHERE client_id = $1::uuid AND log_date >= current_date - 90`, cid);
    const [{ today }] = await this.prisma.$queryRawUnsafe<Array<{ today: string }>>(
      `SELECT to_char(current_date,'YYYY-MM-DD') AS today`);

    const byHabit = new Map<string, Set<string>>();
    for (const l of logs) {
      if (!byHabit.has(l.habit_id)) byHabit.set(l.habit_id, new Set());
      byHabit.get(l.habit_id)!.add(l.d);
    }

    return habits.map((h) => {
      const set = byHabit.get(h.id) ?? new Set<string>();
      const doneToday = set.has(today);
      return {
        ...h,
        done_today: doneToday,
        streak: computeStreak(set, today),
        last7: lastNDays(set, today, 7),
      };
    });
  }

  async createHabit(userId: string, dto: CreateHabitDto): Promise<HabitRow> {
    const cid = await this.clientId(userId);
    const [row] = await this.prisma.$queryRawUnsafe<HabitRow[]>(
      `INSERT INTO public.wellness_habits (client_id, title, icon, color, cadence, target_per_day, sort_order)
       VALUES ($1::uuid, $2, $3, $4, COALESCE($5,'daily'), COALESCE($6,1), COALESCE($7,0))
       RETURNING *`,
      cid, dto.title.trim(), dto.icon ?? null, dto.color ?? null, dto.cadence ?? null,
      dto.targetPerDay ?? null, dto.sortOrder ?? null);
    return row;
  }

  async updateHabit(userId: string, id: string, dto: UpdateHabitDto): Promise<HabitRow> {
    const cid = await this.clientId(userId);
    const [row] = await this.prisma.$queryRawUnsafe<HabitRow[]>(
      `UPDATE public.wellness_habits SET
         title = COALESCE($3,title), icon = COALESCE($4,icon), color = COALESCE($5,color),
         cadence = COALESCE($6,cadence), target_per_day = COALESCE($7,target_per_day),
         sort_order = COALESCE($8,sort_order), active = COALESCE($9,active)
       WHERE id = $1::uuid AND client_id = $2::uuid RETURNING *`,
      id, cid, dto.title ?? null, dto.icon ?? null, dto.color ?? null, dto.cadence ?? null,
      dto.targetPerDay ?? null, dto.sortOrder ?? null, dto.active ?? null);
    if (!row) throw new NotFoundException('Habit not found.');
    return row;
  }

  async deleteHabit(userId: string, id: string): Promise<void> {
    const cid = await this.clientId(userId);
    // Soft-archive so history/streaks aren't destroyed.
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.wellness_habits SET active = false, archived_at = now()
        WHERE id = $1::uuid AND client_id = $2::uuid`, id, cid);
  }

  /** Toggle a habit's check-in for a date (default today). Returns the new state. */
  async toggleHabit(userId: string, id: string, date?: string): Promise<{ done: boolean; streak: number }> {
    const cid = await this.clientId(userId);
    const [h] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.wellness_habits WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1`, id, cid);
    if (!h) throw new NotFoundException('Habit not found.');

    const deleted = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.wellness_habit_logs
        WHERE habit_id = $1::uuid AND log_date = COALESCE($2::date, current_date) RETURNING id`,
      id, date ?? null);
    if (!deleted.length) {
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO public.wellness_habit_logs (habit_id, client_id, log_date)
         VALUES ($1::uuid, $2::uuid, COALESCE($3::date, current_date))
         ON CONFLICT (habit_id, log_date) DO NOTHING`,
        id, cid, date ?? null);
    }
    // Recompute streak.
    const logs = await this.prisma.$queryRawUnsafe<Array<{ d: string }>>(
      `SELECT to_char(log_date,'YYYY-MM-DD') AS d FROM public.wellness_habit_logs
        WHERE habit_id = $1::uuid AND log_date >= current_date - 90`, id);
    const [{ today }] = await this.prisma.$queryRawUnsafe<Array<{ today: string }>>(
      `SELECT to_char(current_date,'YYYY-MM-DD') AS today`);
    const set = new Set(logs.map((l) => l.d));
    return { done: !deleted.length, streak: computeStreak(set, today) };
  }

  // ── Journal ─────────────────────────────────────────────────────────
  async listJournal(userId: string, limit = 50): Promise<JournalRow[]> {
    const cid = await this.clientId(userId);
    return this.prisma.$queryRawUnsafe<JournalRow[]>(
      `SELECT * FROM public.wellness_journal WHERE client_id = $1::uuid
        ORDER BY entry_date DESC, created_at DESC LIMIT $2`,
      cid, Math.min(Math.max(limit, 1), 200));
  }

  async createJournal(userId: string, dto: CreateJournalDto): Promise<JournalRow> {
    const cid = await this.clientId(userId);
    const [row] = await this.prisma.$queryRawUnsafe<JournalRow[]>(
      `INSERT INTO public.wellness_journal (client_id, entry_date, title, body, mood, tags)
       VALUES ($1::uuid, COALESCE($2::date, current_date), $3, $4, $5, $6::jsonb)
       RETURNING *`,
      cid, dto.entryDate ?? null, dto.title ?? null, dto.body.trim(), dto.mood ?? null,
      JSON.stringify(dto.tags ?? []));
    return row;
  }

  async updateJournal(userId: string, id: string, dto: UpdateJournalDto): Promise<JournalRow> {
    const cid = await this.clientId(userId);
    const [row] = await this.prisma.$queryRawUnsafe<JournalRow[]>(
      `UPDATE public.wellness_journal SET
         title = COALESCE($3,title), body = COALESCE($4,body), mood = COALESCE($5,mood),
         tags = COALESCE($6::jsonb, tags), updated_at = now()
       WHERE id = $1::uuid AND client_id = $2::uuid RETURNING *`,
      id, cid, dto.title ?? null, dto.body ?? null, dto.mood ?? null,
      dto.tags ? JSON.stringify(dto.tags) : null);
    if (!row) throw new NotFoundException('Journal entry not found.');
    return row;
  }

  async deleteJournal(userId: string, id: string): Promise<void> {
    const cid = await this.clientId(userId);
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.wellness_journal WHERE id = $1::uuid AND client_id = $2::uuid`, id, cid);
  }

  /** Generate a short, supportive AI reflection on a journal entry and store it. */
  async reflectJournal(userId: string, id: string): Promise<JournalRow> {
    const cid = await this.clientId(userId);
    const [entry] = await this.prisma.$queryRawUnsafe<JournalRow[]>(
      `SELECT * FROM public.wellness_journal WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1`, id, cid);
    if (!entry) throw new NotFoundException('Journal entry not found.');

    const reflection = await this.gemini.summarize({
      assistantType: 'wellness',
      systemPrompt:
        'You are a warm, encouraging wellness coach. Reflect on the client’s journal entry in 2-3 supportive sentences: acknowledge their feelings, highlight one positive, and offer one gentle, practical suggestion. Never diagnose. Plain text.',
      prompt: `Journal entry${entry.mood ? ` (mood ${entry.mood}/5)` : ''}:\n${entry.title ? entry.title + '\n' : ''}${entry.body}`,
      fallback: 'Thanks for taking a moment to reflect. Noticing how you feel is a real step — be kind to yourself today.',
    });

    const [row] = await this.prisma.$queryRawUnsafe<JournalRow[]>(
      `UPDATE public.wellness_journal SET ai_reflection = $3, updated_at = now()
        WHERE id = $1::uuid AND client_id = $2::uuid RETURNING *`,
      id, cid, reflection);
    return row;
  }

  // ── Timeline (read-only aggregation) ────────────────────────────────
  async timeline(userId: string, limit = 40): Promise<TimelineItem[]> {
    const cid = await this.clientId(userId);
    return this.prisma.$queryRawUnsafe<TimelineItem[]>(
      `(
         SELECT 'goal' AS kind, title, COALESCE(description,'') AS detail,
                COALESCE(achieved_at, created_at) AS at,
                CASE WHEN status='achieved' THEN 'achieved' ELSE 'created' END AS variant
           FROM public.wellness_goals WHERE client_id = $1::uuid
       )
       UNION ALL
       (
         SELECT 'journal' AS kind, COALESCE(title,'Journal entry') AS title, left(body, 140) AS detail,
                created_at AS at, '' AS variant
           FROM public.wellness_journal WHERE client_id = $1::uuid
       )
       UNION ALL
       (
         SELECT 'appointment' AS kind, COALESCE(kind,'Appointment') AS title, COALESCE(mode,'') AS detail,
                scheduled_at AS at, status AS variant
           FROM public.appointments WHERE client_id = $1::uuid
       )
       UNION ALL
       (
         SELECT 'milestone' AS kind, COALESCE(message, kind) AS title, kind AS detail,
                achieved_at AS at, '' AS variant
           FROM public.client_milestones WHERE client_id = $1::uuid
       )
       UNION ALL
       (
         SELECT 'report' AS kind, 'Weekly report' AS title, COALESCE(summary,'') AS detail,
                COALESCE(report_date::timestamptz, created_at) AS at, status AS variant
           FROM public.weekly_reports WHERE client_id = $1::uuid AND status = 'published'
       )
       ORDER BY at DESC NULLS LAST
       LIMIT $2`,
      cid, Math.min(Math.max(limit, 1), 100));
  }
}

// ── computation helpers ─────────────────────────────────────────────
function computeStreak(set: Set<string>, today: string): number {
  // A streak isn't "broken" until a full day is missed: start at today if done,
  // else at yesterday, then count consecutive completed days backwards.
  let cursor = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
function lastNDays(set: Set<string>, today: string, n: number): Array<{ date: string; done: boolean }> {
  const out: Array<{ date: string; done: boolean }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    out.push({ date: d, done: set.has(d) });
  }
  return out;
}
function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

// ── types ───────────────────────────────────────────────────────────
export interface GoalRow {
  id: string; client_id: string; title: string; description: string | null; category: string;
  target_value: string | null; current_value: string; unit: string | null; target_date: string | null;
  status: string; achieved_at: string | null; created_at: string; updated_at: string;
}
export interface HabitRow {
  id: string; client_id: string; title: string; icon: string | null; color: string | null;
  cadence: string; target_per_day: number; sort_order: number; active: boolean;
  created_at: string; archived_at: string | null;
}
export interface HabitView extends HabitRow {
  done_today: boolean; streak: number; last7: Array<{ date: string; done: boolean }>;
}
export interface JournalRow {
  id: string; client_id: string; entry_date: string; title: string | null; body: string;
  mood: number | null; tags: unknown; ai_reflection: string | null; created_at: string; updated_at: string;
}
export interface TimelineItem {
  kind: string; title: string; detail: string; at: string | null; variant: string;
}

export interface CreateGoalDto {
  title: string; description?: string; category?: string;
  targetValue?: number; currentValue?: number; unit?: string; targetDate?: string;
}
export interface UpdateGoalDto extends Partial<CreateGoalDto> { status?: string }
export interface CreateHabitDto {
  title: string; icon?: string; color?: string; cadence?: string; targetPerDay?: number; sortOrder?: number;
}
export interface UpdateHabitDto extends Partial<CreateHabitDto> { active?: boolean }
export interface CreateJournalDto {
  body: string; title?: string; mood?: number; tags?: string[]; entryDate?: string;
}
export interface UpdateJournalDto { title?: string; body?: string; mood?: number; tags?: string[] }
