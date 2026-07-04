import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, tap } from 'rxjs';

import { CacheService } from './cache.service';
import { NO_CACHE } from './no-cache.decorator';

interface CacheableRequest {
  method: string;
  originalUrl: string;
  user?: { id?: string; workspaceId?: string | null };
}

/**
 * Global response cache for authenticated GET endpoints across every section.
 *
 * Correctness first:
 *   - Keyed per (workspace, user) + full URL, so one tenant can NEVER be served
 *     another tenant's cached data. Anonymous requests are never cached.
 *   - A per-scope version counter is bumped on ANY write by that user, so they
 *     immediately see their own changes (read-your-writes). Only *other* users'
 *     writes lag, and only up to the short TTL.
 *   - Runs INNERMOST (below TransformInterceptor) so it caches the pure payload;
 *     the requestId in `meta` stays fresh on every hit.
 *   - `@NoCache()` opts any route out entirely.
 *
 * Backed by CacheService → Redis when REDIS_URL is set, in-memory otherwise, and
 * degrades to plain DB reads if Redis is unavailable.
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  /** Seconds a cached GET response lives — short, so live data lags minimally. */
  private static readonly TTL_SECONDS = 15;
  /** Version counters outlive any single response. */
  private static readonly VERSION_TTL = 6 * 60 * 60;

  constructor(
    private readonly cache: CacheService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const optedOut = this.reflector.getAllAndOverride<boolean>(NO_CACHE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (optedOut) return next.handle();

    const req = context.switchToHttp().getRequest<CacheableRequest>();
    const scope = this.scopeOf(req);

    // Writes run normally, then bust this user's cache so their next reads are
    // fresh (read-your-writes). Non-GET responses are never cached.
    if (req.method !== 'GET') {
      if (!scope) return next.handle();
      return next.handle().pipe(tap(() => void this.bump(scope)));
    }

    // Only cache authenticated, tenant-scoped GETs.
    if (!scope) return next.handle();

    const version = (await this.cache.get<number>(this.versionKey(scope))) ?? 0;
    const key = `hc:${scope}:v${version}:${req.originalUrl}`;

    const cached = await this.cache.get<unknown>(key);
    if (cached !== null && cached !== undefined) return of(cached);

    return next.handle().pipe(
      tap((body) => {
        if (body !== undefined && body !== null) {
          void this.cache.set(key, body, HttpCacheInterceptor.TTL_SECONDS);
        }
      }),
    );
  }

  /** Tenant+user scope; null for anonymous/public requests (which we don't cache). */
  private scopeOf(req: CacheableRequest): string | null {
    const u = req.user;
    if (!u?.id) return null;
    return `${u.workspaceId ?? '-'}:${u.id}`;
  }

  private versionKey(scope: string): string {
    return `cv:${scope}`;
  }

  private async bump(scope: string): Promise<void> {
    const key = this.versionKey(scope);
    const current = (await this.cache.get<number>(key)) ?? 0;
    await this.cache.set(key, current + 1, HttpCacheInterceptor.VERSION_TTL);
  }
}
