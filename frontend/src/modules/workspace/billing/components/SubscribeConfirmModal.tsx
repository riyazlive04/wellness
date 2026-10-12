import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  BadgeCheck, CalendarClock, Check, CreditCard, FileText, Info, Loader2, Lock, Sparkles, Ticket, Video, X,
} from 'lucide-react';

import type { BillingCycle } from '@/modules/workspace/billing/PlanCard';
import type { Plan } from '@/modules/workspace/billing/api';
import { cn } from '@/lib/utils';

interface SubscribeConfirmModalProps {
  target: Plan;
  cycle: BillingCycle;
  /** Soft/current plan label (e.g. starter from workspace.plan) — not a Razorpay sub. */
  softCurrentPlanName?: string | null;
  /** Setup fee already paid; the backend charges only the unpaid difference. */
  setupPaid?: { paidInr: number; legacyPaid: boolean };
  pending?: boolean;
  /** A checked coupon: what is charged instead, and its code. */
  coupon?: { code: string; amountInr: number } | null;
  /** The coupon field, shown under the payment summary. */
  couponSlot?: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
/** Prices include 18% GST; this is the GST inside a total. */
const gstIn = (total: number) => Math.round((total - total / 1.18) * 100) / 100;

const ACCENT: Record<string, string> = {
  green: 'from-[#5f9e1e] to-[#8cc63f]',
  blue: 'from-[#2f8f46] to-[#4fae5f]',
  purple: 'from-[#1f5a2c] to-[#2f8f46]',
};

/**
 * Pre-checkout summary for a new subscription: what the plan includes, what
 * is charged today (plan, setup fee, GST inside), when the next charge falls,
 * and how payment works — so the Razorpay total is never a surprise.
 */
export function SubscribeConfirmModal({
  target,
  cycle,
  softCurrentPlanName,
  setupPaid,
  pending,
  coupon,
  couponSlot,
  onClose,
  onConfirm,
}: SubscribeConfirmModalProps) {
  const annual = cycle === 'annual' && target.priceInrAnnual != null;
  const recurring = annual ? target.priceInrAnnual! : target.priceInr;
  const planFee = target.setupFeeInr ?? 0;
  // Mirrors backend/src/billing/setup-fee.ts: pay only what isn't covered yet.
  const setup = setupPaid?.legacyPaid ? 0 : Math.max(0, planFee - (setupPaid?.paidInr ?? 0));
  const covered = planFee - setup;
  const dueNow = coupon ? coupon.amountInr : recurring + setup;
  const nextAmount = coupon ? coupon.amountInr : recurring;
  const period = annual ? 'year' : 'month';
  const today = new Date();
  const next = new Date(today);
  if (annual) next.setFullYear(next.getFullYear() + 1); else next.setMonth(next.getMonth() + 1);
  const monthlyEquivalent = annual ? Math.round(recurring / 12) : null;
  const yearlySaving = annual ? target.priceInr * 12 - recurring : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pending) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  // Portalled to <body> so the backdrop covers the whole screen, sidebar included.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Start ${target.name}`}>
      {/* See-through, dimmed backdrop: the page stays visible behind. */}
      <motion.button
        type="button"
        aria-label="Close"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[3px]"
        onClick={() => { if (!pending) onClose(); }}
      />
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        {/* Header */}
        <div className={cn('relative bg-gradient-to-br px-6 py-5 text-white', ACCENT[target.accent ?? 'green'] ?? ACCENT.green)}>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/75">You're starting</div>
          <div className="mt-0.5 text-2xl font-extrabold tracking-tight">{target.name} · {annual ? 'Yearly' : 'Monthly'}</div>
          <div className="text-sm text-white/85">{target.promise ?? target.tagline}</div>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-[1.1fr_1fr]">
          {/* What you get */}
          <div className="space-y-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/45">What's included</div>
              <ul className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
                {target.features.slice(0, 10).map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-[12.5px] text-foreground/80">
                    <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
                    <span className="leading-snug">{f}</span>
                  </li>
                ))}
              </ul>
              {target.features.length > 10 && (
                <div className="mt-1.5 text-[11.5px] text-foreground/50">+ {target.features.length - 10} more</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {target.aiCreditsPerMonth != null && (
                <Allowance icon={Sparkles} label="AI credits" value={target.aiCreditsPerMonth.toLocaleString('en-IN')} sub="every month" />
              )}
              {target.videoHoursPerMonth !== undefined && (
                <Allowance
                  icon={Video}
                  label="Video calls"
                  value={target.videoHoursPerMonth == null ? 'Unlimited' : target.videoHoursPerMonth === 0 ? 'Not included' : `${target.videoHoursPerMonth} h`}
                  sub={target.videoHoursPerMonth ? 'every month' : ''}
                />
              )}
            </div>

            {!coupon && setup > 0 && (target.setupIncludes?.length ?? 0) > 0 && (
              <div className="rounded-2xl bg-foreground/[0.03] p-3.5">
                <div className="text-[12px] font-bold">One-time setup includes</div>
                <div className="mt-1 text-[12px] text-foreground/65">{target.setupIncludes!.join(' · ')}</div>
              </div>
            )}
          </div>

          {/* Payment summary */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-foreground/[0.08] p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/45">Payment summary</div>
              <div className="mt-3 space-y-2 text-sm">
                <Line label={`${target.name} (${period}ly)`} value={inr(recurring)} />
                {monthlyEquivalent != null && (
                  <p className="-mt-1 text-[11.5px] text-emerald-600 dark:text-emerald-400">
                    {inr(monthlyEquivalent)}/month · you save {inr(yearlySaving)} a year
                  </p>
                )}
                {!coupon && setup > 0 && (
                  <Line label={covered > 0 ? 'Setup fee (difference)' : 'One-time setup fee'} value={inr(setup)} />
                )}
                {!coupon && planFee > 0 && covered > 0 && (
                  <p className="text-[11.5px] text-foreground/55">
                    {setup === 0 ? 'Setup fee already paid - not charged again.' : `${inr(covered)} already paid on your earlier plan.`}
                  </p>
                )}
                {coupon && (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-700 dark:text-emerald-300">
                    <span className="inline-flex items-center gap-1.5 font-semibold"><Ticket className="h-3.5 w-3.5" />Coupon {coupon.code.toUpperCase()}</span>
                    <span>{inr(coupon.amountInr)} instead, no setup fee</span>
                  </div>
                )}
                <div className="my-1 border-t border-dashed border-foreground/[0.12]" />
                <Line label="GST (18%, included)" value={inr(gstIn(dueNow))} muted />
                <div className="flex items-baseline justify-between gap-3 pt-1">
                  <span className="text-sm font-bold">Due today</span>
                  <span className="text-2xl font-extrabold tabular-nums">{inr(dueNow)}</span>
                </div>
              </div>
            </div>

            {couponSlot && (
              <div className="rounded-2xl bg-foreground/[0.03] p-3.5">
                <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold"><Ticket className="h-3.5 w-3.5" />Have a coupon code?</div>
                {couponSlot}
              </div>
            )}

            <div className="space-y-2 text-[12.5px] text-foreground/70">
              <Fact icon={CalendarClock}>
                Charged today, {fmtDate(today)}. Next: <b className="text-foreground">{inr(nextAmount)}</b> on {fmtDate(next)}, then every {period}.
              </Fact>
              <Fact icon={CreditCard}>Pay with UPI, card or net banking on Razorpay's secure checkout. UPI and cards renew automatically.</Fact>
              <Fact icon={FileText}>A GST invoice is added to Billing → Invoices after each payment.</Fact>
              <Fact icon={BadgeCheck}>Cancel any time from Billing; you keep the plan until the period you paid for ends.</Fact>
            </div>

            {softCurrentPlanName && (
              <div className="flex gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-3 text-[12px] text-amber-900 dark:text-amber-100">
                <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <p>
                  This starts a new {target.name} subscription; unused {softCurrentPlanName} days are not deducted.
                  After this payment, later plan changes charge only the difference.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/[0.06] px-6 py-4">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-foreground/50">
            <Lock className="h-3.5 w-3.5" /> Secured by Razorpay. NUSI never sees your card details.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-full px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/[0.05] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#2f8f46] to-[#6fb84f] px-5 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Continue to payment · {inr(dueNow)}
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn('text-foreground/75', muted && 'text-[12.5px] text-foreground/55')}>{label}</span>
      <span className={cn('tabular-nums', muted ? 'text-[12.5px] text-foreground/60' : 'font-semibold text-foreground')}>{value}</span>
    </div>
  );
}

function Allowance({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-foreground/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-foreground/50"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-0.5 text-lg font-extrabold tabular-nums">{value}</div>
      {sub && <div className="text-[10.5px] text-foreground/45">{sub}</div>}
    </div>
  );
}

function Fact({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[hsl(var(--brand-blue))]" />
      <span className="leading-snug">{children}</span>
    </div>
  );
}
