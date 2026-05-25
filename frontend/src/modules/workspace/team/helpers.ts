import type { MemberRole, MemberStatus } from './types';

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
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function joinDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const ROLE_META: Record<
  MemberRole,
  { label: string; chip: string; description: string }
> = {
  owner: {
    label: 'Owner',
    chip: 'border-violet-400/40 bg-violet-400/10 text-violet-200',
    description: 'Full access — billing, integrations, team, all clients.',
  },
  manager: {
    label: 'Manager',
    chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    description: 'Workspace operations — all clients, all programs, no billing or team.',
  },
  coach: {
    label: 'Coach',
    chip: 'border-amber-300/40 bg-amber-300/10 text-amber-200',
    description: 'Their own clients only. Can create programs and run sessions.',
  },
};

export const STATUS_META: Record<
  MemberStatus,
  { label: string; chip: string; dot: string }
> = {
  active: {
    label: 'Active',
    chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    dot: 'bg-emerald-400',
  },
  invited: {
    label: 'Pending',
    chip: 'border-amber-300/40 bg-amber-300/10 text-amber-200',
    dot: 'bg-amber-300',
  },
  disabled: {
    label: 'Disabled',
    chip: 'border-white/15 bg-white/[0.04] text-white/55',
    dot: 'bg-white/40',
  },
};
