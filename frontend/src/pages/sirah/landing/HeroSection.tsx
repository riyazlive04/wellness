import { useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import {
  ArrowRight,
  Sparkles,
  TrendingUp,
  User,
  Utensils,
} from 'lucide-react';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';

/**
 * SIRAH LIFE — landing hero.
 *
 * Two-column layout:
 *  - Left: headline + subhead + CTAs + trust strip
 *  - Right: a photographic produce visual — a finished nourish bowl ringed by
 *    the raw ingredients that went into it.
 *
 * This column previously held an animated "ecosystem" diagram: a Workspace hub
 * with six orbiting glass cards (Voice AI / Plate Vision / Analytics / Clients
 * / Programs / Wellness Score), Bezier connectors and mouse parallax. It was
 * replaced deliberately. The trade is real and worth remembering: the diagram
 * showed the product's surface area above the fold, while the photograph sells
 * the outcome. The feature cards live on in the sections below the fold, and
 * the old implementation is in git if the diagram is ever wanted back.
 *
 * Interaction is deliberately minimal here — a slow float plus a small mouse
 * parallax on the image, sharing the spring already driven by the section. A
 * photograph does not need to be animated to be persuasive, and an over-moving
 * hero fights the "one calm platform" promise in the subhead.
 */

// ─────────────────────────────────────────────────────────────────────
// HeroSection
// ─────────────────────────────────────────────────────────────────────

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  // Critically-damped spring — feels heavy, premium, never overshoots.
  const smoothX = useSpring(mouseX, { stiffness: 60, damping: 22, mass: 0.6 });
  const smoothY = useSpring(mouseY, { stiffness: 60, damping: 22, mass: 0.6 });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Normalised offset from centre, ranging roughly -0.5..0.5
    mouseX.set((e.clientX - rect.left - rect.width / 2) / rect.width);
    mouseY.set((e.clientY - rect.top - rect.height / 2) / rect.height);
  }
  function handleMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  return (
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 pb-24 pt-10 md:px-10 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-32 lg:pt-20"
    >
      {/* ── Text column ─────────────────────────────────────────────── */}
      <motion.div
        variants={stagger(0.08, 0.06)}
        initial="initial"
        animate="animate"
        className="relative flex flex-col items-start"
      >
        <motion.div variants={fadeUp}>
          <Glass
            variant="subtle"
            className="inline-flex items-center gap-2.5 rounded-full border-foreground/10 px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] text-foreground/70"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-500" />
            </span>
            AI Wellness OS · for wellness practices
          </Glass>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="mt-7 max-w-2xl text-balance text-[2.6rem] font-semibold leading-[1.04] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-[4.3rem]"
        >
          The{' '}
          <span className="bg-gradient-to-br from-blue-600 via-teal-500 to-cyan-400 bg-clip-text text-transparent">
            AI Wellness
          </span>
          <br />
          Operating System
          <br />
          <span className="text-foreground/55">for modern wellness practices.</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-foreground/70 md:mt-7 md:text-lg"
        >
          Manage clients, programs, AI meal plans, voice coaching, plate-vision analysis,
          appointments and automation - from one calm platform your clients use free.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center md:mt-10"
        >
          <AIGlow intensity="default" animated>
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-7 py-3.5 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02] cta-glow active:scale-[0.97] active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </AIGlow>
          <a
            href="mailto:support@sirahdigital.in?subject=SIRAH LIFE%20LIFE%20demo%20request"
            className="group inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-white/40 px-7 py-3.5 text-sm text-foreground/80 backdrop-blur transition-colors hover:bg-foreground/[0.04] dark:bg-foreground/[0.03]"
          >
            Book a demo
            <ArrowRight className="h-3.5 w-3.5 opacity-50 transition-transform group-hover:translate-x-0.5" />
          </a>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-foreground/55"
        >
          <span className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-emerald-500" />
            14-day free trial
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-teal-500" />
            No card required
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-cyan-500" />
            DPDP-ready
          </span>
        </motion.div>
      </motion.div>

      {/* ── Produce column ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        className="relative mx-auto aspect-square w-full max-w-[560px]"
      >
        <WorkflowVisual mouseX={smoothX} mouseY={smoothY} />
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Workflow visual — the product story: client → AI meal plan → progress.
// Replaces the old produce ring; three glass cards cascade down the hero's
// right column, connected by flow arrows, with the same halo + mouse parallax.
// ─────────────────────────────────────────────────────────────────────

const HERO_MEALS: [string, string, string][] = [
  ['Breakfast', 'Oats, berries & nuts', '320'],
  ['Lunch', 'Dal, brown rice, salad', '540'],
  ['Dinner', 'Grilled paneer & greens', '420'],
];

function WorkflowVisual({
  mouseX,
  mouseY,
}: {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}) {
  // Same restrained parallax as the old visual — 14px at the extremes.
  const x = useTransform(mouseX, (v) => v * 14);
  const y = useTransform(mouseY, (v) => v * 14);

  return (
    <div className="relative h-full w-full">
      {/* Brand-tinted halo, so the cards sit in the page's gradient. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[80%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-blue-500/12 via-teal-500/10 to-cyan-400/12 blur-3xl"
      />

      <motion.div style={{ x, y }} className="absolute inset-0">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          className="relative mx-auto h-full w-full max-w-[420px]"
        >
          {/* ── 1 · Client ─────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 top-[3%] w-[62%]"
          >
            <Glass className="flex items-center gap-3 p-3.5">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white">
                <User className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">Aarav Sharma</div>
                <div className="truncate text-[11px] text-foreground/55">New client · Weight loss</div>
              </div>
              <span className="ml-auto flex-none rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                New
              </span>
            </Glass>
          </motion.div>

          {/* connector 1 → 2 */}
          <div aria-hidden className="absolute left-[28%] top-[20%] text-teal-500/60">
            <ArrowRight className="h-5 w-5 rotate-90" strokeWidth={1.75} />
          </div>

          {/* ── 2 · AI Meal Plan (focal) ───────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-[28%] w-[80%] -translate-x-1/2"
          >
            <Glass variant="heavy" className="relative overflow-hidden p-4">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full blur-2xl"
                style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.28), transparent 70%)' }}
              />
              <div className="relative flex items-center gap-2">
                <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-foreground">AI Meal Plan</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-foreground/45">Auto-generated</span>
              </div>
              <div className="relative mt-3 space-y-2">
                {HERO_MEALS.map(([meal, desc, kcal]) => (
                  <div key={meal} className="flex items-center gap-3 rounded-lg bg-foreground/[0.03] px-3 py-2">
                    <Utensils className="h-3.5 w-3.5 flex-none text-teal-600/70" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-foreground/85">{meal}</div>
                      <div className="truncate text-[10px] text-foreground/50">{desc}</div>
                    </div>
                    <span className="ml-auto flex-none text-[11px] font-semibold tabular-nums text-foreground/70">
                      {kcal}
                      <span className="text-foreground/40"> kcal</span>
                    </span>
                  </div>
                ))}
              </div>
            </Glass>
          </motion.div>

          {/* connector 2 → 3 */}
          <div aria-hidden className="absolute right-[26%] top-[71%] text-teal-500/60">
            <ArrowRight className="h-5 w-5 rotate-90" strokeWidth={1.75} />
          </div>

          {/* ── 3 · Progress ───────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-[2%] right-0 w-[60%]"
          >
            <Glass className="p-3.5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold text-foreground">Progress</span>
                <span className="ml-auto text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">-3.2 kg</span>
              </div>
              <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="mt-2 h-12 w-full" aria-hidden>
                <defs>
                  <linearGradient id="wfArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--brand-blue))" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="hsl(var(--brand-blue))" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M2 52 L34 44 L66 46 L98 30 L130 33 L162 18 L198 8 L198 60 L2 60 Z" fill="url(#wfArea)" />
                <path
                  d="M2 52 L34 44 L66 46 L98 30 L130 33 L162 18 L198 8"
                  fill="none"
                  stroke="hsl(var(--brand-magenta))"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="198" cy="8" r="3" fill="hsl(var(--brand-magenta))" />
              </svg>
              <div className="mt-1 flex justify-between text-[10px] text-foreground/45">
                <span>Week 1</span>
                <span>86% adherence</span>
                <span>Week 6</span>
              </div>
            </Glass>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
