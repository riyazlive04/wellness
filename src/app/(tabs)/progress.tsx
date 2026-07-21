import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { TrendChart } from '@/components/trend-chart';
import { AppText, Card, Eyebrow, GhostButton, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type HabitDay } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;
type LogField = 'weight_kg' | 'sleep_hours';

export default function Progress() {
  const t = useTheme();
  const qc = useQueryClient();
  const [ask, setAsk] = useState<LogField | null>(null);

  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const habitsQ = useQuery({ queryKey: ['me', 'habits', 14], queryFn: () => clientsApi.myHabits(14), retry: 1 });

  const logMut = useMutation({
    mutationFn: (body: Partial<HabitDay>) => clientsApi.logHabit(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setAsk(null);
    },
  });

  // Oldest -> newest for the chart.
  const habits = useMemo(
    () => [...(habitsQ.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [habitsQ.data],
  );
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = habits.find((h) => h.date === todayStr) ?? null;

  const profile = profileQ.data;
  const weightSeries = habits.filter((h) => h.weight_kg != null).map((h) => h.weight_kg as number);
  const latestWeight = weightSeries.length ? weightSeries[weightSeries.length - 1] : profile?.weight_kg ?? null;
  const firstWeight = weightSeries.length ? weightSeries[0] : null;
  const weightDelta = latestWeight != null && firstWeight != null ? latestWeight - firstWeight : null;

  const bmi =
    latestWeight != null && profile?.height_cm
      ? latestWeight / Math.pow(profile.height_cm / 100, 2)
      : null;

  const streak = computeStreak(habits);

  const refreshing = profileQ.isRefetching || habitsQ.isRefetching;
  const onRefresh = () => {
    profileQ.refetch();
    habitsQ.refetch();
  };

  if (habitsQ.isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenScroll
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
        }>
        <View style={{ gap: 4 }}>
          <Eyebrow>Your progress</Eyebrow>
          <AppText variant="title">Trends & body</AppText>
        </View>

        {/* Top stats */}
        <View style={styles.grid}>
          <StatTile
            icon="scale-outline"
            label="Weight"
            value={latestWeight != null ? `${latestWeight.toFixed(1)}` : '–'}
            unit="kg"
            sub={
              weightDelta != null
                ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg`
                : undefined
            }
            subTone={weightDelta != null && weightDelta < 0 ? 'success' : 'muted'}
          />
          <StatTile
            icon="body-outline"
            label="BMI"
            value={bmi != null ? bmi.toFixed(1) : '–'}
            sub={bmi != null ? bmiLabel(bmi) : 'Add height & weight'}
          />
        </View>

        {/* Weight trend */}
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow>Weight trend · 14 days</Eyebrow>
            {weightSeries.length ? (
              <AppText variant="caption" tone="muted">
                {weightSeries.length} entries
              </AppText>
            ) : null}
          </View>
          <TrendChart values={weightSeries} emptyLabel="Log your weight to start your trend." />
          <GhostButton label="＋ Log weight" onPress={() => setAsk('weight_kg')} />
        </Card>

        {/* Today's habits */}
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Today</Eyebrow>
          <View style={styles.grid}>
            <HabitTile
              icon="water-outline"
              tint="#3B82F6"
              label="Water"
              value={today?.water_ml ? `${(today.water_ml / 1000).toFixed(1)}L` : '–'}
              hint="+250ml"
              onPress={() => logMut.mutate({ water_ml: (today?.water_ml ?? 0) + 250 })}
              busy={logMut.isPending}
            />
            <HabitTile
              icon="moon-outline"
              tint="#0E9AA8"
              label="Sleep"
              value={today?.sleep_hours != null ? `${today.sleep_hours}h` : '–'}
              hint="log"
              onPress={() => setAsk('sleep_hours')}
            />
            <HabitTile
              icon="walk-outline"
              tint="#10B981"
              label="Move"
              value={today?.exercise_minutes ? `${today.exercise_minutes}m` : '–'}
            />
            <HabitTile icon="flame-outline" tint="#F59E0B" label="Streak" value={`${streak}d`} />
          </View>
        </View>

        {/* 14-day activity strip */}
        <Card style={{ gap: spacing.md }}>
          <Eyebrow>Consistency · 14 days</Eyebrow>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {last14(habits).map((d, i) => {
              const active = d != null && isLogged(d);
              return (
                <View
                  key={d?.date ?? `empty-${i}`}
                  style={{
                    flex: 1,
                    height: 34,
                    marginHorizontal: 1.5,
                    borderRadius: 6,
                    backgroundColor: active ? t.colors.accent : t.colors.surfaceStrong,
                    opacity: active ? 1 : 0.6,
                  }}
                />
              );
            })}
          </View>
          <AppText variant="caption" tone="faint">
            Each bar is a day you logged water, sleep, movement, or weight.
          </AppText>
        </Card>
      </ScreenScroll>

      <ValuePrompt
        key={ask ?? 'closed'}
        visible={ask !== null}
        field={ask}
        busy={logMut.isPending}
        onCancel={() => setAsk(null)}
        onSubmit={(field, value) => logMut.mutate({ [field]: value } as Partial<HabitDay>)}
      />
    </Screen>
  );
}

function ValuePrompt({
  visible,
  field,
  busy,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  field: LogField | null;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (field: LogField, value: number) => void;
}) {
  const t = useTheme();
  const [val, setVal] = useState('');
  const cfg =
    field === 'sleep_hours'
      ? { title: 'Log your sleep', unit: 'hours', placeholder: 'e.g. 7.5', max: 24 }
      : { title: 'Log your weight', unit: 'kg', placeholder: 'e.g. 72.5', max: 500 };

  const submit = () => {
    const n = parseFloat(val.replace(',', '.'));
    if (!field || isNaN(n) || n <= 0 || n > cfg.max) return;
    onSubmit(field, n);
    setVal('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onCancel}>
          <Pressable
            style={[styles.sheet, { backgroundColor: t.colors.canvas, borderColor: t.colors.border }]}
            onPress={(e) => e.stopPropagation()}>
          <AppText variant="heading">{cfg.title}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <TextInput
              value={val}
              onChangeText={setVal}
              placeholder={cfg.placeholder}
              placeholderTextColor={t.colors.textFaint}
              keyboardType="decimal-pad"
              autoFocus
              style={[
                styles.promptInput,
                { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border },
              ]}
            />
            <AppText variant="body" tone="muted">
              {cfg.unit}
            </AppText>
          </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
              <GhostButton label="Cancel" onPress={onCancel} style={{ flex: 1 }} />
              <GradientButton label="Save" onPress={submit} loading={busy} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function StatTile({
  icon,
  label,
  value,
  unit,
  sub,
  subTone = 'muted',
}: {
  icon: IoniconName;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  subTone?: 'muted' | 'success';
}) {
  const t = useTheme();
  return (
    <Card style={{ width: '48%', gap: spacing.sm }}>
      <View style={[styles.statIcon, { backgroundColor: t.colors.surfaceStrong }]}>
        <Ionicons name={icon} size={16} color={t.colors.accent} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
        <AppText variant="title" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </AppText>
        {unit ? (
          <AppText variant="muted" tone="muted" style={{ marginBottom: 3 }}>
            {unit}
          </AppText>
        ) : null}
      </View>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
      {sub ? (
        <AppText variant="caption" tone={subTone === 'success' ? 'success' : 'faint'}>
          {sub}
        </AppText>
      ) : null}
    </Card>
  );
}

function HabitTile({
  icon,
  tint,
  label,
  value,
  hint,
  onPress,
  busy,
}: {
  icon: IoniconName;
  tint: string;
  label: string;
  value: string;
  hint?: string;
  onPress?: () => void;
  busy?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ width: '48%' }}>
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={[styles.statIcon, { backgroundColor: tint + '26' }]}>
            <Ionicons name={icon} size={16} color={tint} />
          </View>
          {busy ? (
            <ActivityIndicator size="small" color={t.colors.textFaint} />
          ) : hint && onPress ? (
            <AppText variant="caption" tone="faint">
              {hint}
            </AppText>
          ) : null}
        </View>
        <AppText variant="heading">{value}</AppText>
        <AppText variant="caption" tone="muted">
          {label}
        </AppText>
      </Card>
    </Pressable>
  );
}

function isLogged(d: HabitDay): boolean {
  return d.water_ml > 0 || d.exercise_minutes > 0 || d.weight_kg != null || d.sleep_hours != null;
}

function computeStreak(habitsAsc: HabitDay[]): number {
  // Count back from today over consecutive logged days.
  const byDate = new Map(habitsAsc.map((h) => [h.date, h]));
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 60; i++) {
    const key = cursor.toISOString().slice(0, 10);
    const d = byDate.get(key);
    if (d && isLogged(d)) streak++;
    else if (i > 0) break; // today may be empty and still continue a streak
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function last14(habitsAsc: HabitDay[]): (HabitDay | null)[] {
  const byDate = new Map(habitsAsc.map((h) => [h.date, h]));
  const out: (HabitDay | null)[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 13);
  for (let i = 0; i < 14; i++) {
    out.push(byDate.get(cursor.toISOString().slice(0, 10)) ?? null);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function bmiLabel(bmi: number): string {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Healthy range';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  promptInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 18,
  },
});
