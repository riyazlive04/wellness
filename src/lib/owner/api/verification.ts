import { api } from '@/lib/api';

export type VerificationStatus = 'unsubmitted' | 'pending' | 'verified' | 'rejected';

export interface VerificationDoc {
  type: string;
  file_name: string;
  storage_key: string;
}

export interface WorkspaceVerification {
  workspace_id: string;
  status: VerificationStatus;
  legal_name: string | null;
  professional_title: string | null;
  qualifications: string | null;
  registration_number: string | null;
  experience_years: number | null;
  pan: string | null;
  gstin: string | null;
  documents: VerificationDoc[];
  review_notes: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
}

export interface VerificationSubmission {
  legal_name?: string;
  professional_title?: string;
  qualifications?: string;
  registration_number?: string;
  experience_years?: number;
  pan?: string;
  gstin?: string;
  documents?: VerificationDoc[];
}

export type AdminVerification = WorkspaceVerification & { workspace_name: string | null };

export const verificationApi = {
  // Owner side
  get: () => api.get<WorkspaceVerification>('/api/v1/workspaces/me/verification'),
  submit: (body: VerificationSubmission) =>
    api.put<WorkspaceVerification>('/api/v1/workspaces/me/verification', { body }),
  uploadTicket: (file_name: string) =>
    api.post<{ uploadUrl: string; storageKey: string; token: string }>(
      '/api/v1/workspaces/me/verification/upload-ticket', { body: { file_name } }),

  // Super admin side
  adminList: (status?: string) =>
    api.get<AdminVerification[]>(`/api/v1/admin/verifications${status ? `?status=${status}` : ''}`),
  adminGet: (workspaceId: string) =>
    api.get<WorkspaceVerification>(`/api/v1/admin/verifications/${workspaceId}`),
  adminSignDoc: (workspaceId: string, index: number) =>
    api.get<{ url: string; expiresInSeconds: number }>(`/api/v1/admin/verifications/${workspaceId}/documents/${index}/download`),
  adminDecide: (workspaceId: string, decision: 'verified' | 'rejected', notes?: string) =>
    api.post<WorkspaceVerification>(`/api/v1/admin/verifications/${workspaceId}/decision`, { body: { decision, notes } }),
};
