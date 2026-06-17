import { Injectable } from '@nestjs/common';
import { CacheService } from '../common/cache/cache.service';
import { AuthUser } from './types/auth-user.type';

/**
 * Short-lived cache of the resolved AuthUser, keyed by user id, layered over
 * the shared {@link CacheService} (Redis when REDIS_URL is set, in-memory
 * otherwise).
 *
 * JwtStrategy.validate() runs on every authenticated request and otherwise hits
 * the (remote) database several times to assemble roles / workspace / org /
 * permissions. A single page load fires many API calls within a couple of
 * seconds, so caching the resolved identity for a short TTL collapses all of
 * those into one set of queries — a large latency win — while keeping the data
 * fresh enough that role/permission changes appear within the TTL.
 *
 * Mutations that change a user's effective scope (workspace switch, impersonate
 * start/stop) call `invalidate(userId)` so the very next request re-resolves.
 */
@Injectable()
export class AuthCacheService {
  /** Long enough to absorb a page's request burst, short enough that
   *  permission/role edits surface quickly. */
  private readonly ttlSeconds = 30;

  constructor(private readonly cache: CacheService) {}

  private key(userId: string): string {
    return `auth:user:${userId}`;
  }

  get(userId: string): Promise<AuthUser | null> {
    return this.cache.get<AuthUser>(this.key(userId));
  }

  set(userId: string, user: AuthUser): Promise<void> {
    return this.cache.set(this.key(userId), user, this.ttlSeconds);
  }

  invalidate(userId: string): Promise<void> {
    return this.cache.del(this.key(userId));
  }
}