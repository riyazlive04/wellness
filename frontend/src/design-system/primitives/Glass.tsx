import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface GlassProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual intensity */
  variant?: 'subtle' | 'default' | 'heavy';
  /** Add a faint hover lift */
  interactive?: boolean;
}

/**
 * Glass — a frosted container that adapts to theme.
 *
 *   Light: real white card with soft shadow + slate border, sitting on the
 *          warm canvas wash. Feels airy and crisp.
 *   Dark : translucent white overlay (the original frosted look).
 */
export const Glass = forwardRef<HTMLDivElement, GlassProps>(
  ({ className, variant = 'default', interactive = false, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-2xl border backdrop-blur-xl',
          // Default surface: white-on-warm-canvas in light; white-overlay-on-dark in dark.
          'border-foreground/10 bg-white/85 shadow-[0_4px_24px_-12px_rgb(15_23_42_/_0.10),_0_1px_2px_-1px_rgb(15_23_42_/_0.06)]',
          'dark:bg-foreground/[0.04] dark:shadow-glass',
          // Subtle variant
          variant === 'subtle' &&
            'bg-white/65 shadow-[0_1px_2px_-1px_rgb(15_23_42_/_0.04)] backdrop-blur-md dark:bg-foreground/[0.02]',
          // Heavy variant (modals, AI surfaces, headline cards)
          variant === 'heavy' &&
            'bg-white shadow-[0_12px_36px_-12px_rgb(15_23_42_/_0.14),_0_2px_6px_-2px_rgb(15_23_42_/_0.08)] backdrop-blur-2xl dark:bg-foreground/[0.08]',
          interactive &&
            'transition-all duration-200 hover:-translate-y-[1px] hover:bg-white hover:shadow-[0_18px_44px_-16px_rgb(15_23_42_/_0.18),_0_2px_6px_-2px_rgb(15_23_42_/_0.08)] dark:hover:bg-foreground/[0.06]',
          className,
        )}
        {...rest}
      />
    );
  },
);
Glass.displayName = 'Glass';
