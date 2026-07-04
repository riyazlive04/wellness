import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Download, FileText, Search, Wallet, RotateCcw, Loader2, Play, TrendingDown, Users, Repeat } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import {
  adminApi,
  type InvoiceStatus,
  type ListInvoicesResult,
  type ListPaymentsResult,
  type PaymentStatus,
} from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

type Tab = 'payments' | 'invoices';

export default function AdminBilling() {
  const [tab, setTab] = useState<Tab>('payments');

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="space-y-6"
      >
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
            Billing
          </span>
          <h1 className="text-balance">Payment history & invoices.</h1>
          <p className="text-pretty text-base text-foreground/80 dark:text-foreground/65 md:text-lg md:leading-relaxed">
            Every charge, refund, and GST-bearing invoice — sourced from Razorpay webhooks.
          </p>
        </motion.div>

        <motion.div variants={fadeUp}>
          <AnalyticsStrip />
        </motion.div>

        <motion.div variants={fadeUp} className="flex gap-1">
          <TabButton active={tab === 'payments'} onClick={() => setTab('payments')}>
            Payments
          </TabButton>
          <TabButton active={tab === 'invoices'} onClick={() => setTab('invoices')}>
            Invoices
          </TabButton>
        </motion.div>

        <motion.div variants={fadeUp}>
          {tab === 'payments' ? <PaymentsTable /> : <InvoicesTable />}
        </motion.div>
      </motion.div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white'
          : 'border border-foreground/[0.08] bg-foreground/[0.03] text-foreground/70 hover:bg-foreground/[0.06]',
      )}
    >
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────
// Analytics + automation strip
// ──────────────────────────────────────────────────────────────────
function AnalyticsStrip() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const { data } = useQuery({
    queryKey: ['admin', 'billing', 'analytics'],
    queryFn: adminApi.billingAnalytics,
    staleTime: 60_000,
  });

  async function runAutomation() {
    setRunning(true);
    try {
      const r = await adminApi.runBillingAutomation();
      toast.success(
        `Automation run: ${r.renewalReminders} renewal · ${r.dunning} dunning · ${r.trialReminders} trial · ${r.downgrades} downgraded`,
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'analytics'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Automation run failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MetricCard icon={Repeat} label="Retention (90d)" value={data ? `${data.retention_rate_90d}%` : '—'} hint={data ? `${data.cancelled_90d} cancelled` : ''} tone="sage" />
      <MetricCard icon={TrendingDown} label="Churn (90d)" value={data ? `${data.churn_rate_90d}%` : '—'} hint={data ? `${data.active_subs} active` : ''} tone={data && data.churn_rate_90d > 10 ? 'rose' : 'default'} />
      <MetricCard icon={Users} label="Trial conversion" value={data ? `${data.trial_conversion_rate}%` : '—'} hint={data ? `${data.ever_paid_workspaces}/${data.total_workspaces} paid` : ''} tone="indigo" />
      <div className="flex flex-col justify-between rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-foreground/55">ARPA</div>
          <div className="mt-1 text-lg font-semibold">{data ? INR.format(data.arpa_inr) : '—'}</div>
        </div>
        <button
          type="button"
          onClick={runAutomation}
          disabled={running}
          className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-[11px] font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.06] disabled:opacity-50"
          title="Run trial/renewal/dunning/downgrade jobs now"
        >
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Run automation
        </button>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, hint, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; hint?: string; tone?: 'sage' | 'rose' | 'indigo' | 'default';
}) {
  const toneClass = {
    sage: 'text-emerald-600 dark:text-emerald-300',
    rose: 'text-rose-600 dark:text-rose-300',
    indigo: 'text-violet-600 dark:text-violet-300',
    default: 'text-foreground/70',
  }[tone ?? 'default'];
  return (
    <div className="rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-foreground/55">
        <Icon className={cn('h-3.5 w-3.5', toneClass)} />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-foreground/50">{hint}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Payments tab
// ──────────────────────────────────────────────────────────────────
function PaymentsTable() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PaymentStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const limit = 25;

  async function handleRefund(id: string, label: string) {
    if (!window.confirm(`Refund this payment in full?\n\n${label}\n\nThis cannot be undone.`)) return;
    setRefundingId(id);
    try {
      await adminApi.refundPayment(id);
      toast.success('Refund initiated. Razorpay will reconcile shortly.');
      queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Refund failed.');
    } finally {
      setRefundingId(null);
    }
  }

  const { data, isLoading, error } = useQuery<ListPaymentsResult>({
    queryKey: ['admin', 'payments', status, q, page],
    queryFn: () => adminApi.listPayments({
      status: status === 'all' ? undefined : status,
      q: q || undefined,
      limit, offset: page * limit,
    }),
    keepPreviousData: true,
    staleTime: 30_000,
  });
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {(['all', 'captured', 'failed', 'refunded', 'authorized'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setStatus(s); setPage(0); }}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                status === s
                  ? 'bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white'
                  : 'border border-foreground/[0.08] bg-foreground/[0.03] text-foreground/70 hover:bg-foreground/[0.06]',
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/45" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Search payment id / email / workspace"
            className="w-full rounded-lg border border-foreground/[0.08] bg-foreground/[0.02] py-2 pl-9 pr-3 text-sm placeholder:text-foreground/40 focus:border-violet-400 focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <Glass className="border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
          Couldn't load payments: {(error as Error).message}
        </Glass>
      )}

      <Glass className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-foreground/[0.06] bg-foreground/[0.02] text-left text-[11px] uppercase tracking-[0.14em] text-foreground/55">
              <tr>
                <th className="px-5 py-3">Payment</th>
                <th className="px-5 py-3">Workspace</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Method</th>
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-foreground/55">Loading…</td></tr>
              )}
              {!isLoading && (data?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="mx-auto max-w-md text-sm text-foreground/65">
                      <Wallet className="mx-auto mb-3 h-8 w-8 text-foreground/30" />
                      <p className="font-medium text-foreground/80">No payments yet.</p>
                      <p className="mt-1">
                        Razorpay <code>payment.captured</code> webhooks land here as they arrive.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {(data?.items ?? []).map((p) => (
                <tr key={p.id} className="border-b border-foreground/[0.04] last:border-0">
                  <td className="px-5 py-3 font-mono text-[11px] text-foreground/75">
                    {p.razorpay_payment_id ?? p.id.slice(0, 8)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-medium text-foreground">{p.workspace_name ?? '—'}</div>
                    <div className="text-[11px] text-foreground/55">{p.email ?? '—'}</div>
                  </td>
                  <td className="px-5 py-3">
                    {INR.format(p.amount_paise / 100)}
                    {p.amount_refunded_paise > 0 && (
                      <div className="text-[11px] text-rose-700 dark:text-rose-300">
                        −{INR.format(p.amount_refunded_paise / 100)} refunded
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3"><PaymentPill status={p.status} /></td>
                  <td className="px-5 py-3 capitalize text-foreground/75">{p.method ?? '—'}</td>
                  <td className="px-5 py-3 text-foreground/75">
                    {DATE.format(new Date(p.captured_at ?? p.failed_at ?? p.created_at))}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {p.status === 'captured' && p.amount_refunded_paise < p.amount_paise ? (
                      <button
                        type="button"
                        onClick={() => handleRefund(p.id, `${p.workspace_name ?? ''} · ${INR.format(p.amount_paise / 100)}`)}
                        disabled={refundingId === p.id || !p.razorpay_payment_id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/[0.06] px-3 py-1 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-400/[0.12] disabled:opacity-40 dark:text-rose-300"
                        title={p.razorpay_payment_id ? 'Refund this payment in full' : 'No Razorpay id to refund'}
                      >
                        {refundingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Refund
                      </button>
                    ) : (
                      <span className="text-[11px] text-foreground/35">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(total > 0) && <Pager total={total} page={page} pages={pages} setPage={setPage} />}
      </Glass>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Invoices tab
// ──────────────────────────────────────────────────────────────────
function InvoicesTable() {
  const [status, setStatus] = useState<InvoiceStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const limit = 25;

  const { data, isLoading, error } = useQuery<ListInvoicesResult>({
    queryKey: ['admin', 'invoices', status, page],
    queryFn: () => adminApi.listInvoices({
      status: status === 'all' ? undefined : status,
      limit, offset: page * limit,
    }),
    keepPreviousData: true,
    staleTime: 30_000,
  });
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {(['all', 'issued', 'paid', 'partially_paid', 'cancelled', 'expired'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setStatus(s); setPage(0); }}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
              status === s
                ? 'bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white'
                : 'border border-foreground/[0.08] bg-foreground/[0.03] text-foreground/70 hover:bg-foreground/[0.06]',
            )}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {error && (
        <Glass className="border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
          Couldn't load invoices: {(error as Error).message}
        </Glass>
      )}

      <Glass className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-foreground/[0.06] bg-foreground/[0.02] text-left text-[11px] uppercase tracking-[0.14em] text-foreground/55">
              <tr>
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Workspace</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">GST</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Issued</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-foreground/55">Loading…</td></tr>
              )}
              {!isLoading && (data?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="mx-auto max-w-md text-sm text-foreground/65">
                      <FileText className="mx-auto mb-3 h-8 w-8 text-foreground/30" />
                      <p className="font-medium text-foreground/80">No invoices yet.</p>
                      <p className="mt-1">
                        Razorpay-issued invoices appear here with their PDF download link.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {(data?.items ?? []).map((i) => (
                <tr key={i.id} className="border-b border-foreground/[0.04] last:border-0">
                  <td className="px-5 py-3 font-mono text-[11px] text-foreground/75">
                    {i.invoice_number ?? i.razorpay_invoice_id ?? i.id.slice(0, 8)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-medium text-foreground">{i.workspace_name ?? '—'}</div>
                    <div className="text-[11px] text-foreground/55">
                      {i.customer_email ?? '—'}{i.customer_gstin ? ` · GSTIN ${i.customer_gstin}` : ''}
                    </div>
                  </td>
                  <td className="px-5 py-3">{INR.format(i.amount_paise / 100)}</td>
                  <td className="px-5 py-3 text-foreground/75">
                    {i.gst_amount_paise > 0 ? INR.format(i.gst_amount_paise / 100) : '—'}
                  </td>
                  <td className="px-5 py-3"><InvoicePill status={i.status} /></td>
                  <td className="px-5 py-3 text-foreground/75">
                    {i.issued_at ? DATE.format(new Date(i.issued_at)) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {i.pdf_url ? (
                      <a
                        href={i.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-foreground/[0.08] px-2.5 py-1 text-[11px] hover:bg-foreground/[0.04]"
                      >
                        <Download className="h-3 w-3" />
                        PDF
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(total > 0) && <Pager total={total} page={page} pages={pages} setPage={setPage} />}
      </Glass>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Shared
// ──────────────────────────────────────────────────────────────────
function Pager({
  total, page, pages, setPage,
}: { total: number; page: number; pages: number; setPage: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-foreground/[0.06] px-5 py-3 text-xs text-foreground/65">
      <span>{total} total · page {page + 1} of {pages}</span>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage(Math.max(0, page - 1))}
          className="rounded-lg border border-foreground/[0.08] px-2.5 py-1 hover:bg-foreground/[0.04] disabled:opacity-30"
        >
          Prev
        </button>
        <button
          type="button"
          disabled={page >= pages - 1}
          onClick={() => setPage(page + 1)}
          className="rounded-lg border border-foreground/[0.08] px-2.5 py-1 hover:bg-foreground/[0.04] disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function PaymentPill({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, string> = {
    captured:   'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
    authorized: 'border-sky-400/40 bg-sky-400/10 text-sky-700 dark:text-sky-200',
    created:    'border-foreground/15 bg-foreground/[0.06] text-foreground/70',
    refunded:   'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
    failed:     'border-rose-400/40 bg-rose-400/10 text-rose-700 dark:text-rose-200',
  };
  return (
    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]', map[status])}>
      {status}
    </span>
  );
}

function InvoicePill({ status }: { status: InvoiceStatus }) {
  const map: Record<InvoiceStatus, string> = {
    paid:           'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
    issued:         'border-sky-400/40 bg-sky-400/10 text-sky-700 dark:text-sky-200',
    partially_paid: 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
    draft:          'border-foreground/15 bg-foreground/[0.06] text-foreground/70',
    cancelled:      'border-foreground/15 bg-foreground/[0.06] text-foreground/70',
    expired:        'border-rose-400/40 bg-rose-400/10 text-rose-700 dark:text-rose-200',
  };
  return (
    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]', map[status])}>
      {status.replace('_', ' ')}
    </span>
  );
}