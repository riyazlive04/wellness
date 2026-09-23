import { Ionicons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { useSdui } from '@/contexts/sdui-context';
import { useTheme } from '@/hooks/use-theme';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * The one "something is ready for you" bar.
 *
 * Two kinds of update can be waiting, and they are deliberately handled by a
 * SINGLE mounted component rather than one banner each:
 *
 *   1. A new app build (expo-updates) has been downloaded and needs a restart.
 *   2. A new layout has been published and needs a refresh.
 *
 * Two independent banners would sooner or later both be true and stack on top
 * of each other. So this picks one, and the app build always wins — it is the
 * bigger change, and restarting refetches the layout anyway, which clears the
 * other one for free.
 *
 * Neither is blocking. Both wait for a tap, for the same reason the layout is
 * pinned in the first place: a practice publishing something, or us shipping a
 * build, does not get to yank the screen out from under whoever is using it.
 */
export function UpdateBanner() {
  const t = useTheme();
  const segments = useSegments();

  // `isUpdatePending` is true once fetchUpdateAsync has stored a new bundle —
  // see checkForOtaUpdateInBackground, which downloads but deliberately never
  // reloads on its own.
  const { isUpdatePending } = Updates.useUpdates();
  const { updateAvailable, applyUpdate, isApplying } = useSdui();
  const [restarting, setRestarting] = useState(false);

  // Tabs only. Mid-onboarding is exactly when you must not swap the flow
  // someone is halfway through, and on the auth and plate-vision screens a
  // refresh prompt is noise.
  const inTabs = (segments as string[])[0] === '(tabs)';
  if (!inTabs) return null;

  if (isUpdatePending) {
    return (
      <Bar
        icon="cloud-download"
        label="A new version is ready — tap to restart"
        busyLabel="Restarting…"
        busy={restarting}
        tone={t.colors.accent}
        onPress={() => {
          setRestarting(true);
          // If the reload fails the app simply keeps running the current
          // bundle; clear the spinner so the offer stays tappable.
          Updates.reloadAsync().catch(() => setRestarting(false));
        }}
      />
    );
  }

  if (updateAvailable || isApplying) {
    return (
      <Bar
        icon="sparkles"
        label="Your app has been updated — tap to refresh"
        busyLabel="Updating your app…"
        busy={isApplying}
        tone={t.colors.accent}
        onPress={() => void applyUpdate()}
      />
    );
  }

  return null;
}

function Bar({
  icon,
  label,
  busyLabel,
  busy,
  tone,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  busyLabel: string;
  busy: boolean;
  tone: string;
  onPress: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={busy ? busyLabel : label}
      style={({ pressed }) => [
        styles.bar,
        {
          // Clear of the absolutely-positioned tab bar (~49pt) plus its inset.
          bottom: insets.bottom + 60,
          backgroundColor: tone,
          opacity: pressed && !busy ? 0.9 : 1,
        },
      ]}>
      {busy ? (
        <ActivityIndicator size="small" color={t.colors.onBrand} />
      ) : (
        <Ionicons name={icon} size={16} color={t.colors.onBrand} />
      )}
      <AppText variant="caption" tone="onBrand" style={{ flex: 1 }}>
        {busy ? busyLabel : label}
      </AppText>
      {!busy ? <Ionicons name="chevron-forward" size={14} color={t.colors.onBrand} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 900,
    elevation: 900,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.pill,
    // Lifts it off the content it floats over; without this it reads as part of
    // whatever card happens to be underneath.
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
});
