/**
 * Server-driven UI — the data a layout is allowed to ask for.
 *
 * A screen's `data` block names a source; this table turns that name into a
 * real React Query fetch. The indirection is the security property: the layout
 * never carries a URL, so no published tree can point the app at an arbitrary
 * endpoint, and a source we retire simply stops resolving instead of issuing a
 * request to a path that no longer exists.
 */
import { clientsApi } from '@/lib/clients-api';

import type { DataSourceKey, UiDataBinding } from './types';

type Params = Record<string, string | number | boolean>;

interface SourceSpec {
  /** React Query key. Shares cache with the hand-written screens on purpose. */
  key: (params: Params) => unknown[];
  fetch: (params: Params) => Promise<unknown>;
}

const num = (params: Params, name: string, fallback: number): number => {
  const raw = params[name];
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/**
 * Query keys deliberately match the ones the hardcoded screens already use
 * (`['me','home']`, `['me','meals',days]`). A server-driven home screen and the
 * native fallback then share one cache entry rather than each fetching the same
 * payload — and an optimistic habit write from a native block updates the
 * server-driven tree around it for free.
 */
const SOURCES: Record<DataSourceKey, SourceSpec> = {
  'me.home': {
    key: () => ['me', 'home'],
    fetch: () => clientsApi.home(),
  },
  'me.profile': {
    key: () => ['me', 'profile'],
    fetch: () => clientsApi.myProfile(),
  },
  'me.meals': {
    key: (p) => ['me', 'meals', num(p, 'days', 7)],
    fetch: (p) => clientsApi.myMeals(num(p, 'days', 7)),
  },
  'me.habits': {
    key: (p) => ['me', 'habits', num(p, 'days', 14)],
    fetch: (p) => clientsApi.myHabits(num(p, 'days', 14)),
  },
  'me.program': {
    key: () => ['me', 'program'],
    fetch: () => clientsApi.myProgram(),
  },
  'me.messages': {
    key: (p) => ['me', 'messages', num(p, 'limit', 50)],
    fetch: (p) => clientsApi.myMessages(num(p, 'limit', 50)),
  },
  'me.achievements': {
    key: () => ['me', 'achievements'],
    fetch: () => clientsApi.myAchievements(),
  },
  'me.wellnessSnapshot': {
    key: () => ['me', 'wellness', 'snapshot'],
    fetch: () => clientsApi.myWellnessSnapshot(),
  },
};

export function isKnownSource(source: string): source is DataSourceKey {
  return Object.prototype.hasOwnProperty.call(SOURCES, source);
}

/** React Query options for one declared binding, or null if the app can't serve it. */
export function queryForBinding(binding: UiDataBinding): {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
} | null {
  if (!isKnownSource(binding.source)) return null;
  const spec = SOURCES[binding.source];
  const params = binding.params ?? {};
  return { queryKey: spec.key(params), queryFn: () => spec.fetch(params) };
}
