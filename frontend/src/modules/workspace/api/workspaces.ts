import { api } from '@/lib/api';

export interface Workspace {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string;
  plan: string;
  trial_ends_at: string;
  status: 'active' | 'suspended' | 'deleted';
  display_name: string | null;
  legal_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  brand_accent: string | null;
  tagline: string | null;
  dashboard_quote: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  timezone: string | null;
  locale: string | null;
  city: string | null;
  country_code: string | null;
  gstin: string | null;
  pan: string | null;
  pdf_contact_line: string | null;
  pdf_footer_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspacePayload {
  name: string;
  slug?: string;
  display_name?: string;
  contact_email?: string;
  contact_phone?: string;
  city?: string;
  country_code?: string;
  gstin?: string;
  pan?: string;
  plan?: string;
}

export interface PushConfig {
  vapidPublicKey: string | null;
  enabled: boolean;
}

export type IntegrationCategory =
  | 'payments' | 'ai' | 'email' | 'messaging' | 'monitoring' | 'analytics' | 'storage' | 'auth';
export type IntegrationStatus = 'connected' | 'partial' | 'not_configured';

export interface WorkspaceIntegration {
  key: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  detail: string;
  env_keys: string[];
  env_present: string[];
  docs_url?: string;
}

export interface IntegrationReport {
  items: WorkspaceIntegration[];
  summary: { total: number; connected: number; partial: number; missing: number };
}

export interface WorkspaceBranding {
  name: string;
  legal_name?: string | null;
  logo_url: string | null;
  brand_color: string | null;
  brand_accent: string | null;
  tagline: string | null;
  /** Header contact line for PDFs (already composed from contact fields if unset). */
  pdf_contact_line?: string | null;
  /** Footer note / disclaimer for PDFs. */
  pdf_footer_note?: string | null;
  white_label: boolean;
  /** True when this workspace's practitioner credentials are verified. */
  verified?: boolean;
}

export interface UpdateBrandingPayload {
  logo_url?: string;       // '' clears it
  brand_color?: string;
  brand_accent?: string;
  tagline?: string;
  pdf_contact_line?: string;
  pdf_footer_note?: string;
  white_label?: boolean;
}

/** General-profile fields editable from Settings → General (owner-only server-side). */
export interface UpdateWorkspacePayload {
  name?: string;
  slug?: string;
  legal_name?: string;
  contact_email?: string;
  contact_phone?: string;
  timezone?: string;
  locale?: string;
  dashboard_quote?: string;
}

export const workspacesApi = {
  create: (payload: CreateWorkspacePayload) =>
    api.post<Workspace>('/api/v1/workspaces', { body: payload }),
  me: () => api.get<Workspace>('/api/v1/workspaces/me'),

  // Persist the General settings fields. Owner-only on the server.
  update: (body: UpdateWorkspacePayload) =>
    api.patch<Workspace>('/api/v1/workspaces/me', { body }),

  // Live integration status (env-presence only, no secrets). Owner/admin read.
  integrations: () => api.get<IntegrationReport>('/api/v1/workspaces/me/integrations'),

  // Branding — readable by any member (incl. clients) so the portal can theme.
  branding: () => api.get<WorkspaceBranding | null>('/api/v1/workspaces/me/branding'),
  // Persist branding (owner-only on the server).
  updateBranding: (body: UpdateBrandingPayload) =>
    api.patch<Workspace>('/api/v1/workspaces/me', { body }),

  // Staff push notifications — same handshake as the client portal, but rows
  // are keyed by user_id (no client profile) and tagged with the workspace.
  pushConfig: () => api.get<PushConfig>('/api/v1/workspaces/me/push/config'),
  pushSubscribe: (body: { endpoint: string; p256dh: string; auth: string; user_agent?: string }) =>
    api.post<{ subscribed: true }>('/api/v1/workspaces/me/push/subscribe', { body }),
  pushUnsubscribe: (endpoint: string) =>
    api.post<{ unsubscribed: true }>('/api/v1/workspaces/me/push/unsubscribe', { body: { endpoint } }),
};
