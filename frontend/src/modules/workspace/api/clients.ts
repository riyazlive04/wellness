import { api } from '@/lib/api';

// ──────────────────────────────────────────────────────────────────
// Types — kept in sync with backend/src/clients/clients.types.ts
// ──────────────────────────────────────────────────────────────────

export type ClientStatus = 'active' | 'paused' | 'archived' | 'completed' | string;
export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface ClientListItem {
  id: string;
  user_id: string | null;
  workspace_id: string;
  name: string;
  email: string;
  phone: string | null;
  status: ClientStatus | null;
  program_type: string | null;
  target_kcal: number | null;
  last_weight: string | null;
  display_name: string | null;
  avatar_url: string | null;
  last_active_at: string | null;
  assigned_coach_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** The self-maintained wellness profile a client edits on their Settings page. */
export interface ClientWorkspaceProfile {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  age: number | null;
  gender: string | null;
  height_cm: number | null;
  goals: string | null;
  activity_level: string | null;
  allergies: string | null;
  medical_conditions: string | null;
  food_preferences: string | null;
  service_type: string | null;
  onboarded_at: string | null;
  updated_at: string | null;
}

export interface WorkspaceCoach {
  user_id: string;
  name: string;
  email: string | null;
  role: string;
}

export interface ListClientsResult {
  items: ClientListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ClientInviteRow {
  id: string;
  workspace_id: string;
  email: string;
  name: string | null;
  token: string;
  invited_by: string;
  status: InviteStatus;
  accepted_user_id: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvitePreview {
  id: string;
  workspace_name: string;
  workspace_slug: string | null;
  inviter_email: string | null;
  email: string;
  expires_at: string;
  status: InviteStatus;
  is_expired: boolean;
}

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
  goals: string | null;
  target_kcal: number | null;
  program_type: string | null;
  status: ClientStatus | null;
  avatar_url: string | null;
  last_active_at: string | null;
  /** NULL until the post-invite wellness wizard is complete. */
  onboarded_at: string | null;
  /** Client-authored motivational quotes rotated on their Today banner. */
  banner_quotes?: string[] | null;
  /** NULL until the client accepts the community guidelines (one-time gate). */
  community_accepted_at?: string | null;
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
  metadata?: MessageMeta | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
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
  score: number;              // 0-100
  scoreLabel: string;         // "On track" / "Slipping" / "Glowing" etc.
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

/** Daily habit log for the progress + dashboard pages. */
export interface HabitDay {
  date: string;        // YYYY-MM-DD
  water_ml: number;
  sleep_hours: number | null;
  exercise_minutes: number;
  weight_kg: number | null;
  mood: 'great' | 'good' | 'okay' | 'low' | null;
}

// ── Vision / Voice — Phase 2 (Nutrition Engine routed) ───────────────

export type CookingMethodCode =
  | 'raw' | 'boiled' | 'steamed' | 'grilled' | 'roasted' | 'baked'
  | 'sauteed' | 'pan_fried' | 'deep_fried' | 'stir_fried' | 'curried'
  | 'tandoor' | 'pressure_cooked' | 'microwaved' | 'fermented';

export interface DetectedItem {
  id: string;
  detected_name: string;
  alternates: string[];
  portion_g: number;
  cooking_method: CookingMethodCode;
  ai_confidence: number;
  box?: { x: number; y: number; w: number; h: number };
  resolved: boolean;
  food: {
    id: string;
    source: string;
    source_id: string | null;
    canonical_name: string;
    category: string;
  } | null;
  nutrients: {
    energy_kcal: number;
    protein_g: number;
    carbohydrate_g: number;
    fat_g: number;
    fiber_g: number | null;
    sodium_mg: number | null;
    iron_mg: number | null;
  } | null;
  audit_id: string | null;
  unresolved?: {
    query: string;
    reason: 'no_match' | 'low_confidence' | 'ambiguous';
    candidate_food_ids: string[];
    recommended_action: 'manual_review_required';
  };
}

export interface VisionAnalysisResult {
  items: DetectedItem[];
  totals: {
    energy_kcal: number;
    protein_g: number;
    carbohydrate_g: number;
    fat_g: number;
    fiber_g: number | null;
  };
  unresolved_count: number;
  ai_latency_ms: number;
  has_boxes: boolean;
  provenance: {
    engine_version: string;
    ai_model: string;
  };
}

export interface VoiceMealFood {
  detected_name: string;
  alternates: string[];
  portion_g: number;
  cooking_method: CookingMethodCode;
  ai_confidence: number;
  resolved: boolean;
  food: DetectedItem['food'];
  nutrients: DetectedItem['nutrients'];
  audit_id: string | null;
  unresolved?: DetectedItem['unresolved'];
}

export type VoiceIntent =
  | { kind: 'meal_log';   foods: VoiceMealFood[]; notes?: string }
  | { kind: 'question';   topic: string }
  | { kind: 'reflection'; mood?: string; energy?: number }
  | { kind: 'unknown' };

export interface VoiceConverseResult {
  userTranscript: string;
  aiResponse: string;
  intent?: VoiceIntent;
  latencyMs: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;          // emoji or lucide name
  earned_at: string | null;
  progress: number;      // 0-100
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

/** Appointment enriched with the client's identity, for owner/workspace views. */
export interface WorkspaceAppointment extends Appointment {
  client_id: string;
  client_name: string;
  client_avatar: string | null;
}

/** Join config for the embedded video meeting (free public Jitsi or JaaS when configured). */
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

export interface PushConfig {
  vapidPublicKey: string | null;
  enabled: boolean;
}

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
  my_role: 'owner' | 'moderator' | 'member' | null;
  my_status: 'active' | 'muted' | null;
  created_at: string;
  is_challenge: boolean;
  starts_at: string | null;
  ends_at: string | null;
  target_metric: ChallengeMetric | null;
  target_value: number | null;
}

export interface LeaderboardEntry {
  client_id: string;
  name: string;
  value: number;
  rank: number;
  is_me: boolean;
}

export interface ChallengeLeaderboard {
  group: {
    id: string; name: string;
    target_metric: ChallengeMetric;
    target_value: number;
    starts_at: string;
    ends_at: string;
    is_active: boolean;
  };
  entries: LeaderboardEntry[];
  me_rank: number | null;
  me_value: number;
}

export interface CommunityMember {
  client_id: string;
  name: string;
  role: 'owner' | 'moderator' | 'member';
  status: 'active' | 'muted';
  joined_at: string;
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

export type AssessmentCardType = 'health_assessment' | 'stress_card' | 'sleep_card' | 'action_plan' | 'diet_plan' | 'custom_form';

export type AssessmentQuestionType = 'section' | 'text' | 'scale' | 'number' | 'yesno' | 'choice' | 'multi';
export interface AssessmentFormQuestion {
  id: string;
  question: string;
  type: AssessmentQuestionType;
  options?: string[];
  max?: number;
  required?: boolean;
}
export interface AssessmentForm {
  id: string;
  name: string;
  description: string | null;
  questions: AssessmentFormQuestion[];
  created_at: string;
  updated_at: string;
}

/** A completed assessment surfaced on the owner dashboard's review feed. */
export interface RecentAssessment {
  id: string;
  client_id: string;
  client_name: string;
  card_type: AssessmentCardType;
  title: string | null;
  score: number | null;
  band: string | null;
  submitted_at: string;
}

export interface AssessmentCard {
  id: string;
  card_type: AssessmentCardType;
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
  /** 'client' = uploaded by the client, 'workspace' = shared by the nutritionist. */
  uploaded_by?: string | null;
  created_at: string;
}

export interface ClientNote {
  id: string;
  content: string;
  admin_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Wave 1 ────────────────────────────────────────────────────────────

export interface MoodEntry {
  date: string;
  mood: number | null;
  energy: number | null;
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
  date: string;
}

export interface ConversationSummary {
  client_id: string;
  client_name: string;
  program: string;
  status: string | null;
  avatar_url: string | null;
  last_active_at: string | null;
  last_message: string | null;
  last_sender: 'admin' | 'client' | 'system' | null;
  last_message_at: string | null;
  unread: number;
}

/** Per-message extras stored server-side in messages.metadata. */
export interface MessageMeta {
  reactions?: { admin?: string; client?: string };
  reply?: { id: string; sender: string; preview: string };
  edited_at?: string;
  deleted_at?: string;
  pinned_at?: string;
  status?: string;
  scheduled_for?: string;
}
export interface MsgAttachment { url: string; type: string; name?: string; size?: number }
export interface QuickReply { id: string; label: string; body: string }

export interface ThreadMessage {
  id: string;
  sender_type: 'admin' | 'client' | 'system';
  message_type: string;
  content: string;
  is_read: boolean;
  created_at: string;
  metadata?: MessageMeta | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
}

export interface WeeklySummary {
  summary: string;
  metrics: {
    logged_days: number;
    avg_water_ml: number | null;
    total_exercise_min: number;
    avg_sleep_hrs: number | null;
    avg_mood: number | null;
    avg_energy: number | null;
    meals_logged: number;
  };
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

// ──────────────────────────────────────────────────────────────────
// Client URL slugs
// ──────────────────────────────────────────────────────────────────

/**
 * Human-readable, collision-safe client URL slug: a slugified name plus the
 * first 8 hex chars of the client id (e.g. `sirah-370b450f`). The name part is
 * cosmetic — resolution keys off the id suffix (see `clientIdFromSlug`), so a
 * raw UUID still resolves and stale name slugs never route to the wrong client.
 */
export function clientSlug(displayName: string | null | undefined, id: string): string {
  const base = (displayName || 'client')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'client';
  return `${base}-${id.slice(0, 8)}`;
}

/** Extract the id fragment from a slug (or return the value if it's a raw id). */
export function clientIdFragment(slugOrId: string): string {
  const m = /-([0-9a-f]{8})$/i.exec(slugOrId);
  return m ? m[1].toLowerCase() : slugOrId.toLowerCase();
}

// ──────────────────────────────────────────────────────────────────
// API surface
// ──────────────────────────────────────────────────────────────────

function buildQs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const clientsApi = {
  // Workspace-admin endpoints
  list: (params: { q?: string; status?: string; limit?: number; offset?: number } = {}) =>
    api.get<ListClientsResult>(`/api/v1/workspaces/me/clients${buildQs(params)}`),
  listInvites: () => api.get<{ items: ClientInviteRow[] }>('/api/v1/workspaces/me/clients/invites'),
  invite: (body: { email: string; name?: string; notes?: string }) =>
    api.post<ClientInviteRow>('/api/v1/workspaces/me/clients/invite', { body }),
  importClients: (rows: Array<{ email: string; name?: string; phone?: string }>) =>
    api.post<{ total: number; created: number; skipped: Array<{ email: string; reason: string }> }>(
      '/api/v1/workspaces/me/clients/import', { body: { rows } }),
  listCoaches: () => api.get<WorkspaceCoach[]>('/api/v1/workspaces/me/clients/coaches'),
  assignCoach: (clientId: string, coachUserId: string | null) =>
    api.patch<{ id: string; assigned_coach_user_id: string | null }>(
      `/api/v1/workspaces/me/clients/${clientId}/coach`, { body: { coachUserId } }),
  revokeInvite: (id: string) =>
    api.post<ClientInviteRow>(`/api/v1/workspaces/me/clients/invites/${id}/revoke`),

  // Workspace-admin messaging
  listConversations: () =>
    api.get<ConversationSummary[]>('/api/v1/workspaces/me/clients/conversations'),
  clientThread: (clientId: string, limit = 200) =>
    api.get<ThreadMessage[]>(`/api/v1/workspaces/me/clients/${clientId}/messages${buildQs({ limit })}`),
  sendToClient: (clientId: string, opts: { content?: string; attachment?: MsgAttachment; replyTo?: string; scheduledFor?: string }) =>
    api.post<ThreadMessage>(`/api/v1/workspaces/me/clients/${clientId}/messages`, { body: opts }),
  markClientThreadRead: (clientId: string) =>
    api.post<{ marked: number }>(`/api/v1/workspaces/me/clients/${clientId}/messages/read`),
  reactToClientMsg: (clientId: string, messageId: string, emoji: string) =>
    api.post<{ ok: true }>(`/api/v1/workspaces/me/clients/${clientId}/messages/${messageId}/react`, { body: { emoji } }),
  editClientMsg: (clientId: string, messageId: string, content: string) =>
    api.patch<{ ok: true }>(`/api/v1/workspaces/me/clients/${clientId}/messages/${messageId}`, { body: { content } }),
  deleteClientMsg: (clientId: string, messageId: string, scope: 'me' | 'everyone' = 'everyone') =>
    api.delete<{ ok: true }>(`/api/v1/workspaces/me/clients/${clientId}/messages/${messageId}?scope=${scope}`),
  pinClientMsg: (clientId: string, messageId: string, pinned: boolean) =>
    api.post<{ ok: true }>(`/api/v1/workspaces/me/clients/${clientId}/messages/${messageId}/pin`, { body: { pinned } }),
  // Quick-reply templates (workspace-scoped)
  listQuickReplies: () => api.get<QuickReply[]>('/api/v1/workspaces/me/clients/quick-replies'),
  createQuickReply: (body: string, label?: string) =>
    api.post<QuickReply>('/api/v1/workspaces/me/clients/quick-replies', { body: { body, label } }),
  deleteQuickReply: (id: string) =>
    api.delete<{ deleted: true }>(`/api/v1/workspaces/me/clients/quick-replies/${id}`),
  // Scheduled messages
  listScheduled: (clientId: string) =>
    api.get<ThreadMessage[]>(`/api/v1/workspaces/me/clients/${clientId}/scheduled`),
  cancelScheduled: (clientId: string, messageId: string) =>
    api.delete<{ cancelled: true }>(`/api/v1/workspaces/me/clients/${clientId}/scheduled/${messageId}`),

  // ── Client wellness drill-down (nutritionist view) ─────────────────

  clientWorkspaceMeals: (clientId: string, days = 30) =>
    api.get<Array<{
      id: string;
      meal_type: string;
      meal_name: string | null;
      kcal: number | null;
      detected_name: string | null;
      cooking_method: string | null;
      ai_confidence: number | null;
      nutrition_snapshot: unknown;
      audit_id: string | null;
      resolution_status: string | null;
      logged_at: string;
    }>>(`/api/v1/workspaces/me/clients/${clientId}/meals${buildQs({ days })}`),

  clientWorkspaceHabits: (clientId: string, days = 30) =>
    api.get<Array<{
      date: string;
      water_ml: number;
      sleep_hours: number | null;
      exercise_minutes: number;
      weight_kg: number | null;
      mood: number | null;
      energy: number | null;
    }>>(`/api/v1/workspaces/me/clients/${clientId}/habits${buildQs({ days })}`),

  clientWorkspaceMeasurements: (clientId: string) =>
    api.get<Array<{
      id: string;
      recorded_at: string;
      arm_inches: number | null;
      chest_inches: number | null;
      waist_inches: number | null;
      hip_inches: number | null;
      thigh_inches: number | null;
      notes: string | null;
    }>>(`/api/v1/workspaces/me/clients/${clientId}/measurements`),

  clientWorkspaceProfile: (clientId: string) =>
    api.get<ClientWorkspaceProfile>(`/api/v1/workspaces/me/clients/${clientId}/profile`),

  clientWorkspaceNutritionAudit: (clientId: string, limit = 50) =>
    api.get<Array<{
      id: string;
      target_type: string;
      food_id: string | null;
      food_name: string | null;
      food_source: string | null;
      inputs: unknown;
      outputs: unknown;
      ai_confidence: number | null;
      engine_version: string;
      database_version: string;
      created_at: string;
    }>>(`/api/v1/workspaces/me/clients/${clientId}/nutrition-audit${buildQs({ limit })}`),

  clientWorkspaceNutritionTrends: (clientId: string, days = 14) =>
    api.get<Array<{
      date: string;
      total_kcal: number;
      total_protein_g: number;
      total_carbs_g: number;
      total_fat_g: number;
      meals_count: number;
    }>>(`/api/v1/workspaces/me/clients/${clientId}/nutrition-trends${buildQs({ days })}`),

  // Assessments — owner assigns a Health / Stress / Sleep questionnaire and
  // reviews the client's responses.
  clientAssessments: (clientId: string) =>
    api.get<AssessmentCard[]>(`/api/v1/workspaces/me/clients/${clientId}/assessments`),
  // Workspace-wide recently-completed assessments — for the owner dashboard feed.
  recentAssessments: (limit = 6) =>
    api.get<RecentAssessment[]>(`/api/v1/workspaces/me/clients/assessments/recent${buildQs({ limit })}`),
  assignAssessment: (clientId: string, type: 'health' | 'stress' | 'sleep') =>
    api.post<AssessmentCard>(`/api/v1/workspaces/me/clients/${clientId}/assessments`, { body: { type } }),
  // Nutritionist marks an assessment reviewed (+ optional note the client sees).
  reviewAssessment: (clientId: string, cardId: string, note?: string) =>
    api.post<AssessmentCard>(`/api/v1/workspaces/me/clients/${clientId}/assessments/${cardId}/review`, { body: { note } }),
  // Custom form builder — assign a workspace-authored form to a client.
  assignAssessmentForm: (clientId: string, templateId: string) =>
    api.post<AssessmentCard>(`/api/v1/workspaces/me/clients/${clientId}/assessments`, { body: { templateId } }),
  listAssessmentForms: () =>
    api.get<AssessmentForm[]>('/api/v1/workspaces/me/assessment-forms'),
  createAssessmentForm: (payload: { name: string; description?: string; questions: AssessmentFormQuestion[] }) =>
    api.post<AssessmentForm>('/api/v1/workspaces/me/assessment-forms', { body: payload }),
  deleteAssessmentForm: (id: string) =>
    api.delete<{ id: string }>(`/api/v1/workspaces/me/assessment-forms/${id}`),

  // Private notes the nutritionist keeps on a client
  clientNotes: (clientId: string) =>
    api.get<ClientNote[]>(`/api/v1/workspaces/me/clients/${clientId}/notes`),
  addClientNote: (clientId: string, content: string) =>
    api.post<ClientNote>(`/api/v1/workspaces/me/clients/${clientId}/notes`, { body: { content } }),
  updateClientNote: (clientId: string, noteId: string, content: string) =>
    api.patch<ClientNote>(`/api/v1/workspaces/me/clients/${clientId}/notes/${noteId}`, { body: { content } }),
  deleteClientNote: (clientId: string, noteId: string) =>
    api.delete<{ deleted: true }>(`/api/v1/workspaces/me/clients/${clientId}/notes/${noteId}`),

  // Client file vault — nutritionist view (sees client uploads + can share)
  clientWorkspaceFiles: (clientId: string) =>
    api.get<FileItem[]>(`/api/v1/workspaces/me/clients/${clientId}/files`),
  signClientFile: (clientId: string, fileId: string) =>
    api.get<{ url: string; expiresInSeconds: number }>(`/api/v1/workspaces/me/clients/${clientId}/files/${fileId}/download`),
  clientFileUploadTicket: (clientId: string, file_name: string) =>
    api.post<{ uploadUrl: string; storageKey: string; token: string }>(`/api/v1/workspaces/me/clients/${clientId}/files/upload-ticket`, { body: { file_name } }),
  shareClientFile: (clientId: string, body: { storage_key: string; file_name: string; file_type?: string; file_size?: number }) =>
    api.post<FileItem>(`/api/v1/workspaces/me/clients/${clientId}/files`, { body }),
  deleteClientFile: (clientId: string, fileId: string) =>
    api.delete<{ deleted: true }>(`/api/v1/workspaces/me/clients/${clientId}/files/${fileId}`),

  // Public invite preview + accept
  previewInvite: (token: string) =>
    api.get<InvitePreview>(`/api/v1/invites/${token}`, { skipAuth: true }),
  acceptInvite: (token: string) =>
    api.post<{ workspaceId: string; clientId: string; accepted: true }>(`/api/v1/invites/${token}/accept`),

  // Client-self endpoints
  myProfile:  () => api.get<ClientProfile>('/api/v1/me/profile'),
  myMeals:    (days = 7) => api.get<ClientMealLog[]>(`/api/v1/me/meals${buildQs({ days })}`),
  myMessages: (limit = 50) => api.get<ClientMessage[]>(`/api/v1/me/messages${buildQs({ limit })}`),
  myProgram:  () => api.get<ClientProgram | null>('/api/v1/me/program'),
  myNutritionist: () => api.get<{ name: string; logo_url: string | null; tagline: string | null }>('/api/v1/me/nutritionist'),

  // Extended wellness endpoints — backend implements these as part of MeController.
  myWellnessSnapshot: () => api.get<WellnessSnapshot>('/api/v1/me/wellness/snapshot'),
  myHabits:    (days = 14) => api.get<HabitDay[]>(`/api/v1/me/habits${buildQs({ days })}`),
  logHabit:    (body: Partial<Omit<HabitDay, 'date'>> & { date?: string }) =>
    api.post<HabitDay>('/api/v1/me/habits', { body }),
  myAchievements: () => api.get<Achievement[]>('/api/v1/me/achievements'),
  sendMessage: (opts: string | { content?: string; attachment?: MsgAttachment; replyTo?: string }) =>
    api.post<ClientMessage>('/api/v1/me/messages', { body: typeof opts === 'string' ? { content: opts } : opts }),
  markMyMessagesRead: () => api.post<{ marked: number }>('/api/v1/me/messages/read'),
  reactMyMsg: (messageId: string, emoji: string) =>
    api.post<{ ok: true }>(`/api/v1/me/messages/${messageId}/react`, { body: { emoji } }),
  editMyMsg: (messageId: string, content: string) =>
    api.patch<{ ok: true }>(`/api/v1/me/messages/${messageId}`, { body: { content } }),
  deleteMyMsg: (messageId: string, scope: 'me' | 'everyone' = 'everyone') =>
    api.delete<{ ok: true }>(`/api/v1/me/messages/${messageId}?scope=${scope}`),
  pinMyMsg: (messageId: string, pinned: boolean) =>
    api.post<{ ok: true }>(`/api/v1/me/messages/${messageId}/pin`, { body: { pinned } }),
  updateMyProfile: (patch: Partial<{
    age: number; gender: string; goals: string; phone: string;
    allergies: string; medical_conditions: string; food_preferences: string;
    activity_level: string; height_cm: number; avatar_url: string;
  }>) => api.patch<ClientProfile>('/api/v1/me/profile', { body: patch }),
  /** Replace the client's rotating Today-banner quotes. */
  setBannerQuotes: (quotes: string[]) =>
    api.put<{ banner_quotes: string[] }>('/api/v1/me/banner-quotes', { body: { quotes } }),

  /** Accept the community guidelines (one-time). Returns the acceptance timestamp. */
  acceptCommunity: () =>
    api.post<{ community_accepted_at: string }>('/api/v1/me/community/accept'),
  /** Presence heartbeat — call periodically while the client app is open. */
  recordPresence: () => api.post<{ ok: true }>('/api/v1/me/presence'),
  completeOnboarding: (body: OnboardingPayload) =>
    api.post<ClientProfile>('/api/v1/me/onboarding/complete', { body }),

  // Appointments — client side
  myAppointments: () => api.get<Appointment[]>('/api/v1/me/appointments'),
  myAppointment: (id: string) => api.get<Appointment>(`/api/v1/me/appointments/${id}`),
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

  // Appointments — workspace/owner side (real, DB-backed)
  listWorkspaceAppointments: (from?: string, to?: string) =>
    api.get<WorkspaceAppointment[]>(`/api/v1/workspaces/me/appointments${buildQs({ from, to })}`),
  getWorkspaceAppointment: (id: string) =>
    api.get<WorkspaceAppointment>(`/api/v1/workspaces/me/appointments/${id}`),
  workspaceMeetingConfig: (id: string) =>
    api.get<MeetingJoin>(`/api/v1/workspaces/me/appointments/${id}/meeting`),
  createWorkspaceAppointment: (body: {
    client_id: string; scheduled_at: string; duration_minutes?: number;
    kind: Appointment['kind']; mode?: Appointment['mode']; notes?: string; location?: string;
  }) => api.post<WorkspaceAppointment>('/api/v1/workspaces/me/appointments', { body }),
  updateWorkspaceAppointment: (id: string, body: {
    scheduled_at?: string; duration_minutes?: number; kind?: Appointment['kind'];
    mode?: Appointment['mode']; status?: Appointment['status']; notes?: string; location?: string;
  }) => api.patch<WorkspaceAppointment>(`/api/v1/workspaces/me/appointments/${id}`, { body }),
  cancelWorkspaceAppointment: (id: string, reason?: string) =>
    api.delete<WorkspaceAppointment>(`/api/v1/workspaces/me/appointments/${id}`, { body: { reason } }),

  // Push notifications
  pushConfig:      () => api.get<PushConfig>('/api/v1/me/push/config'),
  pushSubscribe:   (body: { endpoint: string; p256dh: string; auth: string; user_agent?: string }) =>
    api.post<{ subscribed: true }>('/api/v1/me/push/subscribe', { body }),
  pushUnsubscribe: (endpoint: string) =>
    api.post<{ unsubscribed: true }>('/api/v1/me/push/unsubscribe', { body: { endpoint } }),

  // Community
  listGroups: () =>
    api.get<CommunityGroup[]>('/api/v1/me/community/groups'),
  joinGroup: (id: string) =>
    api.post<{ joined: true; memberCount: number }>(`/api/v1/me/community/groups/${id}/join`),
  leaveGroup: (id: string) =>
    api.post<{ left: true; memberCount: number }>(`/api/v1/me/community/groups/${id}/leave`),
  listPosts: (params: { groupId?: string; limit?: number } = {}) =>
    api.get<CommunityPost[]>(`/api/v1/me/community/posts${buildQs(params)}`),
  createPost: (body: { content: string; groupId?: string; title?: string }) =>
    api.post<CommunityPost>('/api/v1/me/community/posts', { body }),
  reactToPost: (id: string, reaction: 'like' | 'love' | 'celebrate' = 'like') =>
    api.post<{ reacted: boolean; likesCount: number }>(`/api/v1/me/community/posts/${id}/react`, { body: { reaction } }),
  listComments: (postId: string) =>
    api.get<CommunityComment[]>(`/api/v1/me/community/posts/${postId}/comments`),
  createComment: (postId: string, content: string) =>
    api.post<CommunityComment>(`/api/v1/me/community/posts/${postId}/comments`, { body: { content } }),

  // Moderation
  pinPost: (postId: string) =>
    api.post<{ pinned: boolean }>(`/api/v1/me/community/posts/${postId}/pin`),
  deletePost: (postId: string) =>
    api.delete<{ deleted: true }>(`/api/v1/me/community/posts/${postId}`),
  deleteComment: (commentId: string) =>
    api.delete<{ deleted: true }>(`/api/v1/me/community/comments/${commentId}`),
  listGroupMembers: (groupId: string) =>
    api.get<CommunityMember[]>(`/api/v1/me/community/groups/${groupId}/members`),
  kickMember: (groupId: string, clientId: string) =>
    api.post<{ kicked: true; memberCount: number }>(
      `/api/v1/me/community/groups/${groupId}/members/${clientId}/kick`,
    ),
  setMemberStatus: (groupId: string, clientId: string, status: 'active' | 'muted') =>
    api.post<{ status: 'active' | 'muted' }>(
      `/api/v1/me/community/groups/${groupId}/members/${clientId}/status`,
      { body: { status } },
    ),
  setMemberRole: (groupId: string, clientId: string, role: 'member' | 'moderator') =>
    api.post<{ role: 'member' | 'moderator' }>(
      `/api/v1/me/community/groups/${groupId}/members/${clientId}/role`,
      { body: { role } },
    ),
  groupLeaderboard: (groupId: string) =>
    api.get<ChallengeLeaderboard>(`/api/v1/me/community/groups/${groupId}/leaderboard`),

  // Measurements
  myMeasurements: (limit = 30) =>
    api.get<Measurement[]>(`/api/v1/me/measurements${buildQs({ limit })}`),
  logMeasurement: (body: Partial<Omit<Measurement, 'id' | 'recorded_at'>> & { recorded_at?: string }) =>
    api.post<Measurement>('/api/v1/me/measurements', { body }),
  deleteMeasurement: (id: string) =>
    api.delete<{ deleted: true }>(`/api/v1/me/measurements/${id}`),

  // Assessment cards
  myAssessments: () => api.get<AssessmentCard[]>('/api/v1/me/assessments'),
  submitAssessment: (id: string, responses: Record<string, unknown>) =>
    api.post<AssessmentCard>(`/api/v1/me/assessments/${id}/responses`, { body: { responses } }),

  // Recipes
  listRecipes: (params: { q?: string; cuisine?: string; limit?: number } = {}) =>
    api.get<RecipeListItem[]>(`/api/v1/me/recipes${buildQs(params)}`),
  getRecipe: (id: string) =>
    api.get<RecipeDetail>(`/api/v1/me/recipes/${id}`),

  // Files
  myFiles: () => api.get<FileItem[]>('/api/v1/me/files'),
  signFile: (id: string) =>
    api.get<{ url: string; expiresInSeconds: number }>(`/api/v1/me/files/${id}/download`),
  fileUploadTicket: (file_name: string) =>
    api.post<{ uploadUrl: string; storageKey: string; token: string }>('/api/v1/me/files/upload-ticket', { body: { file_name } }),
  addMyFile: (body: { storage_key: string; file_name: string; file_type?: string; file_size?: number }) =>
    api.post<FileItem>('/api/v1/me/files', { body }),
  deleteMyFile: (id: string) =>
    api.delete<{ deleted: true }>(`/api/v1/me/files/${id}`),

  // ── Wave 1 ────────────────────────────────────────────────────────

  // Mood + energy
  moodHistory: (days = 30) =>
    api.get<MoodEntry[]>(`/api/v1/me/mood${buildQs({ days })}`),
  logMood: (body: { mood?: number; energy?: number; mood_notes?: string; date?: string }) =>
    api.post<{ date: string; mood: number | null; energy: number | null }>('/api/v1/me/mood', { body }),

  // Cycle
  cycleEvents: (days = 180) =>
    api.get<CycleEvent[]>(`/api/v1/me/cycle${buildQs({ days })}`),
  cyclePrediction: () => api.get<CyclePrediction>('/api/v1/me/cycle/prediction'),
  logCycleEvent: (body: { event_type: CycleEventType; event_date?: string; flow_level?: number; notes?: string }) =>
    api.post<CycleEvent>('/api/v1/me/cycle', { body }),
  deleteCycleEvent: (id: string) =>
    api.delete<{ deleted: true }>(`/api/v1/me/cycle/${id}`),

  // Photos
  progressPhotos: () => api.get<ProgressPhoto[]>('/api/v1/me/photos'),
  photoUploadTicket: (file_name: string) =>
    api.post<{ uploadUrl: string; storageKey: string; token: string }>('/api/v1/me/photos/upload-ticket', { body: { file_name } }),
  addPhoto: (body: { storage_key: string; angle?: 'front' | 'side' | 'back'; weight_kg?: number; notes?: string; taken_at?: string }) =>
    api.post<ProgressPhoto>('/api/v1/me/photos', { body }),
  signPhoto: (id: string) =>
    api.get<{ url: string; expiresInSeconds: number }>(`/api/v1/me/photos/${id}/download`),
  deletePhoto: (id: string) =>
    api.delete<{ deleted: true }>(`/api/v1/me/photos/${id}`),

  // Symptoms
  mySymptoms: (days = 60) =>
    api.get<Symptom[]>(`/api/v1/me/symptoms${buildQs({ days })}`),
  logSymptom: (body: { symptom: string; severity?: number; notes?: string; suspected_trigger?: string; occurred_at?: string }) =>
    api.post<Symptom>('/api/v1/me/symptoms', { body }),
  deleteSymptom: (id: string) =>
    api.delete<{ deleted: true }>(`/api/v1/me/symptoms/${id}`),

  // Milestones
  myMilestones: () => api.get<Milestone[]>('/api/v1/me/milestones'),
  celebrateMilestone: (id: string) =>
    api.post<{ celebrated: true }>(`/api/v1/me/milestones/${id}/celebrate`),

  // Supplements
  mySupplements: () => api.get<Supplement[]>('/api/v1/me/supplements'),
  todaysSupplementLog: () =>
    api.get<Array<{ supplement_id: string; slot: string | null; taken_at: string }>>('/api/v1/me/supplements/today'),
  upsertSupplement: (body: { id?: string; name: string; dosage?: string; schedule?: string[]; notes?: string }) =>
    api.post<Supplement>('/api/v1/me/supplements', { body }),
  deactivateSupplement: (id: string) =>
    api.delete<{ deactivated: true }>(`/api/v1/me/supplements/${id}`),
  logSupplementTaken: (id: string, slot?: string) =>
    api.post<{ taken: true }>(`/api/v1/me/supplements/${id}/taken`, { body: { slot } }),

  // Festivals + AI summary + cuisines
  upcomingFestivals: () => api.get<Festival[]>('/api/v1/me/festivals'),
  weeklySummary: () => api.get<WeeklySummary>('/api/v1/me/weekly-summary'),
  listCuisines: () => api.get<string[]>('/api/v1/me/recipes-cuisines'),

  // AI endpoints reused from the existing /vision + /voice modules.
  // Backend Multer field names: vision = 'image', voice = 'audio'.
  analyzePlate:   (file: File) => {
    const form = new FormData();
    form.append('image', file);
    return api.post<VisionAnalysisResult>('/api/v1/vision/analyze', { body: form });
  },
  voiceConverse:  (file: File) => {
    const form = new FormData();
    form.append('audio', file);
    return api.post<VoiceConverseResult>('/api/v1/voice/converse', { body: form });
  },
};