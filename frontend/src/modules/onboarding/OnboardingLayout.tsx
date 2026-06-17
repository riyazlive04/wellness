import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { BrandMark, GradientOrb, fadeUp, stagger } from '@/design-system';

export interface OnboardingLayoutProps {
  step: number;             // 1-indexed
  totalSteps: number;
  title: string;
  subtitle?: string;
  /** Optional hero illustration shown above the title. Path is relative to /public. */
  illustration?: string;
  /** Alt text for screen readers. Required when `illustration` is set. */
  illustrationAlt?: string;
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  canContinue: boolean;
  nextLabel?: string;
  loading?: boolean;
  children: ReactNode;
}

export function OnboardingLayout(props: OnboardingLayoutProps) {
  const {
    step,
    totalSteps,
    title,
    subtitle,
    illustration,
    illustrationAlt,
    onBack,
    onNext,
    onSkip,
    canContinue,
    nextLabel = 'Continue',
    loading = false,
    children,
  } = props;

  const progress = (step / totalSteps) * 100;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-canvas text-foreground">
      <GradientOrb color="indigo" size={520} position="-top-32 -left-20" />
      <GradientOrb
        color="sage"
        size={460}
        position="-bottom-32 -right-16"
        delay={2}
        driftDuration={22}
      />

      {/* Top bar: brand + progress */}
      <header className="relative z-10 border-b border-foreground/[0.06]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <BrandMark size={32} />
            <span className="text-sm font-semibold tracking-tight">SIRAH LIFE</span>
          </Link>
          <div className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
            Step {step} of {totalSteps}
          </div>
        </div>
        <div className="h-[2px] w-full bg-foreground/[0.04]">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-600 to-fuchsia-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </header>

      {/* Body — the scroll container, so the wheel scrolls the content while
          the header (top) and footer (bottom) stay pinned. min-h-0 lets this
          flex child shrink and actually scroll instead of overflowing. */}
      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
        <motion.div
          variants={stagger(0.08, 0.05)}
          initial="initial"
          animate="animate"
        >
          {illustration && (
            <motion.div
              variants={fadeUp}
              className="mb-6 flex justify-center md:mb-8"
              aria-hidden={!illustrationAlt}
            >
              <img
                src={illustration}
                alt={illustrationAlt ?? ''}
                width={300}
                height={224}
                className="h-40 w-auto md:h-48 lg:h-56 drop-shadow-[0_18px_36px_rgba(139,92,246,0.18)] select-none"
                draggable={false}
              />
            </motion.div>
          )}

          <motion.div variants={fadeUp} className="mb-10 text-center md:text-left">
            <h1 className="text-balance">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 text-pretty text-base leading-relaxed text-foreground/75 dark:text-foreground/60 md:text-lg">
                {subtitle}
              </p>
            )}
          </motion.div>

          <motion.div variants={fadeUp}>{children}</motion.div>
        </motion.div>
        </div>
      </main>

      {/* Footer — pinned below the scroll area (always visible) */}
      <footer className="relative z-10 border-t border-foreground/[0.06] bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-4">
          <button
            type="button"
            onClick={onBack}
            disabled={!onBack || loading}
            className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-5 py-2.5 text-sm text-foreground/70 transition-colors hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                disabled={loading}
                className="text-xs text-foreground/75 dark:text-foreground/55 hover:text-foreground/70"
              >
                Skip for now
              </button>
            )}
            <button
              type="button"
              onClick={onNext}
              disabled={!canContinue || loading}
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-6 py-2.5 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
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
  );
}
