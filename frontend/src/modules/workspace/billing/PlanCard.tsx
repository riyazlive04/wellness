import { Check, Crown, Loader2, Rocket, Sparkles, TrendingUp, User } from 'lucide-react';
import type { ComponentType } from 'react';

import { cn } from '@/lib/utils';
import type { Plan, PlanKey } from './api';

export type BillingCycle = 'monthly' | 'annual';

/**
 * Pricing card — the single source of truth for how a plan is presented, used
 * by both the Subscription picker and the Billing page so they can never drift.
 * Mirrors the pricing sheet: colour-coded tier header, price (+ annual saving),
 * two-column feature list, AI-credits / total-value boxes, and the one-time
 * setup fee strip.
 */

/**
 * Per-tier palette, keyed by the plan's `accent` so the backend drives which
 * tier gets which. All three are NUSI's leaf greens (the --brand-* tokens),
 * stepping from light (Starter) through the brand gradient (Growth) to deep
 * green (Scale Pro).
 */
const BRAND_TEXT = 'text-[hsl(var(--brand-blue))] dark:text-lime-300';
const BRAND_SOFT = 'bg-[hsl(var(--brand-magenta))]/[0.08]';
const ACCENTS = {
  green: {
    header: 'from-[hsl(86_64%_40%)] to-[hsl(76_60%_46%)]',
    ring: 'ring-[hsl(var(--brand-magenta))]/40',
    soft: BRAND_SOFT,
    text: BRAND_TEXT,
    check: BRAND_TEXT,
    cta: 'bg-[hsl(86_64%_38%)] hover:bg-[hsl(86_64%_32%)]',
  },
  blue: {
    header: 'from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]',
    ring: 'ring-[hsl(var(--brand-magenta))]/50',
    soft: BRAND_SOFT,
    text: BRAND_TEXT,
    check: BRAND_TEXT,
    cta: 'bg-[hsl(var(--brand-blue))] hover:bg-[hsl(95_70%_24%)]',
  },
  purple: {
    header: 'from-[hsl(105_60%_15%)] to-[hsl(95_70%_27%)]',
    ring: 'ring-[hsl(var(--brand-blue))]/40',
    soft: BRAND_SOFT,
    text: BRAND_TEXT,
    check: BRAND_TEXT,
    cta: 'bg-[hsl(100_62%_20%)] hover:bg-[hsl(100_62%_15%)]',
  },
} as const;

const TIER_ICON: Record<string, ComponentType<{ className?: string }>> = {
  starter: User,
  growth: TrendingUp,
  scale_pro: Crown,
};

/** ₹ with Indian digit grouping (1,00,000) and no decimals. */
function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

interface PlanCardProps {
  plan: Plan;
  cycle: BillingCycle;
  /**
   * The workspace's active plan backed by a real (paid) subscription — renders
   * the card as "Current plan" AND disables its button.
   */
  currentKey?: PlanKey | null;
  /**
   * The workspace's active plan when it's only a soft/label plan (dev-activated
   * or trial fall-through, no paid Razorpay subscription). Marks the card as
   * current (ribbon + highlighted border) but KEEPS the button usable so the
   * owner can still pay to activate a real subscription.
   */
  softCurrentKey?: PlanKey | null;
  /** Omit to render a read-only card (e.g. the Billing page overview). */
  onSelect?: (plan: Plan) => void;
  pending?: boolean;
  /**
   * CTA text. The caller owns this because the action differs by context —
   * Subscribe / Upgrade / Downgrade / dev "Switch to". Defaults to "Choose X".
   */
  ctaLabel?: string;
  /** Label when this IS the active plan. "Selected" during onboarding. */
  currentLabel?: string;
  className?: string;
}

export function PlanCard({
  plan, cycle, currentKey, softCurrentKey, onSelect, pending, ctaLabel, currentLabel, className,
}: PlanCardProps) {
  const a = ACCENTS[plan.accent ?? 'blue'];
  const Icon = TIER_ICON[plan.key] ?? Sparkles;
  const isCurrent = currentKey === plan.key;
  // Soft current: this IS the active plan, but only as a label (no paid sub) —
  // still mark it, yet leave the button clickable so they can pay to activate.
  const isSoftCurrent = !isCurrent && softCurrentKey != null && softCurrentKey === plan.key;
  const markCurrent = isCurrent || isSoftCurrent;
  const annual = plan.priceInrAnnual ?? null;
  const showAnnual = cycle === 'annual' && annual != null;
  const price = showAnnual ? annual : plan.priceInr;
  // Two months free is the sheet's promise — show the real delta, not a claim.
  const saving = annual != null ? plan.priceInr * 12 - annual : 0;

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-canvas shadow-sm',
        // Current plan wins the ring over "recommended" so it reads as yours.
        markCurrent
          ? 'ring-2 ring-[hsl(var(--brand-magenta))] shadow-lg shadow-[hsl(var(--brand-magenta))]/10'
          : plan.recommended && `ring-2 ${a.ring}`,
        className,
      )}
    >
      {markCurrent && (
        <div className="absolute left-0 top-0 z-10 flex items-center gap-1 rounded-br-xl bg-[hsl(var(--brand-blue))] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-sm">
          <Check className="h-3 w-3" strokeWidth={3} /> Current plan
        </div>
      )}
      {plan.recommended && (
        <div className="absolute right-0 top-0 z-10 rounded-bl-xl bg-amber-400 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-950">
          ★ Recommended
        </div>
      )}

      {/* Tier header */}
      <div className={cn('bg-gradient-to-r px-5 py-4 text-white', a.header)}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-white/20">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-tight tracking-tight">{plan.name}</div>
            <div className="truncate text-[11px] text-white/80">{plan.tagline}</div>
          </div>
        </div>
      </div>

      {/* Price */}
      <div className="px-5 pb-4 pt-5 text-center">
        <div className="flex items-end justify-center gap-1">
          <span className="text-3xl font-extrabold tracking-tight tabular-nums">{inr(price)}</span>
          <span className="pb-1 text-sm text-foreground/60">/{showAnnual ? 'year' : 'month'}</span>
        </div>
        {annual != null && (
          <div className="mt-1 text-xs text-foreground/60">
            {showAnnual ? (
              <>or {inr(plan.priceInr)}/month</>
            ) : (
              <>
                or {inr(annual)}/year{' '}
                <span className={cn('font-semibold', a.text)}>(save {inr(saving)})</span>
              </>
            )}
          </div>
        )}
        {plan.promise && (
          <div className={cn('mt-3 rounded-lg px-3 py-1.5 text-[11px] font-medium', a.soft, a.text)}>
            {plan.promise}
          </div>
        )}
      </div>

      {/* Features - two columns, mirroring the sheet */}
      <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 px-5 pb-4 sm:grid-cols-2">
        {plan.features.map((f) => (
          <div key={f} className="flex items-start gap-1.5 text-[12px] text-foreground/80">
            <Check className={cn('mt-[3px] h-3 w-3 flex-shrink-0', a.check)} strokeWidth={3} />
            <span className="leading-snug">{f}</span>
          </div>
        ))}
      </div>

      {/* AI credits, video hours + total value */}
      {(plan.aiCreditsPerMonth != null || plan.totalValueInr != null || plan.videoHoursPerMonth !== undefined) && (
        <div className={cn('mx-5 mb-4 grid gap-2', TILE_COLS[tileCount(plan)])}>
          {plan.aiCreditsPerMonth != null && (
            <div className={cn('rounded-xl px-3 py-2.5 text-center', a.soft)}>
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                AI credits
              </div>
              <div className="text-lg font-extrabold tabular-nums">
                {plan.aiCreditsPerMonth.toLocaleString('en-IN')}
              </div>
              <div className="text-[9px] text-foreground/50">credits/month</div>
            </div>
          )}
          {plan.videoHoursPerMonth !== undefined && (
            <div className={cn('rounded-xl px-3 py-2.5 text-center', a.soft)}>
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                Video calls
              </div>
              <div className={cn('text-lg font-extrabold tabular-nums', plan.videoHoursPerMonth === 0 && 'text-foreground/35')}>
                {plan.videoHoursPerMonth == null ? 'Unlimited' : plan.videoHoursPerMonth === 0 ? '-' : `${plan.videoHoursPerMonth} h`}
              </div>
              <div className="text-[9px] text-foreground/50">{plan.videoHoursPerMonth === 0 ? 'not included' : 'hours/month'}</div>
            </div>
          )}
          {plan.totalValueInr != null && (
            <div className={cn('rounded-xl px-3 py-2.5 text-center', a.soft)}>
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                Total value
              </div>
              <div className="text-lg font-extrabold tabular-nums">{inr(plan.totalValueInr)}+</div>
              <div className="text-[9px] text-foreground/50">you pay {inr(plan.priceInr)}</div>
            </div>
          )}
        </div>
      )}

      {/* One-time setup fee */}
      {plan.setupFeeInr != null && (
        <div className="mx-5 mb-4 rounded-xl border border-dashed border-foreground/15 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            <Rocket className={cn('h-3 w-3', a.text)} />
            One-time setup fee {inr(plan.setupFeeInr)}
          </div>
          {plan.setupIncludes && plan.setupIncludes.length > 0 && (
            <div className="mt-1 text-[10px] leading-relaxed text-foreground/55">
              {plan.setupIncludes.join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* CTA - pinned to the bottom so cards line up at any feature count */}
      {onSelect && (
        <div className="mt-auto px-5 pb-5">
          <button
            type="button"
            disabled={isCurrent || pending}
            onClick={() => onSelect(plan)}
            className={cn(
              'inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-colors',
              a.cta,
              (isCurrent || pending) && 'cursor-not-allowed opacity-60',
            )}
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isCurrent ? (currentLabel ?? 'Current plan') : (ctaLabel ?? `Choose ${plan.name}`)}
          </button>
        </div>
      )}
      {!onSelect && markCurrent && (
        <div className="mt-auto px-5 pb-5">
          <div className={cn('rounded-full px-4 py-2 text-center text-xs font-semibold', a.soft, a.text)}>
            {currentLabel ?? 'Current plan'}
          </div>
        </div>
      )}
    </div>
  );
}

/** Monthly / annual switch — shared so both pages toggle identically. */
export function CycleToggle({
  cycle,
  onChange,
  className,
}: {
  cycle: BillingCycle;
  onChange: (c: BillingCycle) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-full border border-foreground/10 bg-foreground/[0.03] p-1', className)}>
      {(['monthly', 'annual'] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-colors',
            cycle === c ? 'bg-foreground text-canvas' : 'text-foreground/60 hover:text-foreground',
          )}
        >
          {c}
          {c === 'annual' && <span className="ml-1 text-[10px] opacity-80">save 2 months</span>}
        </button>
      ))}
    </div>
  );
}

const TILE_COLS = ['grid-cols-1', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3'];

/** How many allowance tiles (AI credits, video hours, total value) a plan shows. */
function tileCount(plan: { aiCreditsPerMonth?: number | null; videoHoursPerMonth?: number | null; totalValueInr?: number | null }): number {
  return [plan.aiCreditsPerMonth != null, plan.videoHoursPerMonth !== undefined, plan.totalValueInr != null].filter(Boolean).length;
}
