import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Loader2, Lock, ReceiptIndianRupee, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { BrandMark, Wordmark } from '@/design-system';
import { cn } from '@/lib/utils';

export interface OnboardingStepInfo {
  /** Short name in the step list, e.g. "Your practice". */
  label: string;
  /** One line under it, e.g. "Name, logo and focus areas". */
  description: string;
}

export interface OnboardingLayoutProps {
  step: number;             // 1-indexed
  steps: OnboardingStepInfo[];
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  canContinue: boolean;
  nextLabel?: string;
  loading?: boolean;
  /** Shown next to the Continue button while it is disabled. */
  hint?: string;
  children: ReactNode;
}

/** Reassurance shown under the step list. */
const PROMISES = [
  { icon: Sparkles, text: '14-day free trial. No card needed.' },
  { icon: Lock, text: 'Your documents and client data are encrypted.' },
  { icon: ReceiptIndianRupee, text: 'GST-ready invoices from day one.' },
];

/**
 * Workspace setup shell: a brand panel with the step list on the left
 * (desktop), the current step's form on the right, Back / Continue pinned at
 * the bottom. On phones the panel collapses into a header with a progress bar.
 */
export function OnboardingLayout(props: OnboardingLayoutProps) {
  const {
    step, steps, title, subtitle, onBack, onNext, onSkip,
    canContinue, nextLabel = 'Continue', loading = false, hint, children,
  } = props;
  const total = steps.length;
  const progress = (step / total) * 100;

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-foreground">
      {/* ── Brand panel + steps (desktop) ─────────────────────────── */}
      <aside className="relative hidden w-[360px] flex-shrink-0 flex-col overflow-hidden bg-gradient-to-b from-[hsl(95_70%_24%)] via-[hsl(var(--brand-blue))] to-[hsl(86_64%_34%)] px-9 py-8 text-white lg:flex xl:w-[400px]">
        <div aria-hidden className="pointer-events-none absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-black/10 blur-3xl" />

        <Link to="/" className="relative flex items-center gap-3">
          <BrandMark size={38} animated={false} />
          <span className="text-lg font-extrabold tracking-tight">NUSI</span>
        </Link>

        <div className="relative mt-12">
          <h2 className="text-2xl font-bold leading-tight tracking-tight">Set up your practice</h2>
          <p className="mt-2 text-sm text-white/75">Three quick steps, about 3 minutes. You can change everything later in Settings.</p>
        </div>

        <ol className="relative mt-10 space-y-1">
          {steps.map((s, i) => {
            const n = i + 1;
            const done = n < step;
            const current = n === step;
            return (
              <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
                {n < total && (
                  <span aria-hidden className={cn('absolute left-[15px] top-9 h-[calc(100%-28px)] w-px', done ? 'bg-white/70' : 'bg-white/25')} />
                )}
                <span
                  className={cn(
                    'relative z-[1] grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-sm font-bold transition-colors',
                    done && 'bg-white text-[hsl(var(--brand-blue))]',
                    current && 'bg-white text-[hsl(var(--brand-blue))] ring-4 ring-white/25',
                    !done && !current && 'border border-white/40 text-white/70',
                  )}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
                </span>
                <div className="pt-1">
                  <div className={cn('text-sm font-semibold', !done && !current && 'text-white/70')}>{s.label}</div>
                  <div className={cn('mt-0.5 text-xs', current ? 'text-white/85' : 'text-white/55')}>{s.description}</div>
                </div>
              </li>
            );
          })}
        </ol>

        <ul className="relative mt-auto space-y-3 border-t border-white/15 pt-6">
          {PROMISES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-xs text-white/80">
              <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-white/10"><Icon className="h-3.5 w-3.5" /></span>
              {text}
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Form side ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone/tablet header: brand + progress */}
        <header className="border-b border-foreground/[0.06] lg:hidden">
          <div className="flex items-center justify-between px-5 py-3.5">
            <Link to="/" className="flex items-center gap-2.5">
              <BrandMark size={28} animated={false} />
              <Wordmark className="text-sm" />
            </Link>
            <span className="text-xs font-medium text-foreground/60">Step {step} of {total}</span>
          </div>
          <div className="h-1 w-full bg-foreground/[0.05]">
            <motion.div
              className="h-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-5 py-8 md:px-10 md:py-12">
            <div className="mb-8">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--brand-blue))] dark:text-lime-300">
                Step {step} of {total} · {steps[step - 1]?.label}
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
              {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/65 md:text-base">{subtitle}</p>}
            </div>
            {children}
          </div>
        </main>

        <footer className="border-t border-foreground/[0.06] bg-canvas/90 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-4 md:px-10">
            <button
              type="button"
              onClick={onBack}
              disabled={!onBack || loading}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border border-foreground/10 px-5 py-2.5 text-sm text-foreground/75 transition-colors hover:bg-foreground/[0.04]',
                !onBack && 'invisible',
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="flex items-center gap-4">
              {hint && !canContinue && !loading && <span className="hidden text-xs text-foreground/55 sm:inline">{hint}</span>}
              {onSkip && (
                <button type="button" onClick={onSkip} disabled={loading} className="text-xs text-foreground/60 hover:text-foreground">
                  Skip for now
                </button>
              )}
              <button
                type="button"
                onClick={onNext}
                disabled={!canContinue || loading}
                className="group inline-flex min-w-[140px] items-center justify-center gap-2 rounded-full bg-[hsl(var(--brand-blue))] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[hsl(95_70%_26%)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Setting up…</>
                ) : (
                  <>
                    {nextLabel}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
