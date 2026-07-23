import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Pressable, Modal, StyleSheet, View } from 'react-native';

import { AppText, GhostButton, GradientButton } from '@/components/ui';
import { useAppUpdate } from '@/hooks/use-app-update';
import { useTheme } from '@/hooks/use-theme';
import {
  downloadAndInstallUpdate,
  openDownloadInBrowser,
  openInstallPermissionSettings,
  type UpdateStage,
} from '@/lib/update-installer';
import { formatDownloadSize } from '@/lib/updates';
import { radius, spacing } from '@/lib/theme';

/**
 * "Update available" prompt for the sideloaded build.
 *
 * Shown once per app launch while an update is outstanding — "Later" dismisses
 * it for this session only, so the reminder returns next launch rather than
 * being permanently silenced. That's intentional: with no Play Store to force
 * updates, a dismissed prompt is the only thing standing between a client and a
 * build that may be months out of date.
 *
 * The download happens IN the app and hands off to Android's package installer;
 * the browser is only a fallback for when that's blocked.
 */
export function UpdatePrompt() {
  const t = useTheme();
  const { available, current, manifest } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);
  const [stage, setStage] = useState<UpdateStage | null>(null);
  const [fraction, setFraction] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const visible = available && !dismissed && !!manifest;
  if (!visible) return null;

  const size = formatDownloadSize(manifest.sizeBytes);
  const busy = stage !== null;

  const install = async () => {
    setError(null);
    setFraction(0);
    setStage('downloading');
    try {
      await downloadAndInstallUpdate(manifest, (f, s) => {
        setFraction(f);
        setStage(s);
      });
      // Android is now showing its install dialog over us. Close the modal so
      // the app isn't sitting behind it with a stale progress bar.
      setStage(null);
      setDismissed(true);
    } catch (e) {
      setStage(null);
      setError(e instanceof Error ? e.message : 'The update could not be installed.');
    }
  };

  const packageName = Constants.expoConfig?.android?.package ?? 'in.sirahdigital.life';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => !busy && setDismissed(true)}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: t.colors.canvas, borderColor: t.colors.border }]}>
          <View style={[styles.badge, { backgroundColor: t.colors.surfaceStrong }]}>
            <Ionicons name="cloud-download-outline" size={26} color={t.colors.accent} />
          </View>

          <AppText variant="heading">Update available</AppText>
          <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
            Version {manifest.version} is ready.{current ? ` You're on ${current}.` : ''}
          </AppText>

          {manifest.notes && !busy ? (
            <View style={[styles.notes, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
              <AppText variant="caption" tone="muted">
                {manifest.notes}
              </AppText>
            </View>
          ) : null}

          {busy ? (
            <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
              <View style={[styles.track, { backgroundColor: t.colors.surfaceStrong }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      backgroundColor: t.colors.accent,
                      width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
                {stage === 'installing'
                  ? 'Opening the installer…'
                  : `Downloading… ${Math.round(fraction * 100)}%`}
              </AppText>
            </View>
          ) : (
            <GradientButton
              label={size ? `Update now · ${size}` : 'Update now'}
              onPress={() => void install()}
              style={{ alignSelf: 'stretch' }}
            />
          )}

          {error ? (
            <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
              <AppText variant="caption" tone="danger" style={{ textAlign: 'center' }}>
                {error}
              </AppText>
              {/* Android 8+ refuses the install until this app is allowed to
                  install unknown apps — the most likely reason to land here. */}
              <GhostButton
                label="Allow installs for SIRAH LIFE"
                onPress={() => void openInstallPermissionSettings(packageName)}
              />
              <GhostButton
                label="Download in browser instead"
                onPress={() => void openDownloadInBrowser(manifest)}
              />
            </View>
          ) : null}

          {!busy ? (
            <Pressable onPress={() => setDismissed(true)} hitSlop={8} style={{ paddingVertical: spacing.xs }}>
              <AppText variant="caption" tone="faint">
                Later
              </AppText>
            </Pressable>
          ) : null}
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
  track: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});
