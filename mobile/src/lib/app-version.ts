import * as Application from 'expo-application';
import Constants from 'expo-constants';

/**
 * The version of the app binary this code is running inside.
 *
 * All that survives of the old self-update machinery. The app is distributed
 * through Google Play now, so it does not check a manifest, compare versions or
 * install APKs — Play owns that. This is purely for display.
 *
 * Note this is the BINARY version, not the JS bundle. An OTA update changes the
 * running JavaScript without changing this number, which is why the Settings
 * card reports the two separately.
 */
export function currentAppVersion(): string | null {
  const fromConfig = Constants.expoConfig?.version;
  if (typeof fromConfig === 'string' && fromConfig.trim()) return fromConfig;

  // The native manifest's versionName is the more authoritative source anyway —
  // it is what Android itself compares on install — and it survives cases where
  // the JS manifest is not readable.
  const fromNative = Application.nativeApplicationVersion;
  return typeof fromNative === 'string' && fromNative.trim() ? fromNative : null;
}
