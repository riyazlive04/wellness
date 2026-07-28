import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { ScoreRing } from '@/components/score-ring';
import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { spacing } from '@/lib/theme';

export default function Wellbeing() {
  const t = useTheme();
  const snapQ = useQuery({ queryKey: ['me', 'snapshot'], queryFn: () => clientsApi.myWellnessSnapshot(), retry: 1 });
  const achQ = useQuery({ queryKey: ['me', 'achievements'], queryFn: () => clientsApi.myAchievements(), retry: 1 });
  const symQ = useQuery({ queryKey: ['me', 'symptoms'], queryFn: () => clientsApi.mySymptoms(60), retry: 1 });

  const snap = snapQ.data;
  const earned = (achQ.data ?? []).filter((a) => a.earned_at);
  const symptoms = symQ.data ?? [];

  return (
    <Screen edges={[]}>
      <ScreenScroll refreshControl={<RefreshControl refreshing={snapQ.isRefetching} onRefresh={() => { snapQ.refetch(); achQ.refetch(); symQ.refetch(); }} tintColor={t.colors.accent} />}>
        {snapQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            {snap ? (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
                <ScoreRing score={snap.score > 0 ? snap.score : null} label="score" size={100} />
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="heading">{snap.scoreLabel || 'Your wellness'}</AppText>
                  <AppText variant="muted" tone="muted">{snap.habitsCompletedToday}/{snap.habitsTotal} habits today</AppText>
                  {snap.streakDays > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="flame" size={13} color={t.colors.warning} />
                      <AppText variant="caption" tone="muted">{snap.streakDays}-day streak</AppText>
                    </View>
                  ) : null}
                </View>
              </Card>
            ) : null}

            <View style={{ gap: spacing.sm }}>
              <Eyebrow>Achievements</Eyebrow>
              {earned.length === 0 ? (
                <Card><AppText variant="muted" tone="muted">Keep going — badges unlock as you build habits.</AppText></Card>
              ) : (
                <View style={styles.badges}>
                  {earned.map((a) => (
                    <Card key={a.id} style={{ width: '48%', alignItems: 'center', gap: 4 }}>
                      <AppText style={{ fontSize: 28 }}>{a.icon}</AppText>
                      <AppText variant="caption" style={{ textAlign: 'center' }} numberOfLines={2}>{a.title}</AppText>
                    </Card>
                  ))}
                </View>
              )}
            </View>

            {symptoms.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Recent symptoms</Eyebrow>
                <Card style={{ padding: 0 }}>
                  {symptoms.slice(0, 10).map((s, i) => (
                    <View key={s.id} style={[styles.row, { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: t.colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="body">{s.symptom}</AppText>
                        {s.suspected_trigger ? <AppText variant="caption" tone="muted">Trigger: {s.suspected_trigger}</AppText> : null}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <AppText variant="caption" tone={s.severity >= 4 ? 'danger' : s.severity >= 2 ? 'warning' : 'muted'}>Severity {s.severity}</AppText>
                        <AppText variant="caption" tone="faint">{new Date(s.occurred_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</AppText>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 13 },
});
