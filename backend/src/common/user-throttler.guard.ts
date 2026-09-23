import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit per USER rather than per IP wherever we can tell who is calling.
 *
 * The default guard buckets by IP, which breaks badly for a mobile app in
 * India: carrier-grade NAT puts many subscribers behind one public address, so
 * a handful of unrelated users on the same carrier share a single limit and
 * start 429-ing each other. It only shows up once enough real users are active
 * at once, and it looks like the server failing rather than a limiter working.
 *
 * Keying on the JWT subject gives each account its own budget.
 *
 * ── Why decode instead of verify ─────────────────────────────────────────
 *
 * This guard runs BEFORE JwtAuthGuard (see APP_GUARD order in app.module), so
 * `req.user` does not exist yet, and verifying here would mean doing the
 * signature work twice on every request.
 *
 * The subject is therefore read from an unverified token — fine for choosing a
 * counter, since a forged one still fails authentication a moment later and
 * gets a 401. What it does allow is rotating fake subjects to dodge the
 * per-user limit, which is why `ip` below stays keyed to the address and acts
 * as a backstop no token can escape.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  /**
   * Identify the caller: their account when a token is present, else their IP.
   *
   * `req.ip` is only meaningful because main.ts sets `trust proxy` — without it
   * every request reads as nginx on 127.0.0.1 and the whole user base shares
   * one bucket.
   */
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const sub = subjectOf(req);
    if (sub) return `user:${sub}`;

    const ip = (req.ip as string) || 'unknown';
    return `ip:${ip}`;
  }

  /**
   * The `ip` limiter always keys by address, whatever the tracker said.
   *
   * Everything else follows getTracker (per user when known). This is what
   * stops an attacker minting fresh unsigned subjects to get an unlimited
   * number of per-user budgets — they still share one generous IP ceiling.
   */
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    if (name !== 'ip') return super.generateKey(context, suffix, name);

    const req = context.switchToHttp().getRequest<Record<string, unknown>>();
    const ip = (req.ip as string) || 'unknown';
    return super.generateKey(context, `ip:${ip}`, name);
  }
}

/**
 * Pull `sub` out of a Bearer token without verifying it.
 *
 * Hand-decoded rather than pulled through a JWT library: we want the claim for
 * bucketing only, and a malformed or hostile token must return null rather than
 * throw and take the request down before any real guard has seen it.
 */
function subjectOf(req: Record<string, unknown>): string | null {
  const headers = req.headers as Record<string, string | string[]> | undefined;
  const raw = headers?.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header || !header.startsWith('Bearer ')) return null;

  const parts = header.slice(7).trim().split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      sub?: unknown;
    };
    const sub = payload.sub;
    // Supabase subjects are UUIDs. Anything else is not something we want to
    // turn into an unbounded set of counter keys.
    if (typeof sub !== 'string') return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) return null;
    return sub;
  } catch {
    return null;
  }
}
