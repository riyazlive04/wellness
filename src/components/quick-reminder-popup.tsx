/**
 * Quick reminders from the nutritionist ("drink water", "time for lunch",
 * "log your meal", or their own words) pop up as a card while the app is open.
 * They also arrive as ordinary phone notifications (notifications-service);
 * when the card shows, that notification is cleared from the tray.
 *
 * The card is an overlay inside the app, not a React Native <Modal>: on some
 * Android phones a Modal opened at launch never appeared, which left the card
 * "showing" invisibly and stopped every later reminder.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText, GradientButton } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { notificationsApi, type AppNotification } from '@/lib/notifications-api';
import { radius, spacing } from '@/lib/theme';

/** Notification types that are quick reminders (see the backend's quickReminderContent). */
export const QUICK_REMINDER_TYPES = ['water:reminder', 'meal:reminder', 'meal:log_reminder', 'coach:reminder'];

const SHOWN_KEY = 'sirah-quick-reminders-shown';
const POLL_MS = 30_000;
/** Older than this, a reminder is stale ("time for lunch" at dinner) and stays in Notifications only. */
const FRESH_MS = 3 * 60 * 60_000;

const LOOK: Record<string, { emoji: string; tint: string }> = {
  'water:reminder': { emoji: '💧', tint: '#22A3C3' },
  'meal:reminder': { emoji: '🍽️', tint: '#3FAE88' },
  'meal:log_reminder': { emoji: '📸', tint: '#3FAE88' },
  'coach:reminder': { emoji: '⏰', tint: '#7C6BD6' },
};

/** Drop the leading emoji from the title; the card shows it large. */
const plainTitle = (title: string) => title.replace(/^\p{Extended_Pictographic}️?\s*/u, '');

async function readShown(): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(SHOWN_KEY)) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function QuickReminderPopup() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [current, setCurrent] = useState<AppNotification | null>(null);
  const [busy, setBusy] = useState(false);
  // Mirrors `current` for the poller, which must keep running while a card shows.
  const showingId = useRef<string | null>(null);

  const check = useCallback(async () => {
    if (showingId.current) return;
    try {
      const items = await notificationsApi.list(10);
      if (showingId.current) return;
      const shown = await readShown();
      const now = Date.now();
      const pending = items.filter(
        (n) =>
          QUICK_REMINDER_TYPES.includes(n.type) &&
          !n.read_at &&
          !shown.includes(n.id) &&
          now - new Date(n.created_at).getTime() < FRESH_MS,
      );
      if (!pending.length) return;
      // Newest only: several waiting reminders shouldn't stack up as pop-ups.
      await AsyncStorage.setItem(SHOWN_KEY, JSON.stringify([...pending.map((n) => n.id), ...shown].slice(0, 40)));
      showingId.current = pending[0].id;
      setCurrent(pending[0]);
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void clearFromTray(pending.map((n) => n.id));
    } catch {
      /* offline: try again on the next tick */
    }
  }, [qc]);

  useEffect(() => {
    // First look shortly after the app settles, then every 30 s while it's open.
    const first = setTimeout(() => void check(), 1500);
    let timer = setInterval(() => void check(), POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      clearInterval(timer);
      if (state === 'active') {
        void check();
        timer = setInterval(() => void check(), POLL_MS);
      }
    });
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      sub.remove();
    };
  }, [check]);

  // Android back button closes the card instead of leaving the screen.
  useEffect(() => {
    if (!current) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      showingId.current = null;
      setCurrent(null);
      void notificationsApi.markRead(current.id).catch(() => {});
      return true;
    });
    return () => sub.remove();
  }, [current]);

  const close = (then?: () => void) => {
    const n = current;
    showingId.current = null;
    setCurrent(null);
    if (n) {
      void notificationsApi
        .markRead(n.id)
        .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
        .catch(() => {});
    }
    then?.();
  };

  const addGlass = async () => {
    setBusy(true);
    try {
      const snap = await clientsApi.myWellnessSnapshot();
      await clientsApi.logHabit({ water_ml: Math.min(6000, (snap?.waterMl ?? 0) + 250) });
      void qc.invalidateQueries({ queryKey: ['me'] });
    } catch {
      /* logging is a bonus; the reminder still counts as seen */
    } finally {
      setBusy(false);
      close();
    }
  };

  if (!current) return null;
  const look = LOOK[current.type] ?? LOOK['coach:reminder'];
  const primary =
    current.type === 'water:reminder'
      ? { label: '+1 glass (250 ml)', onPress: () => void addGlass() }
      : current.type === 'meal:reminder' || current.type === 'meal:log_reminder'
        ? { label: 'Log my meal', onPress: () => close(() => router.push('/plate-vision')) }
        : { label: 'Got it', onPress: () => close() };
  const secondary = current.type === 'coach:reminder' ? null : current.type === 'water:reminder' ? 'Later' : 'Got it';

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => close()}>
        <Pressable style={[styles.card, { backgroundColor: t.dark ? '#18201b' : '#ffffff', borderColor: t.colors.border }]} onPress={() => {}}>
          <View style={[styles.badge, { backgroundColor: `${look.tint}22` }]}>
            <AppText style={{ fontSize: 34, lineHeight: 42 }}>{look.emoji}</AppText>
          </View>
          <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
            From your nutritionist
          </AppText>
          <AppText variant="heading" style={{ textAlign: 'center' }}>
            {plainTitle(current.title)}
          </AppText>
          {current.body ? (
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
              {current.body}
            </AppText>
          ) : null}
          <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm }}>
            <GradientButton label={primary.label} loading={busy} onPress={primary.onPress} />
            {secondary ? (
              <Pressable onPress={() => close()} disabled={busy} style={styles.secondary} hitSlop={6}>
                <AppText variant="body" tone="muted">{secondary}</AppText>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </View>
  );
}

/** Remove these reminders' phone notifications from the tray: the card covers them. */
async function clearFromTray(ids: string[]): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      shown
        .filter((p) => ids.includes(String(p.request.content.data?.id ?? '')))
        .map((p) => Notifications.dismissNotificationAsync(p.request.identifier)),
    );
  } catch {
    /* tray clean-up is cosmetic */
  }
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, elevation: 1000 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  secondary: { alignItems: 'center', paddingVertical: spacing.sm },
});
