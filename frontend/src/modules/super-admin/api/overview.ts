import { api } from '@/lib/api';
import type { PlatformStats, RevenueSnapshot } from './admin';

export interface OverviewPractice {
  id: string;
  name: string;
  status: string;
  city: string | null;
  owner_name: string;
  owner_email: string | null;
  kind: 'paying' | 'free' | 'trial' | 'other';
  plan: string;
  trial_ends_at: string | null;
  /** Plan the latest setup fee was paid for: the plan a trial practice chose. */
  setup_plan: string | null;
  setup_paid_inr: number;
  clients: number;
  active_7d: number;
  meals_7d: number;
  ai_calls_30d: number;
  ai_limit: number | null;
  ai_pct: number | null;
  last_active: string | null;
  health: 'good' | 'quiet' | 'new' | 'suspended';
}

/** Everything the super admin home page shows (GET /admin/overview). Any block can be null if it failed. */
export interface AdminOverviewData {
  generated_at: string;
  stats: PlatformStats | null;
  revenue: (RevenueSnapshot & { mrr_net_inr?: number; last_30d_net_inr?: number; checkouts_open?: number; store_sales_30d_inr?: number }) | null;
  monthly: Array<{ month: string; revenue_inr: number; revenue_net_inr: number; payment_count: number }> | null;
  by_plan: Array<{ plan_key: string; active_count: number; mrr_inr: number; mrr_net_inr: number }> | null;
  analytics: { churn_rate_90d: number; trial_conversion_rate: number; arpa_inr: number; cancelled_90d: number; total_workspaces: number } | null;
  totals: { clients: number; clients_new_30d: number; clients_prev_30d: number } | null;
  onboarding: { counts: Record<string, number>; rows: Array<{ id: string; name: string; status: string; sections: string[]; expires_at: string; last_activity_at: string }> } | null;
  practices: OverviewPractice[] | null;
  growth: { weekly: Array<{ week: string; count: number }>; leads_30d: number; onboarding_30d: number; onboarding_done_30d: number } | null;
  engagement: { active_clients: number; meals: number; messages: number; appointments_next_7d: number; quick_reminders: number; plans_published: number; push_phones: number } | null;
  ai: { snapshot: { total_calls: number; errors: number; success_rate: number; total_cost_inr: number; last_24h_calls: number }; most_used: string | null; top: Array<{ workspace_id: string; workspace_name: string | null; calls: number; quota_status: string; quota_limit: number | null }> } | null;
  trials: Array<{ id: string; name: string; trial_ends_at: string; clients: number }> | null;
  verification: Record<string, number> | null;
  leads: { latest: Array<{ id: string; name: string; city: string | null; source: string | null; status: string | null; slot_start: string | null; created_at: string }>; new_count: number; calls_soon: number } | null;
  activity: Array<{ at: string; kind: string; text: string }> | null;
  health: {
    db: { up: boolean; latency_ms: number };
    push: boolean;
    email: boolean;
    payments: { keys: boolean; webhook_secret: boolean; last_webhook_at: string | null; webhook_errors_24h: number; webhook_events_24h: number };
    ai: { configured: boolean; errors_24h: number };
    uptime_seconds: number;
  } | null;
  /** One-time setup fees collected (Razorpay + recorded by hand). */
  setup_fees: {
    total_inr: number; last_30d_inr: number; manual_total_inr: number; count: number;
    rows: Array<{ id: string; workspace_id: string; workspace_name: string; plan_key: string; amount_inr: number; paid_at: string; method: string }>;
  } | null;
}

export const overviewApi = {
  get: () => api.get<AdminOverviewData>('/api/v1/admin/overview'),
};
