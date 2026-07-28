/**
 * Polls the release manifest and reports whether a newer APK is published.
 *
 * Shared by the launch-time prompt and the Settings → About card so both agree
 * on a single cached answer instead of racing two independent fetches.
 */
import { useQuery } from '@tanstack/react-query';

import {
  compareVersions,
  currentAppVersion,
  fetchUpdateManifest,
  type UpdateManifest,
} from '@/lib/updates';

export interface AppUpdateState {
  /** Version compiled into this build, or null if it can't be determined. */
  current: string | null;
  /** Latest published version, once the manifest has been read. */
  latest: string | null;
  manifest: UpdateManifest | null;
  /** True only when the published version is strictly newer than this build. */
  available: boolean;
  isChecking: boolean;
  /** The check failed (offline, manifest 404). Never blocks the app. */
  isError: boolean;
  check: () => void;
}

export function useAppUpdate(): AppUpdateState {
  const current = currentAppVersion();

  const q = useQuery({
    queryKey: ['app-update'],
    queryFn: ({ signal }) => fetchUpdateManifest(signal),
    // Checking a static JSON file is cheap, but there's no point hammering it:
    // once an hour is far more often than we ever ship a build.
    staleTime: 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    retry: 1,
  });

  const manifest = q.data ?? null;

  return {
    current,
    latest: manifest?.version ?? null,
    manifest,
    // `current === null` means we couldn't read our own version — offer nothing
    // rather than nagging about an update the user may already have.
    available: !!manifest && !!current && compareVersions(manifest.version, current) > 0,
    isChecking: q.isFetching,
    isError: q.isError,
    check: () => void q.refetch(),
  };
}
