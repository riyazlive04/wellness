/** Client community — groups + posts feed. Ported from web clientsApi community
 *  methods (/me/community). */
import { api } from '@/lib/api';

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
  is_challenge: boolean;
  target_metric: ChallengeMetric | null;
  target_value: number | null;
}

export interface CommunityPost {
  id: string;
  group_id: string | null;
  author_name: string;
  author_avatar: string | null;
  content: string;
  image_url: string | null;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
  created_at: string;
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

const BASE = '/api/v1/me/community';

export const communityApi = {
  groups: () => api.get<CommunityGroup[]>(`${BASE}/groups`),
  joinGroup: (id: string) => api.post<{ joined: true; memberCount: number }>(`${BASE}/groups/${id}/join`),
  leaveGroup: (id: string) => api.post<{ left: true; memberCount: number }>(`${BASE}/groups/${id}/leave`),
  posts: (params: { groupId?: string; limit?: number } = {}) =>
    api.get<CommunityPost[]>(`${BASE}/posts${qs(params)}`),
  createPost: (body: { content: string; groupId?: string }) =>
    api.post<CommunityPost>(`${BASE}/posts`, { body }),
  react: (id: string, reaction = 'like') =>
    api.post<{ reacted: boolean; likesCount: number }>(`${BASE}/posts/${id}/react`, { body: { reaction } }),
};
