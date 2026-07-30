import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type ClientHomeData, type ClientMealLog, type WellnessSnapshot } from '@/lib/clients-api';
import { optimistic } from '@/lib/optimistic';
import { brand, radius, spacing, status } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const MOOD_WORDS = ['', 'Low', 'Meh', 'Okay', 'Good', 'Great'];
const MOOD_EMOJI = ['😔', '😕', '🙂', '😊', '🤩'];

// Per-habit accent colours give each tile its own soft warmth (matching the
// web KPI cards) instead of a single flat teal. Water=cyan, Sleep=violet,
// Move=emerald.
const HABIT = {
  water: '#22A3C3',
  sleep: '#7C6BD6',
  move: '#3FAE88',
} as const;

// Soft pastel fill alphas (hex suffix): lighter in light mode, a touch
// stronger in dark so tints read on the ink canvas.
const fill = (color: string, dark: boolean) => color + (dark ? '2E' : '1A'); // ~0.18 / ~0.10
const chipBg = (color: string) => color + '33'; // ~0.20

// Standard daily meal slots. Logged/▢ state is derived purely from the
// meals we already fetch — no new data source.
const MEAL_SLOTS: { key: string; label: string; icon: IoniconName; tint: string }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: 'cafe-outline', tint: status.warning },
  { key: 'lunch', label: 'Lunch', icon: 'restaurant-outline', tint: brand.teal },
  { key: 'dinner', label: 'Dinner', icon: 'moon-outline', tint: status.info },
  { key: 'snack', label: 'Snack', icon: 'nutrition-outline', tint: status.success },
];

export default function Today() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();

  const homeQ = useQuery({ queryKey: ['me', 'home'], queryFn: () => clientsApi.home(), retry: 1 });
  const mealsQ = useQuery({ queryKey: ['me', 'meals', 14], queryFn: () => clientsApi.myMeals(14), retry: 1 });

  const todayIso = new Date().toISOString().slice(0, 10);

  // Optimistic: the water/steps/sleep tile updates the instant you tap, then the
  // write runs in the background. No more waiting on the round-trip to see it.
  const habitMut = useMutation({
    mutationFn: (patch: Parameters<typeof clientsApi.logHabit>[0]) => clientsApi.logHabit(patch),
    ...optimistic<ClientHomeData, Parameters<typeof clientsApi.logHabit>[0]>(
      qc,
      ['me', 'home'],
      (old, patch) => {
        if (!old.snapshot) return old;
        const snapshot = { ...old.snapshot };
        if (patch.water_ml != null) snapshot.waterMl = patch.water_ml;
        if (patch.exercise_minutes != null) snapshot.exerciseMinutes = patch.exercise_minutes;
        if (patch.sleep_hours != null) snapshot.sleepHours = patch.sleep_hours;
        return { ...old, snapshot };
      },
    ),
  });
  const moodMut = useMutation({
    mutationFn: (mood: number) => clientsApi.logMood({ mood }),
    ...optimistic<ClientHomeData, number>(qc, ['me', 'home'], (old, mood) => {
      const rest = (old.mood ?? []).filter((m) => m.date !== todayIso);
      const today = { date: todayIso, mood, energy: null, notes: null };
      return { ...old, mood: [today, ...rest] };
    }),
  });

  // Live clock for the greeting.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const home = homeQ.data;
  const profile = home?.profile ?? undefined;
  const snap = home?.snapshot ?? undefined;
  const meals = mealsQ.data ?? [];
  const program = home?.program ?? undefined;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysMeals = meals.filter((m) => m.logged_at.slice(0, 10) === todayStr);
  const todayMealCount = todaysMeals.length;
  const moodDays = home?.mood ?? [];
  const todayMood = moodDays[0]?.date === todayStr ? moodDays[0] : null;

  const latestNudge = (home?.messages ?? [])
    .filter((m) => m.sender_type !== 'client' && (m.content ?? '').trim().length > 0)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];

  const firstName = profile?.name?.split(' ')[0] ?? '';
  const scoreVal = snap && snap.score > 0 ? snap.score : null;
  const scorePct = scoreVal != null ? scoreVal / 100 : 0;

  const refreshing = homeQ.isRefetching || mealsQ.isRefetching;
  const onRefresh = () => {
    homeQ.refetch();
    mealsQ.refetch();
  };

  if (homeQ.isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      </Screen>
    );
  }

  const failed = homeQ.isError && !home;

  return (
    <Screen>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
        }>
        {/* ── Friendly greeting header ─────────────────────────────── */}
        <View style={{ gap: 2, marginTop: spacing.xs }}>
          <Eyebrow>{greeting(now)}</Eyebrow>
          <AppText variant="title">Hi{firstName ? `, ${firstName}` : ''} 👋</AppText>
        </View>

        {/* ── Gradient "today's focus" hero ────────────────────────── */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <LinearGradient
            colors={t.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: spacing.xl, gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 3 }}>
                <AppText
                  variant="label"
                  tone="onBrand"
                  style={{ opacity: 0.85, textTransform: 'uppercase', letterSpacing: 1.4 }}>
                  Today&apos;s focus
                </AppText>
                <AppText variant="heading" tone="onBrand">
                  {snap?.scoreLabel ?? 'Your wellness at a glance'}
                </AppText>
              </View>
              {snap && snap.streakDays > 0 ? (
                <View style={styles.heroStreak}>
                  <Ionicons name="flame" size={13} color={t.colors.onBrand} />
                  <AppText variant="caption" tone="onBrand">
                    {snap.streakDays}-day streak
                  </AppText>
                </View>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
              <AppText variant="display" tone="onBrand" style={{ fontVariant: ['tabular-nums'] }}>
                {scoreVal ?? '–'}
              </AppText>
              <AppText variant="muted" tone="onBrand" style={{ opacity: 0.85, marginBottom: 7 }}>
                / 100 wellness score
              </AppText>
            </View>

            <View style={styles.heroTrack}>
              <View
                style={{
                  width: `${Math.max(0, Math.min(1, scorePct)) * 100}%`,
                  height: '100%',
                  backgroundColor: t.colors.onBrand,
                  borderRadius: 999,
                }}
              />
            </View>
          </LinearGradient>
        </Card>

        {failed ? (
          <Card style={{ gap: spacing.xs }}>
            <AppText variant="heading">{"Can't reach the server"}</AppText>
            <AppText variant="muted" tone="muted">
              {"Check your connection and pull to refresh. If this persists, confirm the app's API URL."}
            </AppText>
          </Card>
        ) : null}

        {/* ── Log meal CTA ────────────────────────────────────────── */}
        <Pressable onPress={() => router.push('/plate-vision')}>
          <LinearGradient
            colors={t.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cta}>
            <Ionicons name="add-circle-outline" size={20} color={t.colors.onBrand} />
            <AppText variant="heading" tone="onBrand">
              Log a meal
            </AppText>
          </LinearGradient>
        </Pressable>

        {/* ── Habit rings ─────────────────────────────────────────── */}
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Today&apos;s habits</Eyebrow>
          <View style={styles.ringRow}>
            <HabitRing
              icon="water-outline"
              tint={HABIT.water}
              label="Water"
              value={snap?.waterMl ? `${(snap.waterMl / 1000).toFixed(1)}L` : '0L'}
              missing={!snap?.waterMl}
              pct={snap ? snap.waterMl / (snap.waterTargetMl || 2000) : 0}
              onPress={() => habitMut.mutate({ water_ml: (snap?.waterMl ?? 0) + 250 })}
            />
            <HabitRing
              icon="moon-outline"
              tint={HABIT.sleep}
              label="Sleep"
              value={snap?.sleepHours != null ? `${snap.sleepHours}h` : '0h'}
              missing={snap?.sleepHours == null}
              pct={snap?.sleepHours != null ? snap.sleepHours / 8 : 0}
              onPress={() => router.push('/(tabs)/progress')}
            />
            <HabitRing
              icon="walk-outline"
              tint={HABIT.move}
              label="Move"
              value={snap?.exerciseMinutes ? `${snap.exerciseMinutes}m` : '0m'}
              missing={!snap?.exerciseMinutes}
              pct={snap ? snap.exerciseMinutes / 30 : 0}
              onPress={() => router.push('/(tabs)/progress')}
            />
          </View>
        </View>

        {/* ── Mood check-in ───────────────────────────────────────── */}
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow>Mood check-in</Eyebrow>
            <AppText variant="caption" tone="muted">
              {todayMood?.mood ? `Feeling ${MOOD_WORDS[todayMood.mood]}` : 'How are you today?'}
            </AppText>
          </View>
          <View style={styles.moodRow}>
            {[1, 2, 3, 4, 5].map((m) => {
              const active = todayMood?.mood === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => moodMut.mutate(m)}
                  style={[
                    styles.moodChip,
                    {
                      backgroundColor: active
                        ? t.colors.primary + '1F'
                        : t.colors.primary + (t.dark ? '14' : '0D'),
                      borderColor: active ? t.colors.primary : t.colors.primary + '1A',
                    },
                  ]}>
                  <AppText style={{ fontSize: 24 }}>{MOOD_EMOJI[m - 1]}</AppText>
                  <AppText variant="caption" tone={active ? 'accent' : 'muted'}>
                    {MOOD_WORDS[m]}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* ── Today's meal plan ───────────────────────────────────── */}
        <MealPlanCard
          todaysMeals={todaysMeals}
          mealCount={todayMealCount}
          onLog={() => router.push('/plate-vision')}
        />

        {/* ── Nutrition summary ───────────────────────────────────── */}
        <NutritionCard snap={snap} mealCount={todayMealCount} />

        {/* ── Nutritionist nudge ──────────────────────────────────── */}
        {latestNudge ? (
          <Pressable onPress={() => router.push('/(tabs)/chat')}>
            <Card style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="chatbubble-ellipses" size={16} color={t.colors.accent} />
                <Eyebrow>From your nutritionist</Eyebrow>
              </View>
              <AppText variant="body" numberOfLines={3}>
                {latestNudge.content}
              </AppText>
            </Card>
          </Pressable>
        ) : null}

        {/* ── Active program ──────────────────────────────────────── */}
        {program ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={[styles.progIcon, { backgroundColor: t.colors.primary + '1A' }]}>
              <Ionicons name="clipboard-outline" size={20} color={t.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="heading">Week {program.week_number}</AppText>
              <AppText variant="muted" tone="muted">
                {program.total_kcal ? `${program.total_kcal} kcal target · ` : ''}
                {program.status ?? 'active'}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
          </Card>
        ) : null}

        {/* ── Quick actions ───────────────────────────────────────── */}
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Quick actions</Eyebrow>
          <View style={styles.grid}>
            <QuickAction icon="camera-outline" label="Plate Vision" tint={HABIT.water} onPress={() => router.push('/plate-vision')} />
            <QuickAction icon="pulse-outline" label="Progress" tint={HABIT.move} onPress={() => router.push('/(tabs)/progress')} />
            <QuickAction icon="sparkles-outline" label="Assistant" tint={HABIT.sleep} onPress={() => router.push('/(tabs)/assistant')} />
            <QuickAction icon="grid-outline" label="More" tint={brand.teal} onPress={() => router.push('/(tabs)/more')} />
          </View>
        </View>
      </ScreenScroll>
    </Screen>
  );
}

/** Compact circular habit indicator inside a soft tinted tile. */
function HabitRing({
  icon,
  tint,
  label,
  value,
  pct,
  missing,
  onPress,
}: {
  icon: IoniconName;
  tint: string;
  label: string;
  value: string;
  pct: number;
  missing?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  const size = 60;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct || 0));
  // When there's no value yet, still draw a faint intentional-looking sliver
  // so the ring never reads as broken/empty.
  const shown = missing ? 0.06 : clamped;
  const offset = c * (1 - shown);
  const arcColor = missing ? tint + '55' : tint;
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <View style={[styles.ringTile, { backgroundColor: fill(tint, t.dark) }]}>
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
            {/* Always-visible coloured track. */}
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={tint + '2E'} strokeWidth={stroke} fill="none" />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={arcColor}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={offset}
              fill="none"
            />
          </Svg>
          {/* Colour-chip behind the icon for a designed, filled look. */}
          <View style={[styles.ringChip, { backgroundColor: chipBg(tint) }]}>
            <Ionicons name={icon} size={18} color={tint} />
          </View>
        </View>
        <AppText variant="heading" style={{ marginTop: spacing.sm, color: t.colors.text }}>
          {value}
        </AppText>
        <AppText variant="caption" tone="muted">
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

function MealPlanCard({
  todaysMeals,
  mealCount,
  onLog,
}: {
  todaysMeals: ClientMealLog[];
  mealCount: number;
  onLog: () => void;
}) {
  const t = useTheme();
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Eyebrow>Today&apos;s meal plan</Eyebrow>
        <AppText variant="caption" tone="muted">
          {mealCount} logged
        </AppText>
      </View>
      <View style={{ gap: spacing.xs }}>
        {MEAL_SLOTS.map((slot) => {
          const logged = todaysMeals.find((m) => (m.meal_type ?? '').toLowerCase().includes(slot.key));
          const subtitle = logged
            ? [logged.meal_name, logged.kcal != null ? `${logged.kcal} kcal` : null].filter(Boolean).join(' · ') ||
              'Logged'
            : 'Not logged yet';
          return (
            <Pressable key={slot.key} onPress={onLog} style={styles.mealRow}>
              <View style={[styles.mealChip, { backgroundColor: slot.tint + (t.dark ? '26' : '1A') }]}>
                <Ionicons name={slot.icon} size={18} color={slot.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="body">{slot.label}</AppText>
                <AppText variant="caption" tone={logged ? 'muted' : 'faint'} numberOfLines={1}>
                  {subtitle}
                </AppText>
              </View>
              <Ionicons
                name={logged ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={logged ? t.colors.success : t.colors.textFaint}
              />
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function NutritionCard({ snap, mealCount }: { snap?: WellnessSnapshot; mealCount: number }) {
  const t = useTheme();
  const kcal = snap?.todayKcal ?? 0;
  const target = snap?.targetKcal ?? null;
  const pct = target ? Math.max(0, Math.min(1, kcal / target)) : 0;
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Eyebrow>{"Today's nutrition"}</Eyebrow>
        <AppText variant="caption" tone="muted">
          {mealCount} {mealCount === 1 ? 'meal' : 'meals'} logged
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <AppText variant="display" style={{ fontVariant: ['tabular-nums'] }}>
          {kcal}
        </AppText>
        <AppText variant="muted" tone="muted" style={{ marginBottom: 6 }}>
          {target ? `/ ${target} kcal` : 'kcal today'}
        </AppText>
      </View>
      {target ? (
        <View style={[styles.track, { backgroundColor: t.colors.primary + (t.dark ? '24' : '1A'), height: 8 }]}>
          <View
            style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: t.colors.primary, borderRadius: 999 }}
          />
        </View>
      ) : null}
    </Card>
  );
}

function QuickAction({
  icon,
  label,
  tint,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  tint: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ width: '48%' }}>
      <Card
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: fill(tint, t.dark),
          borderColor: tint + (t.dark ? '33' : '24'),
        }}>
        <View style={[styles.qaChip, { backgroundColor: chipBg(tint) }]}>
          <Ionicons name={icon} size={18} color={tint} />
        </View>
        <AppText variant="body" style={{ color: t.colors.text }}>
          {label}
        </AppText>
      </Card>
    </Pressable>
  );
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Wind down';
}

const styles = StyleSheet.create({
  heroStreak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  heroTrack: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 15,
    borderRadius: radius.pill,
  },
  ringRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  ringTile: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.xl,
  },
  ringChip: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  moodChip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  mealChip: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  qaChip: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
