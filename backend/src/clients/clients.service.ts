import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import {
  ClientInviteRow,
  ClientListItem,
  ClientMealLog,
  ClientMessage,
  ClientProfile,
  ClientProgram,
  InvitePreview,
} from './clients.types';

interface ListClientsParams {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // Workspace-admin side
  // ─────────────────────────────────────────────────────────────────

  async listClients(
    workspaceId: string,
    params: ListClientsParams = {},
  ): Promise<{ items: ClientListItem[]; total: number; limit: number; offset: number }> {
    const limit = clamp(params.limit ?? 50, 1, 200);
    const offset = Math.max(0, params.offset ?? 0);
    const where: string[] = [`workspace_id = $1::uuid`];
    const vals: unknown[] = [workspaceId];

    if (params.status) {
      vals.push(params.status);
      where.push(`status::text = $${vals.length}`);
    }
    if (params.q) {
      vals.push(`%${params.q.toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${vals.length} OR LOWER(email) LIKE $${vals.length})`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [countRow] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n FROM public.clients ${whereSql}`,
      ...vals,
    );
    vals.push(limit);
    vals.push(offset);
    const items = await this.prisma.$queryRawUnsafe<ClientListItem[]>(
      `SELECT id, user_id, workspace_id, name, email, phone,
              status::text AS status, program_type::text AS program_type,
              target_kcal, last_weight::text, display_name,
              created_at, updated_at
         FROM public.clients
         ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      ...vals,
    );
    return { items, total: Number(countRow?.n ?? 0n), limit, offset };
  }

  async listInvites(workspaceId: string): Promise<{ items: ClientInviteRow[] }> {
    const items = await this.prisma.$queryRawUnsafe<ClientInviteRow[]>(
      `SELECT * FROM public.client_invites
        WHERE workspace_id = $1::uuid
        ORDER BY created_at DESC`,
      workspaceId,
    );
    return { items };
  }

  async createInvite(
    workspaceId: string,
    invitedBy: string,
    email: string,
    name?: string,
    notes?: string,
  ): Promise<ClientInviteRow> {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      throw new BadRequestException('Invalid email');
    }

    // Reject if an active client already exists with this email in the workspace.
    const existing = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients
        WHERE workspace_id = $1::uuid AND lower(email) = $2 AND status::text = 'active'
        LIMIT 1`,
      workspaceId,
      normalized,
    );
    if (existing.length) {
      throw new ConflictException('A client with this email is already active in your workspace');
    }

    const token = randomBytes(32).toString('hex');
    try {
      const rows = await this.prisma.$queryRawUnsafe<ClientInviteRow[]>(
        `INSERT INTO public.client_invites
           (workspace_id, email, name, token, invited_by, notes)
         VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6)
         RETURNING *`,
        workspaceId,
        normalized,
        name ?? null,
        token,
        invitedBy,
        notes ?? null,
      );
      return rows[0];
    } catch (err) {
      // Unique-partial-index collision → there's already a pending invite.
      if ((err as { code?: string }).code === 'P2010' || /duplicate key|unique/.test((err as Error).message)) {
        throw new ConflictException('A pending invite already exists for this email');
      }
      throw err;
    }
  }

  async revokeInvite(workspaceId: string, inviteId: string, actor: string): Promise<ClientInviteRow> {
    const rows = await this.prisma.$queryRawUnsafe<ClientInviteRow[]>(
      `UPDATE public.client_invites
          SET status = 'revoked',
              revoked_at = now(),
              revoked_by = $3::uuid
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND status = 'pending'
       RETURNING *`,
      inviteId,
      workspaceId,
      actor,
    );
    if (!rows.length) throw new NotFoundException('Invite not found or already finalised');
    return rows[0];
  }

  // ─────────────────────────────────────────────────────────────────
  // Invite preview + accept (public-ish)
  // ─────────────────────────────────────────────────────────────────

  async previewInvite(token: string): Promise<InvitePreview> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        workspace_id: string;
        workspace_name: string;
        workspace_slug: string | null;
        inviter_email: string | null;
        email: string;
        expires_at: string;
        status: string;
      }>
    >(
      `SELECT ci.id, ci.workspace_id, w.name AS workspace_name, w.slug AS workspace_slug,
              u.email AS inviter_email, ci.email, ci.expires_at, ci.status
         FROM public.client_invites ci
         JOIN public.workspaces w ON w.id = ci.workspace_id
         LEFT JOIN auth.users u   ON u.id = ci.invited_by
        WHERE ci.token = $1
        LIMIT 1`,
      token,
    );
    if (!rows.length) throw new NotFoundException('Invite not found');
    const r = rows[0];
    const isExpired = new Date(r.expires_at).getTime() < Date.now();
    return {
      id: r.id,
      workspace_name: r.workspace_name,
      workspace_slug: r.workspace_slug,
      inviter_email: r.inviter_email,
      email: r.email,
      expires_at: r.expires_at,
      status: r.status as InvitePreview['status'],
      is_expired: isExpired,
    };
  }

  /**
   * Accept an invite. Caller must be authenticated. Effects:
   *   1. Verify token is pending + not expired + email matches caller.
   *   2. Insert (or update) clients row scoped to this workspace.
   *   3. Insert user_roles(client) if not already present.
   *   4. Mark invite accepted.
   */
  async acceptInvite(token: string, callerId: string, callerEmail: string | undefined): Promise<{ workspaceId: string; clientId: string }> {
    const [invite] = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        workspace_id: string;
        email: string;
        name: string | null;
        status: string;
        expires_at: string;
      }>
    >(
      `SELECT id, workspace_id, email, name, status, expires_at
         FROM public.client_invites WHERE token = $1 LIMIT 1`,
      token,
    );
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'pending') {
      throw new ForbiddenException(`Invite ${invite.status}`);
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      // Mark expired so the row reflects the fact, but reject.
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.client_invites SET status='expired' WHERE id = $1::uuid`,
        invite.id,
      );
      throw new ForbiddenException('Invite expired');
    }
    if (callerEmail && callerEmail.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ForbiddenException('This invite was issued for a different email address');
    }

    // 2. clients row — INSERT or relink existing one to this workspace.
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO public.clients
         (user_id, workspace_id, name, email, phone, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, '', 'active')
       ON CONFLICT (user_id) DO UPDATE
         SET workspace_id = EXCLUDED.workspace_id,
             status       = 'active',
             updated_at   = now()
       RETURNING id`,
      callerId,
      invite.workspace_id,
      invite.name ?? invite.email.split('@')[0],
      invite.email,
    );

    // 3. user_roles += client (ignore if super_admin/workspace already set)
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1::uuid, 'client'::app_role)
       ON CONFLICT (user_id, role) DO NOTHING`,
      callerId,
    );

    // 4. Mark invite accepted.
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.client_invites
          SET status = 'accepted', accepted_at = now(), accepted_user_id = $2::uuid
        WHERE id = $1::uuid`,
      invite.id,
      callerId,
    );

    return { workspaceId: invite.workspace_id, clientId: client.id };
  }

  // ─────────────────────────────────────────────────────────────────
  // Client-side reads (caller must be a client)
  // ─────────────────────────────────────────────────────────────────

  async myProfile(userId: string): Promise<ClientProfile> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        user_id: string;
        workspace_id: string;
        workspace_name: string | null;
        name: string;
        email: string;
        phone: string | null;
        age: number | null;
        gender: string | null;
        goals: string | null;
        target_kcal: number | null;
        program_type: string | null;
        status: string | null;
      }>
    >(
      `SELECT c.id, c.user_id, c.workspace_id,
              w.name AS workspace_name,
              c.name, c.email, c.phone, c.age, c.gender::text AS gender,
              c.goals, c.target_kcal, c.program_type::text AS program_type,
              c.status::text AS status
         FROM public.clients c
         LEFT JOIN public.workspaces w ON w.id = c.workspace_id
        WHERE c.user_id = $1::uuid
        LIMIT 1`,
      userId,
    );
    if (!rows.length) throw new NotFoundException('No client profile linked to this user');
    return rows[0];
  }

  async myMeals(userId: string, days = 7): Promise<ClientMealLog[]> {
    const d = clamp(days, 1, 90);
    const rows = await this.prisma.$queryRawUnsafe<ClientMealLog[]>(
      `SELECT m.id, m.meal_type::text AS meal_type, m.meal_name,
              m.kcal, m.photo_url, m.notes, m.logged_at
         FROM public.meal_logs m
         JOIN public.clients c ON c.id = m.client_id
        WHERE c.user_id = $1::uuid
          AND m.logged_at >= now() - ($2 || ' days')::interval
        ORDER BY m.logged_at DESC
        LIMIT 200`,
      userId,
      String(d),
    );
    return rows;
  }

  async myMessages(userId: string, limit = 50): Promise<ClientMessage[]> {
    const lim = clamp(limit, 1, 200);
    const rows = await this.prisma.$queryRawUnsafe<ClientMessage[]>(
      `SELECT m.id, m.sender_type, m.message_type, m.content, m.is_read, m.created_at
         FROM public.messages m
         JOIN public.clients c ON c.id = m.client_id
        WHERE c.user_id = $1::uuid
        ORDER BY m.created_at DESC
        LIMIT $2`,
      userId,
      lim,
    );
    return rows;
  }

  async myProgram(userId: string): Promise<ClientProgram | null> {
    const rows = await this.prisma.$queryRawUnsafe<ClientProgram[]>(
      `SELECT wp.id, wp.week_number, wp.start_date::text AS start_date,
              wp.end_date::text AS end_date, wp.total_kcal, wp.status, wp.published_at
         FROM public.weekly_plans wp
         JOIN public.clients c ON c.id = wp.client_id
        WHERE c.user_id = $1::uuid
          AND wp.published_at IS NOT NULL
        ORDER BY wp.start_date DESC
        LIMIT 1`,
      userId,
    );
    return rows[0] ?? null;
  }

  // ─────────────────────────────────────────────────────────────────
  // Wellness snapshot — single dashboard hero call
  //
  // Aggregates today's daily_log + meal_logs + the client's streak into
  // one shape the Home page can render without N round-trips.
  // ─────────────────────────────────────────────────────────────────

  async myWellnessSnapshot(userId: string): Promise<{
    score: number;
    scoreLabel: string;
    streakDays: number;
    todayKcal: number;
    targetKcal: number | null;
    waterMl: number;
    waterTargetMl: number;
    sleepHours: number | null;
    exerciseMinutes: number;
    habitsCompletedToday: number;
    habitsTotal: number;
  }> {
    // One round-trip — UNION ALL is awkward with mixed shapes, so use a CTE.
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        target_kcal: number | null;
        today_kcal: number;
        water_ml: number;
        sleep_hours: number | null;
        exercise_minutes: number;
        weight_kg: number | null;
        streak_days: number;
      }>
    >(
      `
      WITH me AS (
        SELECT id, target_kcal FROM public.clients
         WHERE user_id = $1::uuid
         LIMIT 1
      ),
      today_meals AS (
        SELECT COALESCE(SUM(kcal), 0)::int AS kcal
          FROM public.meal_logs
         WHERE client_id = (SELECT id FROM me)
           AND logged_at::date = CURRENT_DATE
      ),
      today_habit AS (
        SELECT water_intake, sleep_hours, activity_minutes, weight
          FROM public.daily_logs
         WHERE client_id = (SELECT id FROM me)
           AND log_date = CURRENT_DATE
         LIMIT 1
      ),
      -- Streak = consecutive days back from today with at least one signal.
      streak AS (
        SELECT COALESCE(MAX(streak_len), 0) AS days FROM (
          SELECT COUNT(*) AS streak_len
            FROM (
              SELECT log_date,
                     log_date - (ROW_NUMBER() OVER (ORDER BY log_date DESC))::int * INTERVAL '1 day' AS grp
                FROM public.daily_logs
               WHERE client_id = (SELECT id FROM me)
                 AND (water_intake > 0 OR activity_minutes > 0 OR weight IS NOT NULL OR sleep_hours IS NOT NULL)
                 AND log_date <= CURRENT_DATE
               ORDER BY log_date DESC
               LIMIT 90
            ) d
           WHERE log_date >= CURRENT_DATE - INTERVAL '90 days'
           GROUP BY grp
           ORDER BY MAX(log_date) DESC
           LIMIT 1
        ) s
      )
      SELECT
        (SELECT target_kcal FROM me)            AS target_kcal,
        (SELECT kcal FROM today_meals)          AS today_kcal,
        COALESCE((SELECT water_intake FROM today_habit), 0)        AS water_ml,
        (SELECT sleep_hours FROM today_habit)::numeric              AS sleep_hours,
        COALESCE((SELECT activity_minutes FROM today_habit), 0)    AS exercise_minutes,
        (SELECT weight FROM today_habit)::numeric                   AS weight_kg,
        (SELECT days FROM streak)::int                              AS streak_days
      `,
      userId,
    );

    if (!row) {
      // No clients row — caller isn't a client yet. Return a neutral snapshot.
      return {
        score: 0,
        scoreLabel: 'Get started',
        streakDays: 0,
        todayKcal: 0,
        targetKcal: null,
        waterMl: 0,
        waterTargetMl: 2500,
        sleepHours: null,
        exerciseMinutes: 0,
        habitsCompletedToday: 0,
        habitsTotal: 3,
      };
    }

    const waterTargetMl = 2500;
    const targetKcal = row.target_kcal ?? null;
    const todayKcal = Number(row.today_kcal) || 0;
    const waterMl = Number(row.water_ml) || 0;
    const exerciseMinutes = Number(row.exercise_minutes) || 0;
    const sleepHours = row.sleep_hours != null ? Number(row.sleep_hours) : null;
    const streakDays = Number(row.streak_days) || 0;

    // Habit completion = each of (water, exercise, sleep) gets 0/1/2 based
    // on how close we are to the target. Total possible 6 → simple to display.
    const habitWater    = waterMl >= waterTargetMl * 0.9 ? 2 : waterMl >= waterTargetMl * 0.4 ? 1 : 0;
    const habitExercise = exerciseMinutes >= 30 ? 2 : exerciseMinutes >= 10 ? 1 : 0;
    const habitSleep    = sleepHours != null && sleepHours >= 7 ? 2 : sleepHours != null && sleepHours >= 5 ? 1 : 0;
    const habitPointsEarned = habitWater + habitExercise + habitSleep;
    const habitPointsMax = 6;

    // Score blends habits (50%), meal adherence (30%), streak bonus (20%).
    let mealAdherence = 0;
    if (targetKcal && targetKcal > 0) {
      // 1.0 when within ±15% of target; degrades linearly.
      const ratio = todayKcal / targetKcal;
      mealAdherence = Math.max(0, 1 - Math.abs(ratio - 1) * 2);
    } else if (todayKcal > 0) {
      mealAdherence = 0.7; // logged at least one meal
    }
    const streakBonus = Math.min(1, streakDays / 14);
    const score = Math.round(
      ((habitPointsEarned / habitPointsMax) * 50) +
      (mealAdherence * 30) +
      (streakBonus * 20),
    );

    return {
      score,
      scoreLabel: labelForScore(score),
      streakDays,
      todayKcal,
      targetKcal,
      waterMl,
      waterTargetMl,
      sleepHours,
      exerciseMinutes,
      habitsCompletedToday: habitPointsEarned,
      habitsTotal: habitPointsMax,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Habits — daily_logs CRUD
  // ─────────────────────────────────────────────────────────────────

  async myHabits(userId: string, days = 14): Promise<HabitDay[]> {
    const d = clamp(days, 1, 90);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        log_date: string;
        water_intake: number | null;
        sleep_hours: string | null;
        activity_minutes: number | null;
        weight: string | null;
      }>
    >(
      `SELECT to_char(dl.log_date, 'YYYY-MM-DD') AS log_date,
              dl.water_intake, dl.sleep_hours, dl.activity_minutes, dl.weight
         FROM public.daily_logs dl
         JOIN public.clients c ON c.id = dl.client_id
        WHERE c.user_id = $1::uuid
          AND dl.log_date > CURRENT_DATE - ($2 || ' days')::interval
        ORDER BY dl.log_date DESC`,
      userId,
      String(d),
    );
    return rows.map((r) => ({
      date: r.log_date,
      water_ml: Number(r.water_intake ?? 0),
      sleep_hours: r.sleep_hours != null ? Number(r.sleep_hours) : null,
      exercise_minutes: Number(r.activity_minutes ?? 0),
      weight_kg: r.weight != null ? Number(r.weight) : null,
      mood: null,
    }));
  }

  /**
   * UPSERT today's habit log. Frontend sends partial updates (just water,
   * or just weight) — we patch the existing row and leave other columns
   * alone. Returns the fresh row so the client cache can replace its copy.
   */
  async upsertHabit(
    userId: string,
    patch: Partial<{ water_ml: number; sleep_hours: number; exercise_minutes: number; weight_kg: number; date: string }>,
  ): Promise<HabitDay> {
    const date = patch.date ?? new Date().toISOString().slice(0, 10);
    // Find caller's client_id once.
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');

    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        log_date: string;
        water_intake: number;
        sleep_hours: string | null;
        activity_minutes: number;
        weight: string | null;
      }>
    >(
      `
      INSERT INTO public.daily_logs (client_id, log_date, water_intake, sleep_hours, activity_minutes, weight)
      VALUES (
        $1::uuid, $2::date,
        COALESCE($3::int, 0),
        $4::numeric,
        COALESCE($5::int, 0),
        $6::numeric
      )
      ON CONFLICT (client_id, log_date) DO UPDATE SET
        water_intake     = COALESCE(EXCLUDED.water_intake,     public.daily_logs.water_intake),
        sleep_hours      = COALESCE(EXCLUDED.sleep_hours,      public.daily_logs.sleep_hours),
        activity_minutes = COALESCE(EXCLUDED.activity_minutes, public.daily_logs.activity_minutes),
        weight           = COALESCE(EXCLUDED.weight,           public.daily_logs.weight),
        updated_at       = now()
      RETURNING to_char(log_date, 'YYYY-MM-DD') AS log_date,
                water_intake, sleep_hours, activity_minutes, weight
      `,
      me.id,
      date,
      patch.water_ml ?? null,
      patch.sleep_hours ?? null,
      patch.exercise_minutes ?? null,
      patch.weight_kg ?? null,
    );

    return {
      date: row.log_date,
      water_ml: Number(row.water_intake ?? 0),
      sleep_hours: row.sleep_hours != null ? Number(row.sleep_hours) : null,
      exercise_minutes: Number(row.activity_minutes ?? 0),
      weight_kg: row.weight != null ? Number(row.weight) : null,
      mood: null,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Achievements
  // ─────────────────────────────────────────────────────────────────

  async myAchievements(userId: string): Promise<Achievement[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        code: string;
        title: string;
        description: string;
        icon_name: string;
        target_value: number;
        current_value: number | null;
        unlocked_at: string | null;
      }>
    >(
      `SELECT a.id, a.code, a.title, a.description, a.icon_name, a.target_value,
              ua.current_value, ua.unlocked_at
         FROM public.achievements a
         LEFT JOIN public.user_achievements ua
                ON ua.achievement_id = a.id AND ua.user_id = $1::uuid
        ORDER BY ua.unlocked_at NULLS LAST, a.created_at`,
      userId,
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      icon: ICON_MAP[r.icon_name] ?? '🏆',
      earned_at: r.unlocked_at,
      progress: r.unlocked_at
        ? 100
        : r.target_value > 0
          ? Math.min(100, Math.round(((r.current_value ?? 0) / r.target_value) * 100))
          : 0,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // Send message (client → nutritionist)
  // ─────────────────────────────────────────────────────────────────

  async sendMessage(userId: string, content: string): Promise<ClientMessage> {
    const body = content.trim();
    if (!body) throw new BadRequestException('Message content cannot be empty.');
    if (body.length > 4000) throw new BadRequestException('Message too long (max 4000 characters).');

    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');

    const [row] = await this.prisma.$queryRawUnsafe<ClientMessage[]>(
      `INSERT INTO public.messages
         (client_id, sender_id, sender_type, message_type, content)
       VALUES ($1::uuid, $2::uuid, 'client', 'manual', $3)
       RETURNING id, sender_type, message_type, content, is_read, created_at`,
      me.id,
      userId,
      body,
    );
    return row;
  }

  // ─────────────────────────────────────────────────────────────────
  // Update profile (settings save)
  //
  // Only writable fields are exposed; status / workspace_id / target_kcal
  // are nutritionist-controlled and ignored if passed.
  // ─────────────────────────────────────────────────────────────────

  async updateMyProfile(
    userId: string,
    patch: Partial<{
      age: number;
      gender: string;
      goals: string;
      phone: string;
      allergies: string;
      medical_conditions: string;
      food_preferences: string;
      activity_level: string;
      height_cm: number;
    }>,
  ): Promise<ClientProfile> {
    // Build dynamic UPDATE — only columns the client actually changed.
    const sets: string[] = [];
    const vals: unknown[] = [];
    const allowed: Array<keyof typeof patch> = [
      'age', 'gender', 'goals', 'phone',
      'allergies', 'medical_conditions', 'food_preferences',
      'activity_level', 'height_cm',
    ];
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        vals.push(patch[key]);
        sets.push(`${key} = $${vals.length}`);
      }
    }
    if (sets.length === 0) {
      // No-op — just return current profile.
      return this.myProfile(userId);
    }
    vals.push(userId);
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.clients
          SET ${sets.join(', ')}, updated_at = now()
        WHERE user_id = $${vals.length}::uuid`,
      ...vals,
    );
    return this.myProfile(userId);
  }
}

// ─────────────────────────────────────────────────────────────────
// Types co-located with the service to keep clients.types.ts terse.
// ─────────────────────────────────────────────────────────────────

export interface HabitDay {
  date: string;
  water_ml: number;
  sleep_hours: number | null;
  exercise_minutes: number;
  weight_kg: number | null;
  mood: 'great' | 'good' | 'okay' | 'low' | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  earned_at: string | null;
  progress: number;
}

// Map legacy Sheizen icon_name strings (e.g. 'flame', 'droplet') to emojis
// so the frontend can render a calm, dependency-free badge grid. Anything
// not in here defaults to 🏆 (trophy).
const ICON_MAP: Record<string, string> = {
  flame: '🔥',
  droplet: '💧',
  trophy: '🏆',
  star: '⭐',
  utensils: '🍽️',
  activity: '🏃',
  award: '🏅',
  zap: '⚡',
  heart: '❤️',
  moon: '🌙',
  sun: '☀️',
  check: '✅',
  target: '🎯',
};

function labelForScore(score: number): string {
  if (score >= 85) return 'Glowing';
  if (score >= 70) return 'On track';
  if (score >= 50) return 'Building';
  if (score >= 25) return 'Slipping';
  return 'Restart today';
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}