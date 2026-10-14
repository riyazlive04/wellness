/**
 * Quick reminders from the nutritionist ("drink water", "time for lunch",
 * "log your meal", or their own words) pop up as a card while the app is open.
 * When the app is closed the background check shows them as phone
 * notifications instead (notifications-service), and the card appears the
 * next time the app opens, if the reminder is still fresh.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, View } from 'react-native';

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
  const showing = useRef(false);

  const check = useCallback(async () => {
    if (showing.current) return;
    try {
      const items = await notificationsApi.list(10);
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
      showing.current = true;
      setCurrent(pending[0]);
      void qc.invalidateQueries({ queryKey: ['notifications'] });
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

  const close = (then?: () => void) => {
    const n = current;
    showing.current = false;
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
    <Modal visible transparent animationType="fade" onRequestClose={() => close()}>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
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
