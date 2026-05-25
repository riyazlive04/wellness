import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface GradientOrbProps {
  /** Color of the orb */
  color?: 'indigo' | 'sage' | 'sand' | 'mixed';
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
  color = 'indigo',
  size = 480,
  position = 'top-0 left-0',
  driftDuration = 18,
  delay = 0,
  className,
}: GradientOrbProps) {
  const reduceMotion = useReducedMotion();
  const gradient = {
    indigo: 'radial-gradient(circle, rgba(99,102,241,0.55) 0%, rgba(99,102,241,0) 70%)',
    sage:   'radial-gradient(circle, rgba(125,190,157,0.50) 0%, rgba(125,190,157,0) 70%)',
    sand:   'radial-gradient(circle, rgba(245,232,211,0.55) 0%, rgba(245,232,211,0) 70%)',
    mixed:  'radial-gradient(circle, rgba(99,102,241,0.45) 0%, rgba(125,190,157,0.25) 40%, rgba(125,190,157,0) 70%)',
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
