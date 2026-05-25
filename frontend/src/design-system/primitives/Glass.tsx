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
 * Theme-aware: in light mode it's a translucent slate/black overlay on white;
 * in dark mode it's a translucent white overlay on near-black.
 */
export const Glass = forwardRef<HTMLDivElement, GlassProps>(
  ({ className, variant = 'default', interactive = false, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-2xl border backdrop-blur-xl',
          // surface: foreground (= ink color) used as a low-opacity overlay.
          // light: foreground=slate-900 → subtle slate tint over white canvas
          // dark : foreground=white      → subtle white tint over near-black canvas
          'border-foreground/10 bg-foreground/[0.04] shadow-glass',
          variant === 'subtle' && 'bg-foreground/[0.02] backdrop-blur-md',
          variant === 'heavy' &&
            'bg-foreground/[0.08] backdrop-blur-2xl',
          interactive &&
            'transition-all duration-200 hover:bg-foreground/[0.06] hover:-translate-y-[1px]',
          className,
        )}
        {...rest}
      />
    );
  },
);
Glass.displayName = 'Glass';
