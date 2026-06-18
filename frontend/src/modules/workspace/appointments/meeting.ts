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
