import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { programsApi } from '@/lib/programs-api';
import { spacing } from '@/lib/theme';

export default function ProgramDetail() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const q = useQuery({
    queryKey: ['programs', 'catalog', id],
    queryFn: () => programsApi.catalogDetail(id!),
    enabled: !!id,
    retry: 1,
  });
  const enrollMut = useMutation({
    mutationFn: () => programsApi.enroll(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['programs'] }),
  });
  const leaveMut = useMutation({
    mutationFn: () => programsApi.leave(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['programs'] }),
  });

  const p = q.data;
  const weeks = p?.content?.weeks ?? [];

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: p?.name ?? 'Program' }} />
      <ScreenScroll>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : !p ? (
          <Card><AppText variant="muted" tone="muted">Couldn&apos;t load this program.</AppText></Card>
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <Eyebrow>{p.category} · {p.difficulty}</Eyebrow>
              <AppText variant="title">{p.name}</AppText>
              {p.tagline ? <AppText variant="muted" tone="muted">{p.tagline}</AppText> : null}
            </View>

            <Card style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <Stat value={`${p.duration_weeks}`} label="weeks" />
              <Stat value={`${p.task_count}`} label="tasks" />
              <Stat value={`${p.enrolled_count}`} label="enrolled" />
            </Card>

            {p.description ? (
              <Card><AppText variant="body" tone="muted">{p.description}</AppText></Card>
            ) : null}

            {p.goals?.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Goals</Eyebrow>
                <Card style={{ gap: spacing.sm }}>
                  {p.goals.map((g) => (
                    <View key={g} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                      <Ionicons name="flag-outline" size={15} color={t.colors.accent} style={{ marginTop: 2 }} />
                      <AppText variant="muted" tone="muted" style={{ flex: 1 }}>{g}</AppText>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            {weeks.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Content</Eyebrow>
                {weeks.map((w) => (
                  <Card key={w.week_number} style={{ gap: spacing.xs }}>
                    <AppText variant="heading">Week {w.week_number}{w.title ? ` · ${w.title}` : ''}</AppText>
                    {(w.tasks ?? []).map((task, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Ionicons name="ellipse" size={6} color={t.colors.textFaint} style={{ marginTop: 7 }} />
                        <AppText variant="muted" tone="muted" style={{ flex: 1 }}>{task.title}</AppText>
                      </View>
                    ))}
                  </Card>
                ))}
              </View>
            ) : null}

            {p.enrolled ? (
              <GhostButton label={leaveMut.isPending ? 'Leaving…' : 'Leave program'} onPress={() => leaveMut.mutate()} />
            ) : p.allow_enrollment ? (
              <GradientButton label={enrollMut.isPending ? 'Enrolling…' : 'Enroll'} onPress={() => enrollMut.mutate()} loading={enrollMut.isPending} />
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" tone="muted">{label}</AppText>
    </View>
  );
}
