import { HORIZON_DAYS, MIN_NOTICE_MIN, formatSlotIST, isValidSlot, openSlots } from './call-slots';

/**
 * Slots are offered to strangers on the internet and turn into calendar events,
 * so the rules are pinned here: IST working hours, no Sundays, enough notice,
 * and never a time another lead already holds.
 */

/** A UTC instant for a wall-clock time in IST. */
const ist = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min) - 330 * 60_000);

// Wednesday 23 Sep 2026, 09:00 IST.
const NOW = ist(2026, 9, 23, 9);

describe('isValidSlot', () => {
  it('accepts a half-hour inside working hours with enough notice', () => {
    expect(isValidSlot(ist(2026, 9, 23, 15, 30), NOW)).toBe(true);
    expect(isValidSlot(ist(2026, 9, 26, 10, 0), NOW)).toBe(true); // Saturday
  });

  it('rejects Sundays', () => {
    expect(isValidSlot(ist(2026, 9, 27, 11, 0), NOW)).toBe(false);
  });

  it('rejects times outside 10:00 - 19:00 IST', () => {
    expect(isValidSlot(ist(2026, 9, 23, 9, 30), NOW)).toBe(false);
    expect(isValidSlot(ist(2026, 9, 23, 18, 30), NOW)).toBe(true); // last slot, ends 19:00
    expect(isValidSlot(ist(2026, 9, 23, 19, 0), NOW)).toBe(false); // would end 19:30
  });

  it('rejects times that are not on a half-hour', () => {
    expect(isValidSlot(ist(2026, 9, 23, 15, 15), NOW)).toBe(false);
  });

  it(`rejects less than ${MIN_NOTICE_MIN} minutes notice, and the past`, () => {
    expect(isValidSlot(ist(2026, 9, 23, 10, 0), NOW)).toBe(false); // 1h away
    expect(isValidSlot(ist(2026, 9, 22, 15, 0), NOW)).toBe(false); // yesterday
  });

  it(`rejects beyond ${HORIZON_DAYS} days`, () => {
    expect(isValidSlot(ist(2026, 10, 20, 11, 0), NOW)).toBe(false);
  });

  it('rejects an unparseable date', () => {
    expect(isValidSlot(new Date('not a date'), NOW)).toBe(false);
  });
});

describe('openSlots', () => {
  it('offers only valid slots, in order', () => {
    const slots = openSlots([], NOW).map((s) => new Date(s));
    expect(slots.length).toBeGreaterThan(50);
    expect(slots.every((d) => isValidSlot(d, NOW))).toBe(true);
    expect([...slots].sort((a, b) => a.getTime() - b.getTime())).toEqual(slots);
  });

  it('leaves out slots another lead already holds', () => {
    const taken = ist(2026, 9, 23, 15, 30);
    const slots = openSlots([taken], NOW);
    expect(slots).not.toContain(taken.toISOString());
    expect(openSlots([], NOW)).toContain(taken.toISOString());
  });
});

describe('formatSlotIST', () => {
  it('reads as an Indian date and time', () => {
    const text = formatSlotIST(ist(2026, 9, 24, 15, 30));
    expect(text).toContain('24 Sep');
    expect(text).toContain('3:30');
    expect(text).toContain('IST');
  });
});
