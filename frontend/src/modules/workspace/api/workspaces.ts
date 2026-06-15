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
  logo_url: string | null;
  brand_color: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  city: string | null;
  country_code: string | null;
  gstin: string | null;
  pan: string | null;
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

export interface WorkspaceBranding {
  name: string;
  logo_url: string | null;
  brand_color: string | null;
  brand_accent: string | null;
  tagline: string | null;
  white_label: boolean;
}

export interface UpdateBrandingPayload {
  logo_url?: string;       // '' clears it
  brand_color?: string;
  brand_accent?: string;
  tagline?: string;
  white_label?: boolean;
}

export const workspacesApi = {
  create: (payload: CreateWorkspacePayload) =>
    api.post<Workspace>('/api/v1/workspaces', { body: payload }),
  me: () => api.get<Workspace>('/api/v1/workspaces/me'),

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
