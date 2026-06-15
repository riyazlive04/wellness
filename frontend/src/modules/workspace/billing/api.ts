import { api } from '@/lib/api';

export type PlanKey = 'starter' | 'pro' | 'scale' | 'enterprise';
export type TopupKey = 'ai_calls_1k' | 'ai_calls_5k' | 'clients_extra_25';

export interface Plan {
  key: PlanKey;
  name: string;
  priceInr: number;
  razorpayPlanIdEnv: string;
  tagline: string;
  features: string[];
  recommended?: boolean;
}

export interface Topup {
  key: TopupKey;
  name: string;
  priceInr: number;
  units: number;
  unitLabel: string;
  description: string;
}

export interface PlansResponse {
  plans: Plan[];
  topups: Topup[];
  razorpayKeyId: string | null;
  razorpayConfigured: boolean;
}

export interface CurrentSubscription {
  id: string;
  workspace_id: string;
  razorpay_subscription_id: string | null;
  plan_key: PlanKey;
  status: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  amount_paise: number | null;
  started_at: string | null;
  cancelled_at: string | null;
}

export interface CreateOrderResponse {
  orderId: string;
  amountPaise: number;
  currency: string;
  topup: { key: TopupKey; name: string; priceInr: number };
  razorpayKeyId: string;
}

export interface CreateSubscriptionResponse {
  subscriptionId: string;
  planKey: PlanKey;
  amountPaise: number;
  razorpayKeyId: string;
}

/** Server invoice row (backend/src/billing/billing.types.ts → InvoiceRow). */
export interface ServerInvoice {
  id: string;
  workspace_id: string;
  subscription_id: string | null;
  payment_id: string | null;
  razorpay_invoice_id: string | null;
  invoice_number: string | null;
  amount_paise: number;
  gst_amount_paise: number;
  status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled' | 'expired';
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

export interface GstBreakdown {
  grossPaise: number;
  basePaise: number;
  gstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  ratePercent: number;
  interState: boolean;
}

export interface SupplierDetails {
  legalName: string;
  addressLines: string[];
  gstin: string | null;
  state: string;
  email: string;
}

export interface InvoiceDetail extends ServerInvoice {
  gst: GstBreakdown;
  supplier: SupplierDetails;
}

export type ChangeDirection = 'upgrade' | 'downgrade' | 'same';
export type ChangeTiming = 'now' | 'cycle_end';

export interface ProrationPreview {
  direction: ChangeDirection;
  timing: ChangeTiming;
  oldPricePaise: number;
  newPricePaise: number;
  daysRemaining: number;
  periodDays: number;
  unusedCreditPaise: number;
  newProratedPaise: number;
  immediateChargePaise: number;
  nextCyclePaise: number;
  currentPlanKey: string;
  targetPlanKey: PlanKey;
  targetPlanName: string;
}

export type BillingNotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

export interface BillingNotification {
  id: string;
  type: string;
  severity: BillingNotificationSeverity;
  title: string;
  body: string;
  action_url: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export const billingApi = {
  listPlans: () =>
    api.get<PlansResponse>('/api/v1/billing/me/plans'),

  currentSubscription: () =>
    api.get<{ subscription: CurrentSubscription | null }>('/api/v1/billing/me/subscription'),

  createOrder: (topupKey: TopupKey) =>
    api.post<CreateOrderResponse>('/api/v1/billing/me/orders', { body: { topupKey } }),

  createSubscription: (planKey: PlanKey) =>
    api.post<CreateSubscriptionResponse>('/api/v1/billing/me/subscribe', { body: { planKey } }),

  verifyOrder: (params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    topupKey: TopupKey;
  }) =>
    api.post<{ verified: true; workspaceId: string }>('/api/v1/billing/me/verify', { body: params }),

  verifySubscription: (params: {
    razorpayPaymentId: string;
    razorpaySubscriptionId: string;
    razorpaySignature: string;
  }) =>
    api.post<{ verified: true; workspaceId: string }>('/api/v1/billing/me/verify-subscription', { body: params }),

  cancel: () =>
    api.post<{ cancelled: true; razorpaySubscriptionId: string }>('/api/v1/billing/me/cancel'),

  // ── Plan change (upgrade / downgrade) ───────────────────────────────
  changePlanPreview: (planKey: PlanKey) =>
    api.get<{ preview: ProrationPreview }>(`/api/v1/billing/me/change-plan/preview?planKey=${planKey}`),

  changePlan: (planKey: PlanKey) =>
    api.post<{ changed: true; timing: ChangeTiming; direction: ChangeDirection; preview: ProrationPreview }>(
      '/api/v1/billing/me/change-plan',
      { body: { planKey } },
    ),

  // ── Invoices ────────────────────────────────────────────────────────
  listInvoices: () =>
    api.get<{ invoices: ServerInvoice[] }>('/api/v1/billing/me/invoices'),

  getInvoice: (id: string) =>
    api.get<{ invoice: InvoiceDetail }>(`/api/v1/billing/me/invoices/${id}`),

  // ── Billing notifications ───────────────────────────────────────────
  listNotifications: () =>
    api.get<{ notifications: BillingNotification[]; unread: number }>('/api/v1/billing/me/notifications'),

  markNotificationRead: (id: string) =>
    api.post<{ ok: true }>(`/api/v1/billing/me/notifications/${id}/read`),

  markAllNotificationsRead: () =>
    api.post<{ ok: true }>('/api/v1/billing/me/notifications/read-all'),
};