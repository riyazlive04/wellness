import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText, Card, Eyebrow, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useMealSlots } from '@/lib/meal-slots';
import type { MealType } from '@/lib/plate-vision-api';
import {
  applyReminders,
  DEFAULT_REMINDERS,
  formatTime,
  fromMinutes,
  knownSlots,
  mealTimeFor,
  remindersApi,
  sendTestReminder,
  toMinutes,
  waterTimes,
  type ReminderSettings,
} from '@/lib/reminders';
import { brand, radius, spacing, tintFill } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const MEAL = '#3FAE88';
const WATER = '#22A3C3';
const ROUTINE = '#7C6BD6';
const INTERVALS: { value: ReminderSettings['water_every_minutes']; label: string }[] = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
];

export default function Reminders() {
  const q = useQuery({ queryKey: ['me', 'reminders'], queryFn: () => remindersApi.get(), retry: 1 });

  if (q.isLoading) {
    return (
      <Screen edges={[]} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (q.isError) {
    return (
      <Screen edges={[]} style={{ alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl }}>
        <AppText variant="body" style={{ textAlign: 'center' }}>Couldn&apos;t load your reminders.</AppText>
        <GradientButton label="Try again" onPress={() => void q.refetch()} />
      </Screen>
    );
  }
  // Keyed so a refetch with new server settings resets the form.
  return <ReminderForm key={JSON.stringify(q.data)} saved={q.data ?? null} />;
}

function ReminderForm({ saved }: { saved: ReminderSettings | null }) {
  const t = useTheme();
  const qc = useQueryClient();
  const { slots: practiceSlots } = useMealSlots();
  const slots = knownSlots(practiceSlots);
  const [s, setS] = useState<ReminderSettings>(saved ?? DEFAULT_REMINDERS);
  const set = (patch: Partial<ReminderSettings>) => setS((prev) => ({ ...prev, ...patch }));

  const save = useMutation({
    mutationFn: async () => {
      const stored = await remindersApi.save(s);
      const count = await applyReminders(stored, slots, { askPermission: true });
      return { stored, count };
    },
    onSuccess: ({ stored, count }) => {
      qc.setQueryData(['me', 'reminders'], stored);
      if (count === null) {
        Alert.alert(
          'Allow notifications',
          'Your reminders are saved, but NUSI can’t show them until you allow notifications for NUSI in your phone settings.',
        );
      } else {
        Alert.alert('Reminders set', count ? `${count} reminders a day are now set on this phone.` : 'All reminders are off.');
      }
    },
    onError: (err: Error) => Alert.alert('Couldn’t save your reminders', err.message),
  });

  const water = waterTimes(s);
  const routine = saved?.custom ?? [];
  const shiftMeal = (slot: MealType, by: number) =>
    set({ meal_times: { ...s.meal_times, [slot]: fromMinutes(toMinutes(mealTimeFor(s, slot)) + by) } });
  const shiftWater = (key: 'water_start' | 'water_end', by: number) => {
    const next = fromMinutes(toMinutes(s[key]) + by);
    const start = key === 'water_start' ? next : s.water_start;
    const end = key === 'water_end' ? next : s.water_end;
    if (toMinutes(start) < toMinutes(end)) set({ [key]: next });
  };

  return (
    <Screen edges={[]}>
      <ScreenScroll contentContainerStyle={{ gap: spacing.lg, paddingBottom: 120 }}>
        {!saved ? (
          <Card style={{ gap: spacing.xs, backgroundColor: tintFill(MEAL, t.dark) }}>
            <AppText variant="body" style={{ fontWeight: '600' }}>Never miss a meal or a glass of water</AppText>
            <AppText variant="muted" tone="muted">
              Pick your times below and tap Save. Reminders arrive on time even without internet.
            </AppText>
          </Card>
        ) : saved.updated_by === 'nutritionist' || saved.sequence_name ? (
          <Card style={{ gap: spacing.xs, backgroundColor: tintFill(ROUTINE, t.dark) }}>
            <AppText variant="body" style={{ fontWeight: '600' }}>
              Set by your nutritionist{saved.sequence_name ? ` · ${saved.sequence_name}` : ''}
            </AppText>
            <AppText variant="muted" tone="muted">
              These are already on this phone. You can change the times to suit your day.
            </AppText>
          </Card>
        ) : null}

        {routine.length ? (
          <View style={{ gap: spacing.sm }}>
            <Eyebrow>Daily routine</Eyebrow>
            <Card style={{ gap: spacing.md }}>
              <ToggleRow
                icon="list-outline"
                tint={ROUTINE}
                title="Routine reminders"
                sub={s.custom_enabled !== false ? `${routine.length} a day from your nutritionist` : 'Off'}
                value={s.custom_enabled !== false}
                onChange={(v) => set({ custom_enabled: v })}
              />
              {s.custom_enabled !== false
                ? routine.map((c) => (
                    <View key={c.id} style={[styles.timeRow, { borderTopColor: t.colors.border }]}>
                      <AppText variant="body" style={styles.routineTime}>{formatTime(c.time)}</AppText>
                      <View style={{ flex: 1 }}>
                        <AppText variant="body">{c.title}</AppText>
                        {c.body ? <AppText variant="caption" tone="muted">{c.body}</AppText> : null}
                      </View>
                    </View>
                  ))
                : null}
            </Card>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Meal times</Eyebrow>
          <Card style={{ gap: spacing.md }}>
            <ToggleRow
              icon="restaurant-outline"
              tint={MEAL}
              title="Meal reminders"
              sub={s.meals_enabled ? `${slots.length} a day, one for each meal in your plan` : 'Off'}
              value={s.meals_enabled}
              onChange={(v) => set({ meals_enabled: v })}
            />
            {s.meals_enabled
              ? slots.map((e) => (
                  <TimeRow
                    key={e.slot}
                    label={e.label}
                    time={mealTimeFor(s, e.slot)}
                    onMinus={() => shiftMeal(e.slot, -15)}
                    onPlus={() => shiftMeal(e.slot, 15)}
                  />
                ))
              : null}
          </Card>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Water</Eyebrow>
          <Card style={{ gap: spacing.md }}>
            <ToggleRow
              icon="water-outline"
              tint={WATER}
              title="Water reminders"
              sub={
                s.water_enabled
                  ? `${water.length} a day, ${formatTime(s.water_start)} to ${formatTime(water[water.length - 1] ?? s.water_end)}`
                  : 'Off'
              }
              value={s.water_enabled}
              onChange={(v) => set({ water_enabled: v })}
            />
            {s.water_enabled ? (
              <>
                <View style={{ gap: spacing.sm }}>
                  <AppText variant="caption" tone="muted">Remind me every</AppText>
                  <View style={styles.chips}>
                    {INTERVALS.map((o) => {
                      const on = s.water_every_minutes === o.value;
                      return (
                        <Pressable
                          key={o.value}
                          onPress={() => set({ water_every_minutes: o.value })}
                          style={[
                            styles.chip,
                            {
                              borderColor: on ? WATER : t.colors.border,
                              backgroundColor: on ? tintFill(WATER, t.dark) : 'transparent',
                            },
                          ]}>
                          <AppText variant="caption" style={{ color: on ? WATER : t.colors.text, fontWeight: on ? '700' : '500' }}>
                            {o.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <TimeRow label="From" time={s.water_start} onMinus={() => shiftWater('water_start', -30)} onPlus={() => shiftWater('water_start', 30)} />
                <TimeRow label="Until" time={s.water_end} onMinus={() => shiftWater('water_end', -30)} onPlus={() => shiftWater('water_end', 30)} />
              </>
            ) : null}
          </Card>
        </View>

        <GradientButton label="Save reminders" loading={save.isPending} onPress={() => save.mutate()} />
        <Pressable
          onPress={async () => {
            const ok = await sendTestReminder();
            if (!ok) Alert.alert('Allow notifications', 'Allow notifications for NUSI in your phone settings first.');
          }}
          style={({ pressed }) => [styles.test, { borderColor: t.colors.border, opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="notifications-outline" size={16} color={brand.teal} />
          <AppText variant="caption" tone="accent">Send me a test reminder</AppText>
        </Pressable>
        <AppText variant="caption" tone="faint" style={{ textAlign: 'center' }}>
          Times follow your phone&apos;s clock. If reminders arrive late, turn off battery saving for NUSI.
        </AppText>
      </ScreenScroll>
    </Screen>
  );
}

function ToggleRow({
  icon,
  tint,
  title,
  sub,
  value,
  onChange,
}: {
  icon: IoniconName;
  tint: string;
  title: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={[styles.rowChip, { backgroundColor: tintFill(tint, t.dark) }]}>
        <Ionicons name={icon} size={19} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="body">{title}</AppText>
        <AppText variant="caption" tone="muted">{sub}</AppText>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.colors.primary, false: t.colors.surfaceStrong }} />
    </View>
  );
}

function TimeRow({ label, time, onMinus, onPlus }: { label: string; time: string; onMinus: () => void; onPlus: () => void }) {
  const t = useTheme();
  return (
    <View style={[styles.timeRow, { borderTopColor: t.colors.border }]}>
      <AppText variant="body" style={{ flex: 1 }} numberOfLines={1}>{label}</AppText>
      <Pressable onPress={onMinus} hitSlop={6} style={[styles.step, { borderColor: t.colors.border }]} accessibilityLabel={`${label} earlier`}>
        <Ionicons name="remove" size={16} color={t.colors.text} />
      </Pressable>
      <AppText variant="body" style={styles.time}>{formatTime(time)}</AppText>
      <Pressable onPress={onPlus} hitSlop={6} style={[styles.step, { borderColor: t.colors.border }]} accessibilityLabel={`${label} later`}>
        <Ionicons name="add" size={16} color={t.colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rowChip: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  step: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  time: { minWidth: 82, textAlign: 'center', fontWeight: '600', fontVariant: ['tabular-nums'] },
  routineTime: { width: 78, fontWeight: '600', fontVariant: ['tabular-nums'] },
  test: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingVertical: 12,
  },
});
