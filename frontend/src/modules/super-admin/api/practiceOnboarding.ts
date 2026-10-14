import { api } from '@/lib/api';

export type SectionKey = 'account' | 'practice' | 'branding' | 'meals' | 'clients' | 'billing';
export type SectionStatus = 'none' | 'in_progress' | 'done';
export type OnboardingStatus = 'invited' | 'opened' | 'in_progress' | 'submitted' | 'changes' | 'approved' | 'cancelled';

export const SECTION_LABELS: Record<SectionKey, { label: string; hint: string }> = {
  account: { label: 'Your account', hint: 'Name, email, phone, password' },
  practice: { label: 'Practice details', hint: 'Name, specialities, city' },
  branding: { label: 'Branding', hint: 'Logo and tagline your clients see' },
  meals: { label: 'Meal times', hint: 'The meals in your plans' },
  clients: { label: 'Your clients', hint: 'How many, and an optional list' },
  billing: { label: 'Billing & verification', hint: 'PAN, GSTIN, billing address' },
};
export const SECTION_ORDER: SectionKey[] = ['account', 'practice', 'branding', 'meals', 'clients', 'billing'];

/** What super admin sees for one onboarding link. */
export interface AdminOnboarding {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  plan_key: string;
  status: OnboardingStatus;
  expired: boolean;
  link: string;
  practice_name: string | null;
  sections: Array<{ key: SectionKey; label: string; status: SectionStatus; updated_at: string | null }>;
  done_count: number;
  section_data: Record<SectionKey, Record<string, unknown>>;
  changes: { section: SectionKey; note: string } | null;
  activity: Array<{ at: string; text: string }>;
  workspace_id: string | null;
  expires_at: string;
  opened_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  last_activity_at: string;
  created_at: string;
}

/** What the nutritionist's page gets for their link. */
export interface PublicOnboarding {
  name: string;
  email: string;
  status: OnboardingStatus;
  has_login: boolean;
  sections: Record<SectionKey, { status: SectionStatus; data: Record<string, unknown> }>;
  changes: { section: SectionKey; note: string } | null;
  expires_at: string;
  trial_days: number;
}

const ADMIN = '/api/v1/admin/practice-onboarding';
const PUB = '/api/v1/practice-onboarding';

export const practiceOnboardingApi = {
  list: () => api.get<AdminOnboarding[]>(ADMIN),
  create: (body: { name: string; email: string; phone?: string; plan?: string }) => api.post<AdminOnboarding>(ADMIN, { body }),
  approve: (id: string) => api.post<AdminOnboarding>(`${ADMIN}/${id}/approve`),
  changes: (id: string, section: SectionKey, note: string) => api.post<AdminOnboarding>(`${ADMIN}/${id}/changes`, { body: { section, note } }),
  extend: (id: string) => api.post<AdminOnboarding>(`${ADMIN}/${id}/extend`),
  cancel: (id: string) => api.post<{ cancelled: true }>(`${ADMIN}/${id}/cancel`),

  open: (token: string) => api.get<PublicOnboarding>(`${PUB}/${encodeURIComponent(token)}`),
  save: (token: string, key: SectionKey, data: Record<string, unknown>, complete: boolean, password?: string) =>
    api.put<PublicOnboarding>(`${PUB}/${encodeURIComponent(token)}/sections/${key}`, { body: { data, complete, ...(password ? { password } : {}) } }),
  submit: (token: string) => api.post<PublicOnboarding>(`${PUB}/${encodeURIComponent(token)}/submit`),
};
