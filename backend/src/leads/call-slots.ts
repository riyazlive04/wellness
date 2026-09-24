/**
 * Demo-call slots offered on the landing page.
 *
 * Fixed working hours in IST, Monday to Friday. Everything here works in UTC
 * instants and only formats into IST, so a server in any timezone - and a lead
 * in any timezone - agree on which call was booked.
 *
 * Calls are 45 minutes with a 15-minute break after each, so slots start on
 * the hour (11:00, 12:00, 14:00, 15:00, 16:00). 13:00-14:00 is lunch.
 *
 * A slot is offered when it is inside working hours, at least MIN_NOTICE_MIN
 * away, within HORIZON_DAYS, and clear - including the break on either side -
 * of other leads' calls and of anything already on the team's Google Calendar.
 */

export const SLOT_MINUTES = 45;
export const BREAK_MINUTES = 15;
const SLOT_STEP_MIN = SLOT_MINUTES + BREAK_MINUTES;
export const OPEN_HOUR_IST = 11; // first slot starts 11:00 IST
export const CLOSE_HOUR_IST = 17; // last call must end by 17:00 IST
export const LUNCH_IST = { start: 13 * 60, end: 14 * 60 }; // minutes since midnight
export const CLOSED_WEEKDAYS = [0, 6]; // Sunday and Saturday, in IST
export const HORIZON_DAYS = 14;
export const MIN_NOTICE_MIN = 120;

const IST_OFFSET_MIN = 330; // +05:30, India has no DST

/** The wall-clock date and time in IST for a UTC instant. */
export function istParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    weekday: ist.getUTCDay(),
  };
}

/** Is this instant the start of a bookable slot (hours, lunch, day, notice, horizon)? */
export function isValidSlot(start: Date, now = new Date()): boolean {
  if (Number.isNaN(start.getTime())) return false;
  if (start.getUTCSeconds() || start.getUTCMilliseconds()) return false;
  const { hour, minute, weekday } = istParts(start);
  if (CLOSED_WEEKDAYS.includes(weekday)) return false;
  const from = hour * 60 + minute;
  const to = from + SLOT_MINUTES;
  if (from < OPEN_HOUR_IST * 60) return false;
  if ((from - OPEN_HOUR_IST * 60) % SLOT_STEP_MIN !== 0) return false;
  if (to > CLOSE_HOUR_IST * 60) return false;
  if (from < LUNCH_IST.end && to > LUNCH_IST.start) return false;
  const minutesAway = (start.getTime() - now.getTime()) / 60_000;
  return minutesAway >= MIN_NOTICE_MIN && minutesAway <= HORIZON_DAYS * 24 * 60;
}

export interface BusyInterval {
  start: Date;
  end: Date;
}

/** Would a call starting here collide with `busy`, counting the break on both sides? */
export function clashes(start: Date, busy: BusyInterval[]): boolean {
  const from = start.getTime() - BREAK_MINUTES * 60_000;
  const to = start.getTime() + (SLOT_MINUTES + BREAK_MINUTES) * 60_000;
  return busy.some((b) => from < b.end.getTime() && to > b.start.getTime());
}

/**
 * Every slot from now to the horizon that is valid and clear of `taken` (other
 * leads' call starts) and `busy` (meetings already on the calendar, booked
 * outside NUSI). Returned as ISO instants, in time order.
 */
export function openSlots(taken: Date[], now = new Date(), busy: BusyInterval[] = []): string[] {
  const blocked: BusyInterval[] = [
    ...busy,
    ...taken.map((d) => ({ start: d, end: new Date(d.getTime() + SLOT_MINUTES * 60_000) })),
  ];
  const slots: string[] = [];
  // Walk quarter-hours (IST is UTC+5:30, so IST hours fall on :30 UTC) and let
  // isValidSlot pick out the real starts.
  const step = 15 * 60_000;
  const first = Math.ceil(now.getTime() / step) * step;
  const last = now.getTime() + HORIZON_DAYS * 24 * 60 * 60_000;
  for (let t = first; t <= last; t += step) {
    const d = new Date(t);
    if (!isValidSlot(d, now)) continue;
    if (clashes(d, blocked)) continue;
    slots.push(d.toISOString());
  }
  return slots;
}

/** "Tue, 24 Sep · 3:30 PM IST" - used in WhatsApp and email confirmations. */
export function formatSlotIST(start: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(start).replace(/,([^,]*)$/, ' ·$1') + ' IST';
}
