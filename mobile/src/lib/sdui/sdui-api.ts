/**
 * Server-driven UI — fetching and caching the layout bundle.
 *
 * Modelled on brand-context: the last good bundle is written to AsyncStorage
 * and read back synchronously-ish on the next launch, so the app opens wearing
 * the practice's layout instead of flashing the stock one for the length of a
 * round-trip. On a white-label build that flash is the product promise breaking
 * in front of the user, and a rearranged tab bar snapping into place a second
 * after launch is the same failure in a smaller costume.
 *
 * Trust boundary: a cached bundle is data we wrote, but it has been through
 * disk and may be from an older build, so it is shape-checked on read exactly
 * like a network response. Anything that fails falls back to the compiled-in
 * defaults rather than rendering half a screen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '@/lib/api';

import { SCHEMA_VERSION, SCREEN_KEYS, type ScreenKey, type UiBundle, type UiScreen } from './types';

const CACHE_KEY = 'sirah-sdui-bundle';
const ETAG_KEY = 'sirah-sdui-etag';

/** What the server sends back; `etag` doubles as the cache-validity token. */
export async function fetchBundle(): Promise<UiBundle> {
  return api.get<UiBundle>('/api/v1/me/ui');
}

/** Cheap check used on resume — a few bytes instead of the whole bundle. */
export async function fetchRevision(): Promise<{ etag: string; version: number }> {
  return api.get<{ etag: string; version: number }>('/api/v1/me/ui/revision');
}

export async function readCachedBundle(): Promise<UiBundle | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return sanitizeBundle(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeCachedBundle(bundle: UiBundle): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [CACHE_KEY, JSON.stringify(bundle)],
      [ETAG_KEY, bundle.etag ?? ''],
    ]);
  } catch {
    // A full disk is not a reason to fail the render — the bundle is already
    // in memory for this session, it just won't survive a restart.
  }
}

export async function readCachedEtag(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ETAG_KEY);
  } catch {
    return null;
  }
}

/**
 * Drop the cached layout.
 *
 * Called on sign-out: the next account on this device may belong to a different
 * practice, and inheriting the previous one's tab bar would leak that
 * workspace's configuration to an unrelated user.
 */
export async function clearCachedBundle(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([CACHE_KEY, ETAG_KEY]);
  } catch {
    /* nothing useful to do */
  }
}

/**
 * Shape-check a bundle from the network or from disk.
 *
 * Not a re-run of the server's validator — the client cannot re-derive plan
 * entitlements or route allowlists, and trying to would just be a second
 * implementation to drift. This checks the envelope: right schema version,
 * screens that are objects with a root node. Per-node robustness is the
 * renderer's job, where an unknown type renders nothing instead of throwing.
 */
export function sanitizeBundle(raw: unknown): UiBundle | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<UiBundle>;

  // A bundle from a newer schema may contain node shapes this build cannot
  // render correctly. Better the stock app than a subtly wrong one.
  if (typeof b.version !== 'number' || b.version > SCHEMA_VERSION) return null;
  if (!b.screens || typeof b.screens !== 'object') return null;

  const screens: Partial<Record<ScreenKey, UiScreen>> = {};
  for (const key of SCREEN_KEYS) {
    const screen = (b.screens as Record<string, unknown>)[key];
    if (!screen || typeof screen !== 'object') continue;
    const s = screen as Partial<UiScreen>;
    if (!s.root || typeof s.root !== 'object' || typeof (s.root as { type?: unknown }).type !== 'string') {
      continue;
    }
    screens[key] = {
      version: typeof s.version === 'number' ? s.version : SCHEMA_VERSION,
      screen: key,
      revision: typeof s.revision === 'number' ? s.revision : 0,
      data: Array.isArray(s.data) ? s.data : [],
      root: s.root,
    };
  }

  if (!Object.keys(screens).length) return null;

  return {
    version: b.version,
    etag: typeof b.etag === 'string' ? b.etag : '',
    screens,
  };
}
