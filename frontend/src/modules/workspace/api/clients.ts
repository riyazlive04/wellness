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
  created_at: string;
  updated_at: string;
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

export interface VisionAnalysisResult {
  detected_items: { name: string; portion_g: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number }[];
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  ai_summary: string;
}

export interface VoiceConverseResult {
  transcript: string;
  ai_reply: string;
  audio_url?: string;
  logged_meal?: { kcal: number; meal_type: string; meal_name: string };
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

export interface PushConfig {
  vapidPublicKey: string | null;
  enabled: boolean;
}

export interface CommunityGroup {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  is_private: boolean;
  member_count: number;
  is_member: boolean;
  created_at: string;
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
  revokeInvite: (id: string) =>
    api.post<ClientInviteRow>(`/api/v1/workspaces/me/clients/invites/${id}/revoke`),

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

  // Extended wellness endpoints — backend implements these as part of MeController.
  myWellnessSnapshot: () => api.get<WellnessSnapshot>('/api/v1/me/wellness/snapshot'),
  myHabits:    (days = 14) => api.get<HabitDay[]>(`/api/v1/me/habits${buildQs({ days })}`),
  logHabit:    (body: Partial<Omit<HabitDay, 'date'>> & { date?: string }) =>
    api.post<HabitDay>('/api/v1/me/habits', { body }),
  myAchievements: () => api.get<Achievement[]>('/api/v1/me/achievements'),
  sendMessage: (content: string) =>
    api.post<ClientMessage>('/api/v1/me/messages', { body: { content } }),
  updateMyProfile: (patch: Partial<{
    age: number; gender: string; goals: string; phone: string;
    allergies: string; medical_conditions: string; food_preferences: string;
    activity_level: string; height_cm: number;
  }>) => api.patch<ClientProfile>('/api/v1/me/profile', { body: patch }),

  // Appointments
  myAppointments: () => api.get<Appointment[]>('/api/v1/me/appointments'),
  bookAppointment: (body: {
    scheduled_at: string;
    duration_minutes?: number;
    kind: Appointment['kind'];
    mode?: Appointment['mode'];
    notes?: string;
  }) => api.post<Appointment>('/api/v1/me/appointments', { body }),
  cancelAppointment: (id: string, reason?: string) =>
    api.delete<Appointment>(`/api/v1/me/appointments/${id}`, { body: { reason } }),

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

  // AI endpoints reused from the existing /vision + /voice modules.
  analyzePlate:   (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<VisionAnalysisResult>('/api/v1/vision/analyze', { body: form });
  },
  voiceConverse:  (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<VoiceConverseResult>('/api/v1/voice/converse', { body: form });
  },
};