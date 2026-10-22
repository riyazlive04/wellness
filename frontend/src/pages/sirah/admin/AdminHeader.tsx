import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The brand band every admin page sits under.
 *
 * Admin surfaces are `bg-foreground/[0.0x]` — tinted black, so they render
 * grey — and the pages are white cards on a near-white canvas. Without a band
 * the whole area reads colourless, which is what it did.
 *
 * Controls placed in `actions` sit on dark, so they need inverted styling:
 * the `adminBtn` helpers below give the two variants used across these pages,
 * rather than each one re-deriving white-on-green by hand.
 */
export function AdminHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  /** Small label above the title, e.g. "Operations · Audit log". */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-gradient-to-br from-teal-800 to-teal-600 px-5 py-4 text-white shadow-sm md:px-6 md:py-5',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <span className="block text-[11px] uppercase tracking-[0.20em] text-white/60">{eyebrow}</span>
        )}
        <h1 className={cn('text-[26px] font-bold tracking-tight text-white', eyebrow && 'mt-1')}>{title}</h1>
        {subtitle && <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-white/70">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A secondary control on the band: outlined, white text. */
export const adminBtnGhost =
  'inline-flex h-9 items-center gap-1.5 rounded-full border border-white/25 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/15';

/** The primary control on the band: solid white, brand-green text. */
export const adminBtnSolid =
  'inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-50';

/** A square icon button on the band (refresh, close). */
export const adminBtnIcon =
  'grid h-9 w-9 place-items-center rounded-full border border-white/25 text-white transition-colors hover:bg-white/15';
