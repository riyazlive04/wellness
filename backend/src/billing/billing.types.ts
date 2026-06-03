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
  /** Sum of captured payments across all time, in INR (rupees, not paise). */
  total_inr: number;
  /** Sum of captured payments in the last 30 days, in INR. */
  last_30d_inr: number;
  /** Monthly recurring revenue — sum of active subscription amounts, in INR. */
  mrr_inr: number;
  /** Annual run-rate (MRR * 12). */
  arr_inr: number;
  /** Active paying subscriptions count. */
  active_subs: number;
  /** Subscriptions in trial. */
  trialing_subs: number;
  /** Subscriptions past_due / halted. */
  past_due_subs: number;
  /** Cancelled this month. */
  cancelled_30d: number;
  /** Failed payments in the dunning queue. */
  failed_payments: number;
}

export interface PlanRevenueBreakdown {
  plan_key: string;
  active_count: number;
  mrr_inr: number;
}

export interface MonthlyRevenuePoint {
  /** ISO date YYYY-MM-01 marking the bucket. */
  month: string;
  revenue_inr: number;
  payment_count: number;
}