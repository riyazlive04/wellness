import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * ReportsService — backs the owner "PDFs, summaries & audits" page.
 *
 * The PDF itself is rendered in the browser with jsPDF (same approach the
 * billing invoice + food-library exports already use), so this service does
 * two jobs only:
 *   1. getData() — assemble the REAL numbers a given report needs, reusing the
 *      AnalyticsService aggregations + a few client/program queries.
 *   2. list/stats/record/remove — persist a durable history row per generated
 *      report so the KPI strip and "Recently generated" list are live.
 *
 * Every sub-query is defensively wrapped (mirrors AnalyticsService) so a single
 * failing section degrades to empty rather than failing the whole report.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  // ── History ────────────────────────────────────────────────────────

  async list(workspaceId: string, limit = 50): Promise<ReportRow[]> {
    const n = Math.min(Math.max(limit, 1), 200);
    const rows = await this.prisma.$queryRawUnsafe<RawReportRow[]>(
      `SELECT id, kind, template_name, target_label, target_id, period_label,
              status, page_count, size_kb, generated_by_label, created_at
         FROM public.workspace_reports
        WHERE workspace_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT ${n}`,
      workspaceId,
    );
    return rows.map(mapRow);
  }

  async stats(workspaceId: string): Promise<ReportStats> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint | null>>>(
      `SELECT
         (SELECT count(*) FROM public.workspace_reports
            WHERE workspace_id=$1::uuid AND created_at >= date_trunc('month', now())) AS month_count,
         (SELECT count(*) FROM public.workspace_reports
            WHERE workspace_id=$1::uuid AND status IN ('queued','generating')) AS in_progress,
         (SELECT count(*) FROM public.workspace_reports
            WHERE workspace_id=$1::uuid) AS total`,
      workspaceId,
    );
    return {
      monthCount: Number(r?.month_count ?? 0),
      inProgress: Number(r?.in_progress ?? 0),
      total: Number(r?.total ?? 0),
      scheduledCount: 0, // recurring schedules land in the Full scope (deferred)
    };
  }

  async record(workspaceId: string, user: { id: string; email?: string }, dto: RecordReportDto): Promise<ReportRow> {
    if (!KNOWN_KINDS.includes(dto.kind)) throw new BadRequestException('Unknown report kind.');
    const [row] = await this.prisma.$queryRawUnsafe<RawReportRow[]>(
      `INSERT INTO public.workspace_reports
         (workspace_id, kind, template_name, target_label, target_id, period_label,
          status, page_count, size_kb, generated_by, generated_by_label)
       VALUES ($1::uuid,$2,$3,$4,$5::uuid,$6,'ready',$7,$8,$9::uuid,$10)
       RETURNING id, kind, template_name, target_label, target_id, period_label,
                 status, page_count, size_kb, generated_by_label, created_at`,
      workspaceId,
      dto.kind,
      dto.templateName,
      dto.targetLabel ?? null,
      dto.targetId ?? null,
      dto.periodLabel ?? '',
      dto.pageCount ?? null,
      dto.sizeKb ?? null,
      user.id,
      user.email ?? 'You',
    );
    return mapRow(row);
  }

  async remove(workspaceId: string, id: string): Promise<{ deleted: true }> {
    const res = await this.prisma.$executeRawUnsafe(
      `DELETE FROM public.workspace_reports WHERE id = $1::uuid AND workspace_id = $2::uuid`,
      id,
      workspaceId,
    );
    if (!res) throw new NotFoundException('Report not found.');
    return { deleted: true };
  }

  // ── Data assembly ──────────────────────────────────────────────────

  async getData(workspaceId: string, kind: ReportKind, targetId?: string): Promise<ReportData> {
    if (!KNOWN_KINDS.includes(kind)) throw new BadRequestException('Unknown report kind.');
    const workspaceName = await this.workspaceName(workspaceId);
    const base: ReportData = { kind, workspaceName, periodLabel: '', target: null, generatedAt: new Date().toISOString() };

    if (kind === 'workspace_digest') {
      const [overview, growth, engagement, programs, nutrition, aiUsage] = await Promise.all([
        this.safe(() => this.analytics.overview(workspaceId), null),
        this.safe(() => this.analytics.clientGrowth(workspaceId, 6), []),
        this.safe(() => this.analytics.engagement(workspaceId, 30), []),
        this.safe(() => this.analytics.programPerformance(workspaceId), { by_status: [] }),
        this.safe(() => this.analytics.nutritionTrends(workspaceId, 30), null),
        this.safe(() => this.analytics.aiUsage(workspaceId, 14), { daily: [], by_service: [] }),
      ]);
      return { ...base, periodLabel: 'Last 30 days', digest: { overview, growth, engagement, programs, nutrition, aiUsage } };
    }

    if (kind === 'program_performance') {
      if (!targetId) throw new BadRequestException('A program is required for this report.');
      const program = await this.programPerformanceDetail(workspaceId, targetId);
      return { ...base, periodLabel: 'All-time', target: { id: targetId, label: program.name }, program };
    }

    if (kind === 'client_health' || kind === 'client_monthly') {
      if (!targetId) throw new BadRequestException('A client is required for this report.');
      const client = await this.clientReportDetail(workspaceId, targetId);
      const periodLabel = kind === 'client_monthly'
        ? new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
        : 'Last 30 days';
      return { ...base, periodLabel, target: { id: targetId, label: client.name }, client };
    }

    // billing_gst is out of the current scope — return a stub the UI guards on.
    return { ...base, periodLabel: 'This month', unsupported: true };
  }

  // ── Detail queries ─────────────────────────────────────────────────

  private async programPerformanceDetail(workspaceId: string, templateId: string): Promise<ProgramReport> {
    const [tpl] = await this.prisma.$queryRawUnsafe<Array<{ name: string; category: string | null; duration_weeks: number | null }>>(
      `SELECT name, category::text AS category, duration_weeks
         FROM public.program_templates WHERE id=$1::uuid AND workspace_id=$2::uuid LIMIT 1`,
      templateId, workspaceId,
    );
    if (!tpl) throw new NotFoundException('Program not found.');

    const rows = await this.prisma.$queryRawUnsafe<Array<{ status: string; n: bigint; avg: number | null }>>(
      `SELECT status, count(*) AS n, COALESCE(round(avg(progress_pct)),0) AS avg
         FROM public.program_assignments
        WHERE workspace_id=$1::uuid AND template_id=$2::uuid
        GROUP BY status`,
      workspaceId, templateId,
    );
    const by: Record<string, { count: number; avg: number }> = {};
    let enrolled = 0;
    for (const r of rows) {
      const c = Number(r.n);
      by[r.status] = { count: c, avg: Number(r.avg ?? 0) };
      enrolled += c;
    }
    const active = by['active']?.count ?? 0;
    const completed = by['completed']?.count ?? 0;
    const paused = by['paused']?.count ?? 0;
    const cancelled = by['cancelled']?.count ?? 0;
    const avgProgress = enrolled
      ? Math.round(rows.reduce((s, r) => s + Number(r.avg ?? 0) * Number(r.n), 0) / enrolled)
      : 0;
    return {
      name: tpl.name,
      category: tpl.category,
      durationWeeks: tpl.duration_weeks ?? null,
      enrolled, active, completed, paused, cancelled,
      avgProgress,
      completionRate: enrolled ? Math.round((completed / enrolled) * 100) : 0,
      dropoutRate: enrolled ? Math.round((cancelled / enrolled) * 100) : 0,
    };
  }

  private async clientReportDetail(workspaceId: string, clientId: string): Promise<ClientReport> {
    const [c] = await this.prisma.$queryRawUnsafe<Array<Record<string, string | number | null>>>(
      `SELECT COALESCE(c.display_name, c.name) AS name, c.email, c.phone, c.age,
              c.gender::text AS gender, c.goals, c.status::text AS status,
              c.program_type::text AS program_type, c.target_kcal,
              c.last_weight::text AS last_weight, c.created_at, c.last_active_at
         FROM public.clients c
        WHERE c.id=$1::uuid AND c.workspace_id=$2::uuid LIMIT 1`,
      clientId, workspaceId,
    );
    if (!c) throw new NotFoundException('Client not found.');

    const program = await this.safe(async () => {
      const [p] = await this.prisma.$queryRawUnsafe<Array<Record<string, string | null>>>(
        `SELECT name, status::text AS status, progress_pct::text AS progress_pct,
                start_date::text AS start_date, end_date::text AS end_date
           FROM public.program_assignments
          WHERE workspace_id=$1::uuid AND client_id=$2::uuid
          ORDER BY created_at DESC LIMIT 1`,
        workspaceId, clientId,
      );
      return p
        ? {
            name: p.name ?? '—',
            status: p.status ?? '—',
            progressPct: Math.round(Number(p.progress_pct ?? 0)),
            startDate: p.start_date,
            endDate: p.end_date,
          }
        : null;
    }, null);

    const nutrition = await this.safe(async () => {
      const [n] = await this.prisma.$queryRawUnsafe<Array<Record<string, string | number | null>>>(
        `SELECT
           COALESCE(SUM(NULLIF(nutrition_snapshot->>'protein_g','')::numeric),0)      AS protein_g,
           COALESCE(SUM(NULLIF(nutrition_snapshot->>'carbohydrate_g','')::numeric),0) AS carb_g,
           COALESCE(SUM(NULLIF(nutrition_snapshot->>'fat_g','')::numeric),0)          AS fat_g,
           COALESCE(SUM(kcal),0)                                                      AS kcal_total,
           GREATEST(count(DISTINCT logged_at::date),1)                                AS days_with_logs,
           count(*)                                                                    AS meal_count
           FROM public.meal_logs
          WHERE client_id=$1::uuid AND logged_at >= now() - interval '30 days'`,
        clientId,
      );
      const num = (k: string) => Number(n?.[k] ?? 0);
      const days = num('days_with_logs') || 1;
      return {
        avgDailyKcal: Math.round(num('kcal_total') / days),
        proteinG: Math.round(num('protein_g')),
        carbG: Math.round(num('carb_g')),
        fatG: Math.round(num('fat_g')),
        mealCount: num('meal_count'),
        daysActive: num('days_with_logs'),
      };
    }, { avgDailyKcal: 0, proteinG: 0, carbG: 0, fatG: 0, mealCount: 0, daysActive: 0 });

    return {
      name: String(c.name ?? 'Client'),
      email: (c.email as string) ?? null,
      phone: (c.phone as string) ?? null,
      age: c.age != null ? Number(c.age) : null,
      gender: (c.gender as string) ?? null,
      goals: (c.goals as string) ?? null,
      status: (c.status as string) ?? null,
      programType: (c.program_type as string) ?? null,
      targetKcal: c.target_kcal != null ? Number(c.target_kcal) : null,
      lastWeight: (c.last_weight as string) ?? null,
      joinedAt: (c.created_at as string) ?? null,
      lastActiveAt: (c.last_active_at as string) ?? null,
      program,
      nutrition30d: nutrition,
    };
  }

  private async workspaceName(workspaceId: string): Promise<string> {
    const [w] = await this.prisma.$queryRawUnsafe<Array<{ name: string | null; display_name: string | null }>>(
      `SELECT name, display_name FROM public.workspaces WHERE id=$1::uuid LIMIT 1`,
      workspaceId,
    );
    return w?.display_name || w?.name || 'SIRAH LIFE';
  }

  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`Report section failed: ${(err as Error).message}`);
      return fallback;
    }
  }
}

// ── Types ──────────────────────────────────────────────────────────────

export type ReportKind =
  | 'client_health'
  | 'client_monthly'
  | 'program_performance'
  | 'workspace_digest'
  | 'billing_gst';

const KNOWN_KINDS: ReportKind[] = [
  'client_health', 'client_monthly', 'program_performance', 'workspace_digest', 'billing_gst',
];

export interface RecordReportDto {
  kind: ReportKind;
  templateName: string;
  targetLabel?: string | null;
  targetId?: string | null;
  periodLabel?: string;
  pageCount?: number;
  sizeKb?: number;
}

interface RawReportRow {
  id: string;
  kind: string;
  template_name: string;
  target_label: string | null;
  target_id: string | null;
  period_label: string;
  status: string;
  page_count: number | null;
  size_kb: number | null;
  generated_by_label: string | null;
  created_at: Date | string;
}

export interface ReportRow {
  id: string;
  kind: ReportKind;
  templateName: string;
  target: string | null;
  targetId: string | null;
  period: string;
  status: string;
  pageCount: number | null;
  sizeKb: number | null;
  generatedBy: string;
  generatedAt: string;
}

export interface ReportStats {
  monthCount: number;
  inProgress: number;
  total: number;
  scheduledCount: number;
}

export interface ProgramReport {
  name: string;
  category: string | null;
  durationWeeks: number | null;
  enrolled: number;
  active: number;
  completed: number;
  paused: number;
  cancelled: number;
  avgProgress: number;
  completionRate: number;
  dropoutRate: number;
}

export interface ClientReport {
  name: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  gender: string | null;
  goals: string | null;
  status: string | null;
  programType: string | null;
  targetKcal: number | null;
  lastWeight: string | null;
  joinedAt: string | null;
  lastActiveAt: string | null;
  program: { name: string; status: string; progressPct: number; startDate: string | null; endDate: string | null } | null;
  nutrition30d: { avgDailyKcal: number; proteinG: number; carbG: number; fatG: number; mealCount: number; daysActive: number };
}

export interface ReportData {
  kind: ReportKind;
  workspaceName: string;
  periodLabel: string;
  generatedAt: string;
  target: { id: string; label: string } | null;
  digest?: {
    overview: Awaited<ReturnType<AnalyticsService['overview']>> | null;
    growth: Awaited<ReturnType<AnalyticsService['clientGrowth']>>;
    engagement: Awaited<ReturnType<AnalyticsService['engagement']>>;
    programs: Awaited<ReturnType<AnalyticsService['programPerformance']>>;
    nutrition: Awaited<ReturnType<AnalyticsService['nutritionTrends']>> | null;
    aiUsage: Awaited<ReturnType<AnalyticsService['aiUsage']>>;
  };
  program?: ProgramReport;
  client?: ClientReport;
  unsupported?: boolean;
}

function mapRow(r: RawReportRow): ReportRow {
  return {
    id: r.id,
    kind: r.kind as ReportKind,
    templateName: r.template_name,
    target: r.target_label,
    targetId: r.target_id,
    period: r.period_label,
    status: r.status,
    pageCount: r.page_count,
    sizeKb: r.size_kb,
    generatedBy: r.generated_by_label ?? 'You',
    generatedAt: typeof r.created_at === 'string' ? r.created_at : r.created_at.toISOString(),
  };
}
