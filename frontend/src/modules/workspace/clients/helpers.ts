import type { ClientStatus } from './types';

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const STATUS_META: Record<
  ClientStatus,
  { label: string; chip: string; dot: string }
> = {
  active: {
    label: 'Active',
    chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    dot: 'bg-emerald-400',
  },
  at_risk: {
    label: 'At risk',
    chip: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
    dot: 'bg-rose-400',
  },
  paused: {
    label: 'Paused',
    chip: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    dot: 'bg-amber-400',
  },
  pending_invite: {
    label: 'Pending',
    chip: 'border-white/15 bg-white/[0.04] text-white/55',
    dot: 'bg-white/40',
  },
};
