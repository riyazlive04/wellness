import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AudioLines, BarChart3, Camera } from 'lucide-react';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';

/**
 * Left-column visual on the auth page. A single glass card that cycles
 * through three "what's inside NUSI" previews every 4 seconds:
 *
 *   1. Voice AI    — animated waveform
 *   2. Plate Vision — scanning grid sweep
 *   3. Analytics   — pulsing bar chart
 *
 * AnimatePresence crossfades between states. The card itself never moves —
 * only its content morphs. Keeps the eye anchored while still feeling alive.
 *
 * Sits at ~280px square; on small screens it hides (the form is the priority).
 */

const STATES = [
  {
    key: 'voice',
    icon: AudioLines,
    label: 'Voice AI',
    detail: 'Listening · 12s clip',
    accent: 'violet',
    body: 'WaveformVisual' as const,
  },
  {
    key: 'vision',
    icon: Camera,
    label: 'Plate Vision',
    detail: 'Detected · 3 items',
    accent: 'cyan',
    body: 'ScannerVisual' as const,
  },
  {
    key: 'analytics',
    icon: BarChart3,
    label: 'Analytics',
    detail: 'MRR · +18.2% MoM',
    accent: 'blue',
    body: 'BarsVisual' as const,
  },
] as const;

const ACCENT_TEXT = {
  violet: 'text-teal-700 dark:text-teal-300',
  cyan: 'text-cyan-700 dark:text-cyan-300',
  blue: 'text-blue-700 dark:text-blue-300',
} as const;

const ACCENT_BG = {
  violet: 'from-teal-500/15 to-teal-500/0',
  cyan: 'from-cyan-500/15 to-cyan-500/0',
  blue: 'from-blue-500/15 to-blue-500/0',
} as const;

export function LiveAuthVisual() {
  const [i, setI] = useState(0);

  // Auto-advance the visible state. 4s feels deliberate — not so fast that
  // it draws focus, not so slow that the user thinks it's static.
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % STATES.length), 4000);
    return () => clearInterval(t);
  }, []);

  const s = STATES[i];

  return (
    <div className="relative">
      {/* Halo behind the card to mirror the hero's glow vocabulary */}
      <div className="pointer-events-none absolute inset-0 -m-8 rounded-[3rem] bg-gradient-to-br from-blue-500/8 via-teal-500/6 to-cyan-400/8 blur-3xl" />

      <Glass
        variant="heavy"
        className="relative w-full max-w-[340px] overflow-hidden rounded-3xl p-6 shadow-[0_30px_80px_-30px_rgba(14,154,168,0.35)]"
      >
        {/* Top row: which preview is showing + a live pulse */}
        <div className="mb-5 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Live in your workspace
          </span>

          {/* Dot pagination */}
          <div className="flex items-center gap-1.5">
            {STATES.map((_, n) => (
              <span
                key={n}
                className={cn(
                  'h-1 rounded-full transition-all duration-500',
                  n === i ? 'w-4 bg-foreground/70' : 'w-1 bg-foreground/20',
                )}
              />
            ))}
          </div>
        </div>

        {/* The state-dependent body, crossfading */}
        <AnimatePresence mode="wait">
          <motion.div
            key={s.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-inset ring-white/30',
                  ACCENT_BG[s.accent],
                )}
              >
                <s.icon className={cn('h-4 w-4', ACCENT_TEXT[s.accent])} strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold tracking-tight">{s.label}</div>
                <div className="text-[11px] text-foreground/60">{s.detail}</div>
              </div>
            </div>

            <div className={cn('h-24 rounded-2xl bg-foreground/[0.03] p-4', ACCENT_TEXT[s.accent])}>
              {s.body === 'WaveformVisual' && <WaveformVisual />}
              {s.body === 'ScannerVisual' && <ScannerVisual />}
              {s.body === 'BarsVisual' && <BarsVisual />}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Footer hint that doesn't change between states */}
        <div className="mt-5 flex items-center justify-between text-[10px] text-foreground/55">
          <span>Every minute, somewhere on NUSI.</span>
          <span className="font-medium tabular-nums">{String(i + 1).padStart(2, '0')} / 03</span>
        </div>
      </Glass>
    </div>
  );
}

// ─── Tiny inline visuals ─────────────────────────────────────────────────

function WaveformVisual() {
  // 32 bars whose heights cycle in a wave pattern. Each bar has a unique
  // delay so the wave actually travels across the row.
  const bars = Array.from({ length: 32 }, (_, i) => i);
  return (
    <div className="flex h-full items-center gap-[3px]">
      {bars.map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-current"
          initial={{ height: 4 }}
          animate={{
            height: [
              4,
              6 + (Math.sin(i * 0.5) + 1) * 18,
              4,
            ],
          }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.04,
          }}
        />
      ))}
    </div>
  );
}

function ScannerVisual() {
  return (
    <svg viewBox="0 0 100 50" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth={1.4}>
      {/* Viewfinder corners */}
      <path d="M 8 12 L 8 6 L 14 6" strokeLinecap="round" />
      <path d="M 86 6 L 92 6 L 92 12" strokeLinecap="round" />
      <path d="M 92 38 L 92 44 L 86 44" strokeLinecap="round" />
      <path d="M 14 44 L 8 44 L 8 38" strokeLinecap="round" />

      {/* Plate */}
      <circle cx="50" cy="25" r="13" opacity="0.7" />
      <circle cx="50" cy="25" r="9" strokeWidth="0.8" opacity="0.35" />

      {/* Food dots */}
      <circle cx="46" cy="22" r="1.8" fill="currentColor" opacity="0.7" />
      <circle cx="55" cy="24" r="1.4" fill="currentColor" opacity="0.7" />
      <circle cx="50" cy="30" r="1.8" fill="currentColor" opacity="0.7" />

      {/* Scanline */}
      <motion.line
        x1="14"
        x2="86"
        strokeWidth="1.2"
        opacity="0.8"
        initial={{ y1: 10, y2: 10 }}
        animate={{ y1: [10, 40, 10], y2: [10, 40, 10] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  );
}

function BarsVisual() {
  const bars = [
    { x: 6, base: 10, peak: 24 },
    { x: 18, base: 18, peak: 32 },
    { x: 30, base: 14, peak: 26 },
    { x: 42, base: 24, peak: 38 },
    { x: 54, base: 20, peak: 30 },
    { x: 66, base: 30, peak: 42 },
    { x: 78, base: 26, peak: 40 },
    { x: 90, base: 34, peak: 46 },
  ];
  return (
    <svg viewBox="0 0 100 50" className="h-full w-full" fill="currentColor">
      <line x1="4" y1="48" x2="96" y2="48" stroke="currentColor" strokeWidth="0.6" opacity="0.3" />
      {bars.map((b, i) => (
        <motion.rect
          key={i}
          x={b.x}
          width={6}
          rx={1}
          initial={{ y: 48 - b.base, height: b.base, opacity: 0.5 + i * 0.05 }}
          animate={{
            y: [48 - b.base, 48 - b.peak, 48 - b.base],
            height: [b.base, b.peak, b.base],
          }}
          transition={{
            duration: 2 + (i % 3) * 0.3,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.12,
          }}
        />
      ))}
    </svg>
  );
}