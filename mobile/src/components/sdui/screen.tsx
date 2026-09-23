/**
 * Server-driven UI — the screen host.
 *
 * Owns everything around the tree: fetching the data the layout declared,
 * building the scope, supplying the page chrome (safe area, scroll,
 * pull-to-refresh) and isolating render failures section by section.
 *
 * The tree itself never fetches. A layout says "I need me.home"; this decides
 * how, when and with what caching — which is why a published layout cannot turn
 * itself into a request storm.
 */
import { useQueries } from '@tanstack/react-query';
import { useMemo, useRef, type ReactElement } from 'react';
import { RefreshControl, View } from 'react-native';

import { AppText, Card, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useSduiActions, type ActionHost, type RunAction } from '@/lib/sdui/actions';
import type { Scope } from '@/lib/sdui/bindings';
import { queryForBinding } from '@/lib/sdui/data-sources';
import type { UiNode, UiScreen } from '@/lib/sdui/types';

import { SduiBoundary, SduiNode } from './renderer';

export interface SduiScopeState {
  scope: Scope;
  isLoading: boolean;
  isError: boolean;
  isRefetching: boolean;
  refetch: () => void;
}

/**
 * Run a screen's declared data bindings and collect them into a scope.
 *
 * `useQueries` keeps this to one hook call regardless of how many sources a
 * layout declares — the count is remote data and can change between renders,
 * which a loop of `useQuery` calls would not survive.
 */
export function useSduiScope(screen: UiScreen): SduiScopeState {
  const bindings = useMemo(
    () => (screen.data ?? []).filter((b) => queryForBinding(b) !== null),
    [screen.data],
  );

  const results = useQueries({
    queries: bindings.map((binding) => {
      const q = queryForBinding(binding)!;
      return { queryKey: q.queryKey, queryFn: q.queryFn, retry: 1 };
    }),
  });

  const scope = useMemo<Scope>(() => {
    const next: Scope = {};
    bindings.forEach((binding, i) => {
      next[binding.key] = results[i]?.data;
    });
    return next;
  }, [bindings, results]);

  return {
    scope,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
    isRefetching: results.some((r) => r.isRefetching),
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}

/**
 * Render a tree's top level with per-section error isolation.
 *
 * The boundary sits on each direct child of the root rather than on the root
 * itself: a broken card should cost its own card, not the page. Anything
 * deeper shares its section's boundary, which is a deliberate limit — a
 * boundary per node would mean hundreds of class instances per screen.
 */
export function SduiSections({
  root,
  scope,
  run,
  onError,
}: {
  root: UiNode;
  scope: Scope;
  run: RunAction;
  onError?: (nodeId: string, error: Error) => void;
}): ReactElement {
  // A root that is not a container has nothing to split up.
  const children =
    root.type === 'stack' || root.type === 'card' || root.type === 'section'
      ? ((root as { children?: UiNode[] }).children ?? [])
      : null;

  if (!children) {
    return (
      <SduiBoundary onError={(e) => onError?.(root.id, e)}>
        <SduiNode node={root} scope={scope} run={run} />
      </SduiBoundary>
    );
  }

  return (
    <>
      {children.map((child, i) => (
        <SduiBoundary key={child.id ?? i} onError={(e) => onError?.(child.id, e)}>
          <SduiNode node={child} scope={scope} run={run} index={i} />
        </SduiBoundary>
      ))}
    </>
  );
}

/**
 * A complete scrollable server-driven page.
 *
 * Used by Today and More. Onboarding and the tab bar have their own hosts,
 * because a wizard and a navigator are not scrollable pages.
 */
export function SduiScreenView({
  screen,
  host,
}: {
  screen: UiScreen;
  host?: ActionHost;
}): ReactElement {
  const t = useTheme();
  const { scope, isError, isRefetching, refetch } = useSduiScope(screen);
  const run = useSduiActions({ ...host, onRefresh: refetch });

  // Log each failing node once. Repeating it on every re-render would bury the
  // signal, and these are the breadcrumbs support needs when a practice says
  // "a card disappeared after we published".
  const reported = useRef(new Set<string>());
  const onError = (nodeId: string, error: Error) => {
    if (reported.current.has(nodeId)) return;
    reported.current.add(nodeId);
    console.warn(`[sdui] node "${nodeId}" failed to render on ${screen.screen}:`, error.message);
  };

  return (
    <Screen>
      <ScreenScroll
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={t.colors.accent}
          />
        }>
        {isError ? (
          <Card style={{ gap: 4 }}>
            <AppText variant="heading">{"Can't reach the server"}</AppText>
            <AppText variant="muted" tone="muted">
              {"Check your connection and pull to refresh. If this persists, confirm the app's API URL."}
            </AppText>
          </Card>
        ) : null}

        <View style={{ gap: 16 }}>
          <SduiSections root={screen.root} scope={scope} run={run} onError={onError} />
        </View>
      </ScreenScroll>
    </Screen>
  );
}
