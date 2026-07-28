import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ScoreRing } from '@/components/score-ring';
import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type WellnessSnapshot } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const MOOD_WORDS = ['', 'Low', 'Meh', 'Okay', 'Good', 'Great'];

export default function Today() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();

  const homeQ = useQuery({ queryKey: ['me', 'home'], queryFn: () => clientsApi.home(), retry: 1 });
  const mealsQ = useQuery({ queryKey: ['me', 'meals', 14], queryFn: () => clientsApi.myMeals(14), retry: 1 });

  const [moodOpen, setMoodOpen] = useState(false);

  const habitMut = useMutation({
    mutationFn: (patch: Parameters<typeof clientsApi.logHabit>[0]) => clientsApi.logHabit(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  const moodMut = useMutation({
    mutationFn: (mood: number) => clientsApi.logMood({ mood }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setMoodOpen(false);
    },
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
  const todayMealCount = meals.filter((m) => m.logged_at.slice(0, 10) === todayStr).length;
  const moodDays = home?.mood ?? [];
  const todayMood = moodDays[0]?.date === todayStr ? moodDays[0] : null;

  const latestNudge = (home?.messages ?? [])
    .filter((m) => m.sender_type !== 'client' && (m.content ?? '').trim().length > 0)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];

  const firstName = profile?.name?.split(' ')[0] ?? '';
  const scoreVal = snap && snap.score > 0 ? snap.score : null;

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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
        }>
        {/* ── Hero: greeting + score ring ─────────────────────────── */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <LinearGradient
            colors={[t.gradient[0] + '26', t.gradient[2] + '14', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
                {greeting(now)}
              </AppText>
              <AppText variant="title">Hi{firstName ? `, ${firstName}` : ''}.</AppText>
              <AppText variant="muted" tone="muted">
                {snap?.scoreLabel ?? 'Your wellness at a glance'}
              </AppText>
              {snap && snap.streakDays > 0 ? (
                <View style={styles.streak}>
                  <Ionicons name="flame" size={13} color={t.colors.warning} />
                  <AppText variant="caption" tone="muted">
                    {snap.streakDays}-day streak
                  </AppText>
                </View>
              ) : null}
            </View>
            <ScoreRing score={scoreVal} label="score" />
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

        {/* ── Habit tiles ─────────────────────────────────────────── */}
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Today</Eyebrow>
          <View style={styles.grid}>
            <HabitTile
              icon="water-outline"
              tint="#3B82F6"
              label="Water"
              value={snap?.waterMl ? `${(snap.waterMl / 1000).toFixed(1)}L` : '–'}
              pct={snap ? snap.waterMl / (snap.waterTargetMl || 2000) : 0}
              hint="+250ml"
              onPress={() => habitMut.mutate({ water_ml: (snap?.waterMl ?? 0) + 250 })}
              busy={habitMut.isPending}
            />
            <HabitTile
              icon="moon-outline"
              tint="#0E9AA8"
              label="Sleep"
              value={snap?.sleepHours != null ? `${snap.sleepHours}h` : '–'}
              pct={snap?.sleepHours != null ? snap.sleepHours / 8 : 0}
              onPress={() => router.push('/(tabs)/progress')}
            />
            <HabitTile
              icon="walk-outline"
              tint="#10B981"
              label="Move"
              value={snap?.exerciseMinutes ? `${snap.exerciseMinutes}m` : '–'}
              pct={snap ? snap.exerciseMinutes / 30 : 0}
              onPress={() => router.push('/(tabs)/progress')}
            />
            <HabitTile
              icon="happy-outline"
              tint="#F59E0B"
              label="Mood"
              value={todayMood?.mood ? MOOD_WORDS[todayMood.mood] : 'Tap'}
              pct={todayMood?.mood ? todayMood.mood / 5 : 0}
              onPress={() => setMoodOpen((o) => !o)}
            />
          </View>

          {moodOpen ? (
            <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              {[1, 2, 3, 4, 5].map((m) => (
                <Pressable
                  key={m}
                  onPress={() => moodMut.mutate(m)}
                  disabled={moodMut.isPending}
                  style={{ alignItems: 'center', gap: 4, padding: spacing.xs }}>
                  <AppText style={{ fontSize: 26 }}>{['😔', '😕', '🙂', '😊', '🤩'][m - 1]}</AppText>
                  <AppText variant="caption" tone="muted">
                    {MOOD_WORDS[m]}
                  </AppText>
                </Pressable>
              ))}
            </Card>
          ) : null}
        </View>

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
            <View style={[styles.progIcon, { backgroundColor: t.colors.surfaceStrong }]}>
              <Ionicons name="clipboard-outline" size={20} color={t.colors.accent} />
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
            <QuickAction icon="camera-outline" label="Plate Vision" onPress={() => router.push('/plate-vision')} />
            <QuickAction icon="pulse-outline" label="Progress" onPress={() => router.push('/(tabs)/progress')} />
            <QuickAction icon="sparkles-outline" label="Assistant" onPress={() => router.push('/(tabs)/assistant')} />
            <QuickAction icon="grid-outline" label="More" onPress={() => router.push('/(tabs)/more')} />
          </View>
        </View>
      </ScreenScroll>
    </Screen>
  );
}

function HabitTile({
  icon,
  tint,
  label,
  value,
  pct,
  hint,
  onPress,
  busy,
}: {
  icon: IoniconName;
  tint: string;
  label: string;
  value: string;
  pct: number;
  hint?: string;
  onPress?: () => void;
  busy?: boolean;
}) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(1, pct || 0));
  return (
    <Pressable onPress={onPress} style={{ width: '48%' }}>
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={[styles.habitIcon, { backgroundColor: tint + '26' }]}>
            <Ionicons name={icon} size={16} color={tint} />
          </View>
          {busy ? (
            <ActivityIndicator size="small" color={t.colors.textFaint} />
          ) : hint ? (
            <AppText variant="caption" tone="faint">
              {hint}
            </AppText>
          ) : null}
        </View>
        <View>
          <AppText variant="heading">{value}</AppText>
          <AppText variant="caption" tone="muted">
            {label}
          </AppText>
        </View>
        <View style={[styles.track, { backgroundColor: t.colors.surfaceStrong }]}>
          <View style={{ width: `${clamped * 100}%`, height: '100%', backgroundColor: tint, borderRadius: 999 }} />
        </View>
      </Card>
    </Pressable>
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
        <View style={[styles.track, { backgroundColor: t.colors.surfaceStrong, height: 8 }]}>
          <View
            style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: t.colors.accent, borderRadius: 999 }}
          />
        </View>
      ) : null}
    </Card>
  );
}

function QuickAction({ icon, label, onPress }: { icon: IoniconName; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ width: '48%' }}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name={icon} size={20} color={t.colors.accent} />
        <AppText variant="body">{label}</AppText>
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
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 15,
    borderRadius: radius.pill,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  habitIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
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
