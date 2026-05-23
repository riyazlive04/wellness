export type InvoiceStatus = 'paid' | 'issued' | 'failed' | 'refunded';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export interface Invoice {
  id: string;
  number: string;                  // "SIRAH-2026-000004"
  issuedAt: string;                // ISO
  paidAt?: string;
  /** Plan tier on this invoice */
  planName: string;
  /** All numeric amounts in paise (1 INR = 100 paise) */
  baseAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;              // 0 when intra-state, > 0 when inter-state
  totalAmount: number;
  status: InvoiceStatus;
  /** Razorpay payment id when paid */
  paymentRef?: string;
}

export interface UsageMetric {
  key: 'clients' | 'aiCalls' | 'teamSeats';
  label: string;
  used: number;
  limit: number | null;            // null = unlimited
}

export interface SubscriptionState {
  planId: 'starter' | 'pro' | 'scale' | 'enterprise';
  planName: string;
  pricePaise: number;
  status: SubscriptionStatus;
  /** Next billing date as ISO */
  currentPeriodEnd: string;
  trialEndsAt?: string;
  graceEndsAt?: string;
  failedPaymentCount: number;
  usage: UsageMetric[];
}
