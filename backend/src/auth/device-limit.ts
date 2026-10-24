/**
 * How many devices one staff login may use at once, and which bucket a
 * request belongs to.
 *
 * The rule is one web session plus one mobile session per user, rather than
 * one session outright. A nutritionist on the clinic desktop who opens the
 * phone app during a home visit is the normal case, not sharing; counting the
 * two buckets separately stops a second *person* on the same login without
 * signing anyone out of their own devices.
 */

/** Which kind of client a session came from. */
export type DeviceKind = 'web' | 'mobile';

/** One session per bucket. Deliberately not configurable per plan - see below. */
export const MAX_PER_KIND = 1;

/**
 * React Native's networking layer, which is what the NUSI app runs on:
 * okhttp on Android, CFNetwork/Darwin on iOS. Expo Go adds its own.
 *
 * Classifying by User-Agent rather than a custom header is deliberate: a
 * header would need a mobile release first, and every already-installed app
 * would count as web until its user updated - locking people out of an app
 * they cannot fix. The UA is already recorded by Supabase on every session.
 */
const MOBILE_UA = /okhttp|CFNetwork|Darwin|Expo|ReactNative/i;

/**
 * A phone *browser* is web, not mobile - "Mobile Safari" and Chrome on
 * Android both carry Mozilla/ and are the web app on a small screen.
 */
export function deviceKindFromUserAgent(ua: string | null | undefined): DeviceKind {
  if (!ua) return 'web';
  if (/^Mozilla\//.test(ua)) return 'web';
  return MOBILE_UA.test(ua) ? 'mobile' : 'web';
}

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  web: 'browser',
  mobile: 'mobile app',
};
