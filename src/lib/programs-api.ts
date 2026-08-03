/** Client program engine — assigned programs, daily tasks, self-enroll catalog.
 *  Ported from web programEngine clientProgramsApi (/me/programs). */
import { api } from '@/lib/api';

export interface ProgressInfo {
  pct: number;
  elapsed_days: number;
  daily_tasks: number;
  daily_done: number;
}

export interface Assignment {
  id: string;
  template_id: string | null;
  name: string;
  category: string | null;
  duration_weeks: number;
  duration_unit?: 'weeks' | 'days';
  start_date: string;
  end_date: string | null;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  progress_pct: string;
  progress?: ProgressInfo;
}

/** "100 days" / "12 weeks" — respects the program's own unit, defaults to weeks. */
export function programDuration(n: number, unit?: string): string {
  const u = unit === 'days' ? 'day' : 'week';
  return `${n} ${u}${n === 1 ? '' : 's'}`;
}

export interface TodayTask {
  id: string;
  title: string;
  description: string | null;
  type: string;
  cadence: string;
  program: string;
  done: boolean;
}

export interface CatalogProgram {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string;
  duration_weeks: number;
  duration_unit?: 'weeks' | 'days';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  featured: boolean;
  allow_enrollment: boolean;
  task_count: number;
  enrolled_count: number;
  enrolled: boolean;
  goals?: string[];
}

export interface ProgramTaskLite {
  id: string;
  title: string;
  description: string | null;
  type: string;
  cadence: string;
  week_number: number | null;
  day_of_week: number | null;
}

/** Rich client-facing program content (mirrors the web ProgramContent). */
export interface ProgramContent {
  overview?: { purpose?: string; achieve?: string; benefits?: string[]; transformation?: string };
  outcomes?: { weight_loss?: string; waist?: string; body_fat?: string; disclaimer?: string };
  roadmap?: { title: string; description?: string; duration?: string }[];
  deliverables?: string[];
  support?: string[];
}

/** Full detail — catalog fields plus the program's tasks and rich content. */
export interface ClientProgramDetail extends CatalogProgram {
  cover_image_url?: string | null;
  tasks?: ProgramTaskLite[];
  content?: ProgramContent | null;
}

const CLIENT = '/api/v1/me/programs';

export const programsApi = {
  today: () => api.get<TodayTask[]>(`${CLIENT}/today`),
  assigned: () => api.get<Assignment[]>(`${CLIENT}/assigned`),
  toggle: (taskId: string) =>
    api.post<{ done: boolean; progress: ProgressInfo }>(`${CLIENT}/tasks/${taskId}/toggle`),
  catalog: () => api.get<CatalogProgram[]>(`${CLIENT}/catalog`),
  catalogDetail: (templateId: string) => api.get<ClientProgramDetail>(`${CLIENT}/catalog/${templateId}`),
  enroll: (templateId: string) =>
    api.post<{ assignmentId: string }>(`${CLIENT}/enroll`, { body: { templateId } }),
  leave: (templateId: string) => api.post<{ left: boolean }>(`${CLIENT}/leave`, { body: { templateId } }),
};
