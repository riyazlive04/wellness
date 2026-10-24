import { Reflector } from '@nestjs/core';
import { DeviceLimitException, DeviceLimitGuard } from './device-limit.guard';
import { AuthUser } from '../types/auth-user.type';

/**
 * A staff member of a practice - the only kind of user the rule applies to.
 */
const STAFF: Partial<AuthUser> = {
  id: 'u1',
  isSuperAdmin: false,
  isClient: false,
  workspaceId: 'w1',
  workspaceRole: 'nutritionist',
};

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

/** A bearer token carrying one session_id claim. Only the payload is read. */
function tokenFor(sessionId: string): string {
  const payload = Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url');
  return `Bearer header.${payload}.sig`;
}

function ctx(opts: {
  user?: Partial<AuthUser> | undefined;
  url?: string;
  ua?: string;
  sessionId?: string;
}) {
  const req = {
    user: opts.user,
    originalUrl: opts.url ?? '/api/v1/clients',
    headers: {
      'user-agent': opts.ua ?? DESKTOP_UA,
      ...(opts.sessionId ? { authorization: tokenFor(opts.sessionId) } : {}),
    },
  };
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never;
}

/** Sessions ordered oldest-first, as the guard's query returns them. */
function session(id: string, ua: string | null, createdOrder: number) {
  return {
    id,
    user_agent: ua,
    ip: '10.0.0.1/32',
    last_active_at: new Date(2026, 0, createdOrder),
    model: null,
  };
}

function makeGuard(rows: unknown[], cacheHit = false) {
  const cache = {
    get: jest.fn().mockResolvedValue(cacheHit ? true : null),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue(rows) };
  // Stubbed rather than a real Reflector: Reflect.getMetadata throws on the
  // undefined handler/class a bare context stub returns. Same approach as
  // trial.guard.spec.
  const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
  const guard = new DeviceLimitGuard(reflector, prisma as never, cache as never);
  return { guard, cache, prisma };
}

describe('DeviceLimitGuard', () => {
  it('allows a single browser session', async () => {
    const { guard } = makeGuard([session('s1', DESKTOP_UA, 1)]);
    await expect(guard.canActivate(ctx({ user: STAFF, sessionId: 's1' }))).resolves.toBe(true);
  });

  // The whole point of the rule: a second person on the same login.
  it('blocks a second browser session and names the one holding the slot', async () => {
    const { guard } = makeGuard([
      session('s1', DESKTOP_UA, 1),
      session('s2', DESKTOP_UA, 2),
    ]);
    await expect(
      guard.canActivate(ctx({ user: STAFF, sessionId: 's2' })),
    ).rejects.toThrow(DeviceLimitException);
  });

  // The oldest session keeps working - someone at their desk is not thrown off
  // because a second device appeared.
  it('leaves the older session working when a newer one is blocked', async () => {
    const { guard } = makeGuard([
      session('s1', DESKTOP_UA, 1),
      session('s2', DESKTOP_UA, 2),
    ]);
    await expect(guard.canActivate(ctx({ user: STAFF, sessionId: 's1' }))).resolves.toBe(true);
  });

  // The reason the limit is per-kind: one person using desk and phone is the
  // normal case, and must not be treated as sharing.
  it('allows one browser and one mobile session at the same time', async () => {
    const rows = [session('web1', DESKTOP_UA, 1), session('app1', 'okhttp/4.9.2', 2)];
    const { guard } = makeGuard(rows);
    await expect(guard.canActivate(ctx({ user: STAFF, sessionId: 'web1' }))).resolves.toBe(true);
    await expect(
      guard.canActivate(ctx({ user: STAFF, sessionId: 'app1', ua: 'okhttp/4.9.2' })),
    ).resolves.toBe(true);
  });

  it('blocks a second mobile session', async () => {
    const { guard } = makeGuard([
      session('app1', 'okhttp/4.9.2', 1),
      session('app2', 'okhttp/4.9.2', 2),
    ]);
    await expect(
      guard.canActivate(ctx({ user: STAFF, sessionId: 'app2', ua: 'okhttp/4.9.2' })),
    ).rejects.toThrow(DeviceLimitException);
  });

  it('exempts super admins', async () => {
    const { guard, prisma } = makeGuard([]);
    await expect(
      guard.canActivate(ctx({ user: { ...STAFF, isSuperAdmin: true }, sessionId: 's9' })),
    ).resolves.toBe(true);
    // Exempt before any query runs.
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('exempts clients', async () => {
    const { guard, prisma } = makeGuard([]);
    await expect(
      guard.canActivate(ctx({ user: { ...STAFF, isClient: true }, sessionId: 's9' })),
    ).resolves.toBe(true);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  // Without this the blocking screen could not render, and the user could not
  // end the other session - they would be stuck with no way out.
  it('keeps the sessions endpoints open while blocked', async () => {
    const { guard, prisma } = makeGuard([
      session('s1', DESKTOP_UA, 1),
      session('s2', DESKTOP_UA, 2),
    ]);
    for (const url of ['/api/v1/me/sessions', '/api/v1/me/sessions/s1', '/api/v1/auth/scope']) {
      await expect(guard.canActivate(ctx({ user: STAFF, sessionId: 's2', url }))).resolves.toBe(true);
    }
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  // A device rule must never be why the product stops working.
  it('does not enforce when the session table cannot be read', async () => {
    const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    const prisma = { $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('no such table')) };
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const guard = new DeviceLimitGuard(reflector, prisma as never, cache as never);
    await expect(guard.canActivate(ctx({ user: STAFF, sessionId: 's2' }))).resolves.toBe(true);
  });

  it('does not enforce on a token with no session_id claim', async () => {
    const { guard, prisma } = makeGuard([]);
    await expect(guard.canActivate(ctx({ user: STAFF }))).resolves.toBe(true);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('skips the query for a session already known to be within the limit', async () => {
    const { guard, prisma } = makeGuard([], true);
    await expect(guard.canActivate(ctx({ user: STAFF, sessionId: 's1' }))).resolves.toBe(true);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('ignores unauthenticated requests', async () => {
    const { guard } = makeGuard([]);
    await expect(guard.canActivate(ctx({ user: undefined }))).resolves.toBe(true);
  });
});
