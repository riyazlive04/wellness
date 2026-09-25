import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface HowStep {
  stage: string;
  title: string;
  body: string;
  icon: LucideIcon;
}

const CYCLE_MS = 2400;

/**
 * "How it works" as a journey: the steps pop in one after another while the
 * connector draws across, then a highlight walks 1 → 5 on a loop with a green
 * progress line filling up to it. Hovering a step jumps the highlight there
 * and holds it. Only cycles while on screen, and not at all for visitors who
 * ask for reduced motion.
 */
export function HowSteps({ steps }: { steps: HowStep[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const onScreen = useInView(ref, { margin: '-80px' });
  const revealed = useInView(ref, { once: true, margin: '-80px' });
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!onScreen || held || reduceMotion) return;
    const t = setInterval(() => setActive((a) => (a + 1) % steps.length), CYCLE_MS);
    return () => clearInterval(t);
  }, [onScreen, held, reduceMotion, steps.length]);

  const progress = steps.length > 1 ? active / (steps.length - 1) : 0;
  // Steps land one by one after the connector starts drawing.
  const stepDelay = (i: number) => (reduceMotion ? 0 : 0.25 + i * 0.18);

  return (
    <ol
      ref={ref}
      onMouseLeave={() => setHeld(false)}
      className="relative grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5"
    >
      {/* Connector: a faint track that draws in, and a green fill up to the active step. */}
      <motion.span
        aria-hidden
        initial={{ scaleX: 0 }}
        animate={revealed ? { scaleX: 1 } : undefined}
        transition={{ duration: reduceMotion ? 0 : 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        className="pointer-events-none absolute left-[10%] right-[10%] top-6 hidden h-0.5 origin-left rounded-full bg-teal-500/15 lg:block"
      />
      <motion.span
        aria-hidden
        initial={{ scaleX: 0 }}
        animate={{ scaleX: revealed ? progress : 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute left-[10%] right-[10%] top-6 hidden h-0.5 origin-left rounded-full bg-gradient-to-r from-teal-700 to-teal-400 lg:block"
      />

      {steps.map((s, i) => {
        const isActive = i === active;
        const isDone = i < active;
        return (
          <motion.li
            key={s.stage}
            initial={{ opacity: 0, y: 18, scale: 0.94 }}
            animate={revealed ? { opacity: 1, y: 0, scale: 1 } : undefined}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: stepDelay(i) }}
            onMouseEnter={() => {
              setActive(i);
              setHeld(true);
            }}
            className="relative flex cursor-default flex-col items-center text-center"
          >
            <motion.span
              animate={{ scale: isActive ? 1.14 : 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18 }}
              className={cn(
                'relative grid h-12 w-12 place-items-center rounded-full border shadow-[0_0_0_6px_hsl(var(--canvas))] transition-colors duration-300',
                isActive
                  ? 'border-teal-600 bg-teal-600 text-white shadow-[0_0_0_6px_hsl(var(--canvas)),0_10px_24px_-8px_rgba(77,124,15,0.6)]'
                  : isDone
                    ? 'border-teal-500/60 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                    : 'border-teal-500/30 bg-canvas text-teal-700 dark:text-teal-300',
              )}
            >
              {isActive && !reduceMotion && (
                <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-teal-500/35" />
              )}
              <motion.span
                key={isActive ? `on-${active}` : 'off'}
                animate={isActive && !reduceMotion ? { rotate: [0, -12, 10, 0] } : { rotate: 0 }}
                transition={{ duration: 0.6 }}
                className="relative"
              >
                <s.icon className="h-5 w-5" />
              </motion.span>
              <motion.span
                initial={{ scale: 0 }}
                animate={revealed ? { scale: 1 } : undefined}
                transition={{ type: 'spring', stiffness: 420, damping: 14, delay: stepDelay(i) + 0.25 }}
                className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-[11px] font-semibold text-white ring-2 ring-[hsl(var(--canvas))]"
              >
                {i + 1}
              </motion.span>
            </motion.span>

            <div
              className={cn(
                'mt-5 bg-gradient-to-br from-teal-700 via-teal-500 to-teal-400 bg-clip-text text-lg font-bold uppercase tracking-[0.08em] text-transparent transition-transform duration-300',
                isActive && 'scale-105',
              )}
            >
              {s.stage}
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">{s.title}</div>
            <div
              className={cn(
                'mt-2 max-w-[16rem] text-xs leading-relaxed transition-colors duration-300',
                isActive ? 'text-foreground/85' : 'text-foreground/55',
              )}
            >
              {s.body}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
