import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Crown, Loader2, Sparkles, TrendingUp, User } from 'lucide-react';
import type { ComponentType } from 'react';

import { fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { billingApi, type Plan } from '@/modules/workspace/billing/api';
import { CycleToggle, type BillingCycle } from '@/modules/workspace/billing/PlanCard';
import { useOnboarding } from '../OnboardingContext';

/**
 * Onboarding plan picker — a COMPACT, selectable card (icon, price, a few
 * highlights, radio-style selected state). Deliberately NOT the full marketing
 * PlanCard (long feature lists / setup fees / total-value boxes) — that belongs
 * on the pricing & billing pages, and overwhelms the onboarding step.
 * The choice is presentational; finish() starts the free trial.
 */

const ACCENT = {
  green:  { ring: 'ring-emerald-500/50', border: 'border-emerald-400/60', soft: 'bg-emerald-500/[0.05]', iconBg: 'bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-600', text: 'text-emerald-700 dark:text-emerald-300' },
  blue:   { ring: 'ring-blue-500/50',    border: 'border-blue-400/60',    soft: 'bg-blue-500/[0.05]',    iconBg: 'bg-blue-500/10',    icon: 'text-blue-600 dark:text-blue-400',    dot: 'bg-blue-600',    text: 'text-blue-700 dark:text-blue-300' },
  purple: { ring: 'ring-purple-500/50',  border: 'border-purple-400/60',  soft: 'bg-purple-500/[0.05]',  iconBg: 'bg-purple-500/10',  icon: 'text-purple-600 dark:text-purple-400',dot: 'bg-purple-600',  text: 'text-purple-700 dark:text-purple-300' },
} as const;

const TIER_ICON: Record<string, ComponentType<{ className?: string }>> = {
  starter: User, growth: TrendingUp, scale_pro: Crown,
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export function StepPlan() {
  const { draft, set } = useOnboarding();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  const plansQ = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: billingApi.listPlans,
    staleTime: 5 * 60 * 1000,
  });

  if (plansQ.isLoading) {
    return (
      <div className="flex justify-center py-16 text-foreground/50">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const plans = plansQ.data?.plans ?? [];
  if (plans.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-foreground/60">
        Plans couldn’t be loaded right now — you can pick one later from Subscription.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <CycleToggle cycle={cycle} onChange={setCycle} />
      </div>

      <motion.div
        variants={stagger(0.05, 0.06)}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {plans.map((plan) => (
          <motion.div key={plan.key} variants={fadeUp}>
            <CompactPlanCard
              plan={plan}
              cycle={cycle}
              selected={draft.planId === plan.key}
              onSelect={(p) => set('planId', p.key)}
            />
          </motion.div>
        ))}
      </motion.div>

      <p className="text-center text-xs text-foreground/50">
        All plans start with a 14-day free trial. You can change or cancel anytime.
      </p>
    </div>
  );
}

function CompactPlanCard({
  plan, cycle, selected, onSelect,
}: {
  plan: Plan;
  cycle: BillingCycle;
  selected: boolean;
  onSelect: (p: Plan) => void;
}) {
  const a = ACCENT[plan.accent ?? 'blue'];
  const Icon = TIER_ICON[plan.key] ?? Sparkles;
  const annual = plan.priceInrAnnual ?? null;
  const showAnnual = cycle === 'annual' && annual != null;
  const price = showAnnual ? annual : plan.priceInr;
  const saving = annual != null ? plan.priceInr * 12 - annual : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(plan)}
      aria-pressed={selected}
      className={cn(
        'relative flex h-full w-full flex-col rounded-2xl border p-5 text-left transition-all duration-200',
        selected
          ? cn(a.border, a.soft, 'ring-2 shadow-md', a.ring)
          : 'border-foreground/10 bg-canvas hover:border-foreground/25 hover:shadow-sm',
      )}
    >
      {plan.recommended && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-950 shadow-sm">
          ★ Popular
        </span>
      )}

      {/* Radio + tier */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn('grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl', a.iconBg)}>
            <Icon className={cn('h-4.5 w-4.5', a.icon)} />
          </span>
          <div className="min-w-0">
            <div className="text-base font-bold leading-tight">{plan.name}</div>
            <div className="truncate text-[11px] text-foreground/55">{plan.tagline}</div>
          </div>
        </div>
        <span className={cn(
          'mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border-2 transition-colors',
          selected ? cn(a.dot, 'border-transparent text-white') : 'border-foreground/25',
        )}>
          {selected && <Check className="h-3 w-3" strokeWidth={3.5} />}
        </span>
      </div>

      {/* Price */}
      <div className="mt-4 flex items-end gap-1">
        <span className="text-2xl font-extrabold tabular-nums">{inr(price)}</span>
        <span className="pb-0.5 text-xs text-foreground/55">/{showAnnual ? 'yr' : 'mo'}</span>
      </div>
      {annual != null && (
        <div className="mt-0.5 text-[11px] text-foreground/50">
          {showAnnual
            ? <>or {inr(plan.priceInr)}/mo</>
            : <>or {inr(annual)}/yr <span className={cn('font-semibold', a.text)}>· save {inr(saving)}</span></>}
        </div>
      )}

      {/* Features — full list */}
      <div className="mt-4 space-y-1.5 border-t border-foreground/[0.06] pt-4">
        {plan.features.map((f) => (
          <div key={f} className="flex items-start gap-2 text-xs text-foreground/75">
            <Check className={cn('mt-[3px] h-3 w-3 flex-shrink-0', a.icon)} strokeWidth={3} />
            <span className="leading-snug">{f}</span>
          </div>
        ))}
      </div>
    </button>
  );
}
