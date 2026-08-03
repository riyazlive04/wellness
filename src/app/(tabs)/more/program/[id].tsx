import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { programsApi, type ProgramTaskLite } from '@/lib/programs-api';
import { spacing } from '@/lib/theme';

const CADENCE_LABEL: Record<string, string> = { daily: 'Every day', weekly: 'Weekly', once: 'One-time' };

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
  const content = p?.content ?? undefined;
  const tasks = p?.tasks ?? [];
  const roadmap = content?.roadmap ?? [];
  const deliverables = content?.deliverables ?? [];
  const support = content?.support ?? [];
  const benefits = content?.overview?.benefits ?? [];
  const outcomes = content?.outcomes;
  const outcomeRows = outcomes
    ? [
        outcomes.weight_loss ? { label: 'Weight loss', value: outcomes.weight_loss } : null,
        outcomes.waist ? { label: 'Waist', value: outcomes.waist } : null,
        outcomes.body_fat ? { label: 'Body fat', value: outcomes.body_fat } : null,
      ].filter(Boolean) as { label: string; value: string }[]
    : [];

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
              <Stat value={`${p.duration_weeks}`} label={p.duration_unit === 'days' ? 'days' : 'weeks'} />
              <Stat value={`${p.task_count}`} label="tasks" />
              <Stat value={`${p.enrolled_count}`} label="enrolled" />
            </Card>

            {p.description ? (
              <Card><AppText variant="body" tone="muted">{p.description}</AppText></Card>
            ) : null}

            {content?.overview?.purpose || content?.overview?.achieve ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Overview</Eyebrow>
                <Card style={{ gap: spacing.md }}>
                  {content.overview?.purpose ? (
                    <View style={{ gap: 2 }}>
                      <AppText variant="caption" tone="muted">Purpose</AppText>
                      <AppText variant="body" tone="muted">{content.overview.purpose}</AppText>
                    </View>
                  ) : null}
                  {content.overview?.achieve ? (
                    <View style={{ gap: 2 }}>
                      <AppText variant="caption" tone="muted">What you&apos;ll achieve</AppText>
                      <AppText variant="body" tone="muted">{content.overview.achieve}</AppText>
                    </View>
                  ) : null}
                </Card>
              </View>
            ) : null}

            {p.goals?.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Goals</Eyebrow>
                <Card style={{ gap: spacing.sm }}>
                  {p.goals.map((g) => (
                    <IconRow key={g} icon="flag-outline" tint={t.colors.accent} text={g} />
                  ))}
                </Card>
              </View>
            ) : null}

            {benefits.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Key benefits</Eyebrow>
                <Card style={{ gap: spacing.sm }}>
                  {benefits.map((b) => (
                    <IconRow key={b} icon="sparkles-outline" tint={t.colors.accent} text={b} />
                  ))}
                </Card>
              </View>
            ) : null}

            {tasks.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>What you&apos;ll do</Eyebrow>
                <Card style={{ gap: spacing.sm }}>
                  {tasks.map((task) => <TaskLine key={task.id} task={task} />)}
                </Card>
              </View>
            ) : null}

            {roadmap.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Roadmap</Eyebrow>
                {roadmap.map((phase, i) => (
                  <Card key={i} style={{ gap: spacing.xs, flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={{ width: 26, height: 26, borderRadius: 999, backgroundColor: t.colors.primary + '22', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      <AppText variant="caption" tone="accent" style={{ fontWeight: '700' }}>{i + 1}</AppText>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="heading">{phase.title}{phase.duration ? ` · ${phase.duration}` : ''}</AppText>
                      {phase.description ? <AppText variant="muted" tone="muted">{phase.description}</AppText> : null}
                    </View>
                  </Card>
                ))}
              </View>
            ) : null}

            {outcomeRows.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Expected outcomes</Eyebrow>
                <Card style={{ gap: spacing.sm }}>
                  {outcomeRows.map((o) => (
                    <View key={o.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <AppText variant="muted" tone="muted">{o.label}</AppText>
                      <AppText variant="body">{o.value}</AppText>
                    </View>
                  ))}
                  {outcomes?.disclaimer ? <AppText variant="caption" tone="muted">{outcomes.disclaimer}</AppText> : null}
                </Card>
              </View>
            ) : null}

            {deliverables.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>What you get</Eyebrow>
                <Card style={{ gap: spacing.sm }}>
                  {deliverables.map((d) => (
                    <IconRow key={d} icon="checkmark-circle-outline" tint={t.colors.success} text={d} />
                  ))}
                </Card>
              </View>
            ) : null}

            {support.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Support included</Eyebrow>
                <Card style={{ gap: spacing.sm }}>
                  {support.map((s) => (
                    <IconRow key={s} icon="hand-left-outline" tint={t.colors.primary} text={s} />
                  ))}
                </Card>
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

function IconRow({ icon, tint, text }: { icon: keyof typeof Ionicons.glyphMap; tint: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={15} color={tint} style={{ marginTop: 2 }} />
      <AppText variant="muted" tone="muted" style={{ flex: 1 }}>{text}</AppText>
    </View>
  );
}

function TaskLine({ task }: { task: ProgramTaskLite }) {
  const t = useTheme();
  const cadence = CADENCE_LABEL[task.cadence] ?? task.cadence;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Ionicons name="ellipse" size={6} color={t.colors.accent} style={{ marginTop: 7 }} />
      <View style={{ flex: 1 }}>
        <AppText variant="body">{task.title}</AppText>
        <AppText variant="caption" tone="muted">{cadence}{task.week_number ? ` · week ${task.week_number}` : ''}</AppText>
      </View>
    </View>
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
