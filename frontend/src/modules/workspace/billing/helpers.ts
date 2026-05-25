import type { InvoiceStatus, SubscriptionStatus } from './types';

export function formatRupees(paise: number, opts: { fractionDigits?: 0 | 2 } = {}): string {
  const rupees = paise / 100;
  const fd = opts.fractionDigits ?? 2;
  return rupees.toLocaleString('en-IN', {
    minimumFractionDigits: fd,
    maximumFractionDigits: fd,
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export const INVOICE_STATUS_META: Record<
  InvoiceStatus,
  { label: string; chip: string; dot: string }
> = {
  paid: {
    label: 'Paid',
    chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    dot: 'bg-emerald-400',
  },
  issued: {
    label: 'Issued',
    chip: 'border-violet-400/40 bg-violet-400/10 text-violet-200',
    dot: 'bg-violet-400',
  },
  failed: {
    label: 'Failed',
    chip: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
    dot: 'bg-rose-400',
  },
  refunded: {
    label: 'Refunded',
    chip: 'border-white/15 bg-white/[0.04] text-white/55',
    dot: 'bg-white/40',
  },
};

export const SUBSCRIPTION_STATUS_META: Record<
  SubscriptionStatus,
  { label: string; chip: string; dot: string }
> = {
  trialing: {
    label: 'Trial active',
    chip: 'border-violet-400/40 bg-violet-400/10 text-violet-200',
    dot: 'bg-violet-400',
  },
  active: {
    label: 'Active',
    chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    dot: 'bg-emerald-400',
  },
  past_due: {
    label: 'Past due',
    chip: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
    dot: 'bg-rose-400',
  },
  canceled: {
    label: 'Canceled',
    chip: 'border-white/15 bg-white/[0.04] text-white/55',
    dot: 'bg-white/40',
  },
};
