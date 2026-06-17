import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Global cache module — exposes CacheService everywhere without per-module
 * imports. Backend is Redis when REDIS_URL is set, in-memory otherwise.
 */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}