import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Receipt, Wallet, FileText, AlertTriangle, CheckCircle2, ArrowRight,
  Download, Loader2, Bell, BellOff,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { billingApi, type ServerInvoice, type BillingNotification, type Plan, type PlanKey } from '@/modules/workspace/billing/api';
import { PlanCard, CycleToggle, type BillingCycle } from '@/modules/workspace/billing/PlanCard';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { generateInvoicePdf } from '@/modules/workspace/billing/invoicePdf';
import { formatRupees, formatDate, daysUntil } from '@/modules/workspace/billing/helpers';
import { cn } from '@/lib/utils';

const PAST_DUE_STATUSES = new Set(['halted', 'pending']);

export default function OwnerBilling() {
  const workspace = readWorkspace();
  const queryClient = useQueryClient();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const subQ = useQuery({ queryKey: ['billing', 'me', 'subscription'], queryFn: billingApi.currentSubscription, retry: 1 });
  const invQ = useQuery({ queryKey: ['billing', 'me', 'invoices'], queryFn: billingApi.listInvoices, retry: 1 });
  const notifQ = useQuery({ queryKey: ['billing', 'me', 'notifications'], queryFn: billingApi.listNotifications, retry: 1 });
  const wsQ = useQuery({ queryKey: ['workspace', 'me'], queryFn: workspacesApi.me, retry: 1 });
  const plansQ = useQuery({ queryKey: ['billing', 'me', 'plans'], queryFn: billingApi.listPlans, retry: 1, staleTime: 10 * 60 * 1000 });

  const subscription = subQ.data?.subscription ?? null;
  const ws = wsQ.data;

  // Plan + remaining-days resolution. A paid plan has a current_period_end
  // (next renewal); otherwise we're on the trial, whose end date lives on the
  // workspace record (same source as the sidebar's "Nd left" pill).
  const onPaidPlan = !!subscription?.current_period_end;
  const trialEndsAt = ws?.trial_ends_at ?? subscription?.trial_ends_at ?? null;
  const renewsAt = onPaidPlan ? subscription!.current_period_end! : trialEndsAt;
  const daysLeft = renewsAt ? Math.max(0, daysUntil(renewsAt)) : null;
  const planLabel = onPaidPlan
    ? subscription!.plan_key
    : (ws?.plan && ws.plan !== 'trial' ? ws.plan : 'Trial');
  const trialDaysLeft = !onPaidPlan && trialEndsAt ? Math.max(0, daysUntil(trialEndsAt)) : null;
  const invoices = invQ.data?.invoices ?? [];
  const notifications = notifQ.data?.notifications ?? [];
  const unread = notifQ.data?.unread ?? 0;
  const isPastDue = subscription ? PAST_DUE_STATUSES.has(subscription.status) : false;

  const totals = useMemo(() => {
    return invoices.reduce(
      (acc, inv) => {
        acc.lifetime += inv.status === 'paid' ? inv.amount_paise : 0;
        if (inv.status === 'paid') acc.paid += inv.amount_paise;
        if (inv.status === 'issued' || inv.status === 'partially_paid') acc.outstanding += inv.amount_paise;
        return acc;
      },
      { lifetime: 0, paid: 0, outstanding: 0 },
    );
  }, [invoices]);

  async function handleDownload(inv: ServerInvoice) {
    setDownloadingId(inv.id);
    try {
      const { invoice } = await billingApi.getInvoice(inv.id);
      await generateInvoicePdf(invoice);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate the invoice PDF.');
    } finally {
      setDownloadingId(null);
    }
  }

  async function markAllRead() {
    try {
      await billingApi.markAllNotificationsRead();
      queryClient.invalidateQueries({ queryKey: ['billing', 'me', 'notifications'] });
    } catch {
      toast.error('Could not mark notifications as read.');
    }
  }

  const outstandingCount = invoices.filter((i) => i.status === 'issued' || i.status === 'partially_paid').length;

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={trialDaysLeft}
      topbarContext="Billing · GST-compliant invoices"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Billing</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Invoices & payments</h1>
              <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">
                GST-compliant invoices, paid via Razorpay. Auto-generated each cycle.
              </p>
            </div>
            <Link
              to="/subscription"
              className="inline-flex items-center gap-2 self-start rounded-full border border-foreground/10 bg-foreground/[0.03] px-4 py-2 text-sm text-foreground/85 transition-colors hover:bg-foreground/[0.06]"
            >
              Manage subscription
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </motion.div>

          {/* Failed-payment recovery banner (real) */}
          {isPastDue && (
            <motion.div variants={fadeUp}>
              <Glass className="overflow-hidden border-rose-400/30 bg-rose-400/[0.05]">
                <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-rose-400/15 text-rose-700 dark:text-rose-300">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">Payment failed — update your card</div>
                      <div className="mt-0.5 text-xs text-foreground/80 dark:text-foreground/65">
                        We couldn't charge your saved card for the latest renewal. Your plan stays active during a
                        14-day grace period; after that the workspace is downgraded to trial limits until payment resumes.
                      </div>
                    </div>
                  </div>
                  <Link
                    to="/subscription"
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-rose-500 to-rose-400 px-4 py-2 text-xs font-medium text-white"
                  >
                    Fix payment
                  </Link>
                </div>
              </Glass>
            </motion.div>
          )}

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPICard icon={Wallet} label="Lifetime paid" value={`₹${formatRupees(totals.lifetime, { fractionDigits: 0 })}`} hint={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`} accent="indigo" />
            <KPICard icon={CheckCircle2} label="Settled" value={`₹${formatRupees(totals.paid, { fractionDigits: 0 })}`} hint="all paid cycles" accent="sage" />
            <KPICard icon={FileText} label="Outstanding" value={`₹${formatRupees(totals.outstanding, { fractionDigits: 0 })}`} hint={`${outstandingCount} pending`} accent={totals.outstanding > 0 ? 'sand' : 'sage'} />
          </motion.div>

          {/* Current plan strip */}
          <motion.div variants={fadeUp}>
            <Glass className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.25)] to-[hsl(var(--brand-magenta)_/_0.20)] text-teal-700 dark:text-teal-200">
                  <Receipt className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Current plan</div>
                  <div className="mt-0.5 flex items-center gap-2 text-base font-medium text-foreground capitalize">
                    {planLabel}
                    {onPaidPlan && subscription?.amount_paise
                      ? <span className="text-foreground/70">· ₹{formatRupees(subscription.amount_paise, { fractionDigits: 0 })}/mo</span>
                      : null}
                    {daysLeft !== null && (
                      <span className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal',
                        !onPaidPlan && daysLeft <= 5
                          ? 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200'
                          : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
                      )}>
                        {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-xs text-foreground/75 dark:text-foreground/55">
                {onPaidPlan ? (
                  <>Renews on <span className="text-foreground/85">{formatDate(renewsAt!)}</span></>
                ) : trialEndsAt ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span>Trial ends <span className="text-foreground/85">{formatDate(trialEndsAt)}</span></span>
                    <Link to="/subscription" className="text-teal-600 hover:underline dark:text-teal-300">Choose a plan →</Link>
                  </span>
                ) : (
                  <Link to="/subscription" className="text-teal-600 hover:underline dark:text-teal-300">Choose a plan →</Link>
                )}
              </div>
            </Glass>
          </motion.div>

          {/* Plans & features */}
          <PlansSection plans={plansQ.data?.plans ?? []} currentKey={onPaidPlan ? subscription!.plan_key : null} />

          {/* Notifications */}
          {notifications.length > 0 && (
            <motion.div variants={fadeUp}>
              <Glass className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-foreground/70" />
                    <div className="text-sm font-medium text-foreground">Billing activity</div>
                    {unread > 0 && (
                      <span className="rounded-full bg-teal-400/15 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-200">{unread} new</span>
                    )}
                  </div>
                  {unread > 0 && (
                    <button type="button" onClick={markAllRead} className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.06]">
                      <BellOff className="h-3 w-3" /> Mark all read
                    </button>
                  )}
                </div>
                <ul className="divide-y divide-foreground/[0.04]">
                  {notifications.slice(0, 8).map((n) => (
                    <NotificationItem key={n.id} n={n} />
                  ))}
                </ul>
              </Glass>
            </motion.div>
          )}

          {/* Invoices table */}
          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                <div>
                  <div className="text-sm font-medium text-foreground">Invoices</div>
                  <div className="text-xs text-foreground/75 dark:text-foreground/60">Download a GST-compliant PDF for any invoice</div>
                </div>
              </div>

              <div className="hidden grid-cols-[1.4fr_1fr_1fr_120px_120px] gap-4 border-b border-foreground/[0.04] px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55 md:grid">
                <div>Invoice</div><div>Date</div><div>Amount</div><div>Status</div><div className="text-right">PDF</div>
              </div>

              {invQ.isLoading ? (
                <div className="px-5 py-10 text-center text-sm text-foreground/55"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
              ) : invoices.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <FileText className="mx-auto h-8 w-8 text-foreground/25" />
                  <div className="mt-3 text-sm text-foreground/70">No invoices yet</div>
                  <div className="mt-1 text-xs text-foreground/50">Your first invoice appears here after your first payment.</div>
                </div>
              ) : (
                <ul>
                  {invoices.map((inv) => (
                    <InvoiceListRow key={inv.id} inv={inv} downloading={downloadingId === inv.id} onDownload={() => handleDownload(inv)} />
                  ))}
                </ul>
              )}
            </Glass>
          </motion.div>

          <motion.div variants={fadeUp} className="text-[11px] text-foreground/35">
            Invoices are GST-inclusive (CGST + SGST for intra-state, IGST for inter-state). Subscription charges are
            also invoiced by Razorpay; top-up payments are invoiced here.
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

const INVOICE_CHIP: Record<string, string> = {
  paid: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
  issued: 'border-teal-400/40 bg-teal-400/10 text-teal-700 dark:text-teal-200',
  partially_paid: 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
  cancelled: 'border-foreground/15 bg-foreground/[0.04] text-foreground/70',
  expired: 'border-rose-400/40 bg-rose-400/10 text-rose-700 dark:text-rose-200',
  draft: 'border-foreground/15 bg-foreground/[0.04] text-foreground/70',
};

// ─── Plans & features comparison ────────────────────────────────────
/**
 * Read-only plan comparison. Uses the same PlanCard as the Subscription picker
 * so the two surfaces can never drift; acting on a plan lives on /subscription.
 */
function PlansSection({ plans, currentKey }: { plans: Plan[]; currentKey: string | null }) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  if (plans.length === 0) return null;
  return (
    <motion.div variants={fadeUp}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Plans</div>
          <div className="text-sm font-medium text-foreground">Compare plans &amp; features</div>
        </div>
        <div className="flex items-center gap-3">
          <CycleToggle cycle={cycle} onChange={setCycle} />
          <Link
            to="/subscription"
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05]"
          >
            Manage <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.key} plan={p} cycle={cycle} currentKey={currentKey as PlanKey | null} />
        ))}
      </div>
    </motion.div>
  );
}

function InvoiceListRow({ inv, downloading, onDownload }: { inv: ServerInvoice; downloading: boolean; onDownload: () => void }) {
  const chip = INVOICE_CHIP[inv.status] ?? INVOICE_CHIP.draft;
  return (
    <li className="grid grid-cols-2 items-center gap-4 border-b border-foreground/[0.04] px-5 py-3.5 last:border-0 md:grid-cols-[1.4fr_1fr_1fr_120px_120px]">
      <div className="min-w-0">
        <div className="truncate font-mono text-xs text-foreground/85">{inv.invoice_number ?? inv.id.slice(0, 8)}</div>
        <div className="text-[11px] capitalize text-foreground/75 dark:text-foreground/60">
          {inv.razorpay_invoice_id ? 'Subscription' : 'Top-up'}
        </div>
      </div>
      <div className="hidden text-xs text-foreground/80 dark:text-foreground/65 md:block">{formatDate(inv.issued_at ?? inv.created_at)}</div>
      <div className="tabular-nums text-sm font-medium text-foreground">₹{formatRupees(inv.amount_paise, { fractionDigits: 0 })}</div>
      <div>
        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em]', chip)}>
          {inv.status.replace('_', ' ')}
        </span>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-foreground/[0.06] disabled:opacity-50"
        >
          {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          PDF
        </button>
      </div>
    </li>
  );
}

const SEVERITY_DOT: Record<string, string> = {
  info: 'bg-teal-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  critical: 'bg-rose-400',
};

function NotificationItem({ n }: { n: BillingNotification }) {
  return (
    <li className={cn('flex items-start gap-3 px-5 py-3.5', !n.read_at && 'bg-foreground/[0.015]')}>
      <span className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', SEVERITY_DOT[n.severity] ?? SEVERITY_DOT.info)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{n.title}</div>
        {n.body && <div className="mt-0.5 text-xs text-foreground/70 dark:text-foreground/55">{n.body}</div>}
      </div>
      <div className="flex-shrink-0 text-[11px] text-foreground/40">{formatDate(n.created_at)}</div>
    </li>
  );
}

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName, initials };
}
