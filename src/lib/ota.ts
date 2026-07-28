/**
 * Deferred, JS-driven OTA update check.
 *
 * WHY THIS EXISTS (and why we do NOT use checkAutomatically: ON_LOAD):
 * the automatic on-launch check downloads the new JS bundle (~6 MB) immediately
 * at startup. On a fast connection that's invisible, but on a very slow link
 * (a real user was on ~12 KB/s) that download SATURATES the pipe and starves
 * the app's own startup API calls — auth token refresh and the profile fetch
 * that gate the loading screen — so the app never gets past the logo. v1.0.6
 * shipped ON_LOAD and did exactly this.
 *
 * So app.json sets `checkAutomatically: NEVER` and we trigger the check from
 * here, only AFTER the app is up and idle. Startup traffic finishes first; the
 * update downloads afterwards on the free pipe, and applies on the next launch.
 * Everything is best-effort and never throws — an update must never be able to
 * break the app.
 */
import * as Updates from 'expo-updates';

let alreadyRan = false;

/**
 * Check for an OTA update and, if one exists, download it in the background.
 * A downloaded update is applied automatically on the next cold start.
 *
 * Call this once, deferred, after the app is interactive — never on the launch
 * path. No-ops in dev (Updates.isEnabled is false with a dev server) and never
 * runs more than once per app session.
 */
export async function checkForOtaUpdateInBackground(): Promise<void> {
  if (alreadyRan) return;
  alreadyRan = true;

  // Disabled in Expo Go / dev-client / when updates aren't configured.
  if (!Updates.isEnabled) return;

  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return;
    await Updates.fetchUpdateAsync();
    // Intentionally NOT calling reloadAsync(): applying mid-session is jarring.
    // The fetched update launches on the next natural app start.
  } catch {
    // Offline, slow link, server hiccup, signature mismatch — all fine to
    // swallow. The app keeps running its current bundle.
  }
}
