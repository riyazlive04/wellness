import { DEFAULT_BOOKING_HOURS, openBookingSlots, validateBookingHours, type BookingHours } from './booking-hours';

/**
 * Clients can only request times the practice actually works, so the slot
 * maths decides what every client sees. Times below are IST (UTC+05:30).
 */

// Monday 28 Sep 2026, 08:00 IST = 02:30 UTC.
const MONDAY_8AM_IST = new Date('2026-09-28T02:30:00Z');
const ist = (isoLocal: string) => new Date(`${isoLocal}+05:30`).toISOString();

const oneDay: BookingHours = { ...DEFAULT_BOOKING_HOURS, horizonDays: 1 };

describe('openBookingSlots', () => {
  it('offers 30-minute starts from 10:00 to 17:30, skipping the 1-2 PM lunch', () => {
    const slots = openBookingSlots(oneDay, [], MONDAY_8AM_IST, 30);
    expect(slots[0]).toBe(ist('2026-09-28T10:00:00'));
    expect(slots).toContain(ist('2026-09-28T12:30:00'));
    expect(slots).not.toContain(ist('2026-09-28T13:00:00'));
    expect(slots).not.toContain(ist('2026-09-28T13:30:00'));
    expect(slots).toContain(ist('2026-09-28T14:00:00'));
    expect(slots[slots.length - 1]).toBe(ist('2026-09-28T17:30:00'));
    expect(slots).toHaveLength(14);
  });

  it('keeps a long session clear of lunch and the end of the day', () => {
    const slots = openBookingSlots(oneDay, [], MONDAY_8AM_IST, 60);
    expect(slots).toContain(ist('2026-09-28T12:00:00'));
    expect(slots).not.toContain(ist('2026-09-28T12:30:00')); // would run into lunch
    expect(slots[slots.length - 1]).toBe(ist('2026-09-28T17:00:00'));
  });

  it('respects the minimum notice', () => {
    const at10 = new Date('2026-09-28T04:30:00Z'); // 10:00 IST, 2h notice
    const slots = openBookingSlots(oneDay, [], at10, 30);
    expect(slots[0]).toBe(ist('2026-09-28T12:00:00'));
  });

  it('skips non-working days', () => {
    const sunday = new Date('2026-09-27T02:30:00Z'); // Sunday 08:00 IST
    expect(openBookingSlots(oneDay, [], sunday, 30)).toEqual([]);
  });

  it('never offers a time that overlaps an existing appointment', () => {
    const busy = [{ start: new Date(ist('2026-09-28T11:00:00')), end: new Date(ist('2026-09-28T11:45:00')) }];
    const slots = openBookingSlots(oneDay, busy, MONDAY_8AM_IST, 30);
    expect(slots).toContain(ist('2026-09-28T10:30:00'));
    expect(slots).not.toContain(ist('2026-09-28T11:00:00'));
    expect(slots).not.toContain(ist('2026-09-28T11:30:00'));
    expect(slots).toContain(ist('2026-09-28T12:00:00'));
  });

  it('keeps the buffer around existing appointments', () => {
    const busy = [{ start: new Date(ist('2026-09-28T11:00:00')), end: new Date(ist('2026-09-28T11:30:00')) }];
    const slots = openBookingSlots({ ...oneDay, bufferMinutes: 15 }, busy, MONDAY_8AM_IST, 30);
    expect(slots).not.toContain(ist('2026-09-28T10:30:00'));
    expect(slots).not.toContain(ist('2026-09-28T11:30:00'));
    expect(slots).toContain(ist('2026-09-28T12:00:00'));
  });

  it('offers nothing while booking hours are switched off', () => {
    expect(openBookingSlots({ ...oneDay, enabled: false }, [], MONDAY_8AM_IST, 30)).toEqual([]);
  });

  it('looks ahead the configured number of days', () => {
    const week = openBookingSlots({ ...DEFAULT_BOOKING_HOURS, horizonDays: 7 }, [], MONDAY_8AM_IST, 30);
    // Mon-Sat worked, Sunday off: 6 days x 14 starts.
    expect(week).toHaveLength(84);
  });
});

describe('validateBookingHours', () => {
  it('accepts the defaults', () => {
    expect(validateBookingHours(DEFAULT_BOOKING_HOURS).ok).toBe(true);
  });

  it.each([
    [{ days: [] }, 'Pick at least one working day.'],
    [{ dayStart: 18 * 60, dayEnd: 10 * 60 }, 'The day must end after it starts.'],
    [{ breakStart: 14 * 60, breakEnd: 13 * 60 }, 'The break must end after it starts.'],
    [{ breakStart: 8 * 60, breakEnd: 9 * 60 }, 'The break must fall inside working hours.'],
  ])('rejects %j', (change, message) => {
    const r = validateBookingHours({ ...DEFAULT_BOOKING_HOURS, ...change });
    expect(r).toEqual({ ok: false, message });
  });

  it('drops a half-filled break instead of saving it', () => {
    const r = validateBookingHours({ ...DEFAULT_BOOKING_HOURS, breakStart: 780, breakEnd: null });
    expect(r.ok && r.value.breakStart).toBe(null);
  });
});
