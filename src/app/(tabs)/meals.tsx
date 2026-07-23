import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type ClientMealLog } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;
type RangeKey = 1 | 7 | 30;

export default function Meals() {
  const t = useTheme();
  const router = useRouter();
  const [days, setDays] = useState<RangeKey>(7);

  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const mealsQ = useQuery({
    queryKey: ['me', 'meals', days],
    queryFn: () => clientsApi.myMeals(days),
    staleTime: 30_000,
    retry: 1,
  });
  const programQ = useQuery({ queryKey: ['me', 'program'], queryFn: () => clientsApi.myProgram(), retry: 1 });

  const meals = mealsQ.data ?? [];
  const todayMeals = meals.filter((m) => isToday(m.logged_at));
  const todayKcal = todayMeals.reduce((s, m) => s + (m.kcal ?? 0), 0);
  const target = profileQ.data?.target_kcal ?? null;
  const program = programQ.data ?? undefined;

  const grouped = meals.reduce<Record<string, ClientMealLog[]>>((acc, m) => {
    const d = m.logged_at.slice(0, 10);
    (acc[d] ??= []).push(m);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort().reverse();

  const refreshing = mealsQ.isRefetching || profileQ.isRefetching;
  const onRefresh = () => {
    mealsQ.refetch();
    profileQ.refetch();
    programQ.refetch();
  };

  const pctTarget = target ? Math.min(100, (todayKcal / target) * 100) : 0;
  const overTarget = target != null && todayKcal > target;

  return (
    <Screen>
      <ScreenScroll
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
        }>
        {/* Header */}
        <View style={{ gap: 4 }}>
          <Eyebrow>Nutrition · Meals</Eyebrow>
          <AppText variant="title">Today on your plate</AppText>
          <AppText variant="muted" tone="muted">
            {"What you ate, and where you are versus your target."}
          </AppText>
        </View>

        {/* Quick log */}
        <View style={styles.tileRow}>
          <LogTile icon="camera-outline" title="Snap" sub="Plate Vision AI" onPress={() => router.push('/plate-vision')} />
          <LogTile icon="scan-outline" title="Scan" sub="Packaged food" onPress={() => router.push('/(tabs)/more/barcode')} />
          <LogTile icon="sparkles-outline" title="Plan" sub="Prescribed meals" onPress={() => router.push('/(tabs)/more/meal-plan')} />
        </View>

        {/* Today summary */}
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <Eyebrow>Today</Eyebrow>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 4 }}>
                <AppText variant="display" style={{ fontVariant: ['tabular-nums'] }}>
                  {todayKcal}
                </AppText>
                <AppText variant="muted" tone="muted" style={{ marginBottom: 6 }}>
                  / {target ?? '–'} kcal
                </AppText>
              </View>
            </View>
            <AppText variant="muted" tone="muted">
              {todayMeals.length} {todayMeals.length === 1 ? 'meal' : 'meals'}
            </AppText>
          </View>
          {target ? (
            <View style={[styles.track, { backgroundColor: t.colors.surfaceStrong }]}>
              <View
                style={{
                  width: `${pctTarget}%`,
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: overTarget ? t.colors.danger : t.colors.accent,
                }}
              />
            </View>
          ) : null}
        </Card>

        {/* Recent history + range toggle */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow>Recent</Eyebrow>
            <View style={[styles.toggle, { borderColor: t.colors.border }]}>
              {([1, 7, 30] as RangeKey[]).map((r) => {
                const active = days === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setDays(r)}
                    style={[styles.toggleBtn, active && { backgroundColor: t.colors.surfaceStrong }]}>
                    <AppText variant="caption" tone={active ? 'text' : 'faint'}>
                      {r === 1 ? 'Today' : r === 7 ? '7 days' : '30 days'}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {mealsQ.isLoading ? (
            <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
              <ActivityIndicator color={t.colors.accent} />
            </Card>
          ) : meals.length === 0 ? (
            <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
              <Ionicons name="restaurant-outline" size={24} color={t.colors.textFaint} />
              <AppText variant="muted" tone="muted">
                Nothing logged in this window yet.
              </AppText>
            </Card>
          ) : (
            sortedDates.map((date) => (
              <View key={date} style={{ gap: spacing.xs }}>
                <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', marginTop: spacing.xs }}>
                  {formatRelativeDay(date)}
                </AppText>
                <Card style={{ padding: 0 }}>
                  {grouped[date].map((m, i) => (
                    <View
                      key={m.id}
                      style={[
                        styles.mealRow,
                        {
                          borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                          borderTopColor: t.colors.border,
                        },
                      ]}>
                      <View style={[styles.mealIcon, { backgroundColor: t.colors.surfaceStrong }]}>
                        <AppText variant="label" tone="muted">
                          {(m.meal_type?.[0] ?? '·').toUpperCase()}
                        </AppText>
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="body">{m.meal_name ?? m.meal_type}</AppText>
                        <AppText variant="caption" tone="muted">
                          {new Date(m.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {m.notes ? ` · ${m.notes.slice(0, 32)}` : ''}
                        </AppText>
                      </View>
                      <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
                        {m.kcal ?? '–'}
                        <AppText variant="caption" tone="faint">
                          {' '}kcal
                        </AppText>
                      </AppText>
                    </View>
                  ))}
                </Card>
              </View>
            ))
          )}
        </View>

        {/* Program hint */}
        {program ? (
          <Pressable onPress={() => router.push('/(tabs)/more')}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Eyebrow>Your plan</Eyebrow>
                <AppText variant="body" style={{ marginTop: 4 }}>
                  Week {program.week_number} · {program.total_kcal ?? '–'} kcal/day
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
            </Card>
          </Pressable>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

function LogTile({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: IoniconName;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <Card style={{ gap: 6, paddingVertical: spacing.md }}>
        <Ionicons name={icon} size={20} color={t.colors.accent} />
        <AppText variant="heading">{title}</AppText>
        <AppText variant="caption" tone="faint" numberOfLines={1}>
          {sub}
        </AppText>
      </Card>
    </Pressable>
  );
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function formatRelativeDay(yyyymmdd: string): string {
  const d = new Date(yyyymmdd);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  tileRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  toggle: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  mealIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
