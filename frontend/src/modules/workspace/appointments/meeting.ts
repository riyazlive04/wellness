/**
 * Teams-style meeting lifecycle, derived purely from the appointment's time +
 * status. Drives the Join button: you can join a few minutes early, stay
 * "live" through the session (plus a grace window), then it reads "ended".
 */
export type MeetingState = 'cancelled' | 'completed' | 'no_show' | 'ended' | 'live' | 'joinable' | 'upcoming';

const JOIN_EARLY_MS = 10 * 60_000; // joinable from 10 min before start
const GRACE_MS = 15 * 60_000;      // stays live 15 min past the scheduled end

export function meetingState(scheduledAt: string, durationMin: number, status: string, now = Date.now()): MeetingState {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'completed') return 'completed';
  if (status === 'no_show') return 'no_show';
  const start = new Date(scheduledAt).getTime();
  const end = start + durationMin * 60_000;
  if (now < start - JOIN_EARLY_MS) return 'upcoming';
  if (now < start) return 'joinable';
  if (now <= end + GRACE_MS) return 'live';
  return 'ended';
}

/** Whether the Join button should be active. */
export function canJoin(state: MeetingState): boolean {
  return state === 'joinable' || state === 'live';
}

/** The Jitsi room id parsed out of a stored meeting URL (or null). */
export function roomOf(meetingUrl: string | null | undefined): string | null {
  if (!meetingUrl) return null;
  try { return new URL(meetingUrl).pathname.replace(/^\/+/, '') || null; }
  catch { return meetingUrl.split('/').pop() || null; }
}

/** Short, human countdown like "in 3h 20m" / "in 2 days". */
export function untilLabel(scheduledAt: string, now = Date.now()): string {
  const diff = new Date(scheduledAt).getTime() - now;
  if (diff <= 0) return 'now';
  const min = Math.round(diff / 60_000);
  if (min < 60) return `in ${min}m`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `in ${hrs}h ${min % 60}m`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days > 1 ? 's' : ''}`;
}

export const KIND_LABEL: Record<string, string> = {
  consultation: 'Consultation',
  follow_up: 'Follow-up',
  check_in: 'Check-in',
  assessment: 'Assessment',
  group_session: 'Group session',
};
export const KIND_DURATION: Record<string, number> = {
  consultation: 45, follow_up: 30, check_in: 15, assessment: 60, group_session: 60,
};

/**
 * Per-type colour, calendar-style. `chip` tints the week-grid block, `bar` is
 * the left accent on list rows, `dot` is a small swatch (e.g. legend / detail).
 * Full class strings so Tailwind keeps them.
 */
export const KIND_COLOR: Record<string, { chip: string; bar: string; dot: string }> = {
  consultation:  { chip: 'border-blue-400/30 bg-blue-400/10 text-blue-700 dark:text-blue-300', bar: 'bg-blue-500', dot: 'bg-blue-500' },
  follow_up:     { chip: 'border-teal-400/30 bg-teal-400/10 text-teal-700 dark:text-teal-300', bar: 'bg-teal-500', dot: 'bg-teal-500' },
  check_in:      { chip: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  assessment:    { chip: 'border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300', bar: 'bg-amber-500', dot: 'bg-amber-500' },
  group_session: { chip: 'border-rose-400/30 bg-rose-400/10 text-rose-700 dark:text-rose-300', bar: 'bg-rose-500', dot: 'bg-rose-500' },
};
export function kindColor(kind: string) { return KIND_COLOR[kind] ?? KIND_COLOR.consultation; }
