import { api } from '@/lib/api';

export interface PrivacyPolicy {
  id: string;
  version: number;
  title: string;
  content: string;
  published_at: string;
  published_by: string | null;
}

export interface CurrentPolicyForUser {
  policy: PrivacyPolicy | null;
  accepted: boolean;
  must_accept: boolean;
}

export interface AdminPolicyView {
  current: PrivacyPolicy | null;
  versions: PrivacyPolicy[];
}

export const policiesApi = {
  // Reader side (any authenticated user).
  current: () => api.get<CurrentPolicyForUser>('/api/v1/policies/privacy/current'),
  accept: () => api.post<{ accepted: true; version: number }>('/api/v1/policies/privacy/accept'),

  // Author side (super admin only on the server).
  adminGet: () => api.get<AdminPolicyView>('/api/v1/admin/policies/privacy'),
  adminPublish: (body: { title?: string; content: string }) =>
    api.put<PrivacyPolicy>('/api/v1/admin/policies/privacy', { body }),
};
