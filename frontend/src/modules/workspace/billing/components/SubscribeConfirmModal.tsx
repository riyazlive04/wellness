import { motion } from 'framer-motion';
import { X, Loader2, CreditCard, Info } from 'lucide-react';

import { Glass } from '@/design-system';
import type { BillingCycle } from '@/modules/workspace/billing/PlanCard';
import type { Plan } from '@/modules/workspace/billing/api';
import { cn } from '@/lib/utils';

interface SubscribeConfirmModalProps {
  target: Plan;
  cycle: BillingCycle;
  /** Soft/current plan label (e.g. starter from workspace.plan) — not a Razorpay sub. */
  softCurrentPlanName?: string | null;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * Pre-checkout confirmation for a *new* subscription (not a mid-cycle plan
 * change). Spells out monthly + setup fee so the Razorpay total is never a
 * surprise, and clarifies that unused days on a label-only "current plan"
 * are not credited — prorated upgrades need an active Razorpay subscription.
 */
export function SubscribeConfirmModal({
  target,
  cycle,
  softCurrentPlanName,
  pending,
  onClose,
  onConfirm,
}: SubscribeConfirmModalProps) {
  const annual = cycle === 'annual' && target.priceInrAnnual != null;
  const recurring = annual ? target.priceInrAnnual! : target.priceInr;
  const setup = target.setupFeeInr ?? 0;
  const dueNow = recurring + setup;
  const period = annual ? 'year' : 'month';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <Glass variant="heavy" className="overflow-hidden p-0 shadow-2xl">
          <div className="flex items-center justify-between border-b border-foreground/[0.08] px-5 py-4">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-teal-400/15 text-teal-700 dark:text-teal-300">
                <CreditCard className="h-4 w-4" />
              </div>
              <div className="text-sm font-semibold">Start {target.name}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div className="space-y-2.5 text-sm">
              <Line label={`${target.name} / ${period}`} value={inr(recurring)} />
              {setup > 0 && (
                <Line label="One-time setup fee" value={inr(setup)} muted />
              )}
              <div className="my-2 border-t border-foreground/[0.08]" />
              <Line label="Due now (new subscription)" value={inr(dueNow)} emphasis />
              <p className="text-xs text-foreground/60">
                Then {inr(recurring)} every {period}. Setup is charged once with the first payment.
              </p>
            </div>

            {softCurrentPlanName ? (
              <div className="flex gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-3 text-xs text-amber-900 dark:text-amber-100">
                <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <div>
                  <div className="font-medium">Not a prorated upgrade from {softCurrentPlanName}</div>
                  <p className="mt-1 text-amber-800/90 dark:text-amber-100/80">
                    There is no active paid Razorpay subscription to credit. Unused {softCurrentPlanName} days
                    are not deducted — this starts a full new {target.name} subscription. After this payment
                    succeeds, future plan switches use Upgrade and charge only the balance for days left.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex gap-2.5 rounded-xl bg-foreground/[0.03] p-3 text-xs text-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <p>
                  This opens Razorpay checkout for a new subscription. Mid-cycle upgrades with a balance-only
                  charge become available after your first paid plan is active.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="rounded-full px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.05] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-teal-600 to-teal-500 px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-60',
                )}
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                Continue to payment · {inr(dueNow)}
              </button>
            </div>
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}

function Line({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn('text-foreground/70', muted && 'text-foreground/55')}>{label}</span>
      <span className={cn('tabular-nums', emphasis ? 'text-base font-semibold text-foreground' : 'text-foreground/85')}>
        {value}
      </span>
    </div>
  );
}
