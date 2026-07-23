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
  start_date: string;
  end_date: string | null;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  progress_pct: string;
  progress?: ProgressInfo;
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
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  featured: boolean;
  allow_enrollment: boolean;
  task_count: number;
  enrolled_count: number;
  enrolled: boolean;
  goals?: string[];
}

/** Full detail — the catalog fields plus content (typed loosely; we only render
 *  a summary on mobile). */
export interface ClientProgramDetail extends CatalogProgram {
  content?: {
    weeks?: { week_number: number; title?: string | null; tasks?: { title: string }[] }[];
  } | null;
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
