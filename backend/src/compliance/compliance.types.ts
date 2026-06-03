export type DeletionStatus = 'pending' | 'in_review' | 'completed' | 'rejected';
export type RequestChannel = 'support' | 'self' | 'admin';

export interface DeletionRequestRow {
  id: string;
  target_user_id: string | null;
  target_email: string;
  workspace_id: string | null;
  workspace_name: string | null;
  requested_by: string | null;
  requested_by_email: string | null;
  request_channel: RequestChannel;
  reason: string | null;
  status: DeletionStatus;
  processed_at: string | null;
  processed_by: string | null;
  processing_notes: string | null;
  due_by: string;
  created_at: string;
  updated_at: string;
}

export interface ComplianceSnapshot {
  pending_count: number;
  in_review_count: number;
  completed_count: number;
  overdue_count: number;
  /** Avg time from request → completed, in days, over the last 30 days. */
  avg_resolution_days: number | null;
}

export interface DsarExport {
  generated_at: string;
  target_user_id: string;
  target_email: string;
  /** Each table -> rows belonging to this user. */
  data: Record<string, unknown[]>;
}