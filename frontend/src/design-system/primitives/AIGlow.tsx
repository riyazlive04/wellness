import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface AIGlowProps extends HTMLMotionProps<'div'> {
  /** Intensity of the glow */
  intensity?: 'soft' | 'default' | 'strong';
  /** Animate the glow continuously */
  animated?: boolean;
}

/**
 * AIGlow — wraps any element with the SIRAH AI signature ring.
 * Used sparingly to mark AI-generated surfaces.
 */
export const AIGlow = forwardRef<HTMLDivElement, AIGlowProps>(
  ({ className, intensity = 'default', animated = true, children, ...rest }, ref) => {
    const intensityClass = {
      soft: 'shadow-[0_0_24px_-8px_rgba(99,102,241,0.25)]',
      default: 'shadow-[0_0_40px_-10px_rgba(99,102,241,0.45),_0_0_80px_-30px_rgba(99,102,241,0.25)]',
      strong: 'shadow-[0_0_60px_-10px_rgba(99,102,241,0.65),_0_0_120px_-30px_rgba(99,102,241,0.35)]',
    }[intensity];

    return (
      <motion.div
        ref={ref}
        className={cn('relative rounded-2xl', intensityClass, className)}
        animate={
          animated
            ? {
                boxShadow: [
                  '0 0 40px -10px rgba(99,102,241,0.45), 0 0 80px -30px rgba(99,102,241,0.25)',
                  '0 0 56px -10px rgba(99,102,241,0.6), 0 0 100px -30px rgba(99,102,241,0.35)',
                  '0 0 40px -10px rgba(99,102,241,0.45), 0 0 80px -30px rgba(99,102,241,0.25)',
                ],
              }
            : undefined
        }
        transition={{ duration: 5, ease: 'easeInOut', repeat: Infinity }}
        {...rest}
      >
        {children}
      </motion.div>
    );
  },
);
AIGlow.displayName = 'AIGlow';
