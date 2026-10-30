import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CalendarClock, Download, FileText, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type PracticeInvoice } from '@/modules/workspace/api/clients';
import { generatePracticeInvoicePdf } from '@/modules/workspace/clients/practiceInvoicePdf';
import { cn } from '@/lib/utils';

/** ₹ with Indian grouping; paise only when they are not zero. */
const inr = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
      })
    : '—';

/**
 * Invoices the client's own nutritionist issued them.
 *
 * Read-only on purpose: the practice collects the money directly, so there is
 * nothing to pay here. The client's job is to see what they owe and keep a
 * copy - hence the download.
 *
 * Drafts never reach this screen; the server filters them out, so an invoice
 * the practice is still writing cannot appear half-finished.
 */
export default function ClientInvoices() {
  const profileQ = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => clientsApi.myProfile(),
    retry: 1,
  });

  const q = useQuery({
    queryKey: ['me', 'invoices'],
    queryFn: () => clientsApi.myInvoices(),
  });

  const rows = q.data ?? [];
  // What is still owed, not what was billed: an invoice part-paid with a
  // deposit would otherwise be counted at its full value and tell the client
  // they owe money they have already handed over.
  const due = rows
    .filter((i) => i.status === 'sent')
    .reduce((s, i) => s + (i.balance_paise ?? i.total_paise), 0);

  async function download(inv: PracticeInvoice) {
    try {
      await generatePracticeInvoicePdf(inv, { clientName: profileQ.data?.name ?? null });
    } catch {
      toast.error('Could not build the PDF.');
    }
  }

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">

          <motion.div variants={fadeUp}>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">
              Billing
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-[28px]">Invoices</h1>
            <p className="mt-1 text-sm text-foreground/55">
              What your nutritionist has charged you. Pay them directly — this page is your record.
            </p>
          </motion.div>

          {due > 0 && (
            <motion.div variants={fadeUp}>
              <Glass className="flex flex-wrap items-center gap-3 border-amber-400/30 bg-amber-400/[0.06] px-5 py-3.5">
                <Wallet className="h-4 w-4 flex-shrink-0 text-amber-700 dark:text-amber-300" />
                <span className="text-sm">
                  <b className="tabular-nums">{inr(due)}</b> outstanding
                </span>
                <span className="text-[11px] text-foreground/55">
                  Ask your nutritionist how they would like to be paid.
                </span>
              </Glass>
            </motion.div>
          )}

          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden">
              {q.isLoading ? (
                <div className="grid place-items-center py-14">
                  <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
                </div>
              ) : q.isError ? (
                <p className="px-5 py-12 text-center text-sm text-foreground/55">
                  Could not load your invoices just now.
                </p>
              ) : rows.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <FileText className="mx-auto h-6 w-6 text-foreground/25" />
                  <p className="mt-3 text-sm text-foreground/55">
                    No invoices yet.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-foreground/[0.04]">
                  {rows.map((inv) => (
                    <li key={inv.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums">
                            {inv.display_number}
                          </span>
                          <StatusPill status={inv.status} />
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-foreground/55">
                          {inv.items[0]?.description ?? 'Invoice'}
                          {inv.items.length > 1 ? ` and ${inv.items.length - 1} more` : ''}
                          {' · '}
                          {inv.status === 'paid'
                            ? `paid ${when(inv.paid_at)}`
                            : inv.due_at
                              ? `due ${when(inv.due_at)}`
                              : when(inv.issued_at)}
                        </div>
                      </div>

                      <div className="flex-shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums">
                          {inr(inv.total_paise)}
                        </div>
                        {/* Part-paid: show the client what has landed and what
                            is left, so the running balance in their portal
                            matches the invoice PDF. */}
                        {inv.paid_paise > 0 && inv.balance_paise > 0 && (
                          <div className="text-[10px] tabular-nums text-amber-700 dark:text-amber-300">
                            {inr(inv.paid_paise)} paid · {inr(inv.balance_paise)} left
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void download(inv)}
                        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-foreground/[0.05]"
                      >
                        <Download className="h-3.5 w-3.5" /> PDF
                      </button>
                    </div>

                    {/* The payment plan, if the practice set one. Voided
                        invoices are left alone: a cancelled bill has no
                        schedule to keep. */}
                    {inv.status !== 'void' && <SchedulePanel invoiceId={inv.id} />}
                    </li>
                  ))}
                </ul>
              )}
            </Glass>
          </motion.div>
        </motion.div>
      </div>
    </ClientLayout>
  );
}

/**
 * The client's own EMI schedule for one invoice.
 *
 * The practice could already split a bill into instalments, but the client
 * could not see the result - their portal showed one lump sum and a line
 * telling them to ask their nutritionist how to pay. So the person actually
 * making the payments had to message someone to find out when the next one
 * was due, which is exactly the chasing the schedule was meant to remove.
 *
 * Renders nothing at all when there is no schedule, which is most invoices:
 * a single-payment bill should not grow an empty "payment plan" heading.
 *
 * Read-only on purpose. A client who cannot meet a date should message their
 * practitioner, who can extend it; letting the client move their own due
 * dates would make the schedule meaningless.
 */
function SchedulePanel({ invoiceId }: { invoiceId: string }) {
  const q = useQuery({
    queryKey: ['me', 'invoice', invoiceId, 'instalments'],
    queryFn: () => clientsApi.myInvoiceInstalments(invoiceId),
    // The schedule changes only when the practice edits it, which is rare.
    staleTime: 60_000,
    retry: 1,
  });

  const parts = q.data ?? [];
  // Silent on failure as well as when empty: a schedule that cannot be
  // fetched must not turn the invoice list into an error page, because the
  // invoice itself above is still correct and still downloadable.
  if (parts.length === 0) return null;

  const paidCount = parts.filter((p) => p.balance_paise === 0).length;
  // The next thing they actually have to pay - the earliest unpaid part.
  const next = parts.find((p) => p.balance_paise > 0) ?? null;

  return (
    <div className="mt-3 rounded-2xl border border-foreground/[0.07] bg-foreground/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="h-3.5 w-3.5 flex-shrink-0 text-foreground/45" />
        <span className="text-[11px] font-semibold text-foreground/75">
          Payment plan
        </span>
        <span className="text-[11px] tabular-nums text-foreground/50">
          {paidCount} of {parts.length} paid
        </span>
        {next && (
          <span className={cn(
            'ml-auto rounded-full border px-2 py-0.5 text-[10px] tabular-nums',
            next.overdue
              ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
              : 'border-foreground/15 bg-foreground/[0.04] text-foreground/65',
          )}>
            {next.overdue ? 'Overdue: ' : 'Next: '}
            {inr(next.balance_paise)} on {when(next.due_at)}
          </span>
        )}
      </div>

      <ul className="mt-2 space-y-1">
        {parts.map((p) => {
          const settled = p.balance_paise === 0;
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]"
            >
              <span className="w-10 flex-shrink-0 tabular-nums text-foreground/45">
                {p.seq}/{parts.length}
              </span>
              <span className={cn(
                'tabular-nums',
                settled ? 'text-foreground/45 line-through' : 'font-medium text-foreground/85',
              )}>
                {inr(p.amount_paise)}
              </span>
              <span className={cn(
                'tabular-nums',
                p.overdue ? 'text-red-700 dark:text-red-300' : 'text-foreground/55',
              )}>
                {settled ? 'paid' : `due ${when(p.due_at)}`}
              </span>
              {/* Part-paid instalment: without this the row reads as unpaid
                  and a client who has already sent half would think it was
                  never received. */}
              {!settled && p.paid_paise > 0 && (
                <span className="tabular-nums text-amber-700 dark:text-amber-300">
                  {inr(p.paid_paise)} received, {inr(p.balance_paise)} left
                </span>
              )}
              {/* Say so when a date moved, so the client trusts the dates
                  they are looking at rather than the ones they remember. */}
              {p.extended_count > 0 && !settled && (
                <span className="text-foreground/40">
                  (moved from {when(p.original_due_at)})
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 'sent' reads as "Due" to the client - what matters is that they owe it. */
function StatusPill({ status }: { status: PracticeInvoice['status'] }) {
  const map = {
    sent: { label: 'Due', cls: 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200' },
    paid: { label: 'Paid', cls: 'border-teal-400/40 bg-teal-400/10 text-teal-700 dark:text-teal-200' },
    void: { label: 'Cancelled', cls: 'border-foreground/15 bg-foreground/[0.04] text-foreground/45' },
    draft: { label: '', cls: '' }, // never reaches the client
  }[status];

  if (!map.label) return null;
  return (
    <span className={cn(
      'rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]',
      map.cls,
    )}>
      {map.label}
    </span>
  );
}
