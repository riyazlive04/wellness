import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText, GradientButton } from '@/components/ui';
import { useAppUpdate } from '@/hooks/use-app-update';
import { useTheme } from '@/hooks/use-theme';
import { formatDownloadSize } from '@/lib/updates';
import { radius, spacing } from '@/lib/theme';

/**
 * "Update available" prompt for the sideloaded build.
 *
 * Shown once per app launch while an update is outstanding — "Later" dismisses
 * it for this session only, so the reminder comes back next launch rather than
 * being permanently silenced. That's intentional: with no Play Store to force
 * updates, a dismissed prompt is the only thing standing between a client and
 * a build that may be months out of date.
 */
export function UpdatePrompt() {
  const t = useTheme();
  const { available, current, manifest } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);

  const visible = available && !dismissed && !!manifest;
  if (!visible) return null;

  const size = formatDownloadSize(manifest.sizeBytes);

  const download = () => {
    setDismissed(true);
    // Opens the browser, which downloads the APK and hands it to Android's
    // package installer. Failure here is non-fatal — the Settings → About card
    // offers the same link.
    Linking.openURL(manifest.url).catch(() => {});
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setDismissed(true)}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: t.colors.canvas, borderColor: t.colors.border }]}>
          <View style={[styles.badge, { backgroundColor: t.colors.surfaceStrong }]}>
            <Ionicons name="cloud-download-outline" size={26} color={t.colors.accent} />
          </View>

          <AppText variant="heading">Update available</AppText>
          <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
            Version {manifest.version} is ready. You&apos;re on {current}.
          </AppText>

          {manifest.notes ? (
            <View style={[styles.notes, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
              <AppText variant="caption" tone="muted">
                {manifest.notes}
              </AppText>
            </View>
          ) : null}

          <GradientButton label={size ? `Download update · ${size}` : 'Download update'} onPress={download} />

          <Pressable onPress={() => setDismissed(true)} hitSlop={8} style={{ paddingVertical: spacing.xs }}>
            <AppText variant="caption" tone="faint">
              Later
            </AppText>
          </Pressable>

          <AppText variant="caption" tone="faint" style={{ textAlign: 'center' }}>
            Your download will open in the browser. Tap the file when it finishes to install.
          </AppText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notes: {
    alignSelf: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
