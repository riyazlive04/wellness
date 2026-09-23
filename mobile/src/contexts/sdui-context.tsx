/**
 * Server-driven UI — the layout the app is currently wearing.
 *
 * Resolution order, and why it is this order:
 *
 *   1. Compiled-in defaults  — always present, so there is never a frame with
 *                              no layout at all.
 *   2. Cached bundle         — painted before the network answers, so a
 *                              customised app does not visibly rearrange
 *                              itself a second after launch.
 *   3. Server bundle         — adopted on a cold start; mid-session it waits.
 *
 * Every stage is optional except the first. A device with no network, a corrupt
 * cache, or a server that predates the migration still gets a complete, working
 * app — it just gets the stock one.
 *
 * ── Why the applied layout is PINNED ────────────────────────────────────
 *
 * The bundle this provider renders is held in state, not read straight from the
 * query cache. Without that pin, a practice publishing a layout would rearrange
 * the screen under whoever happened to be scrolling it — tabs moving, cards
 * reordering mid-tap — with no warning and no way to ask for it back.
 *
 * So: a newer revision is DETECTED but not adopted. `updateAvailable` goes true,
 * the banner offers it, and `applyUpdate()` swaps it when the client says so.
 * A cold start adopts immediately, because there is nothing to interrupt.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import { DEFAULT_SCREENS } from '@/lib/sdui/defaults';
import {
  clearCachedBundle,
  fetchBundle,
  fetchRevision,
  readCachedBundle,
  sanitizeBundle,
  writeCachedBundle,
} from '@/lib/sdui/sdui-api';
import type { ScreenKey, UiBundle, UiScreen } from '@/lib/sdui/types';

export type LayoutSource = 'default' | 'cache' | 'server';

interface SduiValue {
  /** Never null — falls through to the compiled-in default. */
  screen: (key: ScreenKey) => UiScreen;
  /** Where the applied layout came from. Surfaced in Settings for support. */
  source: LayoutSource;
  /** Hash of the applied layout. */
  etag: string | null;
  isLoading: boolean;
  /** A newer layout has been published and is waiting for the client to accept. */
  updateAvailable: boolean;
  /** Adopt the newer layout. Safe to call when nothing is pending. */
  applyUpdate: () => Promise<void>;
  /** True while applyUpdate is fetching, so the banner can show a spinner. */
  isApplying: boolean;
}

const FALLBACK: SduiValue = {
  screen: (key) => DEFAULT_SCREENS[key],
  source: 'default',
  etag: null,
  isLoading: false,
  updateAvailable: false,
  applyUpdate: async () => {},
  isApplying: false,
};

const SduiContext = createContext<SduiValue>(FALLBACK);

const REVISION_KEY = ['me', 'ui', 'revision'] as const;

/** The applied layout, tied to the account it was fetched for. */
interface Applied {
  userId: string;
  bundle: UiBundle;
  /**
   * False while this is only the cached paint. The first SERVER answer of a
   * session replaces a cached layout silently; only publishes that land after
   * that raise the banner.
   */
  fromServer: boolean;
}

export function SduiProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const userId = session?.user?.id ?? null;

  const [cached, setCached] = useState<UiBundle | null>(null);
  const [cacheChecked, setCacheChecked] = useState(false);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Paint from the last known layout before the network is consulted.
  useEffect(() => {
    readCachedBundle()
      .then(setCached)
      .catch(() => {})
      .finally(() => setCacheChecked(true));
  }, []);

  const bundleQ = useQuery({
    queryKey: ['me', 'ui'],
    queryFn: fetchBundle,
    enabled: !!session,
    // The layout changes when somebody publishes, which is rare. Refetching it
    // on every screen mount would be a request per navigation for a payload
    // that is almost always byte-identical.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  /**
   * The cheap "is there anything new?" poll.
   *
   * A few bytes rather than the whole bundle, so a client that is already
   * current pays almost nothing to find that out. This is what drives the
   * banner; the full bundle is only fetched once they accept.
   */
  const revisionQ = useQuery({
    queryKey: REVISION_KEY,
    queryFn: fetchRevision,
    enabled: !!session,
    staleTime: 30_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  /**
   * Check again the moment the app comes back to the foreground.
   *
   * React Query's refetch-on-focus is off app-wide and nothing currently wires
   * AppState to its focusManager, so a backgrounded app would otherwise sit on
   * its interval and miss a publish for minutes after the client reopens it.
   */
  useEffect(() => {
    if (!session) return;
    const sub = AppState.addEventListener('change', (state) => {
      // Refetched through the client by key rather than via `revisionQ.refetch`:
      // the query object is a new reference every render, so depending on it
      // would tear down and re-add this listener on each one.
      if (state === 'active') void qc.refetchQueries({ queryKey: REVISION_KEY });
    });
    return () => sub.remove();
  }, [session, qc]);

  const serverBundle = useMemo(() => sanitizeBundle(bundleQ.data), [bundleQ.data]);
  const latest = serverBundle ?? (userId ? cached : null);

  /**
   * Adopt a layout during render when there is nothing to disrupt.
   *
   * Two such moments, and only two:
   *   - the first layout of a session (or after a different account signs in);
   *   - the first SERVER answer, replacing the cached paint. A client returning
   *     after a week should simply open on the current layout, not be asked to
   *     accept a change they were never shown the old version of.
   *
   * Everything after that waits for the banner.
   *
   * Written as a render-time state adjustment rather than an effect. React
   * supports this for derived state and re-renders before committing, so the
   * pinned layout is correct on the very first paint — an effect would paint
   * once with no layout and once with it.
   */
  if (userId) {
    if (!applied || applied.userId !== userId) {
      if (latest) setApplied({ userId, bundle: latest, fromServer: !!serverBundle });
    } else if (!applied.fromServer && serverBundle) {
      setApplied({ userId, bundle: serverBundle, fromServer: true });
    }
  }

  // Persist only what the server actually sent, and persist the NEWEST bundle
  // even while an older one is still applied — the next cold start should open
  // on the current layout, not replay a version the client already declined.
  useEffect(() => {
    if (!bundleQ.data) return;
    const clean = sanitizeBundle(bundleQ.data);
    if (clean) void writeCachedBundle(clean);
  }, [bundleQ.data]);

  // Signing out drops the practice's layout from disk: the next account on this
  // device may belong to a different workspace, or to none.
  useEffect(() => {
    if (session) return;
    void clearCachedBundle();
  }, [session]);

  const appliedBundle = applied?.userId === userId ? applied.bundle : null;
  const appliedEtag = appliedBundle?.etag ?? null;
  const serverEtag = revisionQ.data?.etag ?? null;

  /**
   * Only claim an update when BOTH hashes are known and differ, and only once
   * the applied layout is server-confirmed.
   *
   * A missing `serverEtag` means the poll has not landed or failed — offering a
   * refresh then would send the client to fetch a bundle we have no reason to
   * believe has changed, and a failed refresh reads as a broken app. A cached
   * layout is excluded because it is about to be replaced silently anyway;
   * without that guard every cold start would flash the banner for the moment
   * between the cached paint and the server's answer.
   */
  const updateAvailable =
    !!applied?.fromServer && !!appliedEtag && !!serverEtag && appliedEtag !== serverEtag;

  const applyUpdate = useCallback(async () => {
    if (!userId) return;
    setIsApplying(true);
    try {
      const fresh = await bundleQ.refetch();
      const clean = sanitizeBundle(fresh.data);
      if (clean) {
        setApplied({ userId, bundle: clean, fromServer: true });
        void writeCachedBundle(clean);
      }
      // Re-read the hash so the banner clears even if the bundle came back
      // byte-identical (a republish that changed nothing the client can see).
      await revisionQ.refetch();
      // The layout may now reference data sources the old one did not.
      await qc.invalidateQueries({ queryKey: ['me'] });
    } finally {
      setIsApplying(false);
    }
  }, [userId, bundleQ, revisionQ, qc]);

  const value = useMemo<SduiValue>(() => {
    const source: LayoutSource = !appliedBundle
      ? 'default'
      : applied?.fromServer
        ? 'server'
        : 'cache';

    return {
      screen: (key) => appliedBundle?.screens?.[key] ?? DEFAULT_SCREENS[key],
      source,
      etag: appliedEtag,
      // Only "loading" while we have nothing at all to draw. Once the cache has
      // been consulted there is always a layout, so no screen should ever sit
      // on a spinner waiting for this.
      isLoading: !cacheChecked && bundleQ.isLoading,
      updateAvailable,
      applyUpdate,
      isApplying,
    };
  }, [
    applied,
    appliedBundle,
    appliedEtag,
    bundleQ.isLoading,
    cacheChecked,
    updateAvailable,
    applyUpdate,
    isApplying,
  ]);

  return <SduiContext.Provider value={value}>{children}</SduiContext.Provider>;
}

/** The whole SDUI state. Most callers want `useScreen` instead. */
export function useSdui(): SduiValue {
  return useContext(SduiContext);
}

/** The layout for one screen. Always defined. */
export function useScreen(key: ScreenKey): UiScreen {
  return useContext(SduiContext).screen(key);
}
