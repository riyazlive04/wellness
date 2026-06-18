import { api } from '@/lib/api';

/** Module 8 — Program Management Engine API (owner/nutritionist + client). */

/** Rich client-facing structured content (program.md). All parts optional. */
export interface ProgramContent {
  overview?: { purpose?: string; achieve?: string; benefits?: string[]; transformation?: string };
  audience?: { tags?: string[]; min_age?: number | null; max_age?: number | null; bmi_min?: number | null; bmi_max?: number | null };
  eligibility?: {
    conditions_allowed?: string[]; conditions_not_suitable?: string[];
    pregnancy_restriction?: boolean; doctor_approval?: boolean; prerequisites?: string[];
  };
  outcomes?: {
    weight_loss?: string; waist?: string; body_fat?: string;
    energy?: boolean; sleep?: boolean; habits?: boolean; disclaimer?: string;
  };
  roadmap?: Array<{ title: string; description?: string; duration?: string }>;
  deliverables?: string[];
  support?: string[];
  faqs?: Array<{ q: string; a: string }>;
}

export interface ProgramTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  category: string;
  duration_weeks: number;
  duration_unit: 'weeks' | 'days';
  goals: string[];
  status: 'draft' | 'published' | 'archived';
  version: number;
  accent_color: string | null;
  tagline: string | null;
  cover_image_url: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  featured: boolean;
  visible: boolean;
  allow_enrollment: boolean;
  max_enrollments: number | null;
  internal_notes: string | null;
  content: ProgramContent;
  task_count?: number;
  assigned_count?: number;
  created_at: string;
  updated_at: string;
}

/** Body accepted by create/update (camelCase, all optional except name on create). */
export interface ProgramTemplateInput {
  name?: string;
  description?: string;
  category?: string;
  durationWeeks?: number;
  durationUnit?: 'weeks' | 'days';
  goals?: string[];
  accentColor?: string;
  tagline?: string;
  coverImageUrl?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  featured?: boolean;
  visible?: boolean;
  allowEnrollment?: boolean;
  maxEnrollments?: number;
  internalNotes?: string;
  content?: ProgramContent;
  status?: 'draft' | 'published' | 'archived';
}

export interface TemplateTask {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  type: string;
  cadence: 'daily' | 'weekly' | 'once';
  week_number: number | null;
  day_of_week: number | null;
  sort_order: number;
}

export interface ProgressInfo { pct: number; elapsed_days: number; daily_tasks: number; daily_done: number }

export interface Assignment {
  id: string;
  template_id: string | null;
  client_id: string;
  client_name?: string | null;
  client_email?: string | null;
  name: string;
  category: string | null;
  duration_weeks: number;
  template_version: number;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  progress_pct: string;
  created_at: string;
  progress?: ProgressInfo;
}

export interface AssignmentTask {
  id: string; assignment_id: string; title: string; description: string | null;
  type: string; cadence: string; week_number: number | null; day_of_week: number | null; sort_order: number;
}

export interface ProgramAnalytics {
  published_templates: number; total_templates: number; active_programs: number;
  completed_programs: number; clients_enrolled: number; avg_progress: number;
}

export interface TodayTask {
  id: string; title: string; description: string | null; type: string; cadence: string; program: string; done: boolean;
}

const OWNER = '/api/v1/workspaces/me/programs';

export const programEngineApi = {
  // Templates
  listTemplates: () => api.get<ProgramTemplate[]>(`${OWNER}/templates`),
  getTemplate: (id: string) => api.get<ProgramTemplate & { tasks: TemplateTask[] }>(`${OWNER}/templates/${id}`),
  createTemplate: (body: ProgramTemplateInput) =>
    api.post<ProgramTemplate>(`${OWNER}/templates`, { body }),
  updateTemplate: (id: string, body: Record<string, unknown>) => api.patch<ProgramTemplate>(`${OWNER}/templates/${id}`, { body }),
  deleteTemplate: (id: string) => api.delete<{ deleted: true }>(`${OWNER}/templates/${id}`),

  // Tasks (builder)
  addTask: (templateId: string, body: Partial<TemplateTask> & { title: string }) =>
    api.post<TemplateTask>(`${OWNER}/templates/${templateId}/tasks`, { body: normalizeTask(body) }),
  updateTask: (templateId: string, taskId: string, body: Record<string, unknown>) =>
    api.patch<TemplateTask>(`${OWNER}/templates/${templateId}/tasks/${taskId}`, { body }),
  deleteTask: (templateId: string, taskId: string) =>
    api.delete<{ deleted: true }>(`${OWNER}/templates/${templateId}/tasks/${taskId}`),

  // Assignment
  assign: (templateId: string, clientIds: string[]) =>
    api.post<{ assigned: number }>(`${OWNER}/templates/${templateId}/assign`, { body: { clientIds } }),
  listAssignments: (status?: string) =>
    api.get<Assignment[]>(`${OWNER}/assignments${status ? `?status=${status}` : ''}`),
  assignmentDetail: (id: string) =>
    api.get<Assignment & { tasks: AssignmentTask[]; progress: ProgressInfo }>(`${OWNER}/assignments/${id}`),
  setAssignmentStatus: (id: string, status: string) =>
    api.patch<Assignment>(`${OWNER}/assignments/${id}/status`, { body: { status } }),
  recommend: (id: string) => api.get<{ recommendation: string }>(`${OWNER}/assignments/${id}/recommend`),
  analytics: () => api.get<ProgramAnalytics>(`${OWNER}/analytics`),
};

// Client side
const CLIENT = '/api/v1/me/programs';

export interface CatalogProgram {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string;
  duration_weeks: number;
  duration_unit: 'weeks' | 'days';
  accent_color: string | null;
  cover_image_url: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  featured: boolean;
  allow_enrollment: boolean;
  max_enrollments: number | null;
  goals: string[];
  task_count: number;
  enrolled_count: number;
  enrolled: boolean;
}

/** Full client-facing detail — no internal_notes (server never sends it). */
export interface ClientProgramDetail extends CatalogProgram {
  content: ProgramContent;
}

export const clientProgramsApi = {
  today: () => api.get<TodayTask[]>(`${CLIENT}/today`),
  assigned: () => api.get<Assignment[]>(`${CLIENT}/assigned`),
  toggle: (taskId: string) => api.post<{ done: boolean; progress: ProgressInfo }>(`${CLIENT}/tasks/${taskId}/toggle`),
  // Self-enrollment catalog
  catalog: () => api.get<CatalogProgram[]>(`${CLIENT}/catalog`),
  catalogDetail: (templateId: string) => api.get<ClientProgramDetail>(`${CLIENT}/catalog/${templateId}`),
  enroll: (templateId: string) => api.post<{ assignmentId: string }>(`${CLIENT}/enroll`, { body: { templateId } }),
  leave: (templateId: string) => api.post<{ left: boolean }>(`${CLIENT}/leave`, { body: { templateId } }),
};

// Map the frontend's camel/snake task fields to the backend DTO (camelCase).
function normalizeTask(body: Partial<TemplateTask> & { title: string }): Record<string, unknown> {
  return {
    title: body.title,
    description: body.description ?? undefined,
    type: body.type ?? undefined,
    cadence: body.cadence ?? undefined,
    weekNumber: body.week_number ?? undefined,
    dayOfWeek: body.day_of_week ?? undefined,
    sortOrder: body.sort_order ?? undefined,
  };
}
