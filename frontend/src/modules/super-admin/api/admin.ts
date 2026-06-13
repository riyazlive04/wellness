import { api } from '@/lib/api';

// ──────────────────────────────────────────────────────────────────
// Stats + workspaces
// ──────────────────────────────────────────────────────────────────

export interface PlatformStats {
  workspaces: { total: number; active: number; suspended: number; deleted: number; trial: number; trialExpiringSoon: number; createdLast30d: number };
  members: { total: number; owners: number };
}

export interface AdminWorkspaceListItem {
  id: string; name: string; slug: string | null; plan: string;
  status: 'active' | 'suspended' | 'deleted';
  trial_ends_at: string; created_at: string;
  owner_id: string; owner_email: string | null;
  member_count: number;
}

export interface AdminWorkspaceDetail extends AdminWorkspaceListItem {
  contact_email: string | null; contact_phone: string | null;
  city: string | null; country_code: string | null;
  gstin: string | null; pan: string | null;
  members: Array<{ user_id: string; email: string | null; role: string; status: string; joined_at: string }>;
  counts: { members: number; clients: number; programs: number; appointments: number; meal_logs: number; assessments: number };
}

export interface ListWorkspacesResult { items: AdminWorkspaceListItem[]; total: number; limit: number; offset: number }
export interface ListWorkspacesParams { status?: 'active' | 'suspended' | 'deleted' | 'all'; plan?: string; q?: string; limit?: number; offset?: number }

// ──────────────────────────────────────────────────────────────────
// Users + team
// ──────────────────────────────────────────────────────────────────

export interface AdminUserListItem {
  id: string; email: string | null;
  created_at: string; last_sign_in_at: string | null;
  banned: boolean; banned_until: string | null;
  workspace_count: number; roles: string[];
}
export interface ListUsersResult { items: AdminUserListItem[]; total: number; limit: number; offset: number }

export interface AdminTeamMember {
  id: string; email: string | null;
  created_at: string; granted_at: string;
}

// ──────────────────────────────────────────────────────────────────
// Announcements
// ──────────────────────────────────────────────────────────────────

/** workspace_member_role values that an announcement can target. */
export type AnnouncementRole =
  | 'owner' | 'nutritionist' | 'assistant_nutritionist'
  | 'receptionist' | 'coach' | 'support';

export interface Announcement {
  id: string; title: string; body: string;
  severity: 'info' | 'warning' | 'critical';
  target_workspace_ids: string[] | null;
  target_roles: AnnouncementRole[] | null;
  published_at: string | null;
  starts_at: string; ends_at: string | null;
  dismissible: boolean;
  created_by: string | null; created_at: string; updated_at: string;
}

export interface ActiveAnnouncement {
  id: string; title: string; body: string;
  severity: 'info' | 'warning' | 'critical';
  dismissible: boolean;
  starts_at: string; ends_at: string | null;
}

export interface MyAnnouncement {
  id: string; title: string; body: string;
  severity: 'info' | 'warning' | 'critical';
  dismissible: boolean;
  published_at: string;
  starts_at: string; ends_at: string | null;
  is_active: boolean;
}

export interface UpsertAnnouncementPayload {
  title: string; body: string;
  severity?: 'info' | 'warning' | 'critical';
  target_workspace_ids?: string[];
  target_roles?: AnnouncementRole[];
  starts_at?: string; ends_at?: string;
  dismissible?: boolean;
}

// ──────────────────────────────────────────────────────────────────
// Config + audit
// ──────────────────────────────────────────────────────────────────

export interface PlatformPlan { id: string; name: string; monthly_inr: number; ai_calls: number; features: string[] }
export interface PlatformConfig {
  id: number; trial_days: number;
  plans: PlatformPlan[];
  feature_flags: Record<string, unknown>;
  ai_quotas: Record<string, number>;
  updated_at: string; updated_by: string | null;
}

export interface AuditEntry {
  id: string;
  actor_id: string | null; actor_email: string | null;
  action: string;
  resource_type: string | null; resource_id: string | null; resource_label: string | null;
  details: unknown;
  ip_address: string | null;
  created_at: string;
}
export interface ListAuditResult { items: AuditEntry[]; total: number; limit: number; offset: number }

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function buildQs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ──────────────────────────────────────────────────────────────────
// API surface
// ──────────────────────────────────────────────────────────────────

export const adminApi = {
  // Stats + workspaces
  stats: () => api.get<PlatformStats>('/api/v1/admin/workspaces/stats'),

  listWorkspaces: (params: ListWorkspacesParams = {}) =>
    api.get<ListWorkspacesResult>(`/api/v1/admin/workspaces${buildQs({
      status: params.status === 'all' ? undefined : params.status,
      plan: params.plan, q: params.q, limit: params.limit, offset: params.offset,
    })}`),
  workspaceDetail: (id: string) => api.get<AdminWorkspaceDetail>(`/api/v1/admin/workspaces/${id}`),
  suspend:    (id: string) => api.post<{ id: string; status: 'suspended' }>(`/api/v1/admin/workspaces/${id}/suspend`),
  activate:   (id: string) => api.post<{ id: string; status: 'active' }>(`/api/v1/admin/workspaces/${id}/activate`),
  softDelete: (id: string) => api.delete<{ id: string; status: 'deleted' }>(`/api/v1/admin/workspaces/${id}`),

  // Users
  listUsers: (params: { q?: string; limit?: number; offset?: number } = {}) =>
    api.get<ListUsersResult>(`/api/v1/admin/users${buildQs(params)}`),
  resetPassword: (id: string) => api.post<{ id: string; email: string; sent: true }>(`/api/v1/admin/users/${id}/reset-password`),
  banUser:       (id: string) => api.post<{ id: string; banned: true }>(`/api/v1/admin/users/${id}/ban`),
  unbanUser:     (id: string) => api.post<{ id: string; banned: false }>(`/api/v1/admin/users/${id}/unban`),

  // Team
  listTeam: () => api.get<{ items: AdminTeamMember[] }>('/api/v1/admin/team'),
  inviteSuperAdmin: (email: string, password: string) =>
    api.post<{ id: string; email: string; granted: true }>('/api/v1/admin/team/invite', { body: { email, password } }),
  revokeSuperAdmin: (id: string) => api.post<{ id: string; revoked: true }>(`/api/v1/admin/team/${id}/revoke`),

  // Announcements
  listAnnouncements:   () => api.get<{ items: Announcement[] }>('/api/v1/admin/announcements'),
  createAnnouncement:  (p: UpsertAnnouncementPayload) => api.post<Announcement>('/api/v1/admin/announcements', { body: p }),
  updateAnnouncement:  (id: string, p: UpsertAnnouncementPayload) => api.patch<Announcement>(`/api/v1/admin/announcements/${id}`, { body: p }),
  publishAnnouncement:   (id: string) => api.post<Announcement>(`/api/v1/admin/announcements/${id}/publish`),
  unpublishAnnouncement: (id: string) => api.post<Announcement>(`/api/v1/admin/announcements/${id}/unpublish`),
  deleteAnnouncement:    (id: string) => api.delete<{ id: string; deleted: true }>(`/api/v1/admin/announcements/${id}`),
  activeAnnouncements:   () => api.get<{ items: ActiveAnnouncement[] }>('/api/v1/announcements/active'),
  myAnnouncements:       () => api.get<{ items: MyAnnouncement[] }>('/api/v1/announcements/mine'),

  // Config
  getConfig:    () => api.get<PlatformConfig>('/api/v1/admin/config'),
  updateConfig: (p: Partial<PlatformConfig>) => api.patch<PlatformConfig>('/api/v1/admin/config', { body: p }),

  // Audit
  listAudit: (params: { actionPrefix?: string; actorId?: string; resourceType?: string; resourceId?: string; limit?: number; offset?: number } = {}) =>
    api.get<ListAuditResult>(`/api/v1/admin/audit${buildQs(params)}`),

  // Billing
  revenueSnapshot:  () => api.get<RevenueSnapshot>('/api/v1/admin/billing/revenue/snapshot'),
  revenueByPlan:    () => api.get<PlanRevenueBreakdown[]>('/api/v1/admin/billing/revenue/by-plan'),
  monthlyRevenue:   (months = 12) =>
    api.get<MonthlyRevenuePoint[]>(`/api/v1/admin/billing/revenue/monthly${buildQs({ months })}`),
  listSubscriptions: (params: ListSubscriptionsParams = {}) =>
    api.get<ListSubscriptionsResult>(`/api/v1/admin/billing/subscriptions${buildQs(params)}`),
  listPayments: (params: ListPaymentsParams = {}) =>
    api.get<ListPaymentsResult>(`/api/v1/admin/billing/payments${buildQs(params)}`),
  listInvoices: (params: ListInvoicesParams = {}) =>
    api.get<ListInvoicesResult>(`/api/v1/admin/billing/invoices${buildQs(params)}`),

  // AI usage
  usageSnapshot: () => api.get<UsageSnapshot>('/api/v1/admin/usage/snapshot'),
  usageByService: () => api.get<UsageByService[]>('/api/v1/admin/usage/by-service'),
  usageTopWorkspaces: (limit = 15) =>
    api.get<UsageByWorkspace[]>(`/api/v1/admin/usage/top-workspaces${buildQs({ limit })}`),
  usageTrend: (days = 30) =>
    api.get<UsageTrendPoint[]>(`/api/v1/admin/usage/trend${buildQs({ days })}`),
  usageAnomalies: () => api.get<UsageAnomalyAlert[]>('/api/v1/admin/usage/anomalies'),

  // Platform health
  health: () => api.get<PlatformHealth>('/api/v1/admin/health'),

  // Integrations
  listIntegrations: () => api.get<IntegrationsList>('/api/v1/admin/integrations'),

  // Compliance
  complianceSnapshot: () => api.get<ComplianceSnapshot>('/api/v1/admin/compliance/snapshot'),
  listDeletionRequests: (params: { status?: DeletionStatus | 'all'; limit?: number; offset?: number } = {}) =>
    api.get<ListDeletionRequestsResult>(`/api/v1/admin/compliance/deletion-requests${buildQs(params)}`),
  createDeletionRequest: (body: CreateDeletionRequestBody) =>
    api.post<DeletionRequestRow>('/api/v1/admin/compliance/deletion-requests', { body }),
  updateDeletionRequest: (id: string, body: { status: DeletionStatus; notes?: string }) =>
    api.patch<DeletionRequestRow>(`/api/v1/admin/compliance/deletion-requests/${id}`, { body }),
  dsarExport: (userId: string) =>
    api.get<DsarExport>(`/api/v1/admin/compliance/export/${userId}`),
};

// ──────────────────────────────────────────────────────────────────
// AI usage types
// ──────────────────────────────────────────────────────────────────

export type UsageServiceKind = 'chat' | 'voice' | 'vision';

export interface UsageSnapshot {
  total_calls: number;
  errors: number;
  success_rate: number;
  total_tokens: number;
  total_cost_inr: number;
  last_24h_calls: number;
  last_24h_cost_inr: number;
  last_24h_tokens: number;
  unique_workspaces_30d: number;
}

export interface UsageByService {
  service: UsageServiceKind;
  calls: number;
  tokens: number;
  cost_inr: number;
  avg_latency_ms: number;
}

export interface UsageByWorkspace {
  workspace_id: string;
  workspace_name: string | null;
  calls: number;
  tokens: number;
  cost_inr: number;
  quota_status: 'ok' | 'warn' | 'over' | 'unknown';
  quota_limit: number | null;
}

export interface UsageTrendPoint {
  day: string;
  calls: number;
  tokens: number;
  cost_inr: number;
}

export interface UsageAnomalyAlert {
  workspace_id: string | null;
  workspace_name: string | null;
  calls_24h: number;
  calls_prev_24h: number;
  multiplier: number;
}

// ──────────────────────────────────────────────────────────────────
// Platform health types
// ──────────────────────────────────────────────────────────────────

export interface PlatformHealth {
  process: {
    uptime_seconds: number;
    node_version: string;
    memory: { rss_mb: number; heap_used_mb: number; heap_total_mb: number };
    env: string;
  };
  database: {
    status: 'up' | 'down';
    latency_ms: number | null;
    version: string | null;
    error?: string;
  };
  webhooks: {
    errors_24h: number;
    events_24h: number;
    last_event_at: string | null;
  };
  errors_24h: { ai_calls: number; webhooks: number };
  flags: { razorpay_configured: boolean; gemini_configured: boolean };
}

// ──────────────────────────────────────────────────────────────────
// Integrations types
// ──────────────────────────────────────────────────────────────────

export type IntegrationCategory = 'payments' | 'ai' | 'email' | 'messaging' | 'monitoring' | 'analytics' | 'storage' | 'auth';
export type IntegrationStatus = 'connected' | 'partial' | 'not_configured';

export interface Integration {
  key: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  detail: string;
  env_keys: string[];
  env_present: string[];
  docs_url?: string;
}

export interface IntegrationsList {
  items: Integration[];
  summary: { total: number; connected: number; partial: number; missing: number };
}

// ──────────────────────────────────────────────────────────────────
// Compliance types
// ──────────────────────────────────────────────────────────────────

export type DeletionStatus = 'pending' | 'in_review' | 'completed' | 'rejected';

export interface DeletionRequestRow {
  id: string;
  target_user_id: string | null;
  target_email: string;
  workspace_id: string | null;
  workspace_name: string | null;
  requested_by: string | null;
  requested_by_email: string | null;
  request_channel: 'support' | 'self' | 'admin';
  reason: string | null;
  status: DeletionStatus;
  processed_at: string | null;
  processed_by: string | null;
  processing_notes: string | null;
  due_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListDeletionRequestsResult {
  items: DeletionRequestRow[];
  total: number; limit: number; offset: number;
}

export interface CreateDeletionRequestBody {
  targetEmail: string;
  targetUserId?: string;
  workspaceId?: string;
  channel: 'support' | 'self' | 'admin';
  reason?: string;
}

export interface ComplianceSnapshot {
  pending_count: number;
  in_review_count: number;
  completed_count: number;
  overdue_count: number;
  avg_resolution_days: number | null;
}

export interface DsarExport {
  generated_at: string;
  target_user_id: string;
  target_email: string;
  data: Record<string, unknown[]>;
}

// ──────────────────────────────────────────────────────────────────
// Billing types
// ──────────────────────────────────────────────────────────────────

export interface RevenueSnapshot {
  total_inr: number;
  last_30d_inr: number;
  mrr_inr: number;
  arr_inr: number;
  active_subs: number;
  trialing_subs: number;
  past_due_subs: number;
  cancelled_30d: number;
  failed_payments: number;
}

export interface PlanRevenueBreakdown {
  plan_key: string;
  active_count: number;
  mrr_inr: number;
}

export interface MonthlyRevenuePoint {
  month: string;
  revenue_inr: number;
  payment_count: number;
}

export type SubscriptionStatus =
  | 'created' | 'authenticated' | 'active' | 'pending'
  | 'halted' | 'cancelled' | 'completed' | 'expired' | 'paused';

export interface SubscriptionListItem {
  id: string;
  workspace_id: string;
  workspace_name: string | null;
  owner_email: string | null;
  razorpay_subscription_id: string | null;
  razorpay_plan_id: string | null;
  plan_key: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  amount_paise: number | null;
  currency: string;
  started_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface ListSubscriptionsParams {
  status?: SubscriptionStatus | 'all';
  plan?: string;
  q?: string;
  limit?: number;
  offset?: number;
}
export interface ListSubscriptionsResult {
  items: SubscriptionListItem[];
  total: number; limit: number; offset: number;
}

export type PaymentStatus = 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';

export interface PaymentListItem {
  id: string;
  workspace_id: string;
  workspace_name: string | null;
  subscription_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  amount_paise: number;
  amount_refunded_paise: number;
  currency: string;
  status: PaymentStatus;
  method: string | null;
  description: string | null;
  email: string | null;
  contact: string | null;
  error_code: string | null;
  error_description: string | null;
  captured_at: string | null;
  failed_at: string | null;
  created_at: string;
}

export interface ListPaymentsParams {
  status?: PaymentStatus | 'all';
  workspaceId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}
export interface ListPaymentsResult {
  items: PaymentListItem[];
  total: number; limit: number; offset: number;
}

export type InvoiceStatus =
  | 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled' | 'expired';

export interface InvoiceListItem {
  id: string;
  workspace_id: string;
  workspace_name: string | null;
  razorpay_invoice_id: string | null;
  invoice_number: string | null;
  amount_paise: number;
  gst_amount_paise: number;
  status: InvoiceStatus;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  due_at: string | null;
  issued_at: string | null;
  paid_at: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_gstin: string | null;
  pdf_url: string | null;
  created_at: string;
}

export interface ListInvoicesParams {
  status?: InvoiceStatus | 'all';
  workspaceId?: string;
  limit?: number;
  offset?: number;
}
export interface ListInvoicesResult {
  items: InvoiceListItem[];
  total: number; limit: number; offset: number;
}
