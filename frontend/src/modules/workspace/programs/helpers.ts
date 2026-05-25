import type { Program } from './types';

export const ACCENT_STYLES: Record<
  Program['accent'],
  { header: string; chip: string; ring: string; sparkColor: string }
> = {
  sage: {
    header: 'from-emerald-400/40 via-emerald-400/15 to-transparent',
    chip:   'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    ring:   'shadow-[0_0_24px_-6px_rgba(125,190,157,0.45)]',
    sparkColor: '#8FC7A8',
  },
  indigo: {
    header: 'from-violet-400/40 via-violet-400/15 to-transparent',
    chip:   'border-violet-400/40 bg-violet-400/10 text-violet-200',
    ring:   'shadow-[0_0_24px_-6px_rgba(128,135,255,0.45)]',
    sparkColor: '#A5ABFF',
  },
  sand: {
    header: 'from-amber-300/40 via-amber-300/15 to-transparent',
    chip:   'border-amber-300/40 bg-amber-300/10 text-amber-200',
    ring:   'shadow-[0_0_24px_-6px_rgba(229,197,140,0.45)]',
    sparkColor: '#E5C58C',
  },
  coral: {
    header: 'from-rose-400/40 via-rose-400/15 to-transparent',
    chip:   'border-rose-400/40 bg-rose-400/10 text-rose-200',
    ring:   'shadow-[0_0_24px_-6px_rgba(248,113,113,0.45)]',
    sparkColor: '#F87171',
  },
};

export function formatDuration(weeks: number): string {
  if (weeks === 4)  return '30 days';
  if (weeks === 8)  return '8 weeks';
  if (weeks === 12) return '12 weeks';
  if (weeks === 16) return '16 weeks';
  return `${weeks} weeks`;
}

export function relativeDate(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const day = 1000 * 60 * 60 * 24;
  const days = Math.floor(ms / day);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
