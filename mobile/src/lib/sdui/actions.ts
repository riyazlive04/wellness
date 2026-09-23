/**
 * Server-driven UI — turning an action object into something that happens.
 *
 * The server has already checked every action against an allowlist, but this is
 * the side that actually opens the browser and writes to the API, so it checks
 * again. Defence in depth is cheap here and the failure mode it guards is
 * expensive: a cached bundle from an older, laxer server is still on disk after
 * a rule tightens, and it will be replayed on the next cold start.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/contexts/auth-context';
import { clientsApi, type ClientHomeData } from '@/lib/clients-api';
import { optimistic } from '@/lib/optimistic';

import { interpolate, type Scope } from './bindings';
import type { UiAction } from './types';

/** Hooks the host screen supplies for actions only it can perform. */
export interface ActionHost {
  /** Onboarding: move between steps. */
  onStep?: (by: number) => void;
  /** Onboarding: submit the collected answers. */
  onSubmit?: () => void;
  /** Pull-to-refresh equivalent for a `refresh` action. */
  onRefresh?: () => void;
}

export type RunAction = (action: UiAction | undefined, scope?: Scope) => void;

export function useSduiActions(host: ActionHost = {}): RunAction {
  const router = useRouter();
  const qc = useQueryClient();
  const { signOut } = useAuth();

  // Same optimistic path the hand-written home screen uses, so a tap on a
  // server-driven tile feels identical to one on the native block beside it.
  const habitMut = useMutation({
    mutationFn: (patch: Parameters<typeof clientsApi.logHabit>[0]) => clientsApi.logHabit(patch),
    ...optimistic<ClientHomeData, Parameters<typeof clientsApi.logHabit>[0]>(
      qc,
      ['me', 'home'],
      (old, patch) => {
        if (!old.snapshot) return old;
        const snapshot = { ...old.snapshot };
        if (patch.water_ml != null) snapshot.waterMl = patch.water_ml;
        if (patch.exercise_minutes != null) snapshot.exerciseMinutes = patch.exercise_minutes;
        if (patch.sleep_hours != null) snapshot.sleepHours = patch.sleep_hours;
        return { ...old, snapshot };
      },
    ),
  });

  const moodMut = useMutation({
    mutationFn: (mood: number) => clientsApi.logMood({ mood }),
  });

  return useCallback<RunAction>(
    (action, scope = {}) => {
      if (!action || action.kind === 'none') return;

      switch (action.kind) {
        case 'navigate': {
          // The href may carry a binding (`.../program/{{item.id}}`), so it is
          // resolved before use — and an unresolved hole means the data was
          // missing, which is a dead link rather than a route to guess at.
          const href = interpolate(action.href, scope).trim();
          if (!href || href.includes('{{')) return;
          router.push(href as Href);
          return;
        }

        case 'back':
          if (router.canGoBack()) router.back();
          return;

        case 'openUrl': {
          const url = interpolate(action.url, scope).trim();
          // https only, re-checked on device. A cached tree from a laxer server
          // is the realistic way a non-https url reaches this line.
          if (!/^https:\/\//i.test(url)) return;
          void WebBrowser.openBrowserAsync(url).catch(() => {});
          return;
        }

        case 'refresh':
          if (host.onRefresh) host.onRefresh();
          else void qc.invalidateQueries({ queryKey: ['me'] });
          return;

        case 'signOut':
          Alert.alert('Sign out?', "You'll need to sign in again to return.", [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
          ]);
          return;

        case 'logHabit': {
          // `delta` needs the current value to add to; read it from the cache
          // rather than the tree, because the tree's scope may be a stale render.
          const home = qc.getQueryData<ClientHomeData>(['me', 'home']);
          const snap = home?.snapshot;
          const current =
            action.metric === 'water_ml'
              ? (snap?.waterMl ?? 0)
              : action.metric === 'sleep_hours'
                ? (snap?.sleepHours ?? 0)
                : (snap?.exerciseMinutes ?? 0);

          const next =
            action.value !== undefined ? action.value : Math.max(0, current + (action.delta ?? 0));

          habitMut.mutate({ [action.metric]: next } as Parameters<typeof clientsApi.logHabit>[0]);
          return;
        }

        case 'logMood':
          moodMut.mutate(action.value);
          return;

        case 'step':
          host.onStep?.(action.by);
          return;

        case 'submitOnboarding':
          host.onSubmit?.();
          return;

        default:
          // An action kind this build predates. Doing nothing is correct — the
          // alternative is guessing at intent expressed by a newer server.
          return;
      }
    },
    [router, qc, signOut, habitMut, moodMut, host],
  );
}
