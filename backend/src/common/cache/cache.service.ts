import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Process-wide cache with a Redis backend when `REDIS_URL` is configured,
 * falling back to an in-memory map otherwise.
 *
 * Why both:
 *   - Single backend instance (no REDIS_URL): the in-memory map is the fastest
 *     possible cache — a local lookup, no network hop. This is the default.
 *   - Multiple instances (REDIS_URL set): Redis gives one shared, restart-safe
 *     cache so a warm entry on one instance serves all of them.
 *
 * Redis failures degrade gracefully to cache MISSES (return null / skip the
 * write), so a flaky Redis never takes the app down — requests just hit the DB.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis | null;
  private readonly mem = new Map<string, { value: string; expiresAt: number }>();

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL')?.trim();
    if (url) {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 2,
        // Don't queue commands while disconnected — fail fast to a cache miss
        // instead of piling up requests behind a dead Redis.
        enableOfflineQueue: false,
        lazyConnect: false,
      });
      this.redis.on('error', (e) => this.logger.warn(`Redis error: ${e.message}`));
      this.redis.on('connect', () => this.logger.log('Cache backend: Redis (connected)'));
    } else {
      this.redis = null;
      this.logger.log('Cache backend: in-memory (set REDIS_URL to share across instances)');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch (e) {
        this.logger.warn(`cache get ${key} failed: ${(e as Error).message}`);
        return null; // treat as miss → caller hits the DB
      }
    }
    return this.memGet<T>(key);
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      } catch (e) {
        this.logger.warn(`cache set ${key} failed: ${(e as Error).message}`);
      }
      return;
    }
    this.memSet(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (e) {
        this.logger.warn(`cache del ${key} failed: ${(e as Error).message}`);
      }
      return;
    }
    this.mem.delete(key);
  }

  /**
   * Cache-aside helper: return the cached value for `key`, or run `fn`, cache
   * its result for `ttlSeconds`, and return it. A thrown `fn` is NOT cached.
   */
  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  // ── in-memory backend ────────────────────────────────────────────────

  private memGet<T>(key: string): T | null {
    const entry = this.mem.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.mem.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  private memSet<T>(key: string, value: T, ttlSeconds: number): void {
    this.mem.set(key, { value: JSON.stringify(value), expiresAt: Date.now() + ttlSeconds * 1000 });
    if (this.mem.size > 5000) {
      const now = Date.now();
      for (const [k, v] of this.mem) if (now > v.expiresAt) this.mem.delete(k);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        /* already closing */
      }
    }
  }
}