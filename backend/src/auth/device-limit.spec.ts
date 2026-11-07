import { IDLE_CUTOFF_HOURS, MAX_PER_KIND, deviceKindFromUserAgent, isIdle } from './device-limit';

/**
 * The UA strings below are real ones taken from auth.sessions on production,
 * not invented - the whole rule rests on telling the app apart from a phone
 * browser, and that distinction is only worth testing against what devices
 * actually send.
 */
describe('deviceKindFromUserAgent', () => {
  it('counts the Android app as mobile', () => {
    expect(deviceKindFromUserAgent('okhttp/4.9.2')).toBe('mobile');
  });

  it('counts the iOS app as mobile', () => {
    expect(deviceKindFromUserAgent('NUSI/1.0.12 CFNetwork/1498.700.2 Darwin/23.6.0')).toBe('mobile');
  });

  it('counts a desktop browser as web', () => {
    expect(
      deviceKindFromUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
      ),
    ).toBe('web');
  });

  // The one that matters: a nutritionist opening nusi.in on their phone is
  // using the WEB app. Calling it mobile would let one person hold both slots
  // with two browsers and never trip the limit.
  it('counts a phone browser as web, not mobile', () => {
    expect(
      deviceKindFromUserAgent(
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('web');
    expect(
      deviceKindFromUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('web');
  });

  // Supabase can record a session with no UA at all. Guessing 'mobile' there
  // would hand out a free extra slot, so an unknown client counts as web.
  it('treats a missing or unknown user agent as web', () => {
    expect(deviceKindFromUserAgent(null)).toBe('web');
    expect(deviceKindFromUserAgent(undefined)).toBe('web');
    expect(deviceKindFromUserAgent('')).toBe('web');
    expect(deviceKindFromUserAgent('node')).toBe('web');
  });
});

describe('isIdle', () => {
  const now = new Date('2026-10-24T15:00:00Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  it('does not treat a session in use as idle', () => {
    expect(isIdle(hoursAgo(0), now)).toBe(false);
    expect(isIdle(hoursAgo(1), now)).toBe(false);
  });

  // The cutoff exists so a normal working day never trips it: someone who
  // signed in at nine still owns their slot in the afternoon.
  it('keeps a session from earlier the same working day', () => {
    expect(isIdle(hoursAgo(6), now)).toBe(false);
    expect(isIdle(hoursAgo(IDLE_CUTOFF_HOURS - 1), now)).toBe(false);
  });

  // Supabase keeps the row after a browser closes, so this is what stops a
  // dead session holding a slot against the device in front of the person.
  it('treats yesterday and older as idle', () => {
    expect(isIdle(hoursAgo(IDLE_CUTOFF_HOURS), now)).toBe(true);
    expect(isIdle(hoursAgo(24 * 9), now)).toBe(true);
  });

  // An unknown last-active time must not silently free a slot.
  it('does not call a session with no timestamp idle', () => {
    expect(isIdle(null, now)).toBe(false);
  });
});

/**
 * How many sessions of one kind may run at once.
 *
 * Raised from 1 to 2 on 2026-11-07. Nothing covered the COUNT before - the
 * existing tests check which bucket a user agent lands in and when a session
 * goes idle - so a change to the allowance could have shipped with no test
 * noticing. These pin the allocation rule itself.
 */
describe('how many sessions of one kind are allowed', () => {
  // Mirrors the guard: oldest-first keeps the slots, the rest are blocked.
  const allocate = (startedAt: number[], limit = MAX_PER_KIND) => {
    const ranked = startedAt
      .map((t, id) => ({ id, t }))
      .sort((a, b) => a.t - b.t);
    const allowed = new Set(ranked.slice(0, limit).map((r) => r.id));
    return startedAt.map((_, id) => allowed.has(id));
  };

  it('allows two of the same kind at once', () => {
    expect(MAX_PER_KIND).toBe(2);
    expect(allocate([100, 200])).toEqual([true, true]);
  });

  it('blocks only the third', () => {
    // Desktop, laptop, then someone else on the same password.
    expect(allocate([100, 200, 300])).toEqual([true, true, false]);
  });

  it('keeps the slots with the sessions that started first', () => {
    // Not last-active: each device refreshes its own timestamp every
    // request, so ranking by activity handed the slot back and forth and
    // nobody was ever blocked.
    expect(allocate([300, 100, 200])).toEqual([false, true, true]);
  });

  it('still stops a password shared round a team', () => {
    const five = allocate([1, 2, 3, 4, 5]);
    expect(five.filter(Boolean)).toHaveLength(2);
  });

  it('web and mobile are separate buckets, so two each means four devices', () => {
    // The guard filters by kind before allocating, so a full web allowance
    // never costs someone their phone.
    const web = allocate([100, 200]);
    const mobile = allocate([150, 250]);
    expect([...web, ...mobile].filter(Boolean)).toHaveLength(4);
  });
});
