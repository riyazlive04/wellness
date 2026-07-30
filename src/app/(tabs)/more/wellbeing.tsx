import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { ScoreRing } from '@/components/score-ring';
import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

export default function Wellbeing() {
  const t = useTheme();
  const snapQ = useQuery({ queryKey: ['me', 'snapshot'], queryFn: () => clientsApi.myWellnessSnapshot(), retry: 1 });
  const achQ = useQuery({ queryKey: ['me', 'achievements'], queryFn: () => clientsApi.myAchievements(), retry: 1 });
  const symQ = useQuery({ queryKey: ['me', 'symptoms'], queryFn: () => clientsApi.mySymptoms(60), retry: 1 });

  const snap = snapQ.data;
  const earned = (achQ.data ?? []).filter((a) => a.earned_at);
  const symptoms = symQ.data ?? [];

  const habitPct =
    snap && snap.habitsTotal > 0 ? Math.max(0, Math.min(1, snap.habitsCompletedToday / snap.habitsTotal)) : 0;

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={snapQ.isRefetching} onRefresh={() => { snapQ.refetch(); achQ.refetch(); symQ.refetch(); }} tintColor={t.colors.accent} />}>
        {snapQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            {snap ? (
              <Card
                style={{
                  gap: spacing.lg,
                  borderRadius: radius['2xl'],
                  backgroundColor: softFill(t.dark, t.colors.primary).backgroundColor,
                  borderColor: softFill(t.dark, t.colors.primary).borderColor,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
                  <ScoreRing score={snap.score > 0 ? snap.score : null} label="score" size={100} />
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <AppText variant="heading">{snap.scoreLabel || 'Your wellness'}</AppText>
                    <AppText variant="muted" tone="muted">{snap.habitsCompletedToday}/{snap.habitsTotal} habits today</AppText>
                    {snap.streakDays > 0 ? (
                      <View style={[styles.pill, { backgroundColor: chipBg(t.colors.warning), alignSelf: 'flex-start' }]}>
                        <Ionicons name="flame" size={12} color={t.colors.warning} />
                        <AppText variant="caption" style={{ color: t.colors.warning }}>{snap.streakDays}-day streak</AppText>
                      </View>
                    ) : null}
                  </View>
                </View>
                {snap.habitsTotal > 0 ? (
                  <View style={[styles.track, { backgroundColor: t.colors.primary + (t.dark ? '24' : '18') }]}>
                    <View style={{ width: `${habitPct * 100}%`, height: '100%', borderRadius: 999, backgroundColor: t.colors.primary }} />
                  </View>
                ) : null}
              </Card>
            ) : null}

            <View style={{ gap: spacing.sm }}>
              <Eyebrow>Achievements</Eyebrow>
              {earned.length === 0 ? (
                <Card
                  style={{
                    alignItems: 'center',
                    gap: spacing.md,
                    paddingVertical: spacing.xl,
                    borderRadius: radius['2xl'],
                    backgroundColor: softFill(t.dark, t.colors.warning).backgroundColor,
                    borderColor: softFill(t.dark, t.colors.warning).borderColor,
                  }}>
                  <View style={[styles.emptyChip, { backgroundColor: chipBg(t.colors.warning) }]}>
                    <Ionicons name="ribbon-outline" size={22} color={t.colors.warning} />
                  </View>
                  <AppText variant="muted" tone="muted" style={{ textAlign: 'center', maxWidth: 240 }}>
                    Keep going — badges unlock as you build habits.
                  </AppText>
                </Card>
              ) : (
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
                      <AppText variant="caption" style={{ textAlign: 'center' }} numberOfLines={2}>{a.title}</AppText>
                    </Card>
                  ))}
                </View>
              )}
            </View>

            {symptoms.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Recent symptoms</Eyebrow>
                <Card style={{ padding: 0, borderRadius: radius.xl }}>
                  {symptoms.slice(0, 10).map((s, i) => {
                    const sevTint = s.severity >= 4 ? t.colors.danger : s.severity >= 2 ? t.colors.warning : t.colors.success;
                    return (
                      <View key={s.id} style={[styles.row, { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: t.colors.border }]}>
                        <View style={[styles.symChip, { backgroundColor: chipBg(sevTint) }]}>
                          <Ionicons name="pulse-outline" size={16} color={sevTint} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppText variant="body">{s.symptom}</AppText>
                          {s.suspected_trigger ? <AppText variant="caption" tone="muted">Trigger: {s.suspected_trigger}</AppText> : null}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 3 }}>
                          <View style={[styles.pill, { backgroundColor: chipBg(sevTint) }]}>
                            <AppText variant="caption" style={{ color: sevTint }}>Severity {s.severity}</AppText>
                          </View>
                          <AppText variant="caption" tone="faint">{new Date(s.occurred_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</AppText>
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
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
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 13 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  emptyChip: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeChip: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symChip: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
