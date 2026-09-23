import { UserThrottlerGuard } from './user-throttler.guard';

/**
 * Rate-limit keying, which is easy to get subtly wrong and only fails at scale.
 *
 * Two bugs this pins down:
 *   - keying by IP alone 429s unrelated users who share a carrier NAT address;
 *   - falling back to the socket address (nginx) puts the whole user base in
 *     one bucket, which is what happens when `trust proxy` is not set.
 */
type Guard = UserThrottlerGuard & {
  getTracker: (req: Record<string, unknown>) => Promise<string>;
};

function makeGuard(): Guard {
  // The base constructor wants module options we do not exercise here; only
  // the keying methods are under test.
  return Object.create(UserThrottlerGuard.prototype) as Guard;
}

/** A Bearer header carrying `sub`, unsigned — the guard never verifies it. */
function bearer(sub: string): Record<string, unknown> {
  const body = Buffer.from(JSON.stringify({ sub }), 'utf8').toString('base64url');
  return { headers: { authorization: `Bearer header.${body}.sig` } };
}

const USER_A = '11111111-2222-4333-8444-555555555555';
const USER_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('UserThrottlerGuard tracker', () => {
  const guard = makeGuard();

  it('keys an authenticated caller by their account', async () => {
    expect(await guard.getTracker(bearer(USER_A))).toBe(`user:${USER_A}`);
  });

  it('gives two users on the SAME IP separate buckets', async () => {
    // The carrier-NAT case: without this they throttle each other.
    const a = { ...bearer(USER_A), ip: '49.37.0.1' };
    const b = { ...bearer(USER_B), ip: '49.37.0.1' };

    expect(await guard.getTracker(a)).not.toBe(await guard.getTracker(b));
  });

  it('gives one user the SAME bucket across changing IPs', async () => {
    const wifi = { ...bearer(USER_A), ip: '10.0.0.5' };
    const mobile = { ...bearer(USER_A), ip: '49.37.0.9' };

    expect(await guard.getTracker(wifi)).toBe(await guard.getTracker(mobile));
  });

  it('falls back to the IP when there is no token', async () => {
    expect(await guard.getTracker({ headers: {}, ip: '203.0.113.7' })).toBe('ip:203.0.113.7');
  });

  describe('malformed tokens fall back to IP instead of throwing', () => {
    it.each([
      ['no Bearer prefix', { headers: { authorization: 'Basic abc' } }],
      ['not three segments', { headers: { authorization: 'Bearer abc.def' } }],
      ['payload is not base64', { headers: { authorization: 'Bearer a.!!!.c' } }],
      ['payload is not JSON', { headers: { authorization: 'Bearer a.bm90LWpzb24.c' } }],
      ['empty header', { headers: { authorization: '' } }],
      ['no headers at all', {}],
    ])('%s', async (_label, req) => {
      const tracker = await guard.getTracker({ ...req, ip: '203.0.113.9' });
      expect(tracker).toBe('ip:203.0.113.9');
    });
  });

  it('ignores a non-UUID subject rather than making a counter key from it', async () => {
    // Otherwise an attacker mints unbounded distinct keys and exhausts memory.
    const req = { ...bearer('not-a-uuid' as string), ip: '203.0.113.11' };
    expect(await guard.getTracker(req)).toBe('ip:203.0.113.11');
  });

  it('ignores a non-string subject', async () => {
    const body = Buffer.from(JSON.stringify({ sub: { nested: true } }), 'utf8').toString(
      'base64url',
    );
    const req = { headers: { authorization: `Bearer h.${body}.s` }, ip: '203.0.113.12' };
    expect(await guard.getTracker(req)).toBe('ip:203.0.113.12');
  });
});
