/**
 * Demo-call slots offered on the landing page.
 *
 * Fixed working hours in IST, Monday to Friday. Everything here works in UTC
 * instants and only formats into IST, so a server in any timezone - and a lead
 * in any timezone - agree on which half-hour was booked.
 *
 * A slot is offered when it is inside working hours, at least MIN_NOTICE_MIN
 * away (nobody should book a call starting in four minutes), within
 * HORIZON_DAYS, and not already held by another lead.
 */

export const SLOT_MINUTES = 30;
export const OPEN_HOUR_IST = 11; // first slot starts 11:00 IST
export const CLOSE_HOUR_IST = 17; // last slot ends 17:00 IST
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

/** Is this instant the start of a bookable slot (hours, day, notice, horizon)? */
export function isValidSlot(start: Date, now = new Date()): boolean {
  if (Number.isNaN(start.getTime())) return false;
  const { hour, minute, weekday } = istParts(start);
  if (CLOSED_WEEKDAYS.includes(weekday)) return false;
  if (minute % SLOT_MINUTES !== 0) return false;
  if (hour < OPEN_HOUR_IST) return false;
  // The slot must also END within working hours.
  if (hour * 60 + minute + SLOT_MINUTES > CLOSE_HOUR_IST * 60) return false;
  const minutesAway = (start.getTime() - now.getTime()) / 60_000;
  return minutesAway >= MIN_NOTICE_MIN && minutesAway <= HORIZON_DAYS * 24 * 60;
}

/**
 * Every slot from now to the horizon, minus the ones already taken.
 * Returned as ISO instants, in time order.
 */
export function openSlots(taken: Date[], now = new Date()): string[] {
  const busy = new Set(taken.map((d) => d.getTime()));
  const slots: string[] = [];

  // Walk half-hours from the next whole slot boundary after the notice period.
  const first = new Date(Math.ceil((now.getTime() + MIN_NOTICE_MIN * 60_000) / (SLOT_MINUTES * 60_000)) * SLOT_MINUTES * 60_000);
  const last = now.getTime() + HORIZON_DAYS * 24 * 60 * 60_000;

  for (let t = first.getTime(); t <= last; t += SLOT_MINUTES * 60_000) {
    const d = new Date(t);
    if (!isValidSlot(d, now)) continue;
    if (busy.has(t)) continue;
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
