import type { Invoice, SubscriptionState } from '../types';

const day = 1000 * 60 * 60 * 24;
const now = Date.now();

// GST split for ₹1999 plan (intra-state Karnataka):
//   Base 1693.22  CGST 152.89  SGST 152.89  Total 1999.00
const PRO_INVOICE_BASE  = 169322;     // paise
const PRO_INVOICE_CGST  = 15289;
const PRO_INVOICE_SGST  = 15289;
const PRO_INVOICE_TOTAL = 199900;

function invoice(opts: {
  n: number;
  daysAgo: number;
  status: Invoice['status'];
  paid?: boolean;
  paymentRef?: string;
}): Invoice {
  const issuedAt = new Date(now - opts.daysAgo * day).toISOString();
  return {
    id: `inv_${opts.n}`,
    number: `NUSI-2026-${String(opts.n).padStart(6, '0')}`,
    issuedAt,
    paidAt: opts.paid ? new Date(new Date(issuedAt).getTime() + 2 * 60 * 60 * 1000).toISOString() : undefined,
    planName: 'Pro',
    baseAmount: PRO_INVOICE_BASE,
    cgstAmount: PRO_INVOICE_CGST,
    sgstAmount: PRO_INVOICE_SGST,
    igstAmount: 0,
    totalAmount: PRO_INVOICE_TOTAL,
    status: opts.status,
    paymentRef: opts.paymentRef,
  };
}

export const MOCK_INVOICES: Invoice[] = [
  invoice({ n: 5, daysAgo: 1,   status: 'issued' }),                          // current period
  invoice({ n: 4, daysAgo: 31,  status: 'paid', paid: true,  paymentRef: 'pay_NkH8aQ91xT' }),
  invoice({ n: 3, daysAgo: 62,  status: 'paid', paid: true,  paymentRef: 'pay_NhK21XY4mZ' }),
  invoice({ n: 2, daysAgo: 93,  status: 'paid', paid: true,  paymentRef: 'pay_NfA0vK22Lp' }),
  invoice({ n: 1, daysAgo: 124, status: 'paid', paid: true,  paymentRef: 'pay_NdJ4tR82Bw' }),
];

/** Healthy subscription. The page exposes a toggle to flip into past_due demo state. */
export const MOCK_SUBSCRIPTION: SubscriptionState = {
  planId: 'pro',
  planName: 'Pro',
  pricePaise: 199900,
  status: 'active',
  currentPeriodEnd: new Date(now + 22 * day).toISOString(),
  failedPaymentCount: 0,
  usage: [
    { key: 'clients',   label: 'Clients',        used: 12,    limit: 100 },
    { key: 'aiCalls',   label: 'AI calls',       used: 1_284, limit: 5_000 },
    { key: 'teamSeats', label: 'Team seats',     used: 1,     limit: 3 },
  ],
};

/** Past-due demo variant used by the "Simulate failed payment" toggle on the page. */
export const MOCK_SUBSCRIPTION_PAST_DUE: SubscriptionState = {
  ...MOCK_SUBSCRIPTION,
  status: 'past_due',
  failedPaymentCount: 2,
  graceEndsAt: new Date(now + 11 * day).toISOString(),
};
