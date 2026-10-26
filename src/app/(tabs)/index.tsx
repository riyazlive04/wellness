import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { GardenPlant } from '@/components/garden-plant';
import { AppText, Card, Eyebrow, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type ClientHomeData, type ClientMealLog } from '@/lib/clients-api';
import { optimistic } from '@/lib/optimistic';
import { useMealSlots } from '@/lib/meal-slots';
import { remindersApi } from '@/lib/reminders';
import { brand, radius, spacing, status, tintFill } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const MOOD_WORDS = ['', 'Low', 'Meh', 'Okay', 'Good', 'Great'];
const MOOD_EMOJI = ['😔', '😕', '🙂', '😊', '🤩'];

/** NUSI green, the same header as the nutritionist app's home. */
const HERO = ['#1a5c2d', '#2f8f46', '#5aa83f'] as const;

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
const fill = (color: string, dark: boolean) => tintFill(color, dark); // opaque tile fill
const chipBg = (color: string) => color + '33'; // ~0.20

// Icon + tint per meal time. The rows themselves are the practice's meal
// times (useMealSlots); logged/▢ state comes from the meals we already fetch.
const SLOT_STYLE: Partial<Record<string, { icon: IoniconName; tint: string }>> = {
  cleansing_water: { icon: 'water-outline', tint: brand.blue },
  early_morning: { icon: 'sunny-outline', tint: status.warning },
  breakfast: { icon: 'cafe-outline', tint: status.warning },
  mid_breakfast: { icon: 'nutrition-outline', tint: status.success },
  mid_morning: { icon: 'nutrition-outline', tint: status.success },
  lunch: { icon: 'restaurant-outline', tint: brand.teal },
  evening_snack: { icon: 'nutrition-outline', tint: status.success },
  evening_snack_1: { icon: 'nutrition-outline', tint: status.success },
  evening_snack_2: { icon: 'nutrition-outline', tint: status.success },
  dinner: { icon: 'moon-outline', tint: status.info },
};

export default function Today() {
  const { t: tr } = useTranslation('clientHome');
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();

  const insets = useSafeAreaInsets();
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(t.dark ? 'light' : 'dark');
    }, [t.dark]),
  );

  const homeQ = useQuery({ queryKey: ['me', 'home'], queryFn: () => clientsApi.home(), retry: 1 });
  const mealsQ = useQuery({ queryKey: ['me', 'meals', 14], queryFn: () => clientsApi.myMeals(14), retry: 1 });
  const remindersQ = useQuery({ queryKey: ['me', 'reminders'], queryFn: () => remindersApi.get(), retry: 1, enabled: Platform.OS !== 'web' });

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
  const garden = snap?.garden;
  const soilPct = garden ? Math.max(0, Math.min(1, garden.growthPct)) : 0;

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

  const kcal = snap?.todayKcal ?? 0;
  const target = snap?.targetKcal ?? null;
  const kcalPct = target ? Math.max(0, Math.min(1, kcal / target)) : 0;
  // Each macro's share of today's calories (4 / 4 / 9 kcal per gram).
  const macros = [
    { label: 'Protein', g: snap?.todayProteinG ?? 0, kcalPerG: 4, color: '#2f8f46' },
    { label: 'Carbs', g: snap?.todayCarbsG ?? 0, kcalPerG: 4, color: '#f59e0b' },
    { label: 'Fat', g: snap?.todayFatG ?? 0, kcalPerG: 9, color: '#ec4899' },
  ];
  const macroKcal = macros.reduce((sum, m) => sum + m.g * m.kcalPerG, 0);
  const hasMacros = snap?.todayProteinG != null && macroKcal > 0;
  const stageDays: Record<string, number> = { sprout: 3, growing: 7, thriving: 14 };
  const toNext = garden && stageDays[garden.stage] ? Math.max(0, stageDays[garden.stage] - (snap?.streakDays ?? 0)) : 0;
  const nextLabel: Record<string, string> = { sprout: 'Growing', growing: 'Thriving', thriving: 'full bloom' };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.canvas }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" progressViewOffset={insets.top} />
        }>
        {/* ── Green hero: greeting, streak and the garden ─────────── */}
        <LinearGradient
          colors={HERO}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
              </AppText>
              <AppText variant="title" style={{ color: '#fff', fontSize: 22 }} numberOfLines={1}>
                {greeting(now, tr)}
                {firstName ? `, ${firstName}` : ''}
              </AppText>
            </View>
            {snap && snap.streakDays > 0 ? (
              <View style={styles.heroStreak}>
                <Ionicons name="flame" size={14} color="#fcd34d" />
                <AppText variant="caption" style={{ color: '#fff', fontWeight: '700' }}>
                  {snap.streakDays === 1
                    ? tr('hero.dayOne', { count: snap.streakDays })
                    : tr('hero.dayOther', { count: snap.streakDays })}
                </AppText>
              </View>
            ) : null}
          </View>

          {/* The garden: a glowing plant that grows with the streak. */}
          <View style={styles.garden}>
            <View style={styles.gardenGlow}>
              <GardenPlant stage={garden?.stage ?? 'seed'} size={70} watered={!!garden?.wateredToday} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="label" style={styles.gardenEyebrow}>
                YOUR GARDEN
              </AppText>
              <AppText variant="heading" style={{ color: '#fff', fontWeight: '800' }}>
                {garden?.headline ?? 'Plant your first seed'}
              </AppText>
              {garden ? (
                <View style={styles.heroStageChip}>
                  <AppText variant="caption" style={{ color: '#fff', fontWeight: '700' }}>
                    {garden.stageLabel}
                    {toNext ? ` · ${toNext} ${toNext === 1 ? 'day' : 'days'} to ${nextLabel[garden.stage]}` : ''}
                  </AppText>
                </View>
              ) : null}
              <View style={{ gap: 4, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {`💧 ${tr('hero.wateredToday')}`}
                  </AppText>
                  <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {Math.round(soilPct * 100)}%
                  </AppText>
                </View>
                <View style={styles.heroTrack}>
                  <View style={{ width: `${soilPct * 100}%`, height: '100%', backgroundColor: '#bef264', borderRadius: 999 }} />
                </View>
              </View>
            </View>
          </View>
          {/* The hint only when it adds something (the chip already counts the days). */}
          {garden && !(toNext && garden.wateredToday) ? (
            <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.85)' }}>
              {garden.hint}
            </AppText>
          ) : null}
        </LinearGradient>

        <View style={styles.body}>
        {failed ? (
          <Card style={{ gap: spacing.xs }}>
            <AppText variant="heading">{tr('errors.unreachable')}</AppText>
            <AppText variant="muted" tone="muted">
              {"Check your connection and pull to refresh. If this persists, confirm the app's API URL."}
            </AppText>
          </Card>
        ) : null}

        {/* ── Today's calories, over the hero ─────────────────────── */}
        <Card style={[styles.kcalCard, { backgroundColor: t.dark ? '#141c17' : '#fff' }]}>
          <View style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={84} height={84} style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={42} cy={42} r={36} stroke={t.dark ? '#24302a' : '#eef3ef'} strokeWidth={9} fill="none" />
              <Circle
                cx={42}
                cy={42}
                r={36}
                stroke="#2f8f46"
                strokeWidth={9}
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 36}
                strokeDashoffset={2 * Math.PI * 36 * (1 - (target ? Math.max(kcalPct, kcal ? 0.03 : 0) : 0))}
                fill="none"
              />
            </Svg>
            <View style={{ position: 'absolute', alignItems: 'center' }}>
              <AppText style={{ fontSize: 17, fontWeight: '800', color: t.colors.text }}>
                {target ? Math.max(0, target - kcal) : kcal}
              </AppText>
              <AppText variant="caption" tone="faint" style={{ fontSize: 9 }}>
                {target ? 'kcal left' : 'kcal'}
              </AppText>
            </View>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <AppText variant="heading">
              {kcal.toLocaleString('en-IN')}
              {target ? ` / ${target.toLocaleString('en-IN')} kcal` : ' kcal today'}
            </AppText>
            {hasMacros ? (
              <View style={{ gap: 5 }}>
                {macros.map((m) => {
                  const share = Math.round(((m.g * m.kcalPerG) / macroKcal) * 100);
                  return (
                    <View key={m.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <AppText variant="caption" tone="muted" style={{ width: 50 }}>
                        {m.label}
                      </AppText>
                      <View style={[styles.macroTrack, { backgroundColor: t.dark ? '#24302a' : '#eef3ef' }]}>
                        <View style={{ width: `${share}%`, height: '100%', borderRadius: 999, backgroundColor: m.color }} />
                      </View>
                      <AppText variant="caption" style={{ width: 70, textAlign: 'right', color: t.colors.text, fontWeight: '600' }}>
                        {Math.round(m.g)} g · {share}%
                      </AppText>
                    </View>
                  );
                })}
              </View>
            ) : null}
            <AppText variant="caption" tone="muted">
              {todayMealCount} {todayMealCount === 1 ? 'meal' : 'meals'} logged today
            </AppText>
            <Pressable onPress={() => router.push('/plate-vision')} style={styles.logBtn}>
              <Ionicons name="camera-outline" size={16} color="#fff" />
              <AppText variant="caption" style={{ color: '#fff', fontWeight: '700' }}>
                Log a meal
              </AppText>
            </Pressable>
          </View>
        </Card>

        {/* ── Reminders invite, until they're set up ─────────────── */}
        {remindersQ.isSuccess && remindersQ.data === null ? (
          <Pressable onPress={() => router.push('/(tabs)/more/reminders')}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={[styles.remindChip, { backgroundColor: tintFill(HABIT.water, t.dark) }]}>
                <Ionicons name="alarm-outline" size={20} color={HABIT.water} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="body" style={{ fontWeight: '600' }}>Turn on meal & water reminders</AppText>
                <AppText variant="caption" tone="muted">A nudge at each meal time and a glass of water every hour</AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
            </Card>
          </Pressable>
        ) : null}

        {/* ── Habit rings ─────────────────────────────────────────── */}
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>{tr('sections.todaysHabits')}</Eyebrow>
          <View style={styles.ringRow}>
            <HabitRing
              icon="water-outline"
              tint={HABIT.water}
              label={tr('metrics.water')}
              value={snap?.waterMl ? `${(snap.waterMl / 1000).toFixed(1)}L` : '0L'}
              missing={!snap?.waterMl}
              pct={snap ? snap.waterMl / (snap.waterTargetMl || 2000) : 0}
              onPress={() => habitMut.mutate({ water_ml: Math.min(6000, (snap?.waterMl ?? 0) + 250) })}
            />
            <HabitRing
              icon="moon-outline"
              tint={HABIT.sleep}
              label={tr('metrics.sleep')}
              value={snap?.sleepHours != null ? `${snap.sleepHours}h` : '0h'}
              missing={snap?.sleepHours == null}
              pct={snap?.sleepHours != null ? snap.sleepHours / 8 : 0}
              onPress={() => router.push('/(tabs)/progress')}
            />
            <HabitRing
              icon="walk-outline"
              tint={HABIT.move}
              label={tr('metrics.move')}
              value={snap?.exerciseMinutes ? `${snap.exerciseMinutes}m` : '0m'}
              missing={!snap?.exerciseMinutes}
              pct={snap ? snap.exerciseMinutes / 30 : 0}
              onPress={() => router.push('/(tabs)/progress')}
            />
          </View>
        </View>

        {/* ── Today's meal plan ───────────────────────────────────── */}
        <MealPlanCard
          todaysMeals={todaysMeals}
          mealCount={todayMealCount}
          onLog={() => router.push('/plate-vision')}
        />

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
          <Eyebrow>{tr('sections.quickActions')}</Eyebrow>
          <View style={styles.grid}>
            <QuickAction icon="camera-outline" label="Plate Vision" tint={HABIT.water} onPress={() => router.push('/plate-vision')} />
            <QuickAction icon="pulse-outline" label="Progress" tint={HABIT.move} onPress={() => router.push('/(tabs)/progress')} />
            <QuickAction icon="grid-outline" label="More" tint={brand.teal} onPress={() => router.push('/(tabs)/more')} />
          </View>
        </View>
        </View>
      </ScrollView>
    </View>
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
  const { slots } = useMealSlots();
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Eyebrow>Today&apos;s meal plan</Eyebrow>
        <AppText variant="caption" tone="muted">
          {mealCount} logged
        </AppText>
      </View>
      <View style={{ gap: spacing.xs }}>
        {slots.map((entry) => {
          const slot = { key: entry.slot, label: entry.label, ...(SLOT_STYLE[entry.slot] ?? { icon: 'restaurant-outline' as IoniconName, tint: brand.teal }) };
          const logged = todaysMeals.find((m) => m.meal_type === slot.key);
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
          borderColor: tint + (t.dark ? '33' : '2E'),
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

function greeting(now: Date, tr: TFunction): string {
  const h = now.getHours();
  if (h < 5) return tr('greeting.lateNight');
  if (h < 12) return tr('greeting.morning');
  if (h < 17) return tr('greeting.afternoon');
  if (h < 21) return tr('greeting.evening');
  return tr('greeting.windDown');
}

const styles = StyleSheet.create({
  remindChip: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
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
  heroStageChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 60,
    gap: spacing.md,
  },
  garden: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  gardenGlow: {
    width: 96,
    height: 104,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d2414',
    borderWidth: 1,
    borderColor: 'rgba(190,242,100,0.28)',
    shadowColor: '#a3e635',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  gardenEyebrow: {
    color: '#bef264',
    letterSpacing: 1.4,
  },
  body: {
    paddingHorizontal: spacing.lg,
    marginTop: -44,
    gap: spacing.lg,
  },
  kcalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  macroTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  logBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: '#2f8f46',
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
