import { motion } from 'framer-motion';
import { fadeUp } from '@/design-system';
import { cn } from '@/lib/utils';

/**
 * Standard editorial header used at the top of every owner page.
 *
 *   ┌─ EYEBROW · SECTION ───────────────────────────────────────────┐
 *   │                                                                │
 *   │ Page title goes here          [ Optional primary action ]     │
 *   │                                                                │
 *   │ One-line supporting description, capped at max-w-2xl so it     │
 *   │ doesn't run edge-to-edge on wide monitors.                     │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Matches the pattern used by /admin pages — same eyebrow tracking,
 * same title-button alignment, same description cap. Drop this into
 * any page and the rhythm is identical to the admin surfaces.
 */

export interface PageHeaderProps {
  /** Tiny uppercase tracking-wide line above the title. e.g. "People · Clients". */
  eyebrow: string;
  /** The page H1. Big, balanced. */
  title: string;
  /** Optional 1–2 sentence supporting copy. Capped at max-w-2xl. */
  description?: string;
  /** Right-aligned primary action — typically a gradient pill. */
  action?: React.ReactNode;
  /** Extra classes on the outer wrapper if you need to tweak vertical spacing. */
  className?: string;
}

export function PageHeader({ eyebrow, title, description, action, className }: PageHeaderProps) {
  return (
    <motion.div variants={fadeUp} className={cn('flex flex-col gap-2', className)}>
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">
        {eyebrow}
      </span>

      {/* Title + action share a row so the action aligns with the H1 baseline,
          not the bottom of the description. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-balance">{title}</h1>
        {action}
      </div>

      {description && (
        <p className="text-pretty max-w-2xl text-base leading-relaxed text-foreground/70 dark:text-foreground/65">
          {description}
        </p>
      )}
    </motion.div>
  );
}