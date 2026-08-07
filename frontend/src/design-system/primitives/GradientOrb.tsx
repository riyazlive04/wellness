import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface GradientOrbProps {
  /** Color of the orb. Sirah brand palette: blue, violet, magenta, mixed (full gradient). */
  color?: 'blue' | 'violet' | 'magenta' | 'indigo' | 'sage' | 'sand' | 'mixed';
  /** Size in pixels */
  size?: number;
  /** Position via Tailwind classes (top/left/right/bottom). */
  position?: string;
  /** Drift duration in seconds */
  driftDuration?: number;
  /** Drift starting delay */
  delay?: number;
  className?: string;
}

/**
 * GradientOrb — a softly-floating, blurred orb used in hero / auth
 * backgrounds to convey calm, ambient, AI-adjacent depth.
 */
export function GradientOrb({
  color = 'blue',
  size = 480,
  position = 'top-0 left-0',
  driftDuration = 18,
  delay = 0,
  className,
}: GradientOrbProps) {
  const reduceMotion = useReducedMotion();
  const gradient = {
    // NUSI brand palette
    blue:    'radial-gradient(circle, rgba(37,99,235,0.55) 0%, rgba(37,99,235,0) 70%)',
    violet:  'radial-gradient(circle, rgba(14,154,168,0.55) 0%, rgba(14,154,168,0) 70%)',
    magenta: 'radial-gradient(circle, rgba(6,182,212,0.55) 0%, rgba(6,182,212,0) 70%)',
    mixed:   'radial-gradient(circle, rgba(37,99,235,0.5) 0%, rgba(14,154,168,0.35) 40%, rgba(6,182,212,0.15) 70%, rgba(6,182,212,0) 90%)',
    // Legacy aliases (kept so existing color="sage|sand|indigo" calls don't break)
    indigo:  'radial-gradient(circle, rgba(14,154,168,0.55) 0%, rgba(14,154,168,0) 70%)',
    sage:    'radial-gradient(circle, rgba(37,99,235,0.45) 0%, rgba(37,99,235,0) 70%)',
    sand:    'radial-gradient(circle, rgba(6,182,212,0.50) 0%, rgba(6,182,212,0) 70%)',
  }[color];

  // Static orb when the user prefers reduced motion — still calm, just not drifting
  if (reduceMotion) {
    return (
      <div
        aria-hidden
        className={cn('pointer-events-none absolute rounded-full blur-3xl', position, className)}
        style={{
          width: size,
          height: size,
          background: gradient,
        }}
      />
    );
  }

  return (
    <motion.div
      aria-hidden
      className={cn('pointer-events-none absolute rounded-full blur-3xl', position, className)}
      style={{
        width: size,
        height: size,
        background: gradient,
      }}
      animate={{
        x: [0, 24, -16, 0],
        y: [0, -20, 12, 0],
        scale: [1, 1.08, 0.96, 1],
      }}
      transition={{
        duration: driftDuration,
        delay,
        ease: 'easeInOut',
        repeat: Infinity,
      }}
    />
  );
}
