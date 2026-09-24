import { HORIZON_DAYS, MIN_NOTICE_MIN, formatSlotIST, isValidSlot, openSlots } from './call-slots';

/**
 * Slots are offered to strangers on the internet and turn into calendar events,
 * so the rules are pinned here: IST working hours, hourly 45-minute calls with a
 * 15-minute break, lunch 13:00-14:00, no weekends, enough notice, and never on
 * top of another lead or a meeting already on the calendar.
 */

/** A UTC instant for a wall-clock time in IST. */
const ist = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min) - 330 * 60_000);

// Wednesday 23 Sep 2026, 09:00 IST.
const NOW = ist(2026, 9, 23, 9);

describe('isValidSlot', () => {
  it('accepts the hourly starts inside working hours', () => {
    for (const h of [11, 12, 14, 15, 16]) expect(isValidSlot(ist(2026, 9, 23, h), NOW)).toBe(true);
    expect(isValidSlot(ist(2026, 9, 25, 11), NOW)).toBe(true); // Friday
  });

  it('rejects the lunch hour', () => {
    expect(isValidSlot(ist(2026, 9, 23, 13), NOW)).toBe(false);
  });

  it('rejects starts that are not on the hour (45 min call + 15 min break)', () => {
    expect(isValidSlot(ist(2026, 9, 23, 15, 30), NOW)).toBe(false);
    expect(isValidSlot(ist(2026, 9, 23, 15, 45), NOW)).toBe(false);
  });

  it('rejects weekends', () => {
    expect(isValidSlot(ist(2026, 9, 26, 12), NOW)).toBe(false); // Saturday
    expect(isValidSlot(ist(2026, 9, 27, 12), NOW)).toBe(false); // Sunday
  });

  it('rejects times outside 11:00 - 17:00 IST', () => {
    expect(isValidSlot(ist(2026, 9, 23, 10), NOW)).toBe(false);
    expect(isValidSlot(ist(2026, 9, 23, 17), NOW)).toBe(false);
  });

  it(`rejects less than ${MIN_NOTICE_MIN} minutes notice, and the past`, () => {
    expect(isValidSlot(ist(2026, 9, 23, 11), ist(2026, 9, 23, 10))).toBe(false); // only 1h away
    expect(isValidSlot(ist(2026, 9, 23, 11), NOW)).toBe(true); // exactly 2h away is fine
    expect(isValidSlot(ist(2026, 9, 22, 15), NOW)).toBe(false); // yesterday
  });

  it(`rejects beyond ${HORIZON_DAYS} days`, () => {
    expect(isValidSlot(ist(2026, 10, 20, 11), NOW)).toBe(false);
  });

  it('rejects an unparseable date', () => {
    expect(isValidSlot(new Date('not a date'), NOW)).toBe(false);
  });
});

describe('openSlots', () => {
  it('offers five slots a weekday, only valid ones, in order', () => {
    const slots = openSlots([], NOW).map((s) => new Date(s));
    expect(slots.every((d) => isValidSlot(d, NOW))).toBe(true);
    expect([...slots].sort((a, b) => a.getTime() - b.getTime())).toEqual(slots);
    const wed = slots.filter((d) => d.getTime() < ist(2026, 9, 24, 0).getTime());
    expect(wed.map((d) => d.toISOString())).toEqual([11, 12, 14, 15, 16].map((h) => ist(2026, 9, 23, h).toISOString()));
  });

  it('leaves out a slot another lead already holds', () => {
    const taken = ist(2026, 9, 23, 15);
    expect(openSlots([], NOW)).toContain(taken.toISOString());
    expect(openSlots([taken], NOW)).not.toContain(taken.toISOString());
  });

  it('blocks slots that overlap a calendar meeting, including the 15-minute break', () => {
    // "Connect with Dr.Saleem" 14:30-15:30 IST.
    const busy = [{ start: ist(2026, 9, 23, 14, 30), end: ist(2026, 9, 23, 15, 30) }];
    const slots = openSlots([], NOW, busy);
    expect(slots).not.toContain(ist(2026, 9, 23, 14).toISOString());
    expect(slots).not.toContain(ist(2026, 9, 23, 15).toISOString());
    expect(slots).toContain(ist(2026, 9, 23, 16).toISOString()); // 30 min after it ends
    expect(slots).toContain(ist(2026, 9, 23, 12).toISOString());
  });

  it('needs the full break after a meeting', () => {
    // Meeting ends 15:50 - a 16:00 call would leave only 10 minutes.
    const busy = [{ start: ist(2026, 9, 23, 15, 20), end: ist(2026, 9, 23, 15, 50) }];
    expect(openSlots([], NOW, busy)).not.toContain(ist(2026, 9, 23, 16).toISOString());
  });

  it('blocks slots touched by an older 30-minute booking at half past', () => {
    const legacy = ist(2026, 9, 23, 15, 30);
    const slots = openSlots([legacy], NOW);
    expect(slots).not.toContain(ist(2026, 9, 23, 15).toISOString());
    expect(slots).not.toContain(ist(2026, 9, 23, 16).toISOString());
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
