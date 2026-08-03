import { api } from '@/lib/api';

/** Global Nutritionist Network — a shared professional feed across all practices. */

export type NetworkReactionKey = 'cheer' | 'strength' | 'love' | 'celebrate';

export interface NetworkComment {
  id: string;
  content: string;
  created_at: string;
  author_practice: string;
  author_role: string | null;
  mine: boolean;
}

export interface NetworkReactor {
  user_id: string;
  reaction: NetworkReactionKey;
  practice: string;
  role: string | null;
  mine: boolean;
}

export interface NetworkPost {
  id: string;
  content: string;
  created_at: string;
  author_user_id: string;
  author_practice: string;
  author_role: string | null;
  author_email: string | null;
  image_url: string | null;
  reactions: Record<NetworkReactionKey, number>;
  reacted_by_me: NetworkReactionKey[];
  reactors: NetworkReactor[];
  comment_count: number;
  comments: NetworkComment[];
  mine: boolean;
  /** Does the current practice follow this post's author? */
  author_is_following: boolean;
}

const BASE = '/api/v1/network';

export const networkApi = {
  feed: (filter?: 'discover' | 'following') =>
    api.get<NetworkPost[]>(`${BASE}/feed${filter === 'following' ? '?filter=following' : ''}`),
  createPost: (content: string, imageUrl?: string | null) =>
    api.post<{ id: string }>(`${BASE}/posts`, { body: { content, imageUrl: imageUrl ?? undefined } }),
  react: (id: string, reaction: NetworkReactionKey) =>
    api.post<{ ok: true }>(`${BASE}/posts/${id}/react`, { body: { reaction } }),
  comment: (id: string, content: string) =>
    api.post<NetworkComment>(`${BASE}/posts/${id}/comments`, { body: { content } }),
  remove: (id: string) => api.delete<{ deleted: true }>(`${BASE}/posts/${id}`),
  follow: (userId: string) => api.post<{ following: boolean }>(`${BASE}/follow/${userId}`, {}),
  unfollow: (userId: string) => api.delete<{ following: boolean }>(`${BASE}/follow/${userId}`),
};
