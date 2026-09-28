/**
 * Booking hours: when a client may request an appointment with their practice.
 *
 * Times are minutes from midnight in India Standard Time (UTC+05:30, no DST),
 * the only zone NUSI practices run in. A slot is offered when the whole session
 * fits inside the working day, misses the break, is at least `minNoticeHours`
 * away, and doesn't overlap a scheduled or pending appointment (± buffer).
 */

export interface BookingHours {
  enabled: boolean;
  /** Working days, 0 = Sunday ... 6 = Saturday. */
  days: number[];
  dayStart: number;
  dayEnd: number;
  breakStart: number | null;
  breakEnd: number | null;
  /** Gap between offered start times. */
  stepMinutes: number;
  /** Free time kept either side of an existing appointment. */
  bufferMinutes: number;
  minNoticeHours: number;
  horizonDays: number;
}

export const DEFAULT_BOOKING_HOURS: BookingHours = {
  enabled: true,
  days: [1, 2, 3, 4, 5, 6],
  dayStart: 10 * 60,
  dayEnd: 18 * 60,
  breakStart: 13 * 60,
  breakEnd: 14 * 60,
  stepMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 2,
  horizonDays: 14,
};

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

export interface BusyRange {
  start: Date;
  end: Date;
}

/** Open start times (ISO, UTC) for a session of `durationMinutes`. */
export function openBookingSlots(
  hours: BookingHours,
  busy: BusyRange[],
  now: Date,
  durationMinutes: number,
): string[] {
  if (!hours.enabled || durationMinutes <= 0) return [];
  const earliest = now.getTime() + hours.minNoticeHours * 3_600_000;
  const pad = hours.bufferMinutes * 60_000;
  const istToday = new Date(now.getTime() + IST_OFFSET_MS);
  // UTC instant of today's IST midnight.
  const day0 = Date.UTC(istToday.getUTCFullYear(), istToday.getUTCMonth(), istToday.getUTCDate()) - IST_OFFSET_MS;

  const out: string[] = [];
  for (let d = 0; d < hours.horizonDays; d++) {
    const midnight = day0 + d * DAY_MS;
    const weekday = new Date(midnight + IST_OFFSET_MS).getUTCDay();
    if (!hours.days.includes(weekday)) continue;

    for (let m = hours.dayStart; m + durationMinutes <= hours.dayEnd; m += hours.stepMinutes) {
      const endMin = m + durationMinutes;
      if (hours.breakStart != null && hours.breakEnd != null && m < hours.breakEnd && endMin > hours.breakStart) continue;
      const start = midnight + m * 60_000;
      const end = midnight + endMin * 60_000;
      if (start < earliest) continue;
      if (busy.some((b) => start < b.end.getTime() + pad && end > b.start.getTime() - pad)) continue;
      out.push(new Date(start).toISOString());
    }
  }
  return out;
}

/**
 * Validate booking hours from the settings form. Returns the cleaned value, or
 * a message saying what to fix.
 */
export function validateBookingHours(input: BookingHours): { ok: true; value: BookingHours } | { ok: false; message: string } {
  const days = [...new Set(input.days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (input.enabled && days.length === 0) return { ok: false, message: 'Pick at least one working day.' };
  if (!(input.dayStart >= 0 && input.dayEnd <= 1440 && input.dayStart < input.dayEnd)) {
    return { ok: false, message: 'The day must end after it starts.' };
  }
  const hasBreak = input.breakStart != null && input.breakEnd != null;
  if (hasBreak) {
    if (!(input.breakStart! < input.breakEnd!)) return { ok: false, message: 'The break must end after it starts.' };
    if (input.breakStart! < input.dayStart || input.breakEnd! > input.dayEnd) {
      return { ok: false, message: 'The break must fall inside working hours.' };
    }
  }
  return {
    ok: true,
    value: {
      ...input,
      days,
      breakStart: hasBreak ? input.breakStart : null,
      breakEnd: hasBreak ? input.breakEnd : null,
    },
  };
}
