/**
 * In-app update installation.
 *
 * Previously the update prompt just opened the APK URL in the browser, which
 * dumped the user into Chrome's download UI and left them to find the file and
 * tap it. This downloads the build inside the app, then hands the finished file
 * straight to Android's package installer.
 *
 * This needs the REQUEST_INSTALL_PACKAGES permission (declared in app.json).
 * That is fine for a self-hosted, sideloaded app — but note that Google Play
 * disallows it for Play-distributed apps except for actual app stores. If SIRAH
 * LIFE is ever published to Play, this permission has to come out of the Play
 * build or the listing will be rejected.
 */
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

import type { UpdateManifest } from '@/lib/updates';

/** Intent.FLAG_GRANT_READ_URI_PERMISSION — lets the installer read our content:// URI. */
const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;
const APK_MIME = 'application/vnd.android.package-archive';
/** Not in expo-intent-launcher's ActivityAction enum (it only covers Settings screens). */
const VIEW_ACTION = 'android.intent.action.VIEW';

export type UpdateStage = 'downloading' | 'installing';

/**
 * Download the published APK and open Android's installer for it.
 *
 * Resolves once the installer has been launched — the user still has to confirm
 * the system install dialog, and Android kills us to replace the package, so
 * there is nothing meaningful to await afterwards.
 */
export async function downloadAndInstallUpdate(
  manifest: UpdateManifest,
  onProgress?: (fraction: number, stage: UpdateStage) => void,
): Promise<void> {
  // iOS can't sideload at all; the browser is the only honest fallback.
  if (Platform.OS !== 'android') {
    await Linking.openURL(manifest.url);
    return;
  }

  const target = new File(Paths.cache, `sirah-life-${manifest.version}.apk`);

  // A half-written file from an interrupted attempt would make the installer
  // reject the package as corrupt, and the error wouldn't say why.
  try {
    if (target.exists) target.delete();
  } catch {
    /* best effort — a failed cleanup isn't worth aborting the update for */
  }

  onProgress?.(0, 'downloading');

  const task = File.createDownloadTask(manifest.url, target, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      // totalBytes is -1 when the server sends no Content-Length; report
      // indeterminate rather than a nonsense negative fraction.
      if (totalBytes > 0) onProgress?.(bytesWritten / totalBytes, 'downloading');
    },
  });

  const file = await task.downloadAsync();
  if (!file) throw new Error('The download was cancelled.');

  const contentUri = file.contentUri;
  if (!contentUri) throw new Error('Could not prepare the download for installation.');

  onProgress?.(1, 'installing');

  await IntentLauncher.startActivityAsync(VIEW_ACTION, {
    data: contentUri,
    type: APK_MIME,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}

/**
 * Android's per-app "Install unknown apps" toggle.
 *
 * On Android 8+ the install intent is refused until the user allows it for this
 * app specifically. Android's own dialog offers a route there, but sending them
 * directly is clearer when the install was blocked.
 */
export async function openInstallPermissionSettings(packageName: string): Promise<void> {
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
    data: `package:${packageName}`,
  });
}

/** Last-resort fallback: let the browser download it the old way. */
export async function openDownloadInBrowser(manifest: UpdateManifest): Promise<void> {
  await Linking.openURL(manifest.url);
}
