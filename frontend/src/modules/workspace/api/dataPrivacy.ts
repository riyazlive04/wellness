import { api } from '@/lib/api';

export interface RetentionPolicy {
  client_months: number;
  messages_years: number;
  backups_days: number;
}

export interface WorkspaceExport {
  generated_at: string;
  workspace_id: string;
  workspace_name: string;
  tables: Record<string, unknown[]>;
  counts: Record<string, number>;
  truncated: string[];
}

export type DataRequestType = 'export' | 'erasure';

export interface DataRequest {
  id: string;
  target_email: string;
  request_channel: string;
  reason: string | null;
  status: string;
  due_by: string;
  processed_at: string | null;
  created_at: string;
}

export const dataPrivacyApi = {
  // Owner-only on the server.
  export: () => api.post<WorkspaceExport>('/api/v1/workspaces/me/data/export'),

  retention: () => api.get<RetentionPolicy>('/api/v1/workspaces/me/data/retention'),
  updateRetention: (body: Partial<RetentionPolicy>) =>
    api.patch<RetentionPolicy>('/api/v1/workspaces/me/data/retention', { body }),

  listRequests: () => api.get<DataRequest[]>('/api/v1/workspaces/me/data/requests'),
  createRequest: (body: { target_email: string; type: DataRequestType; reason?: string }) =>
    api.post<DataRequest>('/api/v1/workspaces/me/data/requests', { body }),
};
