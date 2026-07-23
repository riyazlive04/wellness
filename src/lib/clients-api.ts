/**
 * Client-facing (`/me/*`) endpoints, ported from the web app's clientsApi
 * (frontend/src/modules/workspace/api/clients.ts). Only the client portal
 * surface lives here — owner/admin methods are intentionally omitted.
 */
import { api } from '@/lib/api';

export type ClientStatus = 'active' | 'paused' | 'archived' | 'completed' | string;

export interface ClientProfile {
  id: string;
  user_id: string;
  workspace_id: string;
  workspace_name: string | null;
  name: string;
  email: string;
  phone: string | null;
  age: number | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  goals: string | null;
  activity_level: string | null;
  allergies: string | null;
  medical_conditions: string | null;
  food_preferences: string | null;
  target_kcal: number | null;
  program_type: string | null;
  status: ClientStatus | null;
  avatar_url: string | null;
  onboarded_at: string | null;
  banner_quotes?: string[] | null;
}

export interface ClientMealLog {
  id: string;
  meal_type: string;
  meal_name: string | null;
  kcal: number | null;
  photo_url: string | null;
  notes: string | null;
  logged_at: string;
}

export interface ClientMessage {
  id: string;
  sender_type: 'system' | 'admin' | 'client';
  message_type: string;
  content: string;
  is_read: boolean;
  created_at: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
}

export interface JoinPreview {
  workspace_name: string;
  workspace_slug: string | null;
}

export interface ClientProgram {
  id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  total_kcal: number | null;
  status: string | null;
  published_at: string | null;
}

/** Wellness score + headline stats for the dashboard hero. */
export interface WellnessSnapshot {
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
}

export interface HabitDay {
  date: string;
  water_ml: number;
  sleep_hours: number | null;
  exercise_minutes: number;
  weight_kg: number | null;
  mood: 'great' | 'good' | 'okay' | 'low' | null;
}

export interface MoodEntry {
  date: string;
  mood: number | null;
  energy: number | null;
  notes: string | null;
}

export interface AssessmentCard {
  id: string;
  card_type: string;
  generated_content?: Record<string, unknown> | null;
  status: 'pending' | 'edited' | 'sent';
  created_at: string;
  has_responses: boolean;
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface JoinRequestRow {
  id: string;
  email: string;
  name: string | null;
  status: JoinRequestStatus;
  note: string | null;
  created_at: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  earned_at: string | null;
  progress: number;
}

export interface Appointment {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  kind: 'consultation' | 'follow_up' | 'check_in' | 'assessment' | 'group_session';
  mode: 'video' | 'phone' | 'in_person';
  /** pending = client request awaiting nutritionist approval. */
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'declined';
  meeting_url: string | null;
  location: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  rescheduled_at: string | null;
  previous_scheduled_at: string | null;
}

export interface MeetingJoin {
  provider: 'jitsi' | 'daily';
  domain: string;
  room: string;
  room_url: string | null;
  jwt: string | null;
  mode: Appointment['mode'];
  status: Appointment['status'];
  scheduled_at: string;
  duration_minutes: number;
  kind: Appointment['kind'];
  other_name: string | null;
}

export interface Supplement {
  id: string;
  name: string;
  dosage: string | null;
  schedule: string[];
  active: boolean;
  notes: string | null;
}

export type CycleEventType = 'period_start' | 'period_end' | 'ovulation' | 'pms' | 'cramps' | 'spotting';
export interface CycleEvent {
  id: string;
  event_type: CycleEventType;
  event_date: string;
  flow_level: number | null;
  notes: string | null;
}
export interface CyclePrediction {
  cycle_length_days: number | null;
  last_period_start: string | null;
  predicted_next_period: string | null;
  fertile_window_start: string | null;
  fertile_window_end: string | null;
}

export interface Symptom {
  id: string;
  occurred_at: string;
  symptom: string;
  severity: number;
  notes: string | null;
  suspected_trigger: string | null;
}

export interface RecipeListItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  servings: number;
  total_kcal: number | null;
  video_url: string | null;
}

export interface FileItem {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by?: string | null;
  created_at: string;
}

export interface ProgressPhoto {
  id: string;
  taken_at: string;
  angle: 'front' | 'side' | 'back' | null;
  storage_key: string;
  weight_kg: number | null;
  notes: string | null;
}

export interface OnboardingPayload {
  age?: number;
  gender?: string;
  goals?: string;
  phone?: string;
  allergies?: string;
  medical_conditions?: string;
  food_preferences?: string;
  activity_level?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  height_cm?: number;
  initial_weight_kg?: number;
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

/** One-shot aggregate powering the Today screen (mirrors GET /me/home). */
export interface ClientHomeData {
  profile: ClientProfile | null;
  snapshot: WellnessSnapshot | null;
  program: ClientProgram | null;
  messages: ClientMessage[] | null;
  mood: MoodEntry[] | null;
  assessments: AssessmentCard[] | null;
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const clientsApi = {
  home: () => api.get<ClientHomeData>('/api/v1/me/home'),
  myProfile: () => api.get<ClientProfile>('/api/v1/me/profile'),
  myMeals: (days = 7) => api.get<ClientMealLog[]>(`/api/v1/me/meals${qs({ days })}`),
  myHabits: (days = 14) => api.get<HabitDay[]>(`/api/v1/me/habits${qs({ days })}`),
  myMessages: (limit = 50) => api.get<ClientMessage[]>(`/api/v1/me/messages${qs({ limit })}`),
  myProgram: () => api.get<ClientProgram | null>('/api/v1/me/program'),
  logHabit: (body: Partial<Omit<HabitDay, 'date'>> & { date?: string }) =>
    api.post<HabitDay>('/api/v1/me/habits', { body }),
  logMood: (body: { mood?: number; energy?: number; mood_notes?: string; date?: string }) =>
    api.post<MoodEntry>('/api/v1/me/mood', { body }),
  recordPresence: () => api.post<{ ok: true }>('/api/v1/me/presence'),

  // Messaging with the nutritionist.
  sendMessage: (body: {
    content?: string;
    attachment?: { url: string; type: string; name?: string; size?: number };
    replyTo?: string;
  }) => api.post<ClientMessage>('/api/v1/me/messages', { body }),
  markMyMessagesRead: () => api.post<{ marked: number }>('/api/v1/me/messages/read'),

  myNutritionist: () =>
    api.get<{ name: string; logo_url: string | null; tagline: string | null }>('/api/v1/me/nutritionist'),

  updateMyProfile: (
    patch: Partial<{
      name: string;
      age: number;
      gender: string;
      goals: string;
      phone: string;
      allergies: string;
      medical_conditions: string;
      food_preferences: string;
      activity_level: string;
      height_cm: number;
      weight_kg: number;
      avatar_url: string;
    }>,
  ) => api.patch<ClientProfile>('/api/v1/me/profile', { body: patch }),

  // Extended client surface (More-menu screens).
  myWellnessSnapshot: () => api.get<WellnessSnapshot>('/api/v1/me/wellness/snapshot'),
  myAchievements: () => api.get<Achievement[]>('/api/v1/me/achievements'),
  myMeasurements: (limit = 30) => api.get<Measurement[]>(`/api/v1/me/measurements${qs({ limit })}`),
  logMeasurement: (body: Partial<Omit<Measurement, 'id' | 'recorded_at'>> & { recorded_at?: string }) =>
    api.post<Measurement>('/api/v1/me/measurements', { body }),
  myAppointments: () => api.get<Appointment[]>('/api/v1/me/appointments'),
  myMeetingConfig: (id: string) => api.get<MeetingJoin>(`/api/v1/me/appointments/${id}/meeting`),
  bookAppointment: (body: {
    scheduled_at: string;
    duration_minutes?: number;
    kind: Appointment['kind'];
    mode?: Appointment['mode'];
    notes?: string;
  }) => api.post<Appointment>('/api/v1/me/appointments', { body }),
  cancelAppointment: (id: string, reason?: string) =>
    api.delete<Appointment>(`/api/v1/me/appointments/${id}`, { body: { reason } }),
  mySupplements: () => api.get<Supplement[]>('/api/v1/me/supplements'),
  cycleEvents: (days = 180) => api.get<CycleEvent[]>(`/api/v1/me/cycle${qs({ days })}`),
  cyclePrediction: () => api.get<CyclePrediction>('/api/v1/me/cycle/prediction'),
  logCycleEvent: (body: {
    event_type: CycleEventType;
    event_date?: string;
    flow_level?: number;
    notes?: string;
  }) => api.post<CycleEvent>('/api/v1/me/cycle', { body }),
  deleteCycleEvent: (id: string) => api.delete<{ deleted: true }>(`/api/v1/me/cycle/${id}`),
  mySymptoms: (days = 60) => api.get<Symptom[]>(`/api/v1/me/symptoms${qs({ days })}`),
  listRecipes: (params: { q?: string; cuisine?: string; limit?: number } = {}) =>
    api.get<RecipeListItem[]>(`/api/v1/me/recipes${qs(params)}`),
  listCuisines: () => api.get<string[]>('/api/v1/me/recipes-cuisines'),
  myFiles: () => api.get<FileItem[]>('/api/v1/me/files'),
  fileUploadTicket: (file_name: string) =>
    api.post<{ uploadUrl: string; storageKey: string; token: string }>('/api/v1/me/files/upload-ticket', {
      body: { file_name },
    }),
  addMyFile: (body: { storage_key: string; file_name: string; file_type?: string; file_size?: number }) =>
    api.post<FileItem>('/api/v1/me/files', { body }),
  signFile: (id: string) =>
    api.get<{ url: string; expiresInSeconds: number }>(`/api/v1/me/files/${id}/download`),
  deleteMyFile: (id: string) => api.delete<{ deleted: true }>(`/api/v1/me/files/${id}`),
  myAssessments: () => api.get<AssessmentCard[]>('/api/v1/me/assessments'),
  respondAssessment: (id: string, responses: Record<string, unknown>) =>
    api.post<AssessmentCard>(`/api/v1/me/assessments/${id}/responses`, { body: { responses } }),
  /** Alias used by the take/submit UI (same endpoint as respondAssessment). */
  submitAssessment: (id: string, responses: Record<string, unknown>) =>
    api.post<AssessmentCard>(`/api/v1/me/assessments/${id}/responses`, { body: { responses } }),
  myJoinRequest: () => api.get<JoinRequestRow | null>('/api/v1/me/join-request'),
  previewJoin: (token: string) =>
    api.get<JoinPreview>(`/api/v1/join/${encodeURIComponent(token)}`, { skipAuth: true }),
  requestJoin: (token: string, name?: string) =>
    api.post<{ status: 'pending' | 'active'; workspaceId: string; clientId: string }>(
      `/api/v1/join/${encodeURIComponent(token)}/request`,
      { body: { name } },
    ),

  // Progress photos (signed-URL upload: ticket -> PUT file -> register).
  progressPhotos: () => api.get<ProgressPhoto[]>('/api/v1/me/photos'),
  photoUploadTicket: (file_name: string) =>
    api.post<{ uploadUrl: string; storageKey: string; token: string }>('/api/v1/me/photos/upload-ticket', {
      body: { file_name },
    }),
  addPhoto: (body: {
    storage_key: string;
    angle?: 'front' | 'side' | 'back';
    weight_kg?: number;
    notes?: string;
    taken_at?: string;
  }) => api.post<ProgressPhoto>('/api/v1/me/photos', { body }),
  photoDownload: (id: string) =>
    api.get<{ url: string; expiresInSeconds: number }>(`/api/v1/me/photos/${id}/download`),
  deletePhoto: (id: string) => api.delete<{ deleted: true }>(`/api/v1/me/photos/${id}`),

  // Onboarding (post-invite wellness wizard).
  completeOnboarding: (body: OnboardingPayload) =>
    api.post<ClientProfile>('/api/v1/me/onboarding/complete', { body }),
};
