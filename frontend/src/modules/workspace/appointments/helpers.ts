import type {
  Appointment,
  AppointmentKind,
  AppointmentStatus,
  AppointmentType,
} from './types';

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function endOf(appt: Appointment): Date {
  return new Date(new Date(appt.startAt).getTime() + appt.durationMin * 60_000);
}

export function isSameDay(a: Date | string, b: Date | string): boolean {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export const TYPE_META: Record<
  AppointmentType,
  { label: string; chip: string }
> = {
  video:     { label: 'Video',     chip: 'border-violet-400/40 bg-violet-400/10 text-violet-200' },
  phone:     { label: 'Phone',     chip: 'border-amber-300/40 bg-amber-300/10 text-amber-200' },
  in_person: { label: 'In person', chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' },
};

export const KIND_META: Record<
  AppointmentKind,
  { label: string; accent: 'sage' | 'indigo' | 'sand' | 'coral' }
> = {
  initial:         { label: 'Initial consult',  accent: 'sage' },
  follow_up:       { label: 'Follow-up',        accent: 'indigo' },
  monthly_review:  { label: 'Monthly review',   accent: 'sand' },
  urgent:          { label: 'Urgent',           accent: 'coral' },
  group:           { label: 'Group session',    accent: 'indigo' },
};

export const STATUS_META: Record<
  AppointmentStatus,
  { label: string; chip: string }
> = {
  scheduled: { label: 'Scheduled', chip: 'border-violet-400/40 bg-violet-400/10 text-violet-200' },
  completed: { label: 'Completed', chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' },
  canceled:  { label: 'Canceled',  chip: 'border-white/15 bg-white/[0.04] text-white/55' },
};
