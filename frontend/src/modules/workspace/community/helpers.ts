import type { AuthorRole } from './types';

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
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const ROLE_CHIP: Record<AuthorRole, string> = {
  owner:   'border-indigo-400/40 bg-indigo-400/10 text-indigo-200',
  manager: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  coach:   'border-amber-300/40 bg-amber-300/10 text-amber-200',
  client:  'border-white/15 bg-white/[0.04] text-white/55',
};

export const ROLE_LABEL: Record<AuthorRole, string> = {
  owner:   'Owner',
  manager: 'Manager',
  coach:   'Coach',
  client:  'Client',
};
