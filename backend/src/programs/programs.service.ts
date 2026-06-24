import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AssistantGeminiService } from '../ai-assistant/assistant-gemini.service';

/**
 * ProgramsService — Module 8 Program Management Engine. Workspace-owned program
 * TEMPLATES with tasks, ASSIGNMENTS to clients (which snapshot the template's
 * tasks so a later template edit never mutates an active client's program —
 * versioning), per-day task completion, and progress/analytics. Reuses
 * AssistantGeminiService for AI program recommendations.
 *
 * Owner methods take a workspaceId (from @WorkspaceRole controllers); client
 * methods resolve the caller's client row from clients.user_id.
 */
@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: AssistantGeminiService,
  ) {}

  // ════════════════════════════ TEMPLATES (owner) ════════════════════
  async listTemplates(workspaceId: string): Promise<TemplateRow[]> {
    return this.prisma.$queryRawUnsafe<TemplateRow[]>(
      `SELECT t.*,
              (SELECT count(*) FROM public.program_template_tasks WHERE template_id = t.id)::int AS task_count,
              (SELECT count(*) FROM public.program_assignments WHERE template_id = t.id)::int AS assigned_count,
              COALESCE((SELECT AVG(progress_pct::numeric)
                          FROM public.program_assignments
                         WHERE template_id = t.id
                           AND status IN ('active', 'completed')), 0)::int AS avg_progress
         FROM public.program_templates t
        WHERE t.workspace_id = $1::uuid
        ORDER BY t.updated_at DESC`,
      workspaceId);
  }

  async getTemplate(workspaceId: string, id: string): Promise<TemplateRow & { tasks: TemplateTaskRow[] }> {
    const [tpl] = await this.prisma.$queryRawUnsafe<TemplateRow[]>(
      `SELECT * FROM public.program_templates WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`, id, workspaceId);
    if (!tpl) throw new NotFoundException('Program template not found.');
    const tasks = await this.prisma.$queryRawUnsafe<TemplateTaskRow[]>(
      `SELECT * FROM public.program_template_tasks WHERE template_id = $1::uuid ORDER BY sort_order, created_at`, id);
    return { ...tpl, tasks };
  }

  async createTemplate(workspaceId: string, userId: string, dto: CreateTemplateDto): Promise<TemplateRow> {
    const [row] = await this.prisma.$queryRawUnsafe<TemplateRow[]>(
      `INSERT INTO public.program_templates
         (workspace_id, created_by, name, description, category, duration_weeks, duration_unit, goals, accent_color,
          tagline, cover_image_url, difficulty, featured, visible, allow_enrollment, max_enrollments, internal_notes, content)
       VALUES ($1::uuid, $2::uuid, $3, $4, COALESCE($5,'custom'), COALESCE($6,4), COALESCE($7,'weeks'), $8::jsonb, $9,
          $10, $11, COALESCE($12,'beginner'), COALESCE($13,false), COALESCE($14,true), COALESCE($15,true), $16, $17, COALESCE($18::jsonb,'{}'::jsonb))
       RETURNING *`,
      workspaceId, userId, dto.name.trim(), dto.description ?? null, dto.category ?? null,
      dto.durationWeeks ?? null, dto.durationUnit ?? null, JSON.stringify(dto.goals ?? []), dto.accentColor ?? null,
      dto.tagline ?? null, dto.coverImageUrl ?? null, dto.difficulty ?? null,
      dto.featured ?? null, dto.visible ?? null, dto.allowEnrollment ?? null,
      dto.maxEnrollments ?? null, dto.internalNotes ?? null,
      dto.content ? JSON.stringify(dto.content) : null);
    return row;
  }

  async updateTemplate(workspaceId: string, id: string, dto: UpdateTemplateDto): Promise<TemplateRow> {
    const [row] = await this.prisma.$queryRawUnsafe<TemplateRow[]>(
      `UPDATE public.program_templates SET
         name = COALESCE($3,name), description = COALESCE($4,description), category = COALESCE($5,category),
         duration_weeks = COALESCE($6,duration_weeks), goals = COALESCE($7::jsonb,goals),
         status = COALESCE($8,status),
         accent_color = COALESCE($9,accent_color),
         duration_unit = COALESCE($10,duration_unit),
         tagline = COALESCE($11,tagline),
         cover_image_url = COALESCE($12,cover_image_url),
         difficulty = COALESCE($13,difficulty),
         featured = COALESCE($14,featured),
         visible = COALESCE($15,visible),
         allow_enrollment = COALESCE($16,allow_enrollment),
         max_enrollments = CASE WHEN $17::boolean THEN $18 ELSE max_enrollments END,
         internal_notes = COALESCE($19,internal_notes),
         content = COALESCE($20::jsonb,content),
         version = CASE WHEN $8 = 'published' THEN version + 1 ELSE version END,
         updated_at = now()
       WHERE id = $1::uuid AND workspace_id = $2::uuid RETURNING *`,
      id, workspaceId, dto.name ?? null, dto.description ?? null, dto.category ?? null,
      dto.durationWeeks ?? null, dto.goals ? JSON.stringify(dto.goals) : null, dto.status ?? null,
      dto.accentColor ?? null, dto.durationUnit ?? null,
      dto.tagline ?? null, dto.coverImageUrl ?? null, dto.difficulty ?? null,
      dto.featured ?? null, dto.visible ?? null, dto.allowEnrollment ?? null,
      // max_enrollments is nullable AND clearable: only write when the key is present.
      dto.maxEnrollments !== undefined, dto.maxEnrollments ?? null,
      dto.internalNotes ?? null,
      dto.content ? JSON.stringify(dto.content) : null);
    if (!row) throw new NotFoundException('Program template not found.');
    return row;
  }

  async deleteTemplate(workspaceId: string, id: string): Promise<void> {
    await this.requireTemplate(workspaceId, id);
    // Remove the template's builder tasks first (no FK cascade exists), then the
    // template itself. Client ASSIGNMENTS are independent snapshots (they copied
    // the tasks at assign/enroll time) so they are intentionally left intact —
    // deleting a template never yanks an in-progress program from a client.
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.program_template_tasks WHERE template_id = $1::uuid`, id);
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.program_templates WHERE id = $1::uuid AND workspace_id = $2::uuid`, id, workspaceId);
  }

  // ── Template tasks ──
  async addTask(workspaceId: string, templateId: string, dto: TaskDto): Promise<TemplateTaskRow> {
    await this.requireTemplate(workspaceId, templateId);
    const [row] = await this.prisma.$queryRawUnsafe<TemplateTaskRow[]>(
      `INSERT INTO public.program_template_tasks (template_id, title, description, type, cadence, week_number, day_of_week, sort_order)
       VALUES ($1::uuid, $2, $3, COALESCE($4,'task'), COALESCE($5,'daily'), $6, $7, COALESCE($8,0))
       RETURNING *`,
      templateId, dto.title.trim(), dto.description ?? null, dto.type ?? null, dto.cadence ?? null,
      dto.weekNumber ?? null, dto.dayOfWeek ?? null, dto.sortOrder ?? null);
    await this.touchTemplate(templateId);
    return row;
  }

  async updateTask(workspaceId: string, templateId: string, taskId: string, dto: TaskDto): Promise<TemplateTaskRow> {
    await this.requireTemplate(workspaceId, templateId);
    const [row] = await this.prisma.$queryRawUnsafe<TemplateTaskRow[]>(
      `UPDATE public.program_template_tasks SET
         title = COALESCE($3,title), description = COALESCE($4,description), type = COALESCE($5,type),
         cadence = COALESCE($6,cadence), week_number = $7, day_of_week = $8, sort_order = COALESCE($9,sort_order)
       WHERE id = $1::uuid AND template_id = $2::uuid RETURNING *`,
      taskId, templateId, dto.title ?? null, dto.description ?? null, dto.type ?? null, dto.cadence ?? null,
      dto.weekNumber ?? null, dto.dayOfWeek ?? null, dto.sortOrder ?? null);
    if (!row) throw new NotFoundException('Task not found.');
    return row;
  }

  async deleteTask(workspaceId: string, templateId: string, taskId: string): Promise<void> {
    await this.requireTemplate(workspaceId, templateId);
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.program_template_tasks WHERE id = $1::uuid AND template_id = $2::uuid`, taskId, templateId);
  }

  // ════════════════════════════ ASSIGNMENTS (owner) ══════════════════
  /** Assign a template to one or more clients (snapshotting its tasks). */
  async assign(workspaceId: string, userId: string, templateId: string, clientIds: string[]): Promise<{ assigned: number }> {
    const tpl = await this.getTemplate(workspaceId, templateId);
    if (!clientIds.length) throw new BadRequestException('No clients selected.');

    // Only clients that belong to this workspace.
    const valid = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE workspace_id = $1::uuid AND id = ANY($2::uuid[])`,
      workspaceId, clientIds);
    if (!valid.length) throw new BadRequestException('None of the selected clients are in your workspace.');

    // Total program length in days — drives the assignment's end_date.
    const totalDays = (tpl.duration_unit === 'days' ? tpl.duration_weeks : tpl.duration_weeks * 7);
    let assigned = 0;
    for (const { id: clientId } of valid) {
      const [a] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO public.program_assignments
           (template_id, workspace_id, client_id, assigned_by, name, category, duration_weeks, duration_unit, template_version, start_date, end_date)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, current_date, current_date + ($10 * 1 - 1))
         RETURNING id`,
        templateId, workspaceId, clientId, userId, tpl.name, tpl.category, tpl.duration_weeks,
        tpl.duration_unit, tpl.version, totalDays);
      // Snapshot the template's tasks onto the assignment.
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO public.program_assignment_tasks
           (assignment_id, client_id, title, description, type, cadence, week_number, day_of_week, sort_order)
         SELECT $1::uuid, $2::uuid, title, description, type, cadence, week_number, day_of_week, sort_order
           FROM public.program_template_tasks WHERE template_id = $3::uuid`,
        a.id, clientId, templateId);
      assigned++;
    }
    return { assigned };
  }

  async listAssignments(workspaceId: string, status?: string): Promise<AssignmentListItem[]> {
    return this.prisma.$queryRawUnsafe<AssignmentListItem[]>(
      `SELECT a.*, c.name AS client_name, c.email AS client_email
         FROM public.program_assignments a
         LEFT JOIN public.clients c ON c.id = a.client_id
        WHERE a.workspace_id = $1::uuid
          AND ($2::text IS NULL OR a.status = $2)
        ORDER BY a.created_at DESC LIMIT 200`,
      workspaceId, status ?? null);
  }

  async assignmentDetail(workspaceId: string, id: string) {
    const [a] = await this.prisma.$queryRawUnsafe<AssignmentListItem[]>(
      `SELECT a.*, c.name AS client_name, c.email AS client_email
         FROM public.program_assignments a LEFT JOIN public.clients c ON c.id = a.client_id
        WHERE a.id = $1::uuid AND a.workspace_id = $2::uuid LIMIT 1`, id, workspaceId);
    if (!a) throw new NotFoundException('Assignment not found.');
    const tasks = await this.prisma.$queryRawUnsafe<AssignmentTaskRow[]>(
      `SELECT * FROM public.program_assignment_tasks WHERE assignment_id = $1::uuid ORDER BY sort_order`, id);
    const progress = await this.computeProgress(id);
    return { ...a, tasks, progress };
  }

  async setAssignmentStatus(workspaceId: string, id: string, status: string): Promise<AssignmentListItem> {
    const [row] = await this.prisma.$queryRawUnsafe<AssignmentListItem[]>(
      `UPDATE public.program_assignments
          SET status = $3, completed_at = CASE WHEN $3='completed' THEN now() ELSE completed_at END, updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid RETURNING *`,
      id, workspaceId, status);
    if (!row) throw new NotFoundException('Assignment not found.');
    return row;
  }

  // ════════════════════════════ ANALYTICS (owner) ════════════════════
  async workspaceAnalytics(workspaceId: string): Promise<Record<string, number>> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint | number | null>>>(
      `SELECT
         (SELECT count(*) FROM public.program_templates WHERE workspace_id=$1::uuid AND status='published') AS published_templates,
         (SELECT count(*) FROM public.program_templates WHERE workspace_id=$1::uuid) AS total_templates,
         (SELECT count(*) FROM public.program_assignments WHERE workspace_id=$1::uuid AND status='active') AS active_programs,
         (SELECT count(*) FROM public.program_assignments WHERE workspace_id=$1::uuid AND status='completed') AS completed_programs,
         (SELECT count(DISTINCT client_id) FROM public.program_assignments WHERE workspace_id=$1::uuid AND status='active') AS clients_enrolled,
         (SELECT COALESCE(round(avg(progress_pct)),0) FROM public.program_assignments WHERE workspace_id=$1::uuid AND status IN ('active','completed')) AS avg_progress`,
      workspaceId);
    return {
      published_templates: Number(r?.published_templates ?? 0),
      total_templates: Number(r?.total_templates ?? 0),
      active_programs: Number(r?.active_programs ?? 0),
      completed_programs: Number(r?.completed_programs ?? 0),
      clients_enrolled: Number(r?.clients_enrolled ?? 0),
      avg_progress: Number(r?.avg_progress ?? 0),
    };
  }

  // ════════════════════════════ AI RECOMMENDATION ════════════════════
  async recommend(workspaceId: string, assignmentId: string): Promise<{ recommendation: string }> {
    const detail = await this.assignmentDetail(workspaceId, assignmentId);
    const text = await this.gemini.summarize({
      assistantType: 'clinical',
      systemPrompt:
        'You are a clinical program coach. Given a client’s program progress, give 2-3 short, specific, encouraging recommendations to improve adherence and outcomes. Be practical. Plain text, no markdown headers.',
      prompt: JSON.stringify({
        program: detail.name, status: detail.status, progress_pct: detail.progress.pct,
        days_elapsed: detail.progress.elapsed_days, duration_weeks: detail.duration_weeks,
        tasks: detail.tasks.map((t) => ({ title: t.title, cadence: t.cadence, type: t.type })),
      }),
      workspaceId,
      fallback: 'Keep the client engaged with a quick check-in, celebrate any completed tasks, and simplify the plan if adherence dips below 60%.',
    });
    return { recommendation: text };
  }

  // ════════════════════════════ CLIENT SIDE ══════════════════════════
  async myAssignments(userId: string): Promise<AssignmentListItem[]> {
    const cid = await this.clientId(userId);
    const rows = await this.prisma.$queryRawUnsafe<AssignmentListItem[]>(
      `SELECT * FROM public.program_assignments WHERE client_id = $1::uuid
        ORDER BY (status='active') DESC, created_at DESC`, cid);
    for (const r of rows) (r as AssignmentListItem & { progress?: ProgressInfo }).progress = await this.computeProgress(r.id);
    return rows;
  }

  /** Tasks that are due today across the client's active programs, with done status. */
  async todaysTasks(userId: string): Promise<TodayTask[]> {
    const cid = await this.clientId(userId);
    return this.prisma.$queryRawUnsafe<TodayTask[]>(
      `SELECT at.id, at.title, at.description, at.type, at.cadence, a.name AS program,
              EXISTS(SELECT 1 FROM public.program_task_logs l
                      WHERE l.assignment_task_id = at.id AND l.log_date = current_date) AS done
         FROM public.program_assignment_tasks at
         JOIN public.program_assignments a ON a.id = at.assignment_id
        WHERE at.client_id = $1::uuid AND a.status = 'active'
          AND current_date BETWEEN a.start_date AND COALESCE(a.end_date, current_date)
          AND (
            at.cadence = 'daily'
            OR (at.cadence = 'weekly' AND EXTRACT(dow FROM current_date)::int = COALESCE(at.day_of_week, EXTRACT(dow FROM a.start_date)::int))
            OR (at.cadence = 'once' AND current_date = (a.start_date + ((COALESCE(at.week_number,1)-1)*7 + COALESCE(at.day_of_week,0))))
          )
        ORDER BY a.name, at.sort_order`,
      cid);
  }

  /** Toggle a task's completion for today; recompute the assignment's progress. */
  async toggleTask(userId: string, taskId: string): Promise<{ done: boolean; progress: ProgressInfo }> {
    const cid = await this.clientId(userId);
    const [t] = await this.prisma.$queryRawUnsafe<Array<{ assignment_id: string }>>(
      `SELECT assignment_id FROM public.program_assignment_tasks WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1`, taskId, cid);
    if (!t) throw new NotFoundException('Task not found.');

    const deleted = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.program_task_logs WHERE assignment_task_id = $1::uuid AND log_date = current_date RETURNING id`, taskId);
    if (!deleted.length) {
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO public.program_task_logs (assignment_task_id, assignment_id, client_id, log_date)
         VALUES ($1::uuid, $2::uuid, $3::uuid, current_date)
         ON CONFLICT (assignment_task_id, log_date) DO NOTHING`,
        taskId, t.assignment_id, cid);
    }
    const progress = await this.computeProgress(t.assignment_id);
    return { done: !deleted.length, progress };
  }

  // ════════════════════════════ internals ════════════════════════════
  private async computeProgress(assignmentId: string): Promise<ProgressInfo> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<{
      elapsed_days: number; daily_tasks: bigint; daily_done: bigint; status: string;
    }>>(
      `SELECT
         GREATEST(1, LEAST(current_date, COALESCE(a.end_date, current_date)) - a.start_date + 1) AS elapsed_days,
         (SELECT count(*) FROM public.program_assignment_tasks t WHERE t.assignment_id = a.id AND t.cadence='daily') AS daily_tasks,
         (SELECT count(*) FROM public.program_task_logs l
            JOIN public.program_assignment_tasks t ON t.id = l.assignment_task_id
           WHERE l.assignment_id = a.id AND t.cadence='daily'
             AND l.log_date BETWEEN a.start_date AND current_date) AS daily_done,
         a.status
         FROM public.program_assignments a WHERE a.id = $1::uuid`,
      assignmentId);
    const elapsed = Number(r?.elapsed_days ?? 1);
    const dailyTasks = Number(r?.daily_tasks ?? 0);
    const done = Number(r?.daily_done ?? 0);
    const expected = elapsed * dailyTasks;
    let pct = expected > 0 ? Math.min(100, Math.round((done / expected) * 100)) : (r?.status === 'completed' ? 100 : 0);
    if (r?.status === 'completed') pct = 100;
    // Persist the computed % so list views stay cheap + analytics aggregate it.
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.program_assignments SET progress_pct = $2, updated_at = now() WHERE id = $1::uuid`, assignmentId, pct);
    return { pct, elapsed_days: elapsed, daily_tasks: dailyTasks, daily_done: done };
  }

  private async clientId(userId: string): Promise<string> {
    const [c] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`, userId);
    if (!c) throw new NotFoundException('No client profile linked to this user.');
    return c.id;
  }

  private async clientCtx(userId: string): Promise<{ id: string; workspace_id: string }> {
    const [c] = await this.prisma.$queryRawUnsafe<Array<{ id: string; workspace_id: string }>>(
      `SELECT id, workspace_id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`, userId);
    if (!c) throw new NotFoundException('No client profile linked to this user.');
    return c;
  }

  // ── Client self-enrollment (catalog) ───────────────────────────────────

  /** Published + visible programs in the client's workspace, with task count, enrolled flag, and capacity. */
  async clientCatalog(userId: string): Promise<CatalogItem[]> {
    const c = await this.clientCtx(userId);
    return this.prisma.$queryRawUnsafe<CatalogItem[]>(
      `SELECT t.id, t.name, t.tagline, t.description, t.category, t.duration_weeks, t.duration_unit,
              t.accent_color, t.cover_image_url, t.difficulty, t.featured, t.allow_enrollment,
              t.max_enrollments, t.goals,
              (SELECT count(*) FROM public.program_template_tasks WHERE template_id = t.id)::int AS task_count,
              (SELECT count(*) FROM public.program_assignments a2
                      WHERE a2.template_id = t.id AND a2.status = 'active')::int AS enrolled_count,
              EXISTS(SELECT 1 FROM public.program_assignments a
                      WHERE a.template_id = t.id AND a.client_id = $1::uuid AND a.status = 'active') AS enrolled
         FROM public.program_templates t
        WHERE t.workspace_id = $2::uuid AND t.status = 'published' AND t.visible = true
        ORDER BY t.featured DESC, t.updated_at DESC`,
      c.id, c.workspace_id);
  }

  /** Full client-safe detail for one published program (NEVER returns internal_notes). */
  async clientProgramDetail(userId: string, templateId: string): Promise<ClientProgramView> {
    const c = await this.clientCtx(userId);
    const [row] = await this.prisma.$queryRawUnsafe<ClientProgramView[]>(
      `SELECT t.id, t.name, t.tagline, t.description, t.category, t.duration_weeks, t.duration_unit,
              t.accent_color, t.cover_image_url, t.difficulty, t.featured, t.allow_enrollment,
              t.max_enrollments, t.goals, t.content,
              (SELECT count(*) FROM public.program_template_tasks WHERE template_id = t.id)::int AS task_count,
              (SELECT count(*) FROM public.program_assignments a2
                      WHERE a2.template_id = t.id AND a2.status = 'active')::int AS enrolled_count,
              EXISTS(SELECT 1 FROM public.program_assignments a
                      WHERE a.template_id = t.id AND a.client_id = $1::uuid AND a.status = 'active') AS enrolled
         FROM public.program_templates t
        WHERE t.id = $2::uuid AND t.workspace_id = $3::uuid AND t.status = 'published' AND t.visible = true
        LIMIT 1`,
      c.id, templateId, c.workspace_id);
    if (!row) throw new NotFoundException('Program not available.');
    return row;
  }

  /** Client enrols themselves into a published program (idempotent). */
  async selfEnroll(userId: string, templateId: string): Promise<{ assignmentId: string }> {
    const c = await this.clientCtx(userId);
    const [tpl] = await this.prisma.$queryRawUnsafe<TemplateRow[]>(
      `SELECT * FROM public.program_templates
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND status = 'published' AND visible = true LIMIT 1`,
      templateId, c.workspace_id);
    if (!tpl) throw new NotFoundException('Program not available.');

    const [existing] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.program_assignments
        WHERE template_id = $1::uuid AND client_id = $2::uuid AND status = 'active' LIMIT 1`,
      templateId, c.id);
    if (existing) return { assignmentId: existing.id };

    if (tpl.allow_enrollment === false) throw new BadRequestException('Enrollment is closed for this program.');
    if (tpl.max_enrollments != null) {
      const [cap] = await this.prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM public.program_assignments
          WHERE template_id = $1::uuid AND status = 'active'`, templateId);
      if (Number(cap?.n ?? 0) >= tpl.max_enrollments) throw new BadRequestException('This program is full.');
    }

    const totalDays = tpl.duration_unit === 'days' ? tpl.duration_weeks : tpl.duration_weeks * 7;
    const [a] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO public.program_assignments
         (template_id, workspace_id, client_id, assigned_by, name, category, duration_weeks, duration_unit, template_version, start_date, end_date)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, current_date, current_date + ($10 - 1))
       RETURNING id`,
      templateId, c.workspace_id, c.id, userId, tpl.name, tpl.category, tpl.duration_weeks,
      tpl.duration_unit, tpl.version, totalDays);
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.program_assignment_tasks
         (assignment_id, client_id, title, description, type, cadence, week_number, day_of_week, sort_order)
       SELECT $1::uuid, $2::uuid, title, description, type, cadence, week_number, day_of_week, sort_order
         FROM public.program_template_tasks WHERE template_id = $3::uuid`,
      a.id, c.id, templateId);
    return { assignmentId: a.id };
  }

  /** Client leaves a program — cancels their active assignment for that template. */
  async leaveProgram(userId: string, templateId: string): Promise<{ left: boolean }> {
    const c = await this.clientCtx(userId);
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.program_assignments SET status = 'cancelled', updated_at = now()
        WHERE template_id = $1::uuid AND client_id = $2::uuid AND status = 'active'`,
      templateId, c.id);
    return { left: true };
  }

  private async requireTemplate(workspaceId: string, id: string): Promise<void> {
    const [t] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.program_templates WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`, id, workspaceId);
    if (!t) throw new NotFoundException('Program template not found.');
  }
  private async touchTemplate(id: string): Promise<void> {
    await this.prisma.$queryRawUnsafe(`UPDATE public.program_templates SET updated_at = now() WHERE id = $1::uuid`, id);
  }

  assertWorkspace(workspaceId: string | null): string {
    if (!workspaceId) throw new ForbiddenException('Not in a workspace.');
    return workspaceId;
  }
}

// ── types ───────────────────────────────────────────────────────────
export interface TemplateRow {
  id: string; workspace_id: string; created_by: string | null; name: string; description: string | null;
  category: string; duration_weeks: number; duration_unit: string; goals: unknown; status: string; version: number;
  accent_color: string | null;
  tagline: string | null; cover_image_url: string | null; difficulty: string;
  featured: boolean; visible: boolean; allow_enrollment: boolean; max_enrollments: number | null;
  internal_notes: string | null; content: unknown;
  created_at: string; updated_at: string; task_count?: number; assigned_count?: number;
  /** Avg completion % across this template's active+completed assignments (0 if none). */
  avg_progress?: number;
}
export interface TemplateTaskRow {
  id: string; template_id: string; title: string; description: string | null; type: string;
  cadence: string; week_number: number | null; day_of_week: number | null; sort_order: number; created_at: string;
}
export interface AssignmentListItem {
  id: string; template_id: string | null; workspace_id: string; client_id: string; name: string;
  category: string | null; duration_weeks: number; duration_unit: string; template_version: number; start_date: string;
  end_date: string | null; status: string; progress_pct: string; completed_at: string | null;
  created_at: string; client_name?: string | null; client_email?: string | null;
}
export interface AssignmentTaskRow {
  id: string; assignment_id: string; client_id: string; title: string; description: string | null;
  type: string; cadence: string; week_number: number | null; day_of_week: number | null; sort_order: number;
}
export interface TodayTask {
  id: string; title: string; description: string | null; type: string; cadence: string; program: string; done: boolean;
}
export interface ProgressInfo { pct: number; elapsed_days: number; daily_tasks: number; daily_done: number }

export interface CatalogItem {
  id: string; name: string; tagline: string | null; description: string | null; category: string;
  duration_weeks: number; duration_unit: string; accent_color: string | null;
  cover_image_url: string | null; difficulty: string; featured: boolean; allow_enrollment: boolean;
  max_enrollments: number | null; goals: unknown; task_count: number; enrolled_count: number; enrolled: boolean;
}

/** Client-facing program detail — note: NO internal_notes field, by design. */
export interface ClientProgramView extends CatalogItem { content: unknown }

export interface CreateTemplateDto {
  name: string; description?: string; category?: string; durationWeeks?: number; durationUnit?: string;
  goals?: string[]; accentColor?: string;
  tagline?: string; coverImageUrl?: string; difficulty?: string;
  featured?: boolean; visible?: boolean; allowEnrollment?: boolean; maxEnrollments?: number;
  internalNotes?: string; content?: Record<string, unknown>;
}
export interface UpdateTemplateDto extends Partial<CreateTemplateDto> { status?: string }
export interface TaskDto {
  title: string; description?: string; type?: string; cadence?: string;
  weekNumber?: number; dayOfWeek?: number; sortOrder?: number;
}
