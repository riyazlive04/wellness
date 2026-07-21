import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

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

  return (
    <Screen edges={[]}>
      <ScreenScroll refreshControl={<RefreshControl refreshing={habitsQ.isRefetching} onRefresh={() => { snapQ.refetch(); habitsQ.refetch(); mealsQ.refetch(); }} tintColor={t.colors.accent} />}>
        {loading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <Eyebrow>Wellness summary</Eyebrow>
              <AppText variant="muted" tone="muted">Last {WINDOW} days</AppText>
            </View>

            {snap ? (
              <Card style={{ alignItems: 'center', gap: 2, paddingVertical: spacing.lg }}>
                <AppText variant="display" tone="accent">{snap.score > 0 ? snap.score : '–'}</AppText>
                <AppText variant="muted" tone="muted">{snap.scoreLabel || 'Wellness score'}</AppText>
              </Card>
            ) : null}

            <View style={styles.grid}>
              <Metric icon="water-outline" label="Avg water" value={avgWater ? `${avgWater.toFixed(1)}L` : '–'} />
              <Metric icon="moon-outline" label="Avg sleep" value={avgSleep ? `${avgSleep.toFixed(1)}h` : '–'} />
              <Metric icon="restaurant-outline" label="Meals logged" value={String(meals.length)} />
              <Metric icon="calendar-outline" label="Active days" value={`${activeDays}/${WINDOW}`} />
              <Metric icon="scale-outline" label="Weight change" value={weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)}kg` : '–'} tone={weightDelta != null && weightDelta < 0 ? 'success' : 'muted'} />
              <Metric icon="flame-outline" label="Streak" value={snap ? `${snap.streakDays}d` : '–'} />
            </View>

            <Card style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
              <Ionicons name="information-circle-outline" size={16} color={t.colors.textFaint} style={{ marginTop: 2 }} />
              <AppText variant="caption" tone="faint" style={{ flex: 1 }}>
                Generated from your logged data. Your nutritionist sees the full report in the web portal.
              </AppText>
            </Card>
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function Metric({ icon, label, value, tone = 'muted' }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone?: 'muted' | 'success' }) {
  const t = useTheme();
  return (
    <Card style={{ width: '48%', gap: spacing.sm }}>
      <View style={{ width: 32, height: 32, borderRadius: radius.md, backgroundColor: t.colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={16} color={t.colors.accent} />
      </View>
      <AppText variant="title" tone={tone === 'success' ? 'success' : 'text'} style={{ fontVariant: ['tabular-nums'] }}>{value}</AppText>
      <AppText variant="caption" tone="muted">{label}</AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
});
