import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface GlassProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual intensity */
  variant?: 'subtle' | 'default' | 'heavy';
  /** Add a faint hover lift */
  interactive?: boolean;
}

/**
 * Glass — a frosted container with backdrop blur, soft border, and depth.
 * Use for cards, modals, navigation panels — anywhere you want premium
 * depth without a hard solid surface.
 */
export const Glass = forwardRef<HTMLDivElement, GlassProps>(
  ({ className, variant = 'default', interactive = false, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-2xl border backdrop-blur-xl',
          'border-white/10 bg-white/[0.04]',
          'shadow-[0_4px_16px_-8px_rgba(0,0,0,0.12)]',
          variant === 'subtle' && 'bg-white/[0.02] backdrop-blur-md',
          variant === 'heavy' &&
            'bg-white/[0.08] backdrop-blur-2xl shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)]',
          interactive &&
            'transition-all duration-200 hover:bg-white/[0.06] hover:shadow-[0_20px_48px_-16px_rgba(0,0,0,0.22)] hover:-translate-y-[1px]',
          'dark:border-white/[0.06]',
          className,
        )}
        {...rest}
      />
    );
  },
);
Glass.displayName = 'Glass';
