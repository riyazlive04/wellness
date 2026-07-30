import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Full milestone catalog — mirrors the backend recomputeMilestones() thresholds
// (and the web client). Each tier renders earned or locked.
const MILESTONE_CATALOG: { kind: string; label: string; unit: string; icon: IoniconName; values: number[] }[] = [
  { kind: 'weight_lost_kg', label: 'Weight lost', unit: 'kg', icon: 'trending-down-outline', values: [1, 2, 5, 10, 15, 20] },
  { kind: 'streak_days', label: 'Logging streak', unit: 'days', icon: 'flame-outline', values: [3, 7, 14, 30, 60, 100] },
  { kind: 'waist_lost_in', label: 'Waist lost', unit: 'in', icon: 'resize-outline', values: [1, 2, 4, 6] },
];

/**
 * Full achievement collection — earned badges plus every locked one with its
 * progress toward unlocking. The single source of truth; the Progress tab and
 * Wellbeing screen link here.
 */
export default function Achievements() {
  const t = useTheme();
  const q = useQuery({
    queryKey: ['me', 'achievements'],
    queryFn: () => clientsApi.myAchievements(),
    retry: 1,
  });
  const mileQ = useQuery({
    queryKey: ['me', 'milestones'],
    queryFn: () => clientsApi.myMilestones(),
    retry: 1,
  });

  const all = q.data ?? [];
  const earned = all.filter((a) => a.earned_at);
  const locked = all.filter((a) => !a.earned_at).sort((a, b) => b.progress - a.progress);
  const total = all.length;
  const pct = total > 0 ? earned.length / total : 0;

  const milestones = mileQ.data ?? [];
  // "<kind>:<value>" → earned milestone, so the catalog can show earned/locked.
  const earnedMiles = new Map(milestones.map((m) => [`${m.kind}:${m.value}`, m] as const));

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={q.isRefetching || mileQ.isRefetching}
            onRefresh={() => {
              q.refetch();
              mileQ.refetch();
            }}
            tintColor={t.colors.accent}
          />
        }>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : q.isError && total === 0 ? (
          <Card style={{ gap: spacing.xs }}>
            <AppText variant="heading">{"Couldn't load achievements"}</AppText>
            <AppText variant="muted" tone="muted">
              Pull to refresh to try again.
            </AppText>
          </Card>
        ) : (
          <>
            {/* ── Summary hero ─────────────────────────────────────── */}
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <LinearGradient
                colors={t.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ padding: spacing.xl, gap: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <AppText
                    variant="label"
                    tone="onBrand"
                    style={{ opacity: 0.85, textTransform: 'uppercase', letterSpacing: 1.4 }}>
                    Your badges
                  </AppText>
                  <View style={styles.trophyChip}>
                    <Ionicons name="trophy" size={13} color={t.colors.onBrand} />
                    <AppText variant="caption" tone="onBrand">
                      {earned.length}/{total}
                    </AppText>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
                  <AppText variant="display" tone="onBrand" style={{ fontVariant: ['tabular-nums'] }}>
                    {earned.length}
                  </AppText>
                  <AppText variant="muted" tone="onBrand" style={{ opacity: 0.85, marginBottom: 7 }}>
                    of {total} unlocked
                  </AppText>
                </View>
                <View style={styles.track}>
                  <View
                    style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: t.colors.onBrand, borderRadius: 999 }}
                  />
                </View>
              </LinearGradient>
            </Card>

            {/* ── Earned ───────────────────────────────────────────── */}
            {earned.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Earned</Eyebrow>
                <View style={styles.badges}>
                  {earned.map((a) => (
                    <Card
                      key={a.id}
                      style={{
                        width: '48%',
                        alignItems: 'center',
                        gap: spacing.sm,
                        borderRadius: radius.xl,
                        backgroundColor: softFill(t.dark, t.colors.warning).backgroundColor,
                        borderColor: softFill(t.dark, t.colors.warning).borderColor,
                      }}>
                      <View style={[styles.badgeChip, { backgroundColor: chipBg(t.colors.warning) }]}>
                        <AppText style={{ fontSize: 26 }}>{a.icon}</AppText>
                      </View>
                      <AppText variant="caption" style={{ textAlign: 'center', fontWeight: '600' }} numberOfLines={2}>
                        {a.title}
                      </AppText>
                      {a.earned_at ? (
                        <AppText variant="caption" tone="faint">
                          {new Date(a.earned_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </AppText>
                      ) : null}
                    </Card>
                  ))}
                </View>
              </View>
            ) : null}

            {/* ── Locked / in progress ─────────────────────────────── */}
            {locked.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>{earned.length > 0 ? 'Keep going' : 'All badges'}</Eyebrow>
                <Card style={{ padding: 0, borderRadius: radius.xl }}>
                  {locked.map((a, i) => (
                    <View
                      key={a.id}
                      style={[
                        styles.lockedRow,
                        { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: t.colors.border },
                      ]}>
                      <View style={[styles.lockedChip, { backgroundColor: t.colors.surfaceStrong }]}>
                        <AppText style={{ fontSize: 22, opacity: 0.4 }}>{a.icon}</AppText>
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <AppText variant="body" numberOfLines={1}>
                          {a.title}
                        </AppText>
                        <AppText variant="caption" tone="muted" numberOfLines={2}>
                          {a.description}
                        </AppText>
                        {a.progress > 0 ? (
                          <View style={[styles.miniTrack, { backgroundColor: t.colors.primary + (t.dark ? '24' : '18') }]}>
                            <View
                              style={{
                                width: `${a.progress}%`,
                                height: '100%',
                                borderRadius: 999,
                                backgroundColor: t.colors.primary,
                              }}
                            />
                          </View>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', minWidth: 34 }}>
                        {a.progress > 0 ? (
                          <AppText variant="caption" tone="accent" style={{ fontVariant: ['tabular-nums'] }}>
                            {a.progress}%
                          </AppText>
                        ) : (
                          <Ionicons name="lock-closed" size={14} color={t.colors.textFaint} />
                        )}
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            {/* ── Milestones (tiered: weight / streak / waist) ─────── */}
            <View style={{ gap: spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Eyebrow>Milestones</Eyebrow>
                <AppText variant="caption" tone="faint">
                  {milestones.length} unlocked
                </AppText>
              </View>
              {MILESTONE_CATALOG.map((group) => (
                <View key={group.kind} style={{ gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={group.icon} size={13} color={t.colors.textFaint} />
                    <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                      {group.label}
                    </AppText>
                  </View>
                  <View style={styles.mileGrid}>
                    {group.values.map((v) => {
                      const m = earnedMiles.get(`${group.kind}:${v}`);
                      const unlocked = !!m;
                      return (
                        <View
                          key={v}
                          style={[
                            styles.mileTile,
                            {
                              backgroundColor: unlocked ? softFill(t.dark, t.colors.warning).backgroundColor : t.colors.surface,
                              borderColor: unlocked ? softFill(t.dark, t.colors.warning).borderColor : t.colors.border,
                              opacity: unlocked ? 1 : 0.55,
                            },
                          ]}>
                          <View style={[styles.mileChip, { backgroundColor: unlocked ? chipBg(t.colors.warning) : t.colors.surfaceStrong }]}>
                            <Ionicons
                              name={unlocked ? 'trophy' : group.icon}
                              size={16}
                              color={unlocked ? t.colors.warning : t.colors.textFaint}
                            />
                          </View>
                          <AppText variant="caption" style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                            {v} {group.unit}
                          </AppText>
                          <AppText variant="caption" tone="faint">
                            {m ? new Date(m.achieved_at).toLocaleDateString([], { day: 'numeric', month: 'short' }) : 'Locked'}
                          </AppText>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>

            {/* ── Empty (no catalog) ───────────────────────────────── */}
            {total === 0 ? (
              <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
                <View style={[styles.badgeChip, { backgroundColor: chipBg(t.colors.warning) }]}>
                  <Ionicons name="ribbon-outline" size={22} color={t.colors.warning} />
                </View>
                <AppText variant="muted" tone="muted" style={{ textAlign: 'center', maxWidth: 250 }}>
                  No achievements set up yet — badges will appear here as you build habits.
                </AppText>
              </Card>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
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
    backgroundColor: alpha(tint, dark ? 0.16 : 0.09),
    borderColor: alpha(tint, dark ? 0.32 : 0.2),
  };
}

/** Slightly stronger fill for an icon chip. */
function chipBg(tint: string): string {
  return tint + '33';
}

const styles = StyleSheet.create({
  trophyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  track: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  badgeChip: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  lockedChip: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 2,
  },
  mileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mileTile: {
    width: '31%',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  mileChip: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
