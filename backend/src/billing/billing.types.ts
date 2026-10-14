export type SubscriptionStatus =
  | 'created'
  | 'authenticated'
  | 'active'
  | 'pending'
  | 'halted'
  | 'cancelled'
  | 'completed'
  | 'expired'
  | 'paused';

export type PaymentStatus =
  | 'created'
  | 'authorized'
  | 'captured'
  | 'refunded'
  | 'failed';

export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'cancelled'
  | 'expired';

export interface SubscriptionRow {
  id: string;
  workspace_id: string;
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
  updated_at: string;
}

export interface SubscriptionListItem extends SubscriptionRow {
  workspace_name: string | null;
  owner_email: string | null;
}

export interface PaymentRow {
  id: string;
  workspace_id: string;
  subscription_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  razorpay_invoice_id: string | null;
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

export interface PaymentListItem extends PaymentRow {
  workspace_name: string | null;
}

export interface InvoiceRow {
  id: string;
  workspace_id: string;
  subscription_id: string | null;
  payment_id: string | null;
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

export interface InvoiceListItem extends InvoiceRow {
  workspace_name: string | null;
}

export interface RevenueSnapshot {
  /** NUSI income, all time, after refunds, incl. GST (INR). */
  total_inr: number;
  total_net_inr: number;
  /** NUSI income, last 30 days, after refunds, incl. GST. */
  last_30d_inr: number;
  last_30d_net_inr: number;
  /** Last 30 days split by what was paid for (incl. GST). */
  last_30d_by_kind: { subscription_inr: number; topup_inr: number; other_inr: number };
  /** Practice store sales (clients buying a practice's products), last 30 days: not NUSI income. */
  store_sales_30d_inr: number;
  /** Monthly recurring revenue: current paid subscriptions, yearly divided by 12, incl. GST. */
  mrr_inr: number;
  mrr_net_inr: number;
  arr_inr: number;
  arr_net_inr: number;
  /** Practices with a current paid subscription. */
  active_subs: number;
  /** Practices still in their free trial with no paid plan. */
  trialing_subs: number;
  /** Checkouts started but not paid yet, last 30 days. */
  checkouts_open: number;
  /** Practices whose renewal failed (Razorpay halted / pending). */
  past_due_subs: number;
  /** Paying practices that cancelled in the last 30 days. */
  cancelled_30d: number;
  /** Failed payment attempts in the last 30 days. */
  failed_payments: number;
}

export interface PlanRevenueBreakdown {
  plan_key: string;
  active_count: number;
  mrr_inr: number;
  mrr_net_inr: number;
}

export interface SubscriptionAnalytics {
  active_subs: number;
  cancelled_90d: number;
  /** Paying practices 90 days ago (the churn denominator). */
  active_at_start_90d: number;
  /** Cancelled in 90d divided by paying at the start of the 90 days, percent. */
  churn_rate_90d: number;
  retention_rate_90d: number;
  ever_paid_workspaces: number;
  /** Practices whose trial ended (or that paid early): the conversion denominator. */
  total_workspaces: number;
  /** Practices that ever paid divided by practices whose trial ended, percent. */
  trial_conversion_rate: number;
  /** MRR divided by paying practices, incl. GST. */
  arpa_inr: number;
  arpa_net_inr: number;
  lifetime_revenue_inr: number;
}

export interface MonthlyRevenuePoint {
  /** ISO date YYYY-MM-01 of the Indian month. */
  month: string;
  revenue_inr: number;
  revenue_net_inr: number;
  payment_count: number;
}
