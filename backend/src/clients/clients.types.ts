export type ClientStatus = 'active' | 'paused' | 'archived' | 'completed' | string;
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

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

/** A self-service signup awaiting the owner's decision. */
export interface JoinRequestRow {
  id: string;
  workspace_id: string;
  user_id: string;
  email: string;
  name: string | null;
  status: JoinRequestStatus;
  note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The workspace's shareable join link. token is NULL until first generated. */
export interface JoinLinkInfo {
  token: string | null;
  url: string | null;
  expires_at: string | null;
  is_expired: boolean;
}

/**
 * What an unauthenticated prospect sees at /join/<token>. Deliberately thin —
 * anyone holding the link can read it, so it carries no client or roster data.
 */
export interface JoinPreview {
  workspace_name: string;
  workspace_slug: string | null;
}

/** An email the owner imported ahead of signup; auto-approves on match. */
export interface PreapprovalRow {
  id: string;
  workspace_id: string;
  email: string;
  name: string | null;
  phone: string | null;
  note: string | null;
  consumed_at: string | null;
  created_at: string;
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
  /** NULL until the client completes the post-invite wellness wizard. */
  onboarded_at: string | null;
  /** Client-authored motivational quotes rotated on their Today banner. */
  banner_quotes: string[] | null;
  /** NULL until the client accepts the community guidelines (one-time gate). */
  community_accepted_at: string | null;
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
  metadata?: MessageMetadata | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
}

/** Flexible per-message extras stored in messages.metadata (no migration). */
export interface MessageMetadata {
  reactions?: { admin?: string; client?: string };
  reply?: { id: string; sender: string; preview: string };
  edited_at?: string;
  deleted_at?: string;
  pinned_at?: string;
  /** "Delete for me" — hides the message for one side only. */
  hidden_admin?: boolean;
  hidden_client?: boolean;
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