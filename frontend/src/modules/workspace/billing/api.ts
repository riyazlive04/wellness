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
};