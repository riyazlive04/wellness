import { useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';

import { cn } from '@/lib/utils';

interface HoldToConfirmProps {
  /** Fired once the user has held for `durationMs` (or confirms via keyboard). */
  onConfirm: () => void;
  /** How long the press must be held to commit. Default 700ms. */
  durationMs?: number;
  disabled?: boolean;
  className?: string;
  /** Idle label. */
  children: ReactNode;
  /** Label shown while the press is being held. */
  holdingLabel?: ReactNode;
  /**
   * Keyboard fallback: holding isn't possible with a keyboard, so an
   * Enter/Space activation shows this confirm() prompt instead. Omit to fire
   * immediately on keyboard activation.
   */
  confirmText?: string;
}

/**
 * HoldToConfirm — a destructive-action button that requires a deliberate
 * press-and-hold (a progress fill sweeps across; releasing early cancels).
 * Prevents accidental clicks on irreversible actions. Keyboard users get a
 * confirm() fallback so the action stays accessible.
 */
export function HoldToConfirm({
  onConfirm,
  durationMs = 700,
  disabled,
  className,
  children,
  holdingLabel,
  confirmText,
}: HoldToConfirmProps) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const start = () => {
    if (disabled) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, durationMs);
  };

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    setHolding(false);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={(e) => {
        // detail === 0 means keyboard activation (Enter/Space) — can't "hold",
        // so fall back to a confirm prompt to keep this accessible.
        if (e.detail === 0 && !disabled) {
          if (!confirmText || window.confirm(confirmText)) onConfirm();
        }
      }}
      className={cn(
        'relative select-none overflow-hidden rounded-md transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      {holding && (
        <motion.span
          aria-hidden
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: durationMs / 1000, ease: 'linear' }}
          style={{ transformOrigin: 'left' }}
          className="absolute inset-0 z-0 bg-white/25"
        />
      )}
      <span className="relative z-[1] inline-flex items-center justify-center gap-2">
        {holding && holdingLabel ? holdingLabel : children}
      </span>
    </button>
  );
}
