import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PushService } from './push.service';
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
    private readonly push: PushService,
    private readonly config: ConfigService,
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
    const rows = await this.prisma.$queryRawUnsafe<ClientProfile[]>(
      `SELECT c.id, c.user_id, c.workspace_id,
              w.name AS workspace_name,
              c.name, c.email, c.phone, c.age, c.gender::text AS gender,
              c.goals, c.target_kcal, c.program_type::text AS program_type,
              c.status::text AS status,
              c.onboarded_at
         FROM public.clients c
         LEFT JOIN public.workspaces w ON w.id = c.workspace_id
        WHERE c.user_id = $1::uuid
        LIMIT 1`,
      userId,
    );
    if (!rows.length) throw new NotFoundException('No client profile linked to this user');
    return rows[0];
  }

  /**
   * Mark the post-invite onboarding wizard complete and persist the
   * profile fields the wizard collected in one atomic call. The frontend
   * uses `onboarded_at` to decide whether to gate /portal/* behind the
   * wizard — so we set it last, after the profile UPDATE succeeds.
   */
  async completeOnboarding(
    userId: string,
    body: Partial<{
      age: number;
      gender: string;
      goals: string;
      phone: string;
      allergies: string;
      medical_conditions: string;
      food_preferences: string;
      activity_level: string;
      height_cm: number;
    }> & { initial_weight_kg?: number },
  ): Promise<ClientProfile> {
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');

    // Patch any wellness fields the wizard collected.
    await this.updateMyProfile(userId, {
      age: body.age,
      gender: body.gender,
      goals: body.goals,
      phone: body.phone,
      allergies: body.allergies,
      medical_conditions: body.medical_conditions,
      food_preferences: body.food_preferences,
      activity_level: body.activity_level,
      height_cm: body.height_cm,
    });

    // Capture initial weight as today's habit row (if provided).
    if (body.initial_weight_kg && body.initial_weight_kg > 0) {
      await this.upsertHabit(userId, { weight_kg: body.initial_weight_kg });
    }

    // Flip the gate.
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.clients
          SET onboarded_at = COALESCE(onboarded_at, now()),
              updated_at   = now()
        WHERE id = $1::uuid`,
      me.id,
    );
    return this.myProfile(userId);
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

  /**
   * Send a message FROM an admin TO a specific client and push-notify them.
   * Caller responsibility: confirm the admin owns this workspace and that
   * the client_id belongs to it. We don't re-verify here because the only
   * controller calling this is workspace-scoped already.
   */
  async sendAdminMessage(
    workspaceId: string,
    senderUserId: string,
    clientId: string,
    content: string,
  ): Promise<ClientMessage> {
    const body = content.trim();
    if (!body) throw new BadRequestException('Message content cannot be empty.');
    if (body.length > 4000) throw new BadRequestException('Message too long (max 4000 characters).');

    // Defensive — confirm client belongs to caller's workspace.
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
      `SELECT id, name FROM public.clients
        WHERE id = $1::uuid AND workspace_id = $2::uuid
        LIMIT 1`,
      clientId,
      workspaceId,
    );
    if (!client) throw new NotFoundException('Client not found in this workspace.');

    const [row] = await this.prisma.$queryRawUnsafe<ClientMessage[]>(
      `INSERT INTO public.messages
         (client_id, sender_id, sender_type, message_type, content)
       VALUES ($1::uuid, $2::uuid, 'admin', 'manual', $3)
       RETURNING id, sender_type, message_type, content, is_read, created_at`,
      clientId,
      senderUserId,
      body,
    );

    // Fire-and-forget — push delivery shouldn't block the API response.
    void this.push.sendToClient(clientId, {
      title: 'New message from your nutritionist',
      body: body.length > 140 ? `${body.slice(0, 140)}…` : body,
      url: '/chat',
      tag: `msg-${clientId}`,
    }).catch((err) => this.logger.warn(`Push send failed: ${err}`));

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

  // ─────────────────────────────────────────────────────────────────
  // Appointments — list / book / cancel
  // ─────────────────────────────────────────────────────────────────

  async myAppointments(userId: string): Promise<Appointment[]> {
    const rows = await this.prisma.$queryRawUnsafe<Appointment[]>(
      `SELECT a.id, a.scheduled_at, a.duration_minutes,
              a.kind, a.mode, a.status,
              a.meeting_url, a.location, a.notes,
              a.cancelled_at, a.cancel_reason
         FROM public.appointments a
         JOIN public.clients c ON c.id = a.client_id
        WHERE c.user_id = $1::uuid
        ORDER BY a.scheduled_at DESC
        LIMIT 100`,
      userId,
    );
    return rows;
  }

  async bookAppointment(
    userId: string,
    body: {
      scheduled_at: string;
      duration_minutes?: number;
      kind: 'consultation' | 'follow_up' | 'check_in' | 'assessment' | 'group_session';
      mode?: 'video' | 'phone' | 'in_person';
      notes?: string;
    },
  ): Promise<Appointment> {
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string; workspace_id: string }>>(
      `SELECT id, workspace_id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');

    const when = new Date(body.scheduled_at);
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException('scheduled_at must be a valid ISO timestamp.');
    }
    if (when.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Appointment must be in the future.');
    }

    const [row] = await this.prisma.$queryRawUnsafe<Appointment[]>(
      `INSERT INTO public.appointments
         (client_id, workspace_id, scheduled_at, duration_minutes, kind, mode, notes)
       VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, $5, $6, $7)
       RETURNING id, scheduled_at, duration_minutes,
                 kind, mode, status,
                 meeting_url, location, notes,
                 cancelled_at, cancel_reason`,
      me.id,
      me.workspace_id,
      when.toISOString(),
      body.duration_minutes ?? 30,
      body.kind,
      body.mode ?? 'video',
      body.notes ?? null,
    );

    // Push the booking confirmation back to the client's own devices so
    // multi-device users see it immediately (and the booking shows up
    // in their notification history even if the page didn't reload).
    void this.push.sendToClient(me.id, {
      title: 'Appointment booked',
      body: `${labelForKind(row.kind)} on ${formatWhen(row.scheduled_at)}`,
      url: '/appointments',
      tag: `appt-${row.id}`,
    }).catch((err) => this.logger.warn(`Push send failed: ${err}`));

    return row;
  }

  async cancelAppointment(userId: string, apptId: string, reason?: string): Promise<Appointment> {
    const rows = await this.prisma.$queryRawUnsafe<Appointment[]>(
      `UPDATE public.appointments a
          SET status = 'cancelled',
              cancelled_at = now(),
              cancelled_by = $1::uuid,
              cancel_reason = $3
         FROM public.clients c
        WHERE a.client_id = c.id
          AND c.user_id = $1::uuid
          AND a.id = $2::uuid
          AND a.status = 'scheduled'
       RETURNING a.id, a.scheduled_at, a.duration_minutes,
                 a.kind, a.mode, a.status,
                 a.meeting_url, a.location, a.notes,
                 a.cancelled_at, a.cancel_reason`,
      userId,
      apptId,
      reason ?? null,
    );
    if (!rows.length) {
      throw new NotFoundException('Appointment not found, already cancelled, or not yours.');
    }
    const appt = rows[0];

    // Lookup client_id so push can address by client (not user) and notify.
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (me) {
      void this.push.sendToClient(me.id, {
        title: 'Appointment cancelled',
        body: `${labelForKind(appt.kind)} on ${formatWhen(appt.scheduled_at)} was cancelled.`,
        url: '/appointments',
        tag: `appt-${appt.id}`,
      }).catch((err) => this.logger.warn(`Push send failed: ${err}`));
    }
    return appt;
  }

  // ─────────────────────────────────────────────────────────────────
  // Body measurements
  // ─────────────────────────────────────────────────────────────────

  async myMeasurements(userId: string, limit = 30): Promise<Measurement[]> {
    const me = await this.myClientId(userId);
    const lim = clamp(limit, 1, 200);
    return this.prisma.$queryRawUnsafe<Measurement[]>(
      `SELECT id, recorded_at,
              arm_inches::float    AS arm_inches,
              chest_inches::float  AS chest_inches,
              waist_inches::float  AS waist_inches,
              hip_inches::float    AS hip_inches,
              thigh_inches::float  AS thigh_inches,
              notes
         FROM public.client_measurements
        WHERE client_id = $1::uuid
        ORDER BY recorded_at DESC
        LIMIT $2`,
      me,
      lim,
    );
  }

  async logMeasurement(
    userId: string,
    body: Partial<{
      arm_inches: number; chest_inches: number; waist_inches: number;
      hip_inches: number; thigh_inches: number; notes: string;
      recorded_at: string;
    }>,
  ): Promise<Measurement> {
    const me = await this.myClientId(userId);
    // Reject empty submissions — every field is optional but at least one must be set.
    const measureFields = [
      body.arm_inches, body.chest_inches, body.waist_inches,
      body.hip_inches, body.thigh_inches,
    ];
    if (measureFields.every((v) => v == null)) {
      throw new BadRequestException('Provide at least one measurement.');
    }
    const recordedAt = body.recorded_at
      ? new Date(body.recorded_at)
      : new Date();
    if (Number.isNaN(recordedAt.getTime())) {
      throw new BadRequestException('recorded_at must be a valid ISO timestamp.');
    }

    const [row] = await this.prisma.$queryRawUnsafe<Measurement[]>(
      `INSERT INTO public.client_measurements
         (client_id, recorded_at, arm_inches, chest_inches, waist_inches, hip_inches, thigh_inches, notes)
       VALUES ($1::uuid, $2::timestamptz,
               $3::numeric, $4::numeric, $5::numeric, $6::numeric, $7::numeric, $8)
       RETURNING id, recorded_at,
                 arm_inches::float    AS arm_inches,
                 chest_inches::float  AS chest_inches,
                 waist_inches::float  AS waist_inches,
                 hip_inches::float    AS hip_inches,
                 thigh_inches::float  AS thigh_inches,
                 notes`,
      me,
      recordedAt.toISOString(),
      body.arm_inches    ?? null,
      body.chest_inches  ?? null,
      body.waist_inches  ?? null,
      body.hip_inches    ?? null,
      body.thigh_inches  ?? null,
      body.notes?.slice(0, 500) ?? null,
    );
    return row;
  }

  async deleteMeasurement(userId: string, id: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const result = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.client_measurements
        WHERE id = $1::uuid AND client_id = $2::uuid
       RETURNING id`,
      id,
      me,
    );
    if (!result.length) throw new NotFoundException('Measurement not found.');
    return { deleted: true };
  }

  // ─────────────────────────────────────────────────────────────────
  // Assessment review cards — read-only for the client side
  //
  // The card lives in `pending_review_cards`. Cards become visible to the
  // client only when status = 'sent'. The form_responses JSONB is where
  // the client's answers land; until they fill it in we treat the card
  // as a notification to act on.
  // ─────────────────────────────────────────────────────────────────

  async myAssessmentCards(userId: string): Promise<AssessmentCard[]> {
    const me = await this.myClientId(userId);
    return this.prisma.$queryRawUnsafe<AssessmentCard[]>(
      `SELECT id, card_type, generated_content, status, workflow_stage,
              sent_at, reviewed_at, notes, created_at,
              -- piggy-back: did the client respond yet?
              (generated_content ? 'client_responses') AS has_responses
         FROM public.pending_review_cards
        WHERE client_id = $1::uuid AND status = 'sent'
        ORDER BY sent_at DESC NULLS LAST, created_at DESC
        LIMIT 100`,
      me,
    );
  }

  /**
   * Submit answers on an assessment card. We don't have a dedicated responses
   * column — we patch `generated_content -> client_responses` instead, which
   * keeps everything in one JSONB tree the nutritionist can read.
   */
  async submitAssessmentResponse(
    userId: string,
    cardId: string,
    responses: Record<string, unknown>,
  ): Promise<AssessmentCard> {
    const me = await this.myClientId(userId);
    if (!responses || typeof responses !== 'object') {
      throw new BadRequestException('responses must be an object.');
    }
    const [row] = await this.prisma.$queryRawUnsafe<AssessmentCard[]>(
      `UPDATE public.pending_review_cards
          SET generated_content = jsonb_set(
                COALESCE(generated_content, '{}'::jsonb),
                '{client_responses}',
                $3::jsonb,
                true
              ),
              updated_at = now()
        WHERE id = $1::uuid AND client_id = $2::uuid AND status = 'sent'
       RETURNING id, card_type, generated_content, status, workflow_stage,
                 sent_at, reviewed_at, notes, created_at,
                 (generated_content ? 'client_responses') AS has_responses`,
      cardId,
      me,
      JSON.stringify(responses),
    );
    if (!row) throw new NotFoundException('Assessment card not found or not yours.');
    return row;
  }

  // ─────────────────────────────────────────────────────────────────
  // Recipe library — read-only for clients. The nutritionist UI manages
  // CRUD; the client just consumes.
  // ─────────────────────────────────────────────────────────────────

  async listRecipes(params: { q?: string; cuisine?: string; limit?: number } = {}): Promise<RecipeListItem[]> {
    const limit = clamp(params.limit ?? 50, 1, 200);
    const where: string[] = [];
    const vals: unknown[] = [];
    if (params.q) {
      vals.push(`%${params.q.toLowerCase()}%`);
      where.push(`LOWER(r.name) LIKE $${vals.length}`);
    }
    if (params.cuisine) {
      vals.push(params.cuisine.toLowerCase());
      where.push(`LOWER(r.cuisine) = $${vals.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    vals.push(limit);

    return this.prisma.$queryRawUnsafe<RecipeListItem[]>(
      `SELECT r.id, r.name, r.description, r.servings, r.total_kcal, r.video_url, r.cuisine
         FROM public.recipes r
         ${whereSql}
        ORDER BY r.created_at DESC
        LIMIT $${vals.length}`,
      ...vals,
    );
  }

  async listCuisines(): Promise<string[]> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ cuisine: string }>>(
      `SELECT DISTINCT cuisine FROM public.recipes
        WHERE cuisine IS NOT NULL AND cuisine <> ''
        ORDER BY cuisine`,
    );
    return rows.map((r) => r.cuisine);
  }

  async getRecipe(id: string): Promise<RecipeDetail> {
    const [recipe] = await this.prisma.$queryRawUnsafe<RecipeListItem[]>(
      `SELECT id, name, description, servings, total_kcal, video_url, instructions
         FROM public.recipes
        WHERE id = $1::uuid
        LIMIT 1`,
      id,
    );
    if (!recipe) throw new NotFoundException('Recipe not found.');

    const ingredients = await this.prisma.$queryRawUnsafe<RecipeIngredient[]>(
      `SELECT ri.id, ri.quantity::float AS quantity, ri.unit,
              i.id AS ingredient_id, i.name, i.kcal_per_serving,
              i.protein::float AS protein,
              i.carbs::float   AS carbs,
              i.fats::float    AS fats
         FROM public.recipe_ingredients ri
         JOIN public.ingredients i ON i.id = ri.ingredient_id
        WHERE ri.recipe_id = $1::uuid
        ORDER BY i.name`,
      id,
    );

    return {
      ...recipe,
      instructions: (recipe as RecipeDetail).instructions ?? null,
      ingredients,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // File vault — list + sign download URLs. Files live in the
  // `client-files` Supabase storage bucket. The DB stores the bucket key
  // in `file_url`; we sign it on demand for downloads.
  // ─────────────────────────────────────────────────────────────────

  async myFiles(userId: string): Promise<FileItem[]> {
    const me = await this.myClientId(userId);
    return this.prisma.$queryRawUnsafe<FileItem[]>(
      `SELECT id, file_name, file_url, file_type, file_size, created_at
         FROM public.files
        WHERE client_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 200`,
      me,
    );
  }

  /**
   * Sign a download URL for the client's file. Returns a short-lived URL
   * the browser can fetch directly. We verify ownership first so a client
   * can't ask for a sibling's file by guessing the id.
   */
  async signFileDownload(userId: string, fileId: string): Promise<{ url: string; expiresInSeconds: number }> {
    const me = await this.myClientId(userId);
    const [file] = await this.prisma.$queryRawUnsafe<Array<{ file_url: string; file_name: string }>>(
      `SELECT file_url, file_name FROM public.files
        WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1`,
      fileId,
      me,
    );
    if (!file) throw new NotFoundException('File not found or not yours.');

    const expiresInSeconds = 60 * 10; // 10 minutes — plenty for one download.
    const supabaseUrl       = this.config.getOrThrow<string>('SUPABASE_URL').trim();
    const supabaseServiceKey = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY').trim();

    // The `file_url` column historically stored either the bucket key or a
    // full URL. Strip a leading bucket name if present.
    const objectPath = file.file_url
      .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/[^/]+\//, '')
      .replace(/^client-files\//, '');

    const resp = await fetch(
      `${supabaseUrl}/storage/v1/object/sign/client-files/${objectPath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      this.logger.warn(`Sign URL failed for ${objectPath}: ${resp.status} ${text}`);
      throw new BadRequestException('Could not sign file URL. The file may be missing in storage.');
    }
    const json = (await resp.json()) as { signedURL?: string; signedUrl?: string };
    const signedPath = json.signedURL ?? json.signedUrl;
    if (!signedPath) {
      throw new BadRequestException('Storage did not return a signed URL.');
    }
    return {
      url: `${supabaseUrl}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`,
      expiresInSeconds,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Wave 1 — engagement + India features
  // ─────────────────────────────────────────────────────────────────

  // -- Mood + energy ----------------------------------------------------
  async logMood(
    userId: string,
    body: { mood?: number; energy?: number; mood_notes?: string; date?: string },
  ): Promise<{ date: string; mood: number | null; energy: number | null }> {
    const me = await this.myClientId(userId);
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{ log_date: string; mood: number | null; energy: number | null }>
    >(
      `INSERT INTO public.daily_logs (client_id, log_date, mood, energy, mood_notes)
       VALUES ($1::uuid, $2::date, $3::smallint, $4::smallint, $5)
       ON CONFLICT (client_id, log_date) DO UPDATE SET
         mood       = COALESCE(EXCLUDED.mood,       public.daily_logs.mood),
         energy     = COALESCE(EXCLUDED.energy,     public.daily_logs.energy),
         mood_notes = COALESCE(EXCLUDED.mood_notes, public.daily_logs.mood_notes),
         updated_at = now()
      RETURNING to_char(log_date, 'YYYY-MM-DD') AS log_date, mood, energy`,
      me,
      date,
      body.mood ?? null,
      body.energy ?? null,
      body.mood_notes ?? null,
    );
    return { date: row.log_date, mood: row.mood, energy: row.energy };
  }

  async myMoodHistory(userId: string, days = 30): Promise<Array<{
    date: string; mood: number | null; energy: number | null; notes: string | null;
  }>> {
    const me = await this.myClientId(userId);
    const d = clamp(days, 1, 365);
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      log_date: string; mood: number | null; energy: number | null; mood_notes: string | null;
    }>>(
      `SELECT to_char(log_date, 'YYYY-MM-DD') AS log_date, mood, energy, mood_notes
         FROM public.daily_logs
        WHERE client_id = $1::uuid
          AND (mood IS NOT NULL OR energy IS NOT NULL)
          AND log_date > CURRENT_DATE - ($2 || ' days')::interval
        ORDER BY log_date DESC`,
      me,
      String(d),
    );
    return rows.map((r) => ({
      date: r.log_date, mood: r.mood, energy: r.energy, notes: r.mood_notes,
    }));
  }

  // -- Cycle tracker ----------------------------------------------------
  async myCycleEvents(userId: string, days = 180): Promise<CycleEvent[]> {
    const me = await this.myClientId(userId);
    const d = clamp(days, 1, 730);
    return this.prisma.$queryRawUnsafe<CycleEvent[]>(
      `SELECT id, event_type, to_char(event_date, 'YYYY-MM-DD') AS event_date,
              flow_level, notes
         FROM public.cycle_events
        WHERE client_id = $1::uuid
          AND event_date > CURRENT_DATE - ($2 || ' days')::interval
        ORDER BY event_date DESC
        LIMIT 500`,
      me,
      String(d),
    );
  }

  async logCycleEvent(
    userId: string,
    body: { event_type: CycleEvent['event_type']; event_date?: string; flow_level?: number; notes?: string },
  ): Promise<CycleEvent> {
    const me = await this.myClientId(userId);
    const eventDate = body.event_date ?? new Date().toISOString().slice(0, 10);
    const [row] = await this.prisma.$queryRawUnsafe<CycleEvent[]>(
      `INSERT INTO public.cycle_events (client_id, event_type, event_date, flow_level, notes)
       VALUES ($1::uuid, $2, $3::date, $4::smallint, $5)
       RETURNING id, event_type, to_char(event_date, 'YYYY-MM-DD') AS event_date,
                 flow_level, notes`,
      me,
      body.event_type,
      eventDate,
      body.flow_level ?? null,
      body.notes ?? null,
    );
    return row;
  }

  async deleteCycleEvent(userId: string, id: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.cycle_events WHERE id = $1::uuid AND client_id = $2::uuid RETURNING id`,
      id, me,
    );
    if (!r.length) throw new NotFoundException('Event not found.');
    return { deleted: true };
  }

  /**
   * Predict next period start from the last 3-6 period_start events.
   * Returns null when there isn't enough history (<2 cycles).
   */
  async cyclePrediction(userId: string): Promise<{
    cycle_length_days: number | null;
    last_period_start: string | null;
    predicted_next_period: string | null;
    fertile_window_start: string | null;
    fertile_window_end: string | null;
  }> {
    const me = await this.myClientId(userId);
    const rows = await this.prisma.$queryRawUnsafe<Array<{ event_date: string }>>(
      `SELECT to_char(event_date, 'YYYY-MM-DD') AS event_date
         FROM public.cycle_events
        WHERE client_id = $1::uuid AND event_type = 'period_start'
        ORDER BY event_date DESC
        LIMIT 6`,
      me,
    );
    if (rows.length < 1) {
      return { cycle_length_days: null, last_period_start: null,
        predicted_next_period: null, fertile_window_start: null, fertile_window_end: null };
    }
    const dates = rows.map((r) => new Date(r.event_date).getTime()).sort((a, b) => b - a);
    if (dates.length < 2) {
      return {
        cycle_length_days: null,
        last_period_start: rows[0].event_date,
        predicted_next_period: null,
        fertile_window_start: null, fertile_window_end: null,
      };
    }
    // Average gap (most recent first → newer gaps weighted more)
    const gaps: number[] = [];
    for (let i = 0; i < dates.length - 1; i++) {
      gaps.push(Math.round((dates[i] - dates[i + 1]) / 86_400_000));
    }
    const avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    const last = new Date(dates[0]);
    const next = new Date(last.getTime() + avg * 86_400_000);
    // Fertile window ≈ 14 days before next period, ±2 days.
    const fertileEnd   = new Date(next.getTime() - 12 * 86_400_000);
    const fertileStart = new Date(next.getTime() - 16 * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return {
      cycle_length_days: avg,
      last_period_start: fmt(last),
      predicted_next_period: fmt(next),
      fertile_window_start: fmt(fertileStart),
      fertile_window_end:   fmt(fertileEnd),
    };
  }

  // -- Photo journal ---------------------------------------------------
  async myProgressPhotos(userId: string): Promise<ProgressPhoto[]> {
    const me = await this.myClientId(userId);
    return this.prisma.$queryRawUnsafe<ProgressPhoto[]>(
      `SELECT id, taken_at, angle, storage_key,
              weight_kg::float AS weight_kg, notes
         FROM public.progress_photos
        WHERE client_id = $1::uuid
        ORDER BY taken_at DESC
        LIMIT 200`,
      me,
    );
  }

  async addProgressPhoto(
    userId: string,
    body: { storage_key: string; angle?: 'front' | 'side' | 'back'; weight_kg?: number; notes?: string; taken_at?: string },
  ): Promise<ProgressPhoto> {
    const me = await this.myClientId(userId);
    const takenAt = body.taken_at ? new Date(body.taken_at) : new Date();
    if (Number.isNaN(takenAt.getTime())) {
      throw new BadRequestException('taken_at must be a valid ISO timestamp.');
    }
    const [row] = await this.prisma.$queryRawUnsafe<ProgressPhoto[]>(
      `INSERT INTO public.progress_photos (client_id, taken_at, angle, storage_key, weight_kg, notes)
       VALUES ($1::uuid, $2::timestamptz, $3, $4, $5::numeric, $6)
       RETURNING id, taken_at, angle, storage_key, weight_kg::float AS weight_kg, notes`,
      me,
      takenAt.toISOString(),
      body.angle ?? null,
      body.storage_key,
      body.weight_kg ?? null,
      body.notes ?? null,
    );
    return row;
  }

  async deleteProgressPhoto(userId: string, id: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ id: string; storage_key: string }>>(
      `DELETE FROM public.progress_photos
        WHERE id = $1::uuid AND client_id = $2::uuid
       RETURNING id, storage_key`,
      id, me,
    );
    if (!r.length) throw new NotFoundException('Photo not found.');
    // Best-effort storage delete — we don't fail the API if Supabase storage is slow.
    void this.deleteFromStorage('progress-photos', r[0].storage_key)
      .catch((err) => this.logger.warn(`Could not remove storage object ${r[0].storage_key}: ${err}`));
    return { deleted: true };
  }

  /** Sign a short-lived URL so the browser can render a stored photo. */
  async signProgressPhoto(userId: string, id: string): Promise<{ url: string; expiresInSeconds: number }> {
    const me = await this.myClientId(userId);
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ storage_key: string }>>(
      `SELECT storage_key FROM public.progress_photos
        WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1`,
      id, me,
    );
    if (!row) throw new NotFoundException('Photo not found.');
    return this.signStorageObject('progress-photos', row.storage_key);
  }

  /**
   * Issue a one-shot upload token + path the client can POST a photo to.
   * The browser POSTs the file directly to Supabase storage so the backend
   * doesn't have to proxy bytes. After upload, the browser calls
   * addProgressPhoto with the returned storage_key to create the DB row.
   */
  async createPhotoUploadTicket(
    userId: string,
    fileName: string,
  ): Promise<{ uploadUrl: string; storageKey: string; token: string }> {
    const me = await this.myClientId(userId);
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL').trim();
    const serviceKey  = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY').trim();
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    // Folder per client so signed downloads can't traverse.
    const key = `${me}/${Date.now()}-${randomBytes(6).toString('hex')}-${safe}`;

    // Use Supabase's signed-upload-url feature so the browser can PUT directly.
    const resp = await fetch(
      `${supabaseUrl}/storage/v1/object/upload/sign/progress-photos/${key}`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}` },
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      this.logger.warn(`Sign upload failed: ${resp.status} ${text}`);
      throw new BadRequestException('Could not prepare upload.');
    }
    const json = (await resp.json()) as { url?: string; token?: string };
    if (!json.url || !json.token) {
      throw new BadRequestException('Storage did not return a signed upload URL.');
    }
    const fullUrl = json.url.startsWith('http')
      ? json.url
      : `${supabaseUrl}/storage/v1${json.url.startsWith('/') ? '' : '/'}${json.url}`;
    return { uploadUrl: fullUrl, storageKey: key, token: json.token };
  }

  // -- Symptom tracker -------------------------------------------------
  async mySymptoms(userId: string, days = 60): Promise<Symptom[]> {
    const me = await this.myClientId(userId);
    const d = clamp(days, 1, 365);
    return this.prisma.$queryRawUnsafe<Symptom[]>(
      `SELECT id, occurred_at, symptom, severity, notes, suspected_trigger
         FROM public.symptom_logs
        WHERE client_id = $1::uuid
          AND occurred_at > now() - ($2 || ' days')::interval
        ORDER BY occurred_at DESC
        LIMIT 300`,
      me,
      String(d),
    );
  }

  async logSymptom(
    userId: string,
    body: { symptom: string; severity?: number; notes?: string; suspected_trigger?: string; occurred_at?: string },
  ): Promise<Symptom> {
    const me = await this.myClientId(userId);
    const name = body.symptom.trim();
    if (!name) throw new BadRequestException('Symptom name is required.');
    if (name.length > 80) throw new BadRequestException('Symptom name too long.');
    const occurredAt = body.occurred_at ? new Date(body.occurred_at) : new Date();
    const [row] = await this.prisma.$queryRawUnsafe<Symptom[]>(
      `INSERT INTO public.symptom_logs
         (client_id, occurred_at, symptom, severity, notes, suspected_trigger)
       VALUES ($1::uuid, $2::timestamptz, $3, $4::smallint, $5, $6)
       RETURNING id, occurred_at, symptom, severity, notes, suspected_trigger`,
      me,
      occurredAt.toISOString(),
      name,
      body.severity ?? 2,
      body.notes ?? null,
      body.suspected_trigger ?? null,
    );
    return row;
  }

  async deleteSymptom(userId: string, id: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.symptom_logs
        WHERE id = $1::uuid AND client_id = $2::uuid RETURNING id`,
      id, me,
    );
    if (!r.length) throw new NotFoundException('Symptom not found.');
    return { deleted: true };
  }

  // -- Goal milestones -------------------------------------------------
  async myMilestones(userId: string): Promise<Milestone[]> {
    const me = await this.myClientId(userId);
    // Compute fresh milestones each time we list — cheap and keeps the table
    // in sync without scheduled jobs.
    await this.recomputeMilestones(me);
    return this.prisma.$queryRawUnsafe<Milestone[]>(
      `SELECT id, kind, value::float AS value, achieved_at, celebrated, message
         FROM public.client_milestones
        WHERE client_id = $1::uuid
        ORDER BY achieved_at DESC
        LIMIT 50`,
      me,
    );
  }

  async celebrateMilestone(userId: string, id: string): Promise<{ celebrated: true }> {
    const me = await this.myClientId(userId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE public.client_milestones
          SET celebrated = true
        WHERE id = $1::uuid AND client_id = $2::uuid RETURNING id`,
      id, me,
    );
    if (!r.length) throw new NotFoundException('Milestone not found.');
    return { celebrated: true };
  }

  /**
   * Look at habit + measurement history and INSERT a milestones row for
   * each threshold the client has just crossed. UNIQUE constraint dedupes.
   */
  private async recomputeMilestones(clientId: string): Promise<void> {
    // Weight lost (kg) — compare earliest weight to lowest weight ever.
    const [w] = await this.prisma.$queryRawUnsafe<Array<{ first_w: number | null; min_w: number | null }>>(
      `SELECT MIN(weight)::float FILTER (WHERE log_date = (SELECT MIN(log_date) FROM public.daily_logs WHERE client_id = $1::uuid AND weight IS NOT NULL)) AS first_w,
              MIN(weight)::float AS min_w
         FROM public.daily_logs
        WHERE client_id = $1::uuid AND weight IS NOT NULL`,
      clientId,
    );
    if (w?.first_w != null && w.min_w != null && w.first_w > w.min_w) {
      const lost = w.first_w - w.min_w;
      const thresholds = [1, 2, 5, 10, 15, 20];
      for (const t of thresholds) {
        if (lost >= t) {
          await this.prisma.$queryRawUnsafe(
            `INSERT INTO public.client_milestones (client_id, kind, value, message)
             VALUES ($1::uuid, 'weight_lost_kg', $2::numeric, $3)
             ON CONFLICT (client_id, kind, value) DO NOTHING`,
            clientId, t, `You lost ${t} kg. That's huge.`,
          );
        }
      }
    }

    // Streak days — count consecutive logged days back from today.
    const [s] = await this.prisma.$queryRawUnsafe<Array<{ streak: number }>>(
      `SELECT COALESCE(MAX(streak_len), 0)::int AS streak FROM (
         SELECT COUNT(*) AS streak_len FROM (
           SELECT log_date,
                  log_date - (ROW_NUMBER() OVER (ORDER BY log_date DESC))::int * INTERVAL '1 day' AS grp
             FROM public.daily_logs
            WHERE client_id = $1::uuid
              AND (water_intake > 0 OR activity_minutes > 0 OR weight IS NOT NULL OR sleep_hours IS NOT NULL OR mood IS NOT NULL)
              AND log_date <= CURRENT_DATE
            ORDER BY log_date DESC LIMIT 200
         ) d GROUP BY grp ORDER BY MAX(log_date) DESC LIMIT 1
       ) sub`,
      clientId,
    );
    const streakThresholds = [3, 7, 14, 30, 60, 100];
    for (const t of streakThresholds) {
      if ((s?.streak ?? 0) >= t) {
        await this.prisma.$queryRawUnsafe(
          `INSERT INTO public.client_milestones (client_id, kind, value, message)
           VALUES ($1::uuid, 'streak_days', $2::numeric, $3)
           ON CONFLICT (client_id, kind, value) DO NOTHING`,
          clientId, t, `${t}-day streak. Consistency wins.`,
        );
      }
    }

    // Waist inches lost
    const [m] = await this.prisma.$queryRawUnsafe<Array<{ first: number | null; min: number | null }>>(
      `SELECT (SELECT waist_inches FROM public.client_measurements
                WHERE client_id = $1::uuid AND waist_inches IS NOT NULL
                ORDER BY recorded_at ASC LIMIT 1)::float AS first,
              MIN(waist_inches)::float AS min
         FROM public.client_measurements
        WHERE client_id = $1::uuid AND waist_inches IS NOT NULL`,
      clientId,
    );
    if (m?.first != null && m.min != null && m.first > m.min) {
      const lostIn = m.first - m.min;
      for (const t of [1, 2, 4, 6]) {
        if (lostIn >= t) {
          await this.prisma.$queryRawUnsafe(
            `INSERT INTO public.client_milestones (client_id, kind, value, message)
             VALUES ($1::uuid, 'waist_lost_in', $2::numeric, $3)
             ON CONFLICT (client_id, kind, value) DO NOTHING`,
            clientId, t, `${t} inches off your waist. Visible wins.`,
          );
        }
      }
    }
  }

  // -- Supplements -----------------------------------------------------
  async mySupplements(userId: string): Promise<Supplement[]> {
    const me = await this.myClientId(userId);
    return this.prisma.$queryRawUnsafe<Supplement[]>(
      `SELECT id, name, dosage, schedule, active, notes, created_at
         FROM public.client_supplements
        WHERE client_id = $1::uuid AND active = true
        ORDER BY name`,
      me,
    );
  }

  async upsertSupplement(
    userId: string,
    body: { id?: string; name: string; dosage?: string; schedule?: string[]; notes?: string },
  ): Promise<Supplement> {
    const me = await this.myClientId(userId);
    if (!body.name?.trim()) throw new BadRequestException('Name required.');
    if (body.id) {
      const [r] = await this.prisma.$queryRawUnsafe<Supplement[]>(
        `UPDATE public.client_supplements
            SET name = $3, dosage = $4, schedule = $5::text[], notes = $6, updated_at = now()
          WHERE id = $1::uuid AND client_id = $2::uuid
         RETURNING id, name, dosage, schedule, active, notes, created_at`,
        body.id, me, body.name.trim(), body.dosage ?? null,
        body.schedule ?? [], body.notes ?? null,
      );
      if (!r) throw new NotFoundException('Supplement not found.');
      return r;
    }
    const [r] = await this.prisma.$queryRawUnsafe<Supplement[]>(
      `INSERT INTO public.client_supplements (client_id, name, dosage, schedule, notes)
       VALUES ($1::uuid, $2, $3, $4::text[], $5)
       RETURNING id, name, dosage, schedule, active, notes, created_at`,
      me, body.name.trim(), body.dosage ?? null, body.schedule ?? [], body.notes ?? null,
    );
    return r;
  }

  async deactivateSupplement(userId: string, id: string): Promise<{ deactivated: true }> {
    const me = await this.myClientId(userId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE public.client_supplements
          SET active = false, updated_at = now()
        WHERE id = $1::uuid AND client_id = $2::uuid RETURNING id`,
      id, me,
    );
    if (!r.length) throw new NotFoundException('Supplement not found.');
    return { deactivated: true };
  }

  async logSupplementTaken(
    userId: string,
    id: string,
    slot?: string,
  ): Promise<{ taken: true }> {
    const me = await this.myClientId(userId);
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.supplement_logs (supplement_id, client_id, slot)
       SELECT id, client_id, $3 FROM public.client_supplements
        WHERE id = $1::uuid AND client_id = $2::uuid`,
      id, me, slot ?? null,
    );
    return { taken: true };
  }

  async todaysSupplementLog(userId: string): Promise<Array<{ supplement_id: string; slot: string | null; taken_at: string }>> {
    const me = await this.myClientId(userId);
    return this.prisma.$queryRawUnsafe<Array<{ supplement_id: string; slot: string | null; taken_at: string }>>(
      `SELECT supplement_id, slot, taken_at
         FROM public.supplement_logs
        WHERE client_id = $1::uuid
          AND taken_at >= CURRENT_DATE
        ORDER BY taken_at`,
      me,
    );
  }

  // -- Festivals (static — no DB) --------------------------------------

  /**
   * Calendar of major Indian festivals for the next 12 months. Static because
   * the dates are deterministic for Gregorian-fixed ones and pre-computed for
   * lunar ones — this avoids a third-party API dependency in dev. Replace
   * with a proper lookup when you need >1 year ahead.
   */
  upcomingFestivals(): Festival[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Year-agnostic month/day. We project into the current + next year and filter to "next 90 days".
    const STATIC: Array<Omit<Festival, 'date'> & { mm: number; dd: number }> = [
      { name: 'Pongal',          tone: 'Sweets + festive meals — pace yourself.',          icon: 'sunrise',  mm: 1, dd: 14 },
      { name: 'Republic Day',    tone: 'A national holiday.',                              icon: 'flag',     mm: 1, dd: 26 },
      { name: 'Holi',            tone: 'Thandai + sweets day. Hydrate + step it up tomorrow.', icon: 'sparkles', mm: 3, dd: 14 },
      { name: 'Ugadi',           tone: 'Sweet + sour blend — eat slowly, enjoy fully.',    icon: 'sun',      mm: 3, dd: 30 },
      { name: 'Eid al-Fitr',     tone: 'Sweets, biryani, family. Add a brisk walk after.', icon: 'moon',     mm: 4, dd: 10 },
      { name: 'Tamil New Year',  tone: 'Festive plates — protein early, sweet late.',      icon: 'sparkles', mm: 4, dd: 14 },
      { name: 'Independence Day',tone: 'Public holiday.',                                  icon: 'flag',     mm: 8, dd: 15 },
      { name: 'Raksha Bandhan',  tone: 'Sweets shared with family. Save half for tomorrow.', icon: 'sparkles', mm: 8, dd: 19 },
      { name: 'Janmashtami',     tone: 'Fasting day for many — gentle re-fuel after.',     icon: 'moon',     mm: 8, dd: 26 },
      { name: 'Ganesh Chaturthi',tone: 'Modak season. One a day, not three.',              icon: 'sparkles', mm: 9, dd: 7  },
      { name: 'Onam',            tone: 'Sadya feast — eat slow, eat half.',                icon: 'sun',      mm: 9, dd: 5  },
      { name: 'Navratri',        tone: 'Fasting + dancing. Hydrate, log mood daily.',      icon: 'sparkles', mm: 10, dd: 3 },
      { name: 'Dussehra',        tone: 'Big meal day — split into two smaller ones.',      icon: 'flag',     mm: 10, dd: 12 },
      { name: 'Karwa Chauth',    tone: 'Sunrise-to-moonrise fast. Hydrate well at sundown.', icon: 'moon',   mm: 11, dd: 1 },
      { name: 'Diwali',          tone: 'Sweets week. Pace, walk, water.',                  icon: 'sparkles', mm: 11, dd: 1 },
      { name: 'Bhai Dooj',       tone: 'Family meals — focus on connection, not seconds.', icon: 'sparkles', mm: 11, dd: 3 },
      { name: 'Christmas',       tone: 'Festive treats. Add 20 min walk after dinner.',    icon: 'sparkles', mm: 12, dd: 25 },
    ];
    const out: Festival[] = [];
    for (const item of STATIC) {
      for (const yearOffset of [0, 1]) {
        const candidate = new Date(today.getFullYear() + yearOffset, item.mm - 1, item.dd);
        const diff = (candidate.getTime() - today.getTime()) / 86_400_000;
        if (diff >= 0 && diff <= 90) {
          out.push({ name: item.name, tone: item.tone, icon: item.icon,
            date: candidate.toISOString().slice(0, 10) });
        }
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }

  // -- AI weekly summary -----------------------------------------------
  async myWeeklySummary(userId: string): Promise<{ summary: string; metrics: Record<string, unknown> }> {
    const me = await this.myClientId(userId);

    // Gather last 7 days of signal.
    const [stats] = await this.prisma.$queryRawUnsafe<Array<{
      logged_days: number;
      avg_water: number | null;
      total_exercise: number | null;
      avg_sleep: number | null;
      avg_mood: number | null;
      avg_energy: number | null;
      meals_logged: number;
    }>>(
      `WITH window7 AS (
         SELECT * FROM public.daily_logs
          WHERE client_id = $1::uuid AND log_date >= CURRENT_DATE - INTERVAL '7 days'
       )
       SELECT COUNT(*)::int                                                 AS logged_days,
              AVG(water_intake)                                              AS avg_water,
              SUM(activity_minutes)                                          AS total_exercise,
              AVG(sleep_hours)                                               AS avg_sleep,
              AVG(mood)                                                      AS avg_mood,
              AVG(energy)                                                    AS avg_energy,
              (SELECT COUNT(*)::int FROM public.meal_logs ml
                JOIN public.clients c ON c.id = ml.client_id
                WHERE c.user_id = $2::uuid
                  AND ml.logged_at >= CURRENT_DATE - INTERVAL '7 days')      AS meals_logged
         FROM window7`,
      me,
      userId,
    );

    const metrics = {
      logged_days:    Number(stats?.logged_days ?? 0),
      avg_water_ml:   stats?.avg_water  != null ? Math.round(Number(stats.avg_water)) : null,
      total_exercise_min: stats?.total_exercise != null ? Number(stats.total_exercise) : 0,
      avg_sleep_hrs:  stats?.avg_sleep  != null ? +Number(stats.avg_sleep).toFixed(1) : null,
      avg_mood:       stats?.avg_mood   != null ? +Number(stats.avg_mood).toFixed(1)  : null,
      avg_energy:     stats?.avg_energy != null ? +Number(stats.avg_energy).toFixed(1) : null,
      meals_logged:   Number(stats?.meals_logged ?? 0),
    };

    // Try Gemini if configured; otherwise return a template summary.
    const geminiKey = this.config.get<string>('GEMINI_API_KEY');
    if (geminiKey) {
      try {
        const summary = await this.geminiWeeklySummary(geminiKey, metrics);
        return { summary, metrics };
      } catch (err) {
        this.logger.warn(`Gemini summary failed, falling back to template: ${(err as Error).message}`);
      }
    }
    return { summary: this.fallbackWeeklySummary(metrics), metrics };
  }

  private fallbackWeeklySummary(m: Record<string, unknown>): string {
    const parts: string[] = [];
    if ((m.logged_days as number) >= 6)      parts.push('You logged almost every day this week — that consistency is the win.');
    else if ((m.logged_days as number) >= 3) parts.push(`You logged ${m.logged_days} of 7 days. Try one more tomorrow.`);
    else                                      parts.push('Light logging week. One sip of water tracked is a win — start small.');
    if ((m.avg_water_ml as number) >= 2000)  parts.push(`Average ${m.avg_water_ml} ml of water — strong hydration.`);
    if ((m.total_exercise_min as number) >= 100) parts.push(`${m.total_exercise_min} minutes of exercise this week.`);
    if ((m.avg_sleep_hrs as number) && (m.avg_sleep_hrs as number) >= 7) parts.push('Sleep is in a healthy range.');
    if ((m.avg_mood as number) && (m.avg_mood as number) >= 3.5) parts.push('Mood trending positive.');
    if (parts.length === 0) parts.push('Quiet week. Worth a check-in with yourself — what felt off?');
    return parts.join(' ');
  }

  private async geminiWeeklySummary(apiKey: string, m: Record<string, unknown>): Promise<string> {
    const prompt = `You are a warm wellness coach writing a 2-3 sentence weekly summary for a client. Be specific, encouraging, never preachy. Use the numbers below. Keep it under 80 words. Numbers: ${JSON.stringify(m)}`;
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.7 },
        }),
      },
    );
    if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
    const json = (await resp.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Empty Gemini response');
    return text;
  }

  // -- Storage helpers --------------------------------------------------

  private async signStorageObject(bucket: string, key: string): Promise<{ url: string; expiresInSeconds: number }> {
    const expiresInSeconds = 60 * 60;
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL').trim();
    const serviceKey  = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY').trim();
    const resp = await fetch(
      `${supabaseUrl}/storage/v1/object/sign/${bucket}/${key}`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      },
    );
    if (!resp.ok) throw new BadRequestException('Could not sign storage URL.');
    const json = (await resp.json()) as { signedURL?: string; signedUrl?: string };
    const path = json.signedURL ?? json.signedUrl;
    if (!path) throw new BadRequestException('Storage returned no URL.');
    return {
      url: `${supabaseUrl}/storage/v1${path.startsWith('/') ? '' : '/'}${path}`,
      expiresInSeconds,
    };
  }

  private async deleteFromStorage(bucket: string, key: string): Promise<void> {
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL').trim();
    const serviceKey  = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY').trim();
    await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${serviceKey}` },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Push subscriptions — save/remove
  // ─────────────────────────────────────────────────────────────────

  async savePushSubscription(
    userId: string,
    body: { endpoint: string; p256dh: string; auth: string; user_agent?: string },
  ): Promise<{ subscribed: true }> {
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');

    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.push_subscriptions (client_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1::uuid, $2, $3, $4, $5)
       ON CONFLICT (client_id, endpoint) DO UPDATE SET
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         last_used_at = now()`,
      me.id,
      body.endpoint,
      body.p256dh,
      body.auth,
      body.user_agent ?? null,
    );
    return { subscribed: true };
  }

  async removePushSubscription(
    userId: string,
    endpoint: string,
  ): Promise<{ unsubscribed: true }> {
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.push_subscriptions
        WHERE client_id = $1::uuid AND endpoint = $2`,
      me.id,
      endpoint,
    );
    return { unsubscribed: true };
  }

  // ─────────────────────────────────────────────────────────────────
  // Community — groups, posts, reactions, comments
  //
  // The legacy Sheizen platform shipped 10 community_* tables with full
  // RLS. We use them as-is rather than introducing parallel structures.
  // ─────────────────────────────────────────────────────────────────

  private async myClientId(userId: string): Promise<string> {
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');
    return me.id;
  }

  async listGroups(userId: string): Promise<CommunityGroup[]> {
    const me = await this.myClientId(userId);
    return this.prisma.$queryRawUnsafe<CommunityGroup[]>(
      `SELECT g.id, g.name, g.slug, g.description, g.cover_image_url,
              g.is_private, g.member_count,
              EXISTS (
                SELECT 1 FROM public.community_group_members gm
                 WHERE gm.group_id = g.id AND gm.client_id = $1::uuid AND gm.status = 'active'
              ) AS is_member,
              CASE
                WHEN g.owner_client_id = $1::uuid THEN 'owner'
                ELSE (
                  SELECT gm.role::text FROM public.community_group_members gm
                   WHERE gm.group_id = g.id AND gm.client_id = $1::uuid AND gm.status = 'active'
                   LIMIT 1
                )
              END AS my_role,
              (
                SELECT gm.status FROM public.community_group_members gm
                 WHERE gm.group_id = g.id AND gm.client_id = $1::uuid LIMIT 1
              ) AS my_status,
              g.created_at,
              g.is_challenge,
              g.starts_at,
              g.ends_at,
              g.target_metric::text AS target_metric,
              g.target_value
         FROM public.community_groups g
        WHERE g.is_private = false OR EXISTS (
                SELECT 1 FROM public.community_group_members gm
                 WHERE gm.group_id = g.id AND gm.client_id = $1::uuid AND gm.status = 'active'
              )
        ORDER BY (
          EXISTS (
            SELECT 1 FROM public.community_group_members gm
             WHERE gm.group_id = g.id AND gm.client_id = $1::uuid AND gm.status = 'active'
          )
        ) DESC, g.member_count DESC NULLS LAST, g.created_at DESC
        LIMIT 50`,
      me,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Challenge leaderboard — sums each member's target_metric inside
  // [starts_at, ends_at] and ranks. Group must have is_challenge = true.
  // ─────────────────────────────────────────────────────────────────

  async groupLeaderboard(
    userId: string,
    groupId: string,
  ): Promise<{
    group: {
      id: string; name: string; target_metric: ChallengeMetric;
      target_value: number; starts_at: string; ends_at: string;
      is_active: boolean;
    };
    entries: LeaderboardEntry[];
    me_rank: number | null;
    me_value: number;
  }> {
    const me = await this.myClientId(userId);

    const [g] = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string; name: string;
        is_challenge: boolean;
        starts_at: string | null; ends_at: string | null;
        target_metric: ChallengeMetric | null; target_value: number | null;
      }>
    >(
      `SELECT id, name, is_challenge, starts_at, ends_at,
              target_metric::text AS target_metric, target_value
         FROM public.community_groups
        WHERE id = $1::uuid
        LIMIT 1`,
      groupId,
    );
    if (!g) throw new NotFoundException('Group not found.');
    if (!g.is_challenge || !g.target_metric || !g.starts_at || !g.ends_at) {
      throw new BadRequestException('This group is not a challenge.');
    }

    // Verify the caller can see this leaderboard (member of the group OR
    // the group is public). Matches listGroups visibility.
    const [vis] = await this.prisma.$queryRawUnsafe<
      Array<{ visible: boolean }>
    >(
      `SELECT (g.is_private = false OR EXISTS (
                 SELECT 1 FROM public.community_group_members gm
                  WHERE gm.group_id = g.id AND gm.client_id = $2::uuid AND gm.status = 'active'
              )) AS visible
         FROM public.community_groups g
        WHERE g.id = $1::uuid`,
      groupId,
      me,
    );
    if (!vis?.visible) {
      throw new ForbiddenException('You can\'t see this leaderboard.');
    }

    // Build the metric expression for the join. We always join through
    // active members of THIS group so non-joiners don't pollute the board.
    // The four metrics each have their own subquery pattern.
    const sql = (() => {
      const base = `
        WITH members AS (
          SELECT gm.client_id, c.name
            FROM public.community_group_members gm
            JOIN public.clients c ON c.id = gm.client_id
           WHERE gm.group_id = $1::uuid AND gm.status = 'active'
        )`;
      switch (g.target_metric) {
        case 'water_ml':
          return `${base}
            SELECT m.client_id, m.name,
                   COALESCE(SUM(dl.water_intake), 0)::int AS value
              FROM members m
              LEFT JOIN public.daily_logs dl
                     ON dl.client_id = m.client_id
                    AND dl.log_date BETWEEN $2::date AND $3::date
             GROUP BY m.client_id, m.name`;
        case 'exercise_minutes':
          return `${base}
            SELECT m.client_id, m.name,
                   COALESCE(SUM(dl.activity_minutes), 0)::int AS value
              FROM members m
              LEFT JOIN public.daily_logs dl
                     ON dl.client_id = m.client_id
                    AND dl.log_date BETWEEN $2::date AND $3::date
             GROUP BY m.client_id, m.name`;
        case 'posts':
          return `${base}
            SELECT m.client_id, m.name,
                   COALESCE(COUNT(p.id), 0)::int AS value
              FROM members m
              LEFT JOIN public.community_posts p
                     ON p.author_client_id = m.client_id
                    AND p.group_id = $1::uuid
                    AND p.created_at BETWEEN $2::timestamptz AND $3::timestamptz
             GROUP BY m.client_id, m.name`;
        case 'streak_days':
          // Distinct logged days falling in the window. Not strictly a
          // "consecutive" streak — for a contest window we treat any
          // logged day in [start, end] as one tick toward the target.
          return `${base}
            SELECT m.client_id, m.name,
                   COALESCE(COUNT(DISTINCT dl.log_date), 0)::int AS value
              FROM members m
              LEFT JOIN public.daily_logs dl
                     ON dl.client_id = m.client_id
                    AND dl.log_date BETWEEN $2::date AND $3::date
                    AND (dl.water_intake > 0 OR dl.activity_minutes > 0
                         OR dl.weight IS NOT NULL OR dl.sleep_hours IS NOT NULL)
             GROUP BY m.client_id, m.name`;
        default:
          throw new BadRequestException(`Unsupported metric ${g.target_metric}`);
      }
    })();

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ client_id: string; name: string; value: number }>
    >(sql, groupId, g.starts_at, g.ends_at);

    // Sort + rank in JS. With group sizes in the dozens-to-hundreds this is
    // cheaper than a Postgres window function on every request.
    const sorted = rows.sort((a, b) => Number(b.value) - Number(a.value));
    const entries: LeaderboardEntry[] = sorted.map((r, i) => ({
      client_id: r.client_id,
      name: r.name,
      value: Number(r.value),
      rank: i + 1,
      is_me: r.client_id === me,
    }));

    const meEntry = entries.find((e) => e.is_me);
    const isActive = (() => {
      const now = Date.now();
      const s = g.starts_at ? new Date(g.starts_at).getTime() : 0;
      const e = g.ends_at   ? new Date(g.ends_at).getTime()   : 0;
      return now >= s && now <= e;
    })();

    return {
      group: {
        id: g.id, name: g.name,
        target_metric: g.target_metric,
        target_value:  g.target_value ?? 0,
        starts_at:     g.starts_at!,
        ends_at:       g.ends_at!,
        is_active:     isActive,
      },
      entries,
      me_rank:  meEntry?.rank  ?? null,
      me_value: meEntry?.value ?? 0,
    };
  }

  async joinGroup(userId: string, groupId: string): Promise<{ joined: true; memberCount: number }> {
    const me = await this.myClientId(userId);
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.community_group_members (group_id, client_id, role, status)
       VALUES ($1::uuid, $2::uuid, 'member', 'active')
       ON CONFLICT (group_id, client_id) DO UPDATE SET status = 'active'`,
      groupId,
      me,
    );
    // Keep member_count fresh — cheap denormalization, recomputed from truth.
    const [count] = await this.prisma.$queryRawUnsafe<Array<{ member_count: number }>>(
      `WITH new_count AS (
         SELECT COUNT(*)::int AS n FROM public.community_group_members
          WHERE group_id = $1::uuid AND status = 'active'
       )
       UPDATE public.community_groups
          SET member_count = (SELECT n FROM new_count)
        WHERE id = $1::uuid
       RETURNING member_count`,
      groupId,
    );
    if (!count) throw new NotFoundException('Group not found.');
    return { joined: true, memberCount: count.member_count };
  }

  async leaveGroup(userId: string, groupId: string): Promise<{ left: true; memberCount: number }> {
    const me = await this.myClientId(userId);
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.community_group_members
        WHERE group_id = $1::uuid AND client_id = $2::uuid`,
      groupId,
      me,
    );
    const [count] = await this.prisma.$queryRawUnsafe<Array<{ member_count: number }>>(
      `WITH new_count AS (
         SELECT COUNT(*)::int AS n FROM public.community_group_members
          WHERE group_id = $1::uuid AND status = 'active'
       )
       UPDATE public.community_groups
          SET member_count = (SELECT n FROM new_count)
        WHERE id = $1::uuid
       RETURNING member_count`,
      groupId,
    );
    if (!count) throw new NotFoundException('Group not found.');
    return { left: true, memberCount: count.member_count };
  }

  async listPosts(
    userId: string,
    params: { groupId?: string; limit?: number } = {},
  ): Promise<CommunityPost[]> {
    const me = await this.myClientId(userId);
    const limit = clamp(params.limit ?? 30, 1, 100);

    if (params.groupId) {
      return this.prisma.$queryRawUnsafe<CommunityPost[]>(
        `SELECT p.id, p.author_client_id, p.author_display_name, p.author_service_type,
                p.group_id, p.title, p.content, p.media_urls,
                p.likes_count, p.comments_count, p.pinned, p.created_at,
                EXISTS (
                  SELECT 1 FROM public.community_reactions r
                   WHERE r.target_type = 'post' AND r.target_id = p.id
                     AND r.client_id = $1::uuid
                ) AS i_reacted
           FROM public.community_posts p
          WHERE p.group_id = $2::uuid
          ORDER BY p.pinned DESC, p.created_at DESC
          LIMIT $3`,
        me,
        params.groupId,
        limit,
      );
    }
    return this.prisma.$queryRawUnsafe<CommunityPost[]>(
      `SELECT p.id, p.author_client_id, p.author_display_name, p.author_service_type,
              p.group_id, p.title, p.content, p.media_urls,
              p.likes_count, p.comments_count, p.pinned, p.created_at,
              EXISTS (
                SELECT 1 FROM public.community_reactions r
                 WHERE r.target_type = 'post' AND r.target_id = p.id
                   AND r.client_id = $1::uuid
              ) AS i_reacted
         FROM public.community_posts p
        WHERE p.visibility = 'public'
          AND (p.group_id IS NULL OR EXISTS (
              SELECT 1 FROM public.community_group_members gm
               WHERE gm.group_id = p.group_id AND gm.client_id = $1::uuid AND gm.status = 'active'
          ))
        ORDER BY p.created_at DESC
        LIMIT $2`,
      me,
      limit,
    );
  }

  async createPost(
    userId: string,
    body: { content: string; groupId?: string; title?: string },
  ): Promise<CommunityPost> {
    const me = await this.myClientId(userId);
    const content = body.content.trim();
    if (!content) throw new BadRequestException('Post content cannot be empty.');
    if (content.length > 1000) throw new BadRequestException('Post too long (max 1000 characters).');

    // Block muted members from posting to groups they've been muted in.
    if (body.groupId) {
      const [mem] = await this.prisma.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT status FROM public.community_group_members
          WHERE group_id = $1::uuid AND client_id = $2::uuid LIMIT 1`,
        body.groupId,
        me,
      );
      if (mem?.status === 'muted') {
        throw new ForbiddenException('You are muted in this group.');
      }
    }

    // The community_posts table requires author_display_name — pull from clients.
    const [profile] = await this.prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM public.clients WHERE id = $1::uuid LIMIT 1`,
      me,
    );

    const [row] = await this.prisma.$queryRawUnsafe<CommunityPost[]>(
      `INSERT INTO public.community_posts
         (author_client_id, author_display_name, group_id, title, content, visibility)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, 'public')
       RETURNING id, author_client_id, author_display_name, author_service_type,
                 group_id, title, content, media_urls,
                 likes_count, comments_count, pinned, created_at,
                 false AS i_reacted`,
      me,
      profile?.name ?? 'Anonymous',
      body.groupId ?? null,
      body.title?.slice(0, 150) ?? null,
      content,
    );
    return row;
  }

  async toggleReaction(
    userId: string,
    postId: string,
    reaction: 'like' | 'love' | 'celebrate' = 'like',
  ): Promise<{ reacted: boolean; likesCount: number }> {
    const me = await this.myClientId(userId);

    // If we already reacted, remove it; otherwise insert one. likes_count
    // is updated atomically in the same statement so the read-back value
    // is consistent.
    const [existing] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.community_reactions
        WHERE target_type = 'post' AND target_id = $1::uuid AND client_id = $2::uuid
        LIMIT 1`,
      postId,
      me,
    );

    if (existing) {
      await this.prisma.$queryRawUnsafe(
        `DELETE FROM public.community_reactions WHERE id = $1::uuid`,
        existing.id,
      );
      const [post] = await this.prisma.$queryRawUnsafe<Array<{ likes_count: number }>>(
        `UPDATE public.community_posts
            SET likes_count = GREATEST(0, COALESCE(likes_count, 0) - 1)
          WHERE id = $1::uuid
         RETURNING likes_count`,
        postId,
      );
      return { reacted: false, likesCount: post?.likes_count ?? 0 };
    }

    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.community_reactions (client_id, target_type, target_id, reaction)
       VALUES ($1::uuid, 'post', $2::uuid, $3::public.community_reaction_type)`,
      me,
      postId,
      reaction,
    );
    const [post] = await this.prisma.$queryRawUnsafe<Array<{ likes_count: number }>>(
      `UPDATE public.community_posts
          SET likes_count = COALESCE(likes_count, 0) + 1
        WHERE id = $1::uuid
       RETURNING likes_count`,
      postId,
    );
    return { reacted: true, likesCount: post?.likes_count ?? 1 };
  }

  async listComments(postId: string, limit = 50): Promise<CommunityComment[]> {
    const lim = clamp(limit, 1, 200);
    return this.prisma.$queryRawUnsafe<CommunityComment[]>(
      `SELECT id, post_id, author_client_id, author_display_name, author_service_type,
              content, likes_count, created_at
         FROM public.community_comments
        WHERE post_id = $1::uuid
        ORDER BY created_at ASC
        LIMIT $2`,
      postId,
      lim,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Moderation — pin, delete, kick, mute
  //
  // Resolves the caller's role inside a group from two truth sources:
  //   1. community_groups.owner_client_id  → 'owner'
  //   2. community_group_members.role      → 'owner' | 'moderator' | 'member'
  // We treat membership-table 'owner' the same as the owner_client_id check
  // since both can exist on the same row.
  // ─────────────────────────────────────────────────────────────────

  /** Returns the caller's role in this group, or 'none' if not a member. */
  private async groupRole(
    clientId: string,
    groupId: string,
  ): Promise<'owner' | 'moderator' | 'member' | 'none'> {
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{ is_owner: boolean; mem_role: string | null; mem_status: string | null }>
    >(
      `SELECT (g.owner_client_id = $1::uuid)      AS is_owner,
              gm.role::text                        AS mem_role,
              gm.status                            AS mem_status
         FROM public.community_groups g
         LEFT JOIN public.community_group_members gm
                ON gm.group_id = g.id AND gm.client_id = $1::uuid
        WHERE g.id = $2::uuid
        LIMIT 1`,
      clientId,
      groupId,
    );
    if (!row) return 'none';
    if (row.is_owner) return 'owner';
    if (row.mem_status !== 'active') return 'none';
    if (row.mem_role === 'moderator') return 'moderator';
    if (row.mem_role === 'owner')     return 'owner';
    if (row.mem_role === 'member')    return 'member';
    return 'none';
  }

  /** True for owner/moderator on this group. */
  private async canModerate(clientId: string, groupId: string): Promise<boolean> {
    const r = await this.groupRole(clientId, groupId);
    return r === 'owner' || r === 'moderator';
  }

  /**
   * Pin / unpin a post. Owner or moderator only. Global posts (group_id NULL)
   * can't be pinned — pinning is per-group surface.
   */
  async togglePinPost(userId: string, postId: string): Promise<{ pinned: boolean }> {
    const me = await this.myClientId(userId);
    const [post] = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; group_id: string | null; pinned: boolean }>
    >(
      `SELECT id, group_id, pinned FROM public.community_posts WHERE id = $1::uuid LIMIT 1`,
      postId,
    );
    if (!post) throw new NotFoundException('Post not found.');
    if (!post.group_id) {
      throw new BadRequestException('Global posts cannot be pinned. Pin only works inside a group.');
    }
    if (!(await this.canModerate(me, post.group_id))) {
      throw new ForbiddenException('You must be a moderator or the owner of this group to pin posts.');
    }
    const [updated] = await this.prisma.$queryRawUnsafe<Array<{ pinned: boolean }>>(
      `UPDATE public.community_posts
          SET pinned = NOT pinned, updated_at = now()
        WHERE id = $1::uuid
       RETURNING pinned`,
      postId,
    );
    await this.logAudit(me, updated.pinned ? 'post.pinned' : 'post.unpinned', 'community_posts', postId);
    return { pinned: updated.pinned };
  }

  /**
   * Delete a post. Allowed for:
   *   - the author
   *   - owner / moderator of the post's group (if it has a group)
   */
  async deletePost(userId: string, postId: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const [post] = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; author_client_id: string; group_id: string | null }>
    >(
      `SELECT id, author_client_id, group_id FROM public.community_posts WHERE id = $1::uuid LIMIT 1`,
      postId,
    );
    if (!post) throw new NotFoundException('Post not found.');

    const isAuthor = post.author_client_id === me;
    const isMod = post.group_id ? await this.canModerate(me, post.group_id) : false;
    if (!isAuthor && !isMod) {
      throw new ForbiddenException('You can only delete your own posts, or any post inside a group you moderate.');
    }
    // ON DELETE CASCADE on comments + reactions means we don't need a tx here.
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.community_posts WHERE id = $1::uuid`,
      postId,
    );
    await this.logAudit(me, isAuthor ? 'post.deleted_self' : 'post.deleted_mod', 'community_posts', postId);
    return { deleted: true };
  }

  /**
   * Delete a comment. Allowed for the author, or owner/moderator of the
   * parent post's group.
   */
  async deleteComment(userId: string, commentId: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; author_client_id: string; post_id: string; group_id: string | null }>
    >(
      `SELECT c.id, c.author_client_id, c.post_id, p.group_id
         FROM public.community_comments c
         JOIN public.community_posts p ON p.id = c.post_id
        WHERE c.id = $1::uuid
        LIMIT 1`,
      commentId,
    );
    if (!row) throw new NotFoundException('Comment not found.');

    const isAuthor = row.author_client_id === me;
    const isMod = row.group_id ? await this.canModerate(me, row.group_id) : false;
    if (!isAuthor && !isMod) {
      throw new ForbiddenException('You can only delete your own comments, or any comment inside a group you moderate.');
    }
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.community_comments WHERE id = $1::uuid`,
      commentId,
    );
    // Cheap denormalization — keep comments_count honest.
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.community_posts
          SET comments_count = GREATEST(0, COALESCE(comments_count, 0) - 1)
        WHERE id = $1::uuid`,
      row.post_id,
    );
    await this.logAudit(me, isAuthor ? 'comment.deleted_self' : 'comment.deleted_mod', 'community_comments', commentId);
    return { deleted: true };
  }

  /**
   * Kick a member out of a group. Owner can kick anyone; moderator can kick
   * members only (not other moderators or the owner).
   */
  async kickMember(
    userId: string,
    groupId: string,
    targetClientId: string,
  ): Promise<{ kicked: true; memberCount: number }> {
    const me = await this.myClientId(userId);
    const callerRole  = await this.groupRole(me, groupId);
    const targetRole  = await this.groupRole(targetClientId, groupId);

    if (callerRole === 'none' || callerRole === 'member') {
      throw new ForbiddenException('Only moderators or the owner can kick members.');
    }
    if (callerRole === 'moderator' && (targetRole === 'moderator' || targetRole === 'owner')) {
      throw new ForbiddenException('Moderators can only kick regular members.');
    }
    if (targetRole === 'owner') {
      throw new ForbiddenException('The group owner cannot be kicked.');
    }
    if (targetClientId === me) {
      throw new BadRequestException('Use the leave endpoint to remove yourself.');
    }

    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.community_group_members
        WHERE group_id = $1::uuid AND client_id = $2::uuid`,
      groupId,
      targetClientId,
    );
    const [count] = await this.prisma.$queryRawUnsafe<Array<{ member_count: number }>>(
      `WITH new_count AS (
         SELECT COUNT(*)::int AS n FROM public.community_group_members
          WHERE group_id = $1::uuid AND status = 'active'
       )
       UPDATE public.community_groups
          SET member_count = (SELECT n FROM new_count)
        WHERE id = $1::uuid
       RETURNING member_count`,
      groupId,
    );
    await this.logAudit(me, 'member.kicked', 'community_group_members', targetClientId);
    return { kicked: true, memberCount: count?.member_count ?? 0 };
  }

  /**
   * Mute a member — they stay in the group but lose the ability to post or
   * comment until unmuted. We use members.status = 'muted' as the flag
   * since the column is already there. Insert + post/comment RLS aside,
   * we also enforce here in createPost / createComment by checking status.
   */
  async setMemberStatus(
    userId: string,
    groupId: string,
    targetClientId: string,
    status: 'active' | 'muted',
  ): Promise<{ status: 'active' | 'muted' }> {
    const me = await this.myClientId(userId);
    if (!(await this.canModerate(me, groupId))) {
      throw new ForbiddenException('Only moderators or the owner can mute members.');
    }
    const targetRole = await this.groupRole(targetClientId, groupId);
    if (targetRole === 'owner') {
      throw new ForbiddenException('The group owner cannot be muted.');
    }
    if (targetRole === 'none') {
      throw new NotFoundException('Target is not a member of this group.');
    }
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `UPDATE public.community_group_members
          SET status = $3
        WHERE group_id = $1::uuid AND client_id = $2::uuid
       RETURNING status`,
      groupId,
      targetClientId,
      status,
    );
    await this.logAudit(me, status === 'muted' ? 'member.muted' : 'member.unmuted',
      'community_group_members', targetClientId);
    return { status: (row?.status ?? status) as 'active' | 'muted' };
  }

  /**
   * Promote a member to moderator (owner only) or demote back to member.
   */
  async setMemberRole(
    userId: string,
    groupId: string,
    targetClientId: string,
    role: 'member' | 'moderator',
  ): Promise<{ role: 'member' | 'moderator' }> {
    const me = await this.myClientId(userId);
    const callerRole = await this.groupRole(me, groupId);
    if (callerRole !== 'owner') {
      throw new ForbiddenException('Only the group owner can promote or demote moderators.');
    }
    const targetRole = await this.groupRole(targetClientId, groupId);
    if (targetRole === 'owner') {
      throw new ForbiddenException('Cannot change role on the owner row.');
    }
    if (targetRole === 'none') {
      throw new NotFoundException('Target is not a member of this group.');
    }
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ role: string }>>(
      `UPDATE public.community_group_members
          SET role = $3::public.community_group_role
        WHERE group_id = $1::uuid AND client_id = $2::uuid
       RETURNING role::text AS role`,
      groupId,
      targetClientId,
      role,
    );
    await this.logAudit(me, role === 'moderator' ? 'member.promoted' : 'member.demoted',
      'community_group_members', targetClientId);
    return { role: (row?.role ?? role) as 'member' | 'moderator' };
  }

  /**
   * List members of a group with their role + status. Member-only — anyone
   * outside the group can't enumerate the roster.
   */
  async listGroupMembers(
    userId: string,
    groupId: string,
  ): Promise<Array<{
    client_id: string; name: string; role: string; status: string; joined_at: string;
  }>> {
    const me = await this.myClientId(userId);
    const callerRole = await this.groupRole(me, groupId);
    if (callerRole === 'none') {
      throw new ForbiddenException('You must be a member of this group to see its roster.');
    }
    return this.prisma.$queryRawUnsafe<Array<{
      client_id: string; name: string; role: string; status: string; joined_at: string;
    }>>(
      `SELECT gm.client_id, c.name, gm.role::text AS role, gm.status, gm.joined_at
         FROM public.community_group_members gm
         JOIN public.clients c ON c.id = gm.client_id
        WHERE gm.group_id = $1::uuid
        ORDER BY (gm.role = 'owner') DESC,
                 (gm.role = 'moderator') DESC,
                 gm.joined_at ASC
        LIMIT 200`,
      groupId,
    );
  }

  /** Append-only audit row for moderation actions. Best-effort — failures are swallowed. */
  private async logAudit(
    actorClientId: string,
    action: string,
    targetTable: string,
    targetId: string,
  ): Promise<void> {
    try {
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO public.community_audit_logs
           (actor_client_id, action, target_table, target_id)
         VALUES ($1::uuid, $2, $3, $4::uuid)`,
        actorClientId,
        action,
        targetTable,
        targetId,
      );
    } catch (err) {
      this.logger.warn(`Audit log insert failed for ${action} ${targetId}: ${(err as Error).message}`);
    }
  }

  async createComment(
    userId: string,
    postId: string,
    content: string,
  ): Promise<CommunityComment> {
    const me = await this.myClientId(userId);
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Comment cannot be empty.');
    if (trimmed.length > 500) throw new BadRequestException('Comment too long (max 500 characters).');

    // Honour mute if the parent post lives inside a group.
    const [post] = await this.prisma.$queryRawUnsafe<Array<{ group_id: string | null }>>(
      `SELECT group_id FROM public.community_posts WHERE id = $1::uuid LIMIT 1`,
      postId,
    );
    if (post?.group_id) {
      const [mem] = await this.prisma.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT status FROM public.community_group_members
          WHERE group_id = $1::uuid AND client_id = $2::uuid LIMIT 1`,
        post.group_id,
        me,
      );
      if (mem?.status === 'muted') {
        throw new ForbiddenException('You are muted in this group.');
      }
    }

    const [profile] = await this.prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM public.clients WHERE id = $1::uuid LIMIT 1`,
      me,
    );

    const [row] = await this.prisma.$queryRawUnsafe<CommunityComment[]>(
      `INSERT INTO public.community_comments
         (post_id, author_client_id, author_display_name, content)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       RETURNING id, post_id, author_client_id, author_display_name, author_service_type,
                 content, likes_count, created_at`,
      postId,
      me,
      profile?.name ?? 'Anonymous',
      trimmed,
    );

    // Cheap denormalization of comments_count on the parent post.
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.community_posts
          SET comments_count = COALESCE(comments_count, 0) + 1
        WHERE id = $1::uuid`,
      postId,
    );
    return row;
  }
}

// ─────────────────────────────────────────────────────────────────
// Types co-located with the service to keep clients.types.ts terse.
// ─────────────────────────────────────────────────────────────────

export type ChallengeMetric = 'water_ml' | 'exercise_minutes' | 'posts' | 'streak_days';

export interface CommunityGroup {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  is_private: boolean;
  member_count: number;
  is_member: boolean;
  /** Caller's effective role in the group, or null if not a member. */
  my_role: 'owner' | 'moderator' | 'member' | null;
  /** Caller's membership row status ('active'/'muted'), or null. */
  my_status: 'active' | 'muted' | null;
  created_at: string;
  // Challenge fields — non-null only when is_challenge = true.
  is_challenge: boolean;
  starts_at: string | null;
  ends_at: string | null;
  target_metric: ChallengeMetric | null;
  target_value: number | null;
}

export interface LeaderboardEntry {
  client_id: string;
  name: string;
  /** Caller's progress on the target_metric within [starts_at, ends_at]. */
  value: number;
  /** Rank starting at 1. */
  rank: number;
  is_me: boolean;
}

export interface CommunityPost {
  id: string;
  author_client_id: string;
  author_display_name: string;
  author_service_type: string | null;
  group_id: string | null;
  title: string | null;
  content: string;
  media_urls: unknown;
  likes_count: number;
  comments_count: number;
  pinned: boolean;
  created_at: string;
  i_reacted: boolean;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  author_client_id: string;
  author_display_name: string;
  author_service_type: string | null;
  content: string;
  likes_count: number;
  created_at: string;
}

export interface Appointment {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  kind: 'consultation' | 'follow_up' | 'check_in' | 'assessment' | 'group_session';
  mode: 'video' | 'phone' | 'in_person';
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  meeting_url: string | null;
  location: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

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

export interface Measurement {
  id: string;
  recorded_at: string;
  arm_inches: number | null;
  chest_inches: number | null;
  waist_inches: number | null;
  hip_inches: number | null;
  thigh_inches: number | null;
  notes: string | null;
}

export interface AssessmentCard {
  id: string;
  card_type: 'health_assessment' | 'stress_card' | 'sleep_card' | 'action_plan' | 'diet_plan';
  generated_content: Record<string, unknown>;
  status: 'pending' | 'edited' | 'sent';
  workflow_stage: string;
  sent_at: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  has_responses: boolean;
}

export interface RecipeListItem {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  total_kcal: number | null;
  video_url: string | null;
}

export interface RecipeIngredient {
  id: string;
  ingredient_id: string;
  name: string;
  quantity: number;
  unit: string;
  kcal_per_serving: number;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
}

export interface RecipeDetail extends RecipeListItem {
  instructions: string | null;
  ingredients: RecipeIngredient[];
}

export interface FileItem {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

// ─── Wave 1 — engagement + India types ─────────────────────────────────

export interface CycleEvent {
  id: string;
  event_type: 'period_start' | 'period_end' | 'ovulation' | 'pms' | 'cramps' | 'spotting';
  event_date: string;
  flow_level: number | null;
  notes: string | null;
}

export interface ProgressPhoto {
  id: string;
  taken_at: string;
  angle: 'front' | 'side' | 'back' | null;
  storage_key: string;
  weight_kg: number | null;
  notes: string | null;
}

export interface Symptom {
  id: string;
  occurred_at: string;
  symptom: string;
  severity: number;
  notes: string | null;
  suspected_trigger: string | null;
}

export interface Milestone {
  id: string;
  kind: string;
  value: number | null;
  achieved_at: string;
  celebrated: boolean;
  message: string | null;
}

export interface Supplement {
  id: string;
  name: string;
  dosage: string | null;
  schedule: string[];
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface Festival {
  name: string;
  tone: string;
  icon: string;
  /** YYYY-MM-DD */
  date: string;
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

function labelForKind(kind: Appointment['kind']): string {
  switch (kind) {
    case 'consultation':  return 'Consultation';
    case 'follow_up':     return 'Follow-up';
    case 'check_in':      return 'Check-in';
    case 'assessment':    return 'Assessment';
    case 'group_session': return 'Group session';
    default:              return 'Appointment';
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // "Mon, Jun 9, 3:30 PM" — Asia/Kolkata default for the SIRAH audience.
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}