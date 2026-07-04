import { SetMetadata } from '@nestjs/common';

/** Metadata key read by HttpCacheInterceptor to skip a route. */
export const NO_CACHE = 'sirah:no_cache';

/**
 * Opt a controller or route out of the global GET response cache. Use on any
 * endpoint that must always hit the handler (e.g. sets cookies/headers, or
 * needs strict real-time freshness beyond the short cache TTL).
 */
export const NoCache = () => SetMetadata(NO_CACHE, true);
