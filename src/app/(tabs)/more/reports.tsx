import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const WINDOW = 30;

export default function Reports() {
  const t = useTheme();
  const snapQ = useQuery({ queryKey: ['me', 'snapshot'], queryFn: () => clientsApi.myWellnessSnapshot(), retry: 1 });
  const habitsQ = useQuery({ queryKey: ['me', 'habits', WINDOW], queryFn: () => clientsApi.myHabits(WINDOW), retry: 1 });
  const mealsQ = useQuery({ queryKey: ['me', 'meals', WINDOW], queryFn: () => clientsApi.myMeals(WINDOW), retry: 1 });

  const habits = habitsQ.data ?? [];
  const meals = mealsQ.data ?? [];
  const snap = snapQ.data;

  const waterDays = habits.filter((h) => h.water_ml > 0);
  const avgWater = waterDays.length ? waterDays.reduce((s, h) => s + h.water_ml, 0) / waterDays.length / 1000 : 0;
  const sleepDays = habits.filter((h) => h.sleep_hours != null);
  const avgSleep = sleepDays.length ? sleepDays.reduce((s, h) => s + (h.sleep_hours ?? 0), 0) / sleepDays.length : 0;
  const weights = habits.filter((h) => h.weight_kg != null).map((h) => h.weight_kg as number);
  const weightDelta = weights.length >= 2 ? weights[weights.length - 1] - weights[0] : null;
  const activeDays = habits.filter((h) => h.water_ml > 0 || h.exercise_minutes > 0 || h.sleep_hours != null || h.weight_kg != null).length;

  const loading = snapQ.isLoading || habitsQ.isLoading || mealsQ.isLoading;

  const weightDown = weightDelta != null && weightDelta < 0;

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={habitsQ.isRefetching} onRefresh={() => { snapQ.refetch(); habitsQ.refetch(); mealsQ.refetch(); }} tintColor={t.colors.accent} />}>
        {loading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <Eyebrow>Wellness summary</Eyebrow>
              <AppText variant="title">Your last {WINDOW} days</AppText>
            </View>

            {snap ? (
              <Card style={{ gap: spacing.lg, overflow: 'hidden', borderRadius: radius['2xl'] }}>
                <LinearGradient
                  colors={[t.gradient[2] + (t.dark ? '1F' : '14'), t.gradient[1] + '08', 'transparent']}
                  start={{ x: 1, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ gap: spacing.xs }}>
                    <Eyebrow>{snap.scoreLabel || 'Wellness score'}</Eyebrow>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                      <AppText variant="display" tone="accent" style={{ fontVariant: ['tabular-nums'], lineHeight: 42 }}>
                        {snap.score > 0 ? snap.score : '–'}
                      </AppText>
                      {snap.score > 0 ? (
                        <AppText variant="heading" tone="muted" style={{ marginBottom: 6 }}>
                          / 100
                        </AppText>
                      ) : null}
                    </View>
                    {snap.streakDays > 0 ? (
                      <View style={[styles.chip, { backgroundColor: t.colors.warning + (t.dark ? '2E' : '1A'), borderColor: t.colors.warning + '33', marginTop: 2 }]}>
                        <Ionicons name="flame" size={12} color={t.colors.warning} />
                        <AppText variant="caption" style={{ color: t.colors.warning }}>
                          {`${snap.streakDays}-day streak`}
                        </AppText>
                      </View>
                    ) : null}
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
                    <Ionicons name="ribbon-outline" size={22} color={t.colors.accent} />
                  </View>
                </View>
              </Card>
            ) : null}

            <View style={styles.grid}>
              <Metric icon="water-outline" tint={t.colors.accent} label="Avg water" value={avgWater ? `${avgWater.toFixed(1)}L` : '–'} />
              <Metric icon="moon-outline" tint={t.colors.primary} label="Avg sleep" value={avgSleep ? `${avgSleep.toFixed(1)}h` : '–'} />
              <Metric icon="restaurant-outline" tint={t.colors.success} label="Meals logged" value={String(meals.length)} />
              <Metric icon="calendar-outline" tint={t.colors.accent} label="Active days" value={`${activeDays}/${WINDOW}`} />
              <Metric
                icon="scale-outline"
                tint={weightDown ? t.colors.success : t.colors.warning}
                label="Weight change"
                value={weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)}kg` : '–'}
                valueTone={weightDown ? 'success' : 'text'}
              />
              <Metric icon="flame-outline" tint={t.colors.warning} label="Streak" value={snap ? `${snap.streakDays}d` : '–'} />
            </View>

            <LinearGradient
              colors={[t.gradient[0] + '20', t.gradient[1] + '12', t.gradient[2] + '0A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.noteCard, { borderColor: t.colors.accent + '33' }]}>
              <View style={[styles.noteIcon, { backgroundColor: t.colors.accent + (t.dark ? '2E' : '1F') }]}>
                <Ionicons name="sparkles-outline" size={18} color={t.colors.accent} />
              </View>
              <AppText variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
                Generated from your logged data. Your nutritionist sees the full report in the web portal.
              </AppText>
            </LinearGradient>
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function Metric({
  icon,
  tint,
  label,
  value,
  valueTone = 'text',
}: {
  icon: IoniconName;
  tint: string;
  label: string;
  value: string;
  valueTone?: 'text' | 'success';
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
      <View style={[styles.iconChip, { backgroundColor: tint + (t.dark ? '33' : '1F') }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <AppText variant="title" tone={valueTone === 'success' ? 'success' : 'text'} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </AppText>
      <AppText variant="caption" tone="muted">{label}</AppText>
    </Card>
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
    backgroundColor: alpha(tint, dark ? 0.18 : 0.1),
    borderColor: alpha(tint, dark ? 0.34 : 0.22),
  };
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
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
    alignSelf: 'flex-start',
  },
  noteCard: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
