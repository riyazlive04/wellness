import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Download, FileText, Loader2, Wallet } from 'lucide-react';
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
  const due = rows.filter((i) => i.status === 'sent').reduce((s, i) => s + i.total_paise, 0);

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
                    <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
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

                      <span className="flex-shrink-0 text-sm font-semibold tabular-nums">
                        {inr(inv.total_paise)}
                      </span>

                      <button
                        type="button"
                        onClick={() => void download(inv)}
                        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-foreground/[0.05]"
                      >
                        <Download className="h-3.5 w-3.5" /> PDF
                      </button>
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
