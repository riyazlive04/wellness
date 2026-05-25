import { useState } from 'react';
import { ChevronDown, Download, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import type { Invoice } from '../types';
import { INVOICE_STATUS_META, formatDate, formatRupees } from '../helpers';

interface InvoiceRowProps {
  invoice: Invoice;
}

export function InvoiceRow({ invoice }: InvoiceRowProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = INVOICE_STATUS_META[invoice.status];
  const interState = invoice.igstAmount > 0;

  return (
    <li className="border-b border-foreground/[0.04] last:border-0">
      {/* Compact row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="grid w-full grid-cols-[1.4fr_1fr_1fr_140px_24px] items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-foreground/[0.02]"
      >
        <div>
          <div className="font-mono text-xs text-foreground/85">{invoice.number}</div>
          <div className="text-[11px] text-foreground/60">{invoice.planName} plan</div>
        </div>
        <div className="text-xs text-foreground/65">{formatDate(invoice.issuedAt)}</div>
        <div className="tabular-nums text-sm font-medium text-foreground">
          ₹{formatRupees(invoice.totalAmount, { fractionDigits: 0 })}
        </div>
        <div>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em]', meta.chip)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
            {meta.label}
          </span>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-foreground/55 transition-transform', expanded && 'rotate-180')} />
      </button>

      {/* Expanded detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-4 border-t border-foreground/[0.04] px-5 py-4 md:grid-cols-[1fr_auto]">
              {/* GST breakdown */}
              <dl className="space-y-1.5 text-xs">
                <Row label="Base amount"   value={`₹${formatRupees(invoice.baseAmount)}`} />
                {interState ? (
                  <Row label="IGST (18%)"  value={`₹${formatRupees(invoice.igstAmount)}`} />
                ) : (
                  <>
                    <Row label="CGST (9%)" value={`₹${formatRupees(invoice.cgstAmount)}`} />
                    <Row label="SGST (9%)" value={`₹${formatRupees(invoice.sgstAmount)}`} />
                  </>
                )}
                <Row
                  label="Total"
                  value={`₹${formatRupees(invoice.totalAmount)}`}
                  emphasis
                />
                {invoice.paymentRef && (
                  <Row label="Razorpay ref" value={invoice.paymentRef} mono />
                )}
                {invoice.paidAt && (
                  <Row label="Paid on" value={formatDate(invoice.paidAt)} />
                )}
              </dl>

              {/* Actions */}
              <div className="flex flex-col gap-2 md:items-end">
                <button
                  type="button"
                  onClick={() => toast.success(`Downloading ${invoice.number}.pdf`)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3.5 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-foreground/[0.06]"
                >
                  <Download className="h-3 w-3" />
                  Download PDF
                </button>
                {invoice.paymentRef && (
                  <button
                    type="button"
                    onClick={() => toast(`Razorpay: ${invoice.paymentRef}`, { description: 'Opens the receipt in Razorpay dashboard when wired.' })}
                    className="inline-flex items-center gap-1.5 text-xs text-foreground/55 hover:text-foreground"
                  >
                    View on Razorpay
                    <ExternalLink className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function Row({
  label,
  value,
  emphasis,
  mono,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-foreground/55">{label}</dt>
      <dd
        className={cn(
          'tabular-nums',
          mono && 'font-mono',
          emphasis ? 'text-base font-semibold text-foreground' : 'text-foreground/85',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
