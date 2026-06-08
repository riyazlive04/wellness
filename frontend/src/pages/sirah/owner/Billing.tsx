import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Receipt, Wallet, FileText, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { InvoiceRow } from '@/modules/workspace/billing/components/InvoiceRow';
import {
  MOCK_INVOICES,
  MOCK_SUBSCRIPTION,
  MOCK_SUBSCRIPTION_PAST_DUE,
} from '@/modules/workspace/billing/data/mockBilling';
import { daysUntil, formatDate, formatRupees } from '@/modules/workspace/billing/helpers';

export default function OwnerBilling() {
  const workspace = readWorkspace();
  const [simulateFailed, setSimulateFailed] = useState(false);

  const subscription = simulateFailed ? MOCK_SUBSCRIPTION_PAST_DUE : MOCK_SUBSCRIPTION;

  // Totals
  const totals = useMemo(() => {
    return MOCK_INVOICES.reduce(
      (acc, inv) => {
        acc.lifetime += inv.totalAmount;
        if (inv.status === 'paid') acc.paid += inv.totalAmount;
        if (inv.status === 'issued') acc.outstanding += inv.totalAmount;
        if (inv.status === 'failed') acc.outstanding += inv.totalAmount;
        return acc;
      },
      { lifetime: 0, paid: 0, outstanding: 0 },
    );
  }, []);

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={null}
      topbarContext="Billing · GST-compliant invoices"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header + demo toggle */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Billing</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                Invoices & payments
              </h1>
              <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">
                GST-compliant invoices, paid via Razorpay. Auto-generated each cycle.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setSimulateFailed((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/80 dark:text-foreground/65 hover:bg-foreground/[0.06]"
                title="Toggle this to preview the failed-payment recovery design"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${simulateFailed ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                Demo: {simulateFailed ? 'failed payment' : 'healthy'}
              </button>
              <Link
                to="/subscription"
                className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-4 py-2 text-sm text-foreground/85 transition-colors hover:bg-foreground/[0.06]"
              >
                Manage subscription
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </motion.div>

          {/* Failed payment recovery banner */}
          {subscription.status === 'past_due' && (
            <motion.div variants={fadeUp}>
              <Glass className="overflow-hidden border-rose-400/30 bg-rose-400/[0.05]">
                <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-rose-400/15 text-rose-700 dark:text-rose-300">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Payment failed — please update your card
                      </div>
                      <div className="mt-0.5 text-xs text-foreground/80 dark:text-foreground/65">
                        We tried twice and couldn't charge your saved card. Your workspace is in a{' '}
                        <span className="text-foreground/85">11-day grace period</span> ending{' '}
                        {subscription.graceEndsAt && formatDate(subscription.graceEndsAt)}. After that,
                        the workspace becomes read-only until payment resumes.
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-200/70">
                        <span className="rounded-full bg-rose-400/15 px-2 py-0.5">Day 3 reminder sent</span>
                        <span className="rounded-full bg-rose-400/15 px-2 py-0.5">Day 7 reminder pending</span>
                        <span className="rounded-full bg-foreground/[0.04] px-2 py-0.5 text-foreground/75 dark:text-foreground/55">Day 14 final notice</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toast.success('Retry initiated. (Wires to Razorpay retry API.)')}
                      className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-400/10 px-4 py-2 text-xs font-medium text-rose-100 transition-colors hover:bg-rose-400/15"
                    >
                      Retry charge
                    </button>
                    <button
                      type="button"
                      onClick={() => toast('Razorpay checkout opens when wired.')}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-rose-500 to-rose-400 px-4 py-2 text-xs font-medium text-foreground"
                    >
                      Update card
                    </button>
                  </div>
                </div>
              </Glass>
            </motion.div>
          )}

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPICard
              icon={Wallet}
              label="Lifetime"
              value={`₹${formatRupees(totals.lifetime, { fractionDigits: 0 })}`}
              hint={`${MOCK_INVOICES.length} invoices`}
              accent="indigo"
            />
            <KPICard
              icon={CheckCircle2}
              label="Paid"
              value={`₹${formatRupees(totals.paid, { fractionDigits: 0 })}`}
              hint="all settled cycles"
              accent="sage"
            />
            <KPICard
              icon={FileText}
              label="Outstanding"
              value={`₹${formatRupees(totals.outstanding, { fractionDigits: 0 })}`}
              hint={`${MOCK_INVOICES.filter((i) => i.status === 'issued' || i.status === 'failed').length} pending`}
              accent={totals.outstanding > 0 ? 'sand' : 'sage'}
            />
          </motion.div>

          {/* Current plan strip */}
          <motion.div variants={fadeUp}>
            <Glass className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600/25 to-fuchsia-500/20 text-violet-700 dark:text-violet-200">
                  <Receipt className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                    Current plan
                  </div>
                  <div className="mt-0.5 text-base font-medium text-foreground">
                    {subscription.planName} · ₹{formatRupees(subscription.pricePaise, { fractionDigits: 0 })}/mo
                  </div>
                </div>
              </div>
              <div className="text-xs text-foreground/75 dark:text-foreground/55">
                Next invoice on{' '}
                <span className="text-foreground/85">{formatDate(subscription.currentPeriodEnd)}</span>
                {' · '}
                {daysUntil(subscription.currentPeriodEnd)} days
              </div>
            </Glass>
          </motion.div>

          {/* Invoices table */}
          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                <div>
                  <div className="text-sm font-medium text-foreground">Invoices</div>
                  <div className="text-xs text-foreground/75 dark:text-foreground/60">Tap a row to see the GST breakdown</div>
                </div>
                <button
                  type="button"
                  onClick={() => toast.success('Exporting CSV of all invoices…')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.06]"
                >
                  Export CSV
                </button>
              </div>

              {/* Header */}
              <div className="hidden grid-cols-[1.4fr_1fr_1fr_140px_24px] gap-4 border-b border-foreground/[0.04] px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55 md:grid">
                <div>Invoice</div>
                <div>Date</div>
                <div>Amount</div>
                <div>Status</div>
                <div></div>
              </div>

              <ul>
                {MOCK_INVOICES.map((inv) => (
                  <InvoiceRow key={inv.id} invoice={inv} />
                ))}
              </ul>
            </Glass>
          </motion.div>

          {/* Footer */}
          <motion.div variants={fadeUp} className="text-[11px] text-foreground/35">
            Invoices include CGST + SGST for intra-state customers (Karnataka workspace) and IGST
            for inter-state. PDFs are stored in your private Supabase Storage bucket.
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

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

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}
