import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface GradientOrbProps {
  /** Color of the orb. NUSI brand palette (leaf greens; sage = the logo's cyan leaf). Names kept for compatibility. */
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
    blue:    'radial-gradient(circle, rgba(85,142,25,0.55) 0%, rgba(85,142,25,0) 70%)',
    violet:  'radial-gradient(circle, rgba(109,176,34,0.55) 0%, rgba(109,176,34,0) 70%)',
    magenta: 'radial-gradient(circle, rgba(139,203,58,0.55) 0%, rgba(139,203,58,0) 70%)',
    mixed:   'radial-gradient(circle, rgba(85,142,25,0.5) 0%, rgba(109,176,34,0.35) 40%, rgba(139,203,58,0.15) 70%, rgba(139,203,58,0) 90%)',
    // Legacy aliases (kept so existing color="sage|sand|indigo" calls don't break)
    indigo:  'radial-gradient(circle, rgba(109,176,34,0.55) 0%, rgba(109,176,34,0) 70%)',
    sage:    'radial-gradient(circle, rgba(60,198,238,0.30) 0%, rgba(60,198,238,0) 70%)',
    sand:    'radial-gradient(circle, rgba(139,203,58,0.50) 0%, rgba(139,203,58,0) 70%)',
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
