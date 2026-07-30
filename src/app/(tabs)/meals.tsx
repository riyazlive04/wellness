import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type ClientMealLog } from '@/lib/clients-api';
import { brand, radius, spacing, status } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;
type RangeKey = 1 | 7 | 30;

/** Soft brand tint — a low-alpha wash of a brand/teal hue for chips & tracks. */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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
  const remaining = target != null ? Math.max(0, target - todayKcal) : null;

  return (
    <Screen>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
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

        {/* Hero — calorie ring + intake summary */}
        <Card style={{ gap: spacing.lg, overflow: 'hidden', borderRadius: radius['2xl'], padding: spacing.xl }}>
          <LinearGradient
            colors={[tint(brand.cyan, t.dark ? 0.1 : 0.08), 'transparent']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <CalorieRing kcal={todayKcal} target={target} pct={pctTarget} over={overTarget} />
            <View style={{ flex: 1, gap: 6 }}>
              <Eyebrow>Today</Eyebrow>
              <AppText variant="body" tone="muted">
                {todayMeals.length} {todayMeals.length === 1 ? 'meal' : 'meals'} logged
              </AppText>
              {remaining != null ? (
                <View style={[styles.pillStat, { backgroundColor: tint(overTarget ? brand.blue : brand.teal, 0.14) }]}>
                  <Ionicons
                    name={overTarget ? 'flame-outline' : 'leaf-outline'}
                    size={14}
                    color={overTarget ? t.colors.warning : t.colors.primary}
                  />
                  <AppText variant="caption" tone={overTarget ? 'warning' : 'accent'}>
                    {overTarget ? `${todayKcal - target!} kcal over` : `${remaining} kcal left`}
                  </AppText>
                </View>
              ) : (
                <AppText variant="caption" tone="faint">
                  Set a target to track progress
                </AppText>
              )}
            </View>
          </View>

          {/* Macros — honest empty state (no per-macro data is logged) */}
          <View
            style={[
              styles.macroHint,
              { backgroundColor: tint(brand.teal, t.dark ? 0.1 : 0.07), borderColor: t.colors.border },
            ]}>
            <View style={[styles.macroHintChip, { backgroundColor: tint(brand.cyan, t.dark ? 0.2 : 0.13) }]}>
              <Ionicons name="pie-chart-outline" size={16} color={t.colors.accent} />
            </View>
            <AppText variant="caption" tone="muted" style={{ flex: 1 }}>
              Log meals with nutrition info to see your protein, carbs and fat breakdown.
            </AppText>
          </View>

          {/* Primary + secondary log actions */}
          <View style={{ gap: spacing.sm }}>
            <GradientButton label="Log a meal" onPress={() => router.push('/plate-vision')} />
            <GhostButton label="Scan packaged food" onPress={() => router.push('/(tabs)/more/barcode')} />
          </View>
        </Card>

        {/* Quick access */}
        <View style={styles.tileRow}>
          <LogTile icon="camera-outline" title="Snap" sub="Plate Vision AI" color={brand.teal} onPress={() => router.push('/plate-vision')} />
          <LogTile icon="scan-outline" title="Scan" sub="Packaged food" color={brand.cyan} onPress={() => router.push('/(tabs)/more/barcode')} />
          <LogTile icon="sparkles-outline" title="Plan" sub="Prescribed meals" color={status.warning} onPress={() => router.push('/(tabs)/more/meal-plan')} />
        </View>

        {/* Recent history + range toggle */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow>Recent</Eyebrow>
            <View style={[styles.toggle, { borderColor: t.colors.border, backgroundColor: t.colors.surface }]}>
              {([1, 7, 30] as RangeKey[]).map((r) => {
                const active = days === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setDays(r)}
                    style={[styles.toggleBtn, active && { backgroundColor: tint(brand.teal, t.dark ? 0.22 : 0.14) }]}>
                    <AppText variant="caption" tone={active ? 'accent' : 'faint'}>
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
              <View style={[styles.emptyChip, { backgroundColor: tint(brand.teal, 0.12) }]}>
                <Ionicons name="restaurant-outline" size={22} color={t.colors.primary} />
              </View>
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
                <Card style={{ padding: 0, overflow: 'hidden' }}>
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
                      <View style={[styles.mealIcon, { backgroundColor: tint(mealTint(m.meal_type), t.dark ? 0.2 : 0.13) }]}>
                        <Ionicons name={mealIcon(m.meal_type)} size={18} color={mealTint(m.meal_type)} />
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
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={[styles.mealIcon, { backgroundColor: tint(brand.cyan, t.dark ? 0.2 : 0.13) }]}>
                <Ionicons name="sparkles-outline" size={18} color={t.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
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

/** Circular gradient calorie ring — kcal consumed of the daily target. */
function CalorieRing({
  kcal,
  target,
  pct,
  over,
  size = 116,
  stroke = 10,
}: {
  kcal: number;
  target: number | null;
  pct: number;
  over: boolean;
  size?: number;
  stroke?: number;
}) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(100, pct)) / 100;
  const offset = c * (1 - frac);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <SvgGradient id="kcalGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.gradient[0]} />
            <Stop offset="0.5" stopColor={t.gradient[1]} />
            <Stop offset="1" stopColor={t.gradient[2]} />
          </SvgGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tint(over ? status.warning : brand.cyan, t.dark ? 0.22 : 0.18)}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? t.colors.warning : 'url(#kcalGrad)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          fill="none"
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <AppText variant="title" style={{ fontVariant: ['tabular-nums'] }}>
          {kcal}
        </AppText>
        <AppText variant="caption" tone="faint">
          of {target ?? '–'} kcal
        </AppText>
      </View>
    </View>
  );
}

function LogTile({
  icon,
  title,
  sub,
  color,
  onPress,
}: {
  icon: IoniconName;
  title: string;
  sub: string;
  color: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {({ pressed }) => (
        <Card style={{ gap: 8, paddingVertical: spacing.md, opacity: pressed ? 0.85 : 1 }}>
          <View style={[styles.tileChip, { backgroundColor: tint(color, t.dark ? 0.2 : 0.12) }]}>
            <Ionicons name={icon} size={18} color={color} />
          </View>
          <AppText variant="heading">{title}</AppText>
          <AppText variant="caption" tone="faint" numberOfLines={1}>
            {sub}
          </AppText>
        </Card>
      )}
    </Pressable>
  );
}

/** Meal-type accent hue drawn from the teal/cyan/aqua brand family. */
function mealTint(type: string | null | undefined): string {
  switch ((type ?? '').toLowerCase()) {
    case 'breakfast':
      return status.warning; // amber — morning warmth
    case 'lunch':
      return brand.teal;
    case 'dinner':
      return brand.blue;
    case 'snack':
      return status.success; // emerald
    default:
      return brand.cyan;
  }
}

function mealIcon(type: string | null | undefined): IoniconName {
  switch ((type ?? '').toLowerCase()) {
    case 'breakfast':
      return 'cafe-outline';
    case 'lunch':
      return 'restaurant-outline';
    case 'dinner':
      return 'moon-outline';
    case 'snack':
      return 'nutrition-outline';
    default:
      return 'fast-food-outline';
  }
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
  tileChip: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  macroHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  macroHintChip: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChip: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
