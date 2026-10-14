/**
 * Send a client a one-off reminder now ("drink water", "time for lunch", "log
 * your meal", or your own words). It pops up in their NUSI app, or arrives as a
 * phone notification when the app is closed. Sending to many clients at once
 * is on the web (Clients → Reminders).
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ActionButton, Field, Sheet } from '@/components/owner/ui';
import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_SLOTS, SLOT_LABELS, mealPlansApi, type MealSlot, type MealSlotEntry } from '@/lib/owner/api/mealPlans';
import { DEFAULT_MEAL_TIMES, remindersApi, type QuickReminderKind } from '@/lib/owner/api/reminders';
import { radius, spacing } from '@/lib/theme';

const KINDS: { kind: QuickReminderKind; emoji: string; label: string }[] = [
  { kind: 'water', emoji: '💧', label: 'Drink water' },
  { kind: 'meal', emoji: '🍽️', label: 'Meal time' },
  { kind: 'log_meal', emoji: '📸', label: 'Log a meal' },
  { kind: 'custom', emoji: '⏰', label: 'Your words' },
];

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function QuickReminderSheet({ clientId, clientName, onClose }: { clientId: string; clientName: string; onClose: () => void }) {
  const t = useTheme();
  const slotsQ = useQuery({ queryKey: ['workspace', 'meal-plans', 'slots'], queryFn: () => mealPlansApi.slots(), staleTime: 30_000 });
  const schedule: MealSlotEntry[] = slotsQ.data?.schedule?.length
    ? slotsQ.data.schedule
    : DEFAULT_SLOTS.map((slot) => ({ slot, label: SLOT_LABELS[slot], custom: false }));
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nearest =
    [...schedule].sort(
      (a, b) => Math.abs(toMinutes(DEFAULT_MEAL_TIMES[a.slot]) - nowMin) - Math.abs(toMinutes(DEFAULT_MEAL_TIMES[b.slot]) - nowMin),
    )[0]?.slot ?? 'lunch';
  const [kind, setKind] = useState<QuickReminderKind>('water');
  const [slot, setSlot] = useState<MealSlot | null>(null);
  const [message, setMessage] = useState('');
  const mealSlot = slot ?? nearest;

  const send = useMutation({
    mutationFn: () =>
      remindersApi.quick({
        clientIds: [clientId],
        kind,
        ...(kind === 'meal' || kind === 'log_meal' ? { slot: mealSlot } : {}),
        ...(kind === 'custom' ? { message: message.trim() } : {}),
      }),
    onSuccess: (r) => {
      onClose();
      Alert.alert(
        r.sent ? 'Sent' : 'Already sent',
        r.sent ? `It pops up in ${clientName}'s NUSI app.` : 'The same reminder went out in the last 2 minutes, so it wasn’t sent again.',
      );
    },
    onError: (e: Error) => Alert.alert('Could not send', e.message),
  });

  return (
    <Sheet visible onClose={() => !send.isPending && onClose()} title={`Quick reminder to ${clientName}`}>
      <View style={styles.grid}>
        {KINDS.map((k) => {
          const on = kind === k.kind;
          return (
            <Pressable
              key={k.kind}
              onPress={() => setKind(k.kind)}
              style={[styles.kind, { borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? `${t.colors.primary}14` : 'transparent' }]}>
              <AppText style={{ fontSize: 22 }}>{k.emoji}</AppText>
              <AppText variant="caption" style={{ fontWeight: '700' }}>{k.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      {kind === 'meal' || kind === 'log_meal' ? (
        <View style={styles.wrap}>
          {schedule.map((e) => {
            const on = mealSlot === e.slot;
            return (
              <Pressable
                key={e.slot}
                onPress={() => setSlot(e.slot)}
                style={[styles.chip, { borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? `${t.colors.primary}14` : 'transparent' }]}>
                <AppText variant="caption" style={{ fontWeight: '600' }}>{e.label}</AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {kind === 'custom' ? (
        <Field label="MESSAGE" value={message} onChangeText={setMessage} maxLength={200} multiline placeholder="e.g. Time for your evening walk 🚶" style={{ minHeight: 70, textAlignVertical: 'top' }} />
      ) : null}
      <ActionButton
        label="Send now"
        icon="send"
        loading={send.isPending}
        disabled={kind === 'custom' && !message.trim()}
        onPress={() => send.mutate()}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kind: { width: '48%', flexGrow: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
});
