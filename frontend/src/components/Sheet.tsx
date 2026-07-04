import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Responsive modal container: a bottom sheet on phones (slides up from the
 * bottom edge, full-width, rounded top, grab handle) and a centered dialog on
 * desktop — the native-app pattern. Drop-in replacement for the hand-rolled
 * `fixed inset-0 … place-items-center` + inner card wrapper.
 *
 * Provide the header / scrollable body / footer as children. Width on desktop
 * is set via `className` (e.g. `sm:max-w-xl`); it always goes full-width on mobile.
 */
export function Sheet({
  onClose,
  children,
  className,
  ariaLabel,
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <motion.div
        initial={{ y: 48, opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex w-full flex-col overflow-hidden bg-popover shadow-2xl',
          // Mobile: bottom sheet. Desktop: centered card.
          'max-h-[92dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]',
          'sm:max-h-[86vh] sm:max-w-lg sm:rounded-2xl sm:border sm:border-foreground/[0.08] sm:pb-0',
          className,
        )}
      >
        {/* Grab handle — mobile only */}
        <div className="mx-auto mt-2.5 h-1 w-9 flex-shrink-0 rounded-full bg-foreground/15 sm:hidden" />
        {children}
      </motion.div>
    </div>
  );
}
