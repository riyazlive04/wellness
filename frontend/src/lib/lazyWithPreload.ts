import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * React.lazy that also exposes `.preload()` so a route's JS chunk can be fetched
 * ahead of navigation. Vite dedupes the module, so preloading and the eventual
 * lazy render share the exact same chunk — the preload just warms the cache.
 */
export type Preloadable<T extends ComponentType<unknown>> =
  LazyExoticComponent<T> & { preload: () => Promise<unknown> };

const RETRIES = 3;
const BACKOFF_MS = 400;

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/**
 * Retry a dynamic import a few times before giving up. Dynamic imports can fail
 * for transient reasons that have nothing to do with a stale chunk — most often
 * `net::ERR_NETWORK_CHANGED` (Wi-Fi/VPN flip mid-request) or a dropped
 * connection. Those recover on their own within a few hundred ms, so a short
 * backoff retry swallows them silently instead of unmounting the route to the
 * ChunkErrorBoundary "Updating…" screen. Only after all retries fail does the
 * error propagate (a genuinely missing chunk → boundary → hard reload).
 */
function retryImport<T>(factory: () => Promise<T>): Promise<T> {
  return factory().catch(async (err) => {
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      await sleep(BACKOFF_MS * attempt);
      try {
        return await factory();
      } catch {
        if (attempt === RETRIES) throw err;
      }
    }
    throw err;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithPreload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): Preloadable<T> {
  const load = () => retryImport(factory);
  const Component = lazy(load) as Preloadable<T>;
  Component.preload = load;
  return Component;
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

/** Run `cb` when the browser is idle (falls back to a short timeout). */
function onIdle(cb: () => void): void {
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb, { timeout: 2500 });
  else window.setTimeout(cb, 300);
}

/**
 * Warm a set of route chunks one-at-a-time during browser idle time, so the next
 * section the user opens is already cached — instant, no Suspense fallback flash.
 * Sequential + idle-scheduled so it never competes with the first data fetch or
 * blocks interaction. `import()` is itself cached, so re-preloading is a no-op.
 */
export function warmRoutesDuringIdle(routes: Array<{ preload: () => Promise<unknown> }>): void {
  if (typeof window === 'undefined' || routes.length === 0) return;
  let i = 0;
  const pump = () => {
    if (i >= routes.length) return;
    routes[i++]
      .preload()
      .catch(() => { /* offline / chunk error - harmless, real nav retries */ })
      .finally(() => onIdle(pump));
  };
  onIdle(pump);
}
