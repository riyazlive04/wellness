import { api } from '@/lib/api';
import type { Post, Cohort, ReactionKey, TrendingTag } from '@/lib/owner/types/community';

export interface ModerationSummary {
  flagged: number;
  engagementRate: number;
  totalPosts: number;
}

export interface CreatePostPayload {
  content: string;
  authorName: string;
  pinned?: boolean;
  cohortId?: string;
  /** Optional inline image as a downscaled data URL. */
  imageUrl?: string;
}

const BASE = '/api/v1/workspaces/me/community';

export const communityApi = {
  feed: (cohort?: string) =>
    api.get<Post[]>(`${BASE}/feed${cohort && cohort !== 'all' ? `?cohort=${encodeURIComponent(cohort)}` : ''}`),
  cohorts: () => api.get<Cohort[]>(`${BASE}/cohorts`),
  createCohort: (name: string, description?: string) =>
    api.post<Cohort>(`${BASE}/cohorts`, { body: { name, description } }),
  deleteCohort: (cohortId: string) =>
    api.delete<{ deleted: true }>(`${BASE}/cohorts/${cohortId}`),
  trending: () => api.get<TrendingTag[]>(`${BASE}/trending`),
  moderation: () => api.get<ModerationSummary>(`${BASE}/moderation`),

  createPost: (body: CreatePostPayload) =>
    api.post<{ id: string }>(`${BASE}/posts`, { body }),
  react: (postId: string, reaction: ReactionKey) =>
    api.post<{ reacted: boolean }>(`${BASE}/posts/${postId}/react`, { body: { reaction } }),
  comment: (postId: string, body: { content: string; authorName: string }) =>
    api.post<{ id: string }>(`${BASE}/posts/${postId}/comments`, { body }),
  pin: (postId: string, pinned: boolean) =>
    api.post<{ pinned: boolean }>(`${BASE}/posts/${postId}/pin`, { body: { pinned } }),
  remove: (postId: string) =>
    api.delete<{ deleted: true }>(`${BASE}/posts/${postId}`),
};