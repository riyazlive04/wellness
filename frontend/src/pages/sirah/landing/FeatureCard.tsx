import { useRef, type ComponentType } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';

/**
 * NUSI — Features grid card.
 *
 * Three layered effects make every card feel alive without adding chrome:
 *  1. 3D tilt — the card rotates a few degrees toward the cursor on X+Y,
 *     smoothed by a spring so the motion is heavy and intentional.
 *  2. Ambient orb — a soft, accent-tinted radial gradient follows the
 *     cursor inside the card (only visible on hover). This is the bit
 *     that pulls the eye and signals interactivity.
 *  3. Per-card accent — icon background, ring, and orb hue all draw
 *     from one of {violet, blue, cyan}. Breaks the all-purple uniformity
 *     from the old grid while staying inside the brand palette.
 *
 * The parent grid container MUST set `perspective: 1000px` for the tilt
 * to read as 3D rather than skew.
 */

export type FeatureAccent = 'violet' | 'blue' | 'cyan';

interface FeatureCardProps {
  /** Custom SVG illustration component. Receives `className` for sizing/color. */
  visual: ComponentType<{ className?: string }>;
  title: string;
  body: string;
  accent: FeatureAccent;
}

const ACCENT: Record<
  FeatureAccent,
  { icon: string; iconBg: string; ring: string; orb: string }
> = {
  violet: {
    icon: 'text-teal-600 dark:text-teal-300',
    iconBg: 'from-teal-500/15 to-teal-500/0',
    ring: 'group-hover:ring-teal-400/40',
    orb: 'rgba(14,154,168,0.22)', // teal-500 @ 22%
  },
  blue: {
    icon: 'text-blue-600 dark:text-blue-300',
    iconBg: 'from-blue-500/15 to-blue-500/0',
    ring: 'group-hover:ring-blue-400/40',
    orb: 'rgba(59,130,246,0.22)',
  },
  cyan: {
    icon: 'text-cyan-600 dark:text-cyan-300',
    iconBg: 'from-cyan-500/15 to-cyan-500/0',
    ring: 'group-hover:ring-cyan-400/40',
    orb: 'rgba(34,211,238,0.22)',
  },
};

export function FeatureCard({ visual: Visual, title, body, accent }: FeatureCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const a = ACCENT[accent];

  // Raw mouse-position motion values in card-relative coords.
  const mx = useMotionValue(0); // -0.5 .. 0.5
  const my = useMotionValue(0);
  // Orb position in % (0..100). Sticks at last cursor position even when leaving.
  const orbX = useMotionValue(50);
  const orbY = useMotionValue(50);

  // Tilt rotation. ±6° feels premium; >8° starts looking gimmicky.
  // Critically-damped spring keeps the motion liquid, never jittery.
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), {
    stiffness: 140,
    damping: 18,
    mass: 0.5,
  });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-6, 6]), {
    stiffness: 140,
    damping: 18,
    mass: 0.5,
  });

  // Build the radial-gradient CSS string from the live orb position.
  const orbGradient = useMotionTemplate`radial-gradient(280px circle at ${orbX}% ${orbY}%, ${a.orb}, transparent 70%)`;

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xNorm = (e.clientX - rect.left) / rect.width;
    const yNorm = (e.clientY - rect.top) / rect.height;
    mx.set(xNorm - 0.5);
    my.set(yNorm - 0.5);
    orbX.set(xNorm * 100);
    orbY.set(yNorm * 100);
  }
  function handleMouseLeave() {
    mx.set(0);
    my.set(0);
    // Don't recentre the orb — it fades out instead, looks more organic.
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      // initial/animate/whileHover drive the named-variant chain that
      // illustrations (e.g. WorkspaceIllustration) listen to for hover-only
      // motion. rotateX/Y are MotionValues, so they coexist cleanly.
      initial="rest"
      animate="rest"
      whileHover="hover"
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      className="group relative h-full"
    >
      <Glass
        interactive
        className={cn(
          'relative h-full overflow-hidden p-6 ring-1 ring-transparent transition-shadow duration-300',
          a.ring,
        )}
      >
        {/* Ambient orb — fades in on hover. pointer-events-none keeps the
            tilt math clean (the orb sits inside the card so mouse stays on
            the same element regardless of where the orb is rendered). */}
        <motion.div
          aria-hidden
          style={{ background: orbGradient }}
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />

        {/* Hairline at the top — picks up the accent on hover. Small touch,
            big perceptual lift. */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100',
          )}
        />

        {/* Content sits above the orb. translateZ pushes it forward a hair,
            giving the icon a subtle pop in 3D space when the card tilts. */}
        <div className="relative z-10" style={{ transform: 'translateZ(20px)' }}>
          {/* Illustration plate — 80×80 to give the bespoke SVG room to
              breathe. ring + gradient bg sit BEHIND the SVG, the
              illustration draws in `a.icon` color via currentColor. */}
          <div
            className={cn(
              'mb-5 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 ring-inset ring-white/30 transition-transform duration-300 group-hover:scale-105',
              a.iconBg,
            )}
          >
            <Visual className={cn('h-16 w-16', a.icon)} />
          </div>
          <h3 className="text-base font-medium tracking-tight text-foreground">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-foreground/75 dark:text-foreground/55">
            {body}
          </p>
        </div>
      </Glass>
    </motion.div>
  );
}