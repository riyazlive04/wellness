import { api } from '@/lib/api';
import type { ReportKind } from '@/lib/owner/types/reports';

/** Reports — owner "PDFs, summaries & audits". PDFs render client-side; the
 *  backend supplies real numbers (`/data`) and the generation history. */

export interface ReportRow {
  id: string;
  kind: ReportKind;
  templateName: string;
  target: string | null;
  targetId: string | null;
  period: string;
  status: 'ready' | 'generating' | 'queued' | 'failed' | string;
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

// ── Report data payloads (shape mirrors backend ReportData) ─────────────

export interface DigestData {
  overview: {
    total_clients: number; active_clients: number; new_clients_month: number; active_7d: number;
    active_programs: number; avg_program_progress: number; ai_calls_month: number; messages_7d: number; mrr_inr: number;
  } | null;
  growth: Array<{ month: string; count: number }>;
  engagement: Array<{ day: string; active: number }>;
  programs: { by_status: Array<{ status: string; count: number; avg_progress: number }> };
  nutrition: { protein_g: number; carb_g: number; fat_g: number; avg_daily_kcal: number; meal_count: number } | null;
  aiUsage: { daily: Array<{ day: string; calls: number }>; by_service: Array<{ service: string; calls: number }> };
}

export interface ProgramReport {
  name: string; category: string | null; durationWeeks: number | null;
  enrolled: number; active: number; completed: number; paused: number; cancelled: number;
  avgProgress: number; completionRate: number; dropoutRate: number;
}

export interface ClientReport {
  name: string; email: string | null; phone: string | null; age: number | null;
  gender: string | null; goals: string | null; status: string | null; programType: string | null;
  targetKcal: number | null; lastWeight: string | null; joinedAt: string | null; lastActiveAt: string | null;
  program: { name: string; status: string; progressPct: number; startDate: string | null; endDate: string | null } | null;
  nutrition30d: { avgDailyKcal: number; proteinG: number; carbG: number; fatG: number; mealCount: number; daysActive: number };
}

export interface ReportData {
  kind: ReportKind;
  workspaceName: string;
  periodLabel: string;
  generatedAt: string;
  target: { id: string; label: string } | null;
  digest?: DigestData;
  program?: ProgramReport;
  client?: ClientReport;
  unsupported?: boolean;
}

export interface RecordReportBody {
  kind: ReportKind;
  templateName: string;
  targetLabel?: string | null;
  targetId?: string | null;
  periodLabel?: string;
  pageCount?: number;
  sizeKb?: number;
}

const BASE = '/api/v1/workspaces/me/reports';

export const reportsApi = {
  list: () => api.get<ReportRow[]>(BASE),
  stats: () => api.get<ReportStats>(`${BASE}/stats`),
  data: (kind: ReportKind, targetId?: string) =>
    api.get<ReportData>(`${BASE}/data?kind=${kind}${targetId ? `&targetId=${targetId}` : ''}`),
  record: (body: RecordReportBody) => api.post<ReportRow>(BASE, { body }),
  remove: (id: string) => api.delete<{ deleted: true }>(`${BASE}/${id}`),
};
