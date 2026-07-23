/**
 * Self-hosted update checking.
 *
 * SIRAH LIFE is distributed as a sideloaded APK rather than through the Play
 * Store, so nothing tells a client that a newer build exists — they would keep
 * running whatever they first installed, forever. `deploy/vps/release-apk.sh`
 * publishes a manifest next to the APK; this module reads it and compares it
 * against the version compiled into the running build.
 *
 * We deliberately do NOT try to install the APK ourselves: that needs the
 * REQUEST_INSTALL_PACKAGES permission plus a FileProvider, and it makes the app
 * look like a malware installer to Play Protect. Handing the URL to the browser
 * lets Android's own package installer take over, which is what users expect
 * from a sideloaded app.
 */
import Constants from 'expo-constants';

/**
 * Where the manifest lives. Kept separate from EXPO_PUBLIC_API_BASE_URL on
 * purpose: the API base is user-overridable in Settings (for dev tunnels), and
 * pointing the update check at a dev machine would offer bogus updates.
 */
export const UPDATE_MANIFEST_URL =
  process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL ??
  'https://nusi.sirahagents.com/download/latest.json';

/** Shape written by release-apk.sh. Everything but version/url is optional. */
export interface UpdateManifest {
  version: string;
  url: string;
  sizeBytes?: number;
  notes?: string;
  publishedAt?: string;
}

/**
 * The version compiled into this build (app.json → expo.version), or null when
 * it can't be determined.
 *
 * Returning null rather than a "0.0.0" sentinel is deliberate — 0.0.0 is older
 * than every published release, so it would fail OPEN and nag every user with a
 * permanent, un-actionable "update available" prompt. Unknown means we say
 * nothing.
 */
export function currentAppVersion(): string | null {
  const v = Constants.expoConfig?.version;
  return typeof v === 'string' && v.trim() ? v : null;
}

/**
 * Compare dotted numeric versions; returns > 0 when `a` is newer than `b`.
 *
 * Deliberately tolerant — missing or non-numeric segments count as 0, so a
 * malformed manifest can never make us claim an update that doesn't exist.
 */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.');
  const pb = String(b).split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number.parseInt(pa[i] ?? '0', 10) || 0;
    const nb = Number.parseInt(pb[i] ?? '0', 10) || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * Fetch and validate the manifest. Returns null (rather than throwing) when the
 * payload isn't a usable manifest, so a broken deploy degrades to "no update
 * offered" instead of an error the user can't act on.
 */
export async function fetchUpdateManifest(signal?: AbortSignal): Promise<UpdateManifest | null> {
  const res = await fetch(UPDATE_MANIFEST_URL, { signal });
  if (!res.ok) throw new Error(`Update manifest returned ${res.status}`);

  const raw: unknown = await res.json();
  if (typeof raw !== 'object' || raw === null) return null;

  const m = raw as Partial<UpdateManifest>;
  if (typeof m.version !== 'string' || typeof m.url !== 'string') return null;
  if (!/^https?:\/\//i.test(m.url)) return null; // never hand a non-http scheme to the browser

  return {
    version: m.version,
    url: m.url,
    sizeBytes: typeof m.sizeBytes === 'number' ? m.sizeBytes : undefined,
    notes: typeof m.notes === 'string' ? m.notes : undefined,
    publishedAt: typeof m.publishedAt === 'string' ? m.publishedAt : undefined,
  };
}

/** "56 MB", or null when the manifest didn't carry a size. */
export function formatDownloadSize(bytes?: number): string | null {
  if (typeof bytes !== 'number' || bytes <= 0) return null;
  return `${(bytes / 1048576).toFixed(0)} MB`;
}
