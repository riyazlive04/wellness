import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
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
import { radius, spacing, tintFill } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;
type LogField = 'weight_kg' | 'sleep_hours' | 'exercise_minutes';

export default function Progress() {
  const t = useTheme();
  const qc = useQueryClient();
  const router = useRouter();
  const [ask, setAsk] = useState<LogField | null>(null);

  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const habitsQ = useQuery({ queryKey: ['me', 'habits', 14], queryFn: () => clientsApi.myHabits(14), retry: 1 });
  const achQ = useQuery({ queryKey: ['me', 'achievements'], queryFn: () => clientsApi.myAchievements(), retry: 1 });

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

  // Presentation-only derivations from the same data.
  const days14 = last14(habits);
  const logged14 = days14.filter((d) => d != null && isLogged(d)).length;
  const adherence = Math.round((logged14 / 14) * 100);

  // Real achievements (same source as More → Achievements), earned first.
  const allAch = achQ.data ?? [];
  const earnedAch = allAch.filter((a) => a.earned_at);
  const totalAch = allAch.length;

  const coachNote =
    streak >= 7
      ? 'A full week of consistency — this is exactly how lasting change is built. Proud of you.'
      : streak >= 3
        ? "You're on a roll. Small daily wins are stacking up into real momentum."
        : weightDelta != null && weightDelta < 0
          ? 'Trending in the right direction. Keep logging so we can fine-tune your plan together.'
          : 'Log a little every day — water, sleep, movement or weight. The trend takes care of itself.';

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

  const deltaDown = weightDelta != null && weightDelta < 0;
  const deltaTint = deltaDown ? t.colors.success : t.colors.warning;

  return (
    <Screen>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
        }>
        <View style={{ gap: 4 }}>
          <Eyebrow>Your progress</Eyebrow>
          <AppText variant="title">Trends & body</AppText>
        </View>

        {/* Hero weight card — big number + delta + sparkline */}
        <Card style={{ gap: spacing.lg, overflow: 'hidden', borderRadius: radius['2xl'] }}>
          <LinearGradient
            colors={[t.gradient[2] + (t.dark ? '1F' : '14'), t.gradient[1] + '08', 'transparent']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ gap: spacing.xs }}>
              <Eyebrow>Current weight</Eyebrow>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                <AppText variant="display" style={{ fontVariant: ['tabular-nums'], lineHeight: 42 }}>
                  {latestWeight != null ? latestWeight.toFixed(1) : '–'}
                </AppText>
                <AppText variant="heading" tone="muted" style={{ marginBottom: 6 }}>
                  kg
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 }}>
                {weightDelta != null ? (
                  <View style={[styles.chip, { backgroundColor: deltaTint + '1A', borderColor: deltaTint + '33' }]}>
                    <Ionicons name={deltaDown ? 'arrow-down' : 'arrow-up'} size={12} color={deltaTint} />
                    <AppText variant="caption" style={{ color: deltaTint }}>
                      {`${Math.abs(weightDelta).toFixed(1)} kg · 14d`}
                    </AppText>
                  </View>
                ) : null}
                {bmi != null ? (
                  <View style={[styles.chip, { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border }]}>
                    <Ionicons name="body-outline" size={12} color={t.colors.textMuted} />
                    <AppText variant="caption" tone="muted">
                      {`BMI ${bmi.toFixed(1)} · ${bmiLabel(bmi)}`}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </View>
            <View
              style={[
                styles.heroIcon,
                {
                  backgroundColor: t.colors.accent + (t.dark ? '2E' : '1A'),
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: t.colors.accent + '3A',
                },
              ]}>
              <Ionicons name="scale-outline" size={22} color={t.colors.accent} />
            </View>
          </View>

          <TrendChart values={weightSeries} height={96} emptyLabel="Log your weight to start your trend." />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="caption" tone="faint">
              {weightSeries.length ? `${weightSeries.length} entries logged` : 'No entries yet'}
            </AppText>
          </View>
          <GhostButton label="＋ Log weight" onPress={() => setAsk('weight_kg')} />
        </Card>

        {/* Two-up stats — adherence + streak */}
        <View style={styles.grid}>
          <MiniStat
            icon="pulse-outline"
            tint={t.colors.accent}
            label="Adherence"
            value={`${adherence}`}
            unit="%"
            sub="last 14 days"
          />
          <MiniStat
            icon="flame"
            tint={t.colors.warning}
            label="Current streak"
            value={`${streak}`}
            unit={streak === 1 ? 'day' : 'days'}
            sub={streak > 0 ? 'keep it going' : 'log to start'}
          />
        </View>

        {/* Achievements — real badges; tap to open the full collection */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow>Achievements</Eyebrow>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <AppText variant="caption" tone="accent">See all</AppText>
              <Ionicons name="chevron-forward" size={13} color={t.colors.accent} />
            </View>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/more/achievements')}>
            {({ pressed }) => (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: pressed ? 0.7 : 1 }}>
                {earnedAch.length > 0 ? (
                  <View style={{ flexDirection: 'row' }}>
                    {earnedAch.slice(0, 5).map((a, i) => (
                      <View
                        key={a.id}
                        style={[
                          styles.achEmoji,
                          {
                            marginLeft: i === 0 ? 0 : -8,
                            backgroundColor: t.colors.warning + (t.dark ? '2E' : '1A'),
                            borderColor: t.colors.surface,
                          },
                        ]}>
                        <AppText style={{ fontSize: 17 }}>{a.icon}</AppText>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View
                    style={[
                      styles.achEmoji,
                      { backgroundColor: t.colors.warning + (t.dark ? '2E' : '1A'), borderColor: t.colors.surface },
                    ]}>
                    <Ionicons name="ribbon-outline" size={17} color={t.colors.warning} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <AppText variant="body">
                    {earnedAch.length > 0 ? `${earnedAch.length} of ${totalAch} unlocked` : 'Unlock your first badge'}
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    {earnedAch.length > 0 ? 'Tap to see your badges' : 'Keep logging to earn achievements'}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={t.colors.textFaint} />
              </Card>
            )}
          </Pressable>
        </View>

        {/* Today's habits */}
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Today</Eyebrow>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <HabitTile
              icon="water-outline"
              tint={t.colors.accent}
              label="Water"
              value={today?.water_ml ? `${(today.water_ml / 1000).toFixed(1)}L` : '–'}
              hint="+250ml"
              onPress={() => logMut.mutate({ water_ml: Math.min(6000, (today?.water_ml ?? 0) + 250) })}
              busy={logMut.isPending}
            />
            <HabitTile
              icon="moon-outline"
              tint={t.colors.primary}
              label="Sleep"
              value={today?.sleep_hours != null ? `${today.sleep_hours}h` : '–'}
              hint="log"
              onPress={() => setAsk('sleep_hours')}
            />
            <HabitTile
              icon="walk-outline"
              tint={t.colors.success}
              label="Move"
              value={today?.exercise_minutes ? `${today.exercise_minutes}m` : '–'}
              hint="log"
              onPress={() => setAsk('exercise_minutes')}
            />
          </View>
        </View>

        {/* 14-day activity strip */}
        <Card style={{ gap: spacing.md }}>
          <Eyebrow>Consistency · 14 days</Eyebrow>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {days14.map((d, i) => {
              const active = d != null && isLogged(d);
              return (
                <View
                  key={d?.date ?? `empty-${i}`}
                  style={{
                    flex: 1,
                    height: 36,
                    marginHorizontal: 1.5,
                    borderRadius: radius.sm,
                    backgroundColor: active ? t.colors.accent : t.colors.accent + (t.dark ? '1A' : '12'),
                  }}
                />
              );
            })}
          </View>
          <AppText variant="caption" tone="faint">
            Each bar is a day you logged water, sleep, movement, or weight.
          </AppText>
        </Card>

        {/* Note from your coach */}
        <LinearGradient
          colors={[t.gradient[0] + '2B', t.gradient[1] + '1A', t.gradient[2] + '10']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.coachCard, { borderColor: t.colors.accent + '33' }]}>
          <View style={[styles.heroIcon, { backgroundColor: t.colors.accent + '26' }]}>
            <Ionicons name="sparkles-outline" size={20} color={t.colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Eyebrow>Keep going</Eyebrow>
            <AppText variant="body" style={{ lineHeight: 21 }}>
              {coachNote}
            </AppText>
          </View>
        </LinearGradient>
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
      ? { title: 'Log your sleep', unit: 'hours', placeholder: 'e.g. 7', max: 16 }
      : field === 'exercise_minutes'
        ? { title: 'Log your movement', unit: 'minutes', placeholder: 'e.g. 30', max: 300 }
        : { title: 'Log your weight', unit: 'kg', placeholder: 'e.g. 72.5', max: 500 };

  const submit = () => {
    const n = parseFloat(val.replace(',', '.'));
    if (!field || isNaN(n) || n <= 0 || n > cfg.max) return;
    // water/sleep/exercise are integer columns server-side; only weight is decimal.
    const value = field === 'weight_kg' ? n : Math.round(n);
    onSubmit(field, value);
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

/** Compact stat card — big value + unit over a tinted icon. */
function MiniStat({
  icon,
  tint,
  label,
  value,
  unit,
  sub,
}: {
  icon: IoniconName;
  tint: string;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  const t = useTheme();
  const fill = softFill(t.dark, tint);
  return (
    <Card
      style={{
        width: '48%',
        gap: spacing.sm,
        borderRadius: radius['2xl'],
        backgroundColor: fill.backgroundColor,
        borderColor: fill.borderColor,
      }}>
      <View style={[styles.statIconLg, { backgroundColor: tint + (t.dark ? '33' : '1F') }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
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
        <AppText variant="caption" tone="faint">
          {sub}
        </AppText>
      ) : null}
    </Card>
  );
}

/* Achievement badges now live on the dedicated More → Achievements screen. */

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
  const fill = softFill(t.dark, tint);
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1 }}>
      <Card
        style={{
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: radius.xl,
          backgroundColor: fill.backgroundColor,
          borderColor: fill.borderColor,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={[styles.statIconLg, { backgroundColor: tint + (t.dark ? '40' : '2B') }]}>
            <Ionicons name={icon} size={18} color={tint} />
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

/** Append an alpha byte to a 6-digit hex color. */
function alpha(hex: string, a: number): string {
  const clamped = Math.max(0, Math.min(1, a));
  return hex + Math.round(clamped * 255).toString(16).padStart(2, '0');
}

/** Soft pastel tile fill — warmer in dark, whisper-light in light mode. */
function softFill(dark: boolean, tint: string): { backgroundColor: string; borderColor: string } {
  return {
    backgroundColor: tintFill(tint, dark),
    borderColor: alpha(tint, dark ? 0.34 : 0.22),
  };
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
  statIconLg: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achEmoji: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coachCard: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
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
