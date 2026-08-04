export type AuthorRole = 'owner' | 'manager' | 'coach' | 'client';
export type ReactionKey = 'cheer' | 'strength' | 'love' | 'celebrate';

export interface PostAuthor {
  id: string;
  name: string;
  role: AuthorRole;
}

export interface PostComment {
  id: string;
  author: PostAuthor;
  body: string;
  createdAt: string;
}

export interface Post {
  id: string;
  author: PostAuthor;
  body: string;
  hashtags: string[];
  imageUrl?: string;
  /** Reaction counts by key */
  reactions: Record<ReactionKey, number>;
  /** Reaction keys the current user has tapped (demo state) */
  reactedByMe: ReactionKey[];
  commentCount: number;
  comments: PostComment[];
  createdAt: string;
  pinned?: boolean;
  /** Optional cohort / group label */
  cohort?: string;
}

export interface TrendingTag {
  tag: string;
  posts: number;
  trend: 'up' | 'flat' | 'down';
}

export interface Cohort {
  id: string;
  label: string;
  members: number;
}
