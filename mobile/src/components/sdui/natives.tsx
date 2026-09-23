/**
 * Server-driven UI — the blocks that stay real React Native code.
 *
 * These moved here wholesale from the hand-written Today and More screens. They
 * are the pieces that should never have become JSON: a running clock, an
 * optimistic write, a tile that expands into a mood picker, a gradient CTA.
 * Expressing those in a layout tree would mean inventing state, effects and
 * event wiring in the schema — which is how an SDUI system stops being a layout
 * format and becomes a bad programming language.
 *
 * What the server gets to decide is whether each appears and in what order.
 * That is the part a practice actually wants to change.
 *
 * A name that is not in this registry renders nothing, which is what lets an
 * older build survive a layout that references a block it has never heard of.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScoreRing } from '@/components/score-ring';
import { AppText, Card, Eyebrow } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import type { ClientHomeData, ClientMessage, WellnessSnapshot } from '@/lib/clients-api';
import type { RunAction } from '@/lib/sdui/actions';
import type { Scope } from '@/lib/sdui/bindings';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const MOOD_WORDS = ['', 'Low', 'Meh', 'Okay', 'Good', 'Great'];

export interface NativeBlockProps {
  /** The screen's resolved data, keyed by binding name. */
  scope: Scope;
  /** Dispatcher for schema actions, so a native block can trigger one too. */
  run: RunAction;
  /** Author-supplied props from the `native` node. */
  props?: Record<string, unknown>;
}

/**
 * Pull the home payload out of the scope.
 *
 * The binding key is conventionally `home`, but an author may rename it, so
 * fall back to the first scope entry that looks like a home payload rather than
 * hard-coding the name and rendering blank when someone renames a binding.
 */
function homeData(scope: Scope): ClientHomeData | undefined {
  const direct = scope.home as ClientHomeData | undefined;
  if (direct && typeof direct === 'object') return direct;
  for (const value of Object.values(scope)) {
    if (value && typeof value === 'object' && 'snapshot' in (value as object)) {
      return value as ClientHomeData;
    }
  }
  return undefined;
}

// ────────────────────────────────────────────────────────────────────────
// Home
// ────────────────────────────────────────────────────────────────────────

function ScoreHero({ scope }: NativeBlockProps): ReactElement {
  const t = useTheme();
  const home = homeData(scope);
  const snap = home?.snapshot;
  const profile = home?.profile;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const firstName = profile?.name?.split(' ')[0] ?? '';
  const scoreVal = snap && snap.score > 0 ? snap.score : null;

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <LinearGradient
        colors={[t.gradient[0] + '26', t.gradient[2] + '14', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          padding: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.lg,
        }}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText
            variant="label"
            tone="faint"
            style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
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
  );
}

function LogMealCta({ run }: NativeBlockProps): ReactElement {
  const t = useTheme();
  return (
    <Pressable onPress={() => run({ kind: 'navigate', href: '/plate-vision' })}>
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
  );
}

function HabitTiles({ scope, run }: NativeBlockProps): ReactElement {
  const home = homeData(scope);
  const snap = home?.snapshot;
  const [moodOpen, setMoodOpen] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);
  const moodDays = home?.mood ?? [];
  const todayMood = moodDays[0]?.date === todayStr ? moodDays[0] : null;

  return (
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
          onPress={() => run({ kind: 'logHabit', metric: 'water_ml', delta: 250 })}
        />
        <HabitTile
          icon="moon-outline"
          tint="#6DB022"
          label="Sleep"
          value={snap?.sleepHours != null ? `${snap.sleepHours}h` : '–'}
          pct={snap?.sleepHours != null ? snap.sleepHours / 8 : 0}
          onPress={() => run({ kind: 'navigate', href: '/(tabs)/progress' })}
        />
        <HabitTile
          icon="walk-outline"
          tint="#10B981"
          label="Move"
          value={snap?.exerciseMinutes ? `${snap.exerciseMinutes}m` : '–'}
          pct={snap ? snap.exerciseMinutes / 30 : 0}
          onPress={() => run({ kind: 'navigate', href: '/(tabs)/progress' })}
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
        <Card
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {[1, 2, 3, 4, 5].map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                setMoodOpen(false); // close instantly; the write runs in the background
                run({ kind: 'logMood', value: m });
              }}
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
  );
}

function MealSummary({ scope }: NativeBlockProps): ReactElement {
  const t = useTheme();
  const home = homeData(scope);
  const snap = home?.snapshot as WellnessSnapshot | undefined;

  // Meals may be bound separately; fall back to the home payload's own count.
  const meals = Array.isArray(scope.meals) ? (scope.meals as { logged_at: string }[]) : [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const mealCount = meals.filter((m) => m.logged_at?.slice(0, 10) === todayStr).length;

  const kcal = snap?.todayKcal ?? 0;
  const target = snap?.targetKcal ?? null;
  const pct = target ? Math.max(0, Math.min(1, kcal / target)) : 0;

  return (
    <Card style={{ gap: spacing.md }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
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
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              backgroundColor: t.colors.accent,
              borderRadius: 999,
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}

function CoachNudge({ scope, run }: NativeBlockProps): ReactElement | null {
  const t = useTheme();
  const home = homeData(scope);

  const latest = (home?.messages ?? ([] as ClientMessage[]))
    .filter((m) => m.sender_type !== 'client' && (m.content ?? '').trim().length > 0)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];

  if (!latest) return null;

  return (
    <Pressable onPress={() => run({ kind: 'navigate', href: '/(tabs)/chat' })}>
      <Card style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="chatbubble-ellipses" size={16} color={t.colors.accent} />
          <Eyebrow>From your nutritionist</Eyebrow>
        </View>
        <AppText variant="body" numberOfLines={3}>
          {latest.content}
        </AppText>
      </Card>
    </Pressable>
  );
}

function ProgramProgress({ scope, run }: NativeBlockProps): ReactElement | null {
  const t = useTheme();
  const home = homeData(scope);
  const program = home?.program;
  if (!program) return null;

  return (
    <Pressable onPress={() => run({ kind: 'navigate', href: '/(tabs)/more/programs' })}>
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
    </Pressable>
  );
}

function QuickActions({ run }: NativeBlockProps): ReactElement {
  return (
    <View style={styles.grid}>
      <QuickAction
        icon="camera-outline"
        label="Plate Vision"
        onPress={() => run({ kind: 'navigate', href: '/plate-vision' })}
      />
      <QuickAction
        icon="pulse-outline"
        label="Progress"
        onPress={() => run({ kind: 'navigate', href: '/(tabs)/progress' })}
      />
      <QuickAction
        icon="sparkles-outline"
        label="Assistant"
        onPress={() => run({ kind: 'navigate', href: '/(tabs)/assistant' })}
      />
      <QuickAction
        icon="grid-outline"
        label="More"
        onPress={() => run({ kind: 'navigate', href: '/(tabs)/more' })}
      />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// More
// ────────────────────────────────────────────────────────────────────────

function ProfileHeader({ run }: NativeBlockProps): ReactElement {
  const t = useTheme();
  const { user } = useAuth();
  const name = (user?.user_metadata?.name as string) || user?.email || 'You';

  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={[styles.avatar, { backgroundColor: t.colors.surfaceStrong }]}>
        <AppText variant="heading" tone="accent">
          {initialsOf(name)}
        </AppText>
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="heading">{name}</AppText>
        {user?.email ? (
          <AppText variant="muted" tone="muted" numberOfLines={1}>
            {user.email}
          </AppText>
        ) : null}
      </View>
      <Pressable
        onPress={() => run({ kind: 'navigate', href: '/(tabs)/more/settings' })}
        hitSlop={8}>
        <Ionicons name="settings-outline" size={20} color={t.colors.textMuted} />
      </Pressable>
    </Card>
  );
}

function SignOutBlock({ run }: NativeBlockProps): ReactElement {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => run({ kind: 'signOut' })}
      style={({ pressed }) => [
        styles.signOut,
        {
          borderColor: t.colors.border,
          backgroundColor: pressed ? t.colors.surfaceStrong : 'transparent',
        },
      ]}>
      <Ionicons name="log-out-outline" size={18} color={t.colors.danger} />
      <AppText variant="heading" tone="danger">
        Sign out
      </AppText>
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────────────────

/** Must stay in step with NATIVE_COMPONENTS in backend/src/sdui/sdui.registry.ts. */
export const NATIVE_BLOCKS: Record<string, (p: NativeBlockProps) => ReactElement | null> = {
  'home.scoreHero': ScoreHero,
  'home.logMealCta': LogMealCta,
  'home.habitTiles': HabitTiles,
  'home.mealSummary': MealSummary,
  'home.coachNudge': CoachNudge,
  'home.programProgress': ProgramProgress,
  'home.quickActions': QuickActions,
  'more.profileHeader': ProfileHeader,
  'more.signOut': SignOutBlock,
};

// ────────────────────────────────────────────────────────────────────────
// Shared bits
// ────────────────────────────────────────────────────────────────────────

function HabitTile({
  icon,
  tint,
  label,
  value,
  pct,
  hint,
  onPress,
}: {
  icon: IoniconName;
  tint: string;
  label: string;
  value: string;
  pct: number;
  hint?: string;
  onPress?: () => void;
}) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(1, pct || 0));
  return (
    <Pressable onPress={onPress} style={{ width: '48%' }}>
      <Card style={{ gap: spacing.sm }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={[styles.habitIcon, { backgroundColor: tint + '26' }]}>
            <Ionicons name={icon} size={16} color={tint} />
          </View>
          {hint ? (
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
          <View
            style={{
              width: `${clamped * 100}%`,
              height: '100%',
              backgroundColor: tint,
              borderRadius: 999,
            }}
          />
        </View>
      </Card>
    </Pressable>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
}) {
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

function initialsOf(name: string): string {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  );
}


const styles = StyleSheet.create({
  streak: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
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
  track: { height: 6, borderRadius: 999, overflow: 'hidden' },
  progIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingVertical: 14,
    marginTop: spacing.sm,
  },
});
