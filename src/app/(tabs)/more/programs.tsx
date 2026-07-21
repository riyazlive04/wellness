import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { programsApi, type Assignment, type CatalogProgram, type TodayTask } from '@/lib/programs-api';
import { radius, spacing } from '@/lib/theme';

export default function Programs() {
  const t = useTheme();
  const qc = useQueryClient();
  const todayQ = useQuery({ queryKey: ['programs', 'today'], queryFn: () => programsApi.today(), retry: 1 });
  const assignedQ = useQuery({ queryKey: ['programs', 'assigned'], queryFn: () => programsApi.assigned(), retry: 1 });
  const catalogQ = useQuery({ queryKey: ['programs', 'catalog'], queryFn: () => programsApi.catalog(), retry: 1 });

  const toggleMut = useMutation({
    mutationFn: (taskId: string) => programsApi.toggle(taskId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['programs', 'today'] }); qc.invalidateQueries({ queryKey: ['programs', 'assigned'] }); },
  });
  const enrollMut = useMutation({
    mutationFn: (templateId: string) => programsApi.enroll(templateId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['programs'] }),
  });

  const today = todayQ.data ?? [];
  const assigned = assignedQ.data ?? [];
  const catalog = (catalogQ.data ?? []).filter((c) => !c.enrolled && c.allow_enrollment);

  return (
    <Screen edges={[]}>
      <ScreenScroll refreshControl={<RefreshControl refreshing={todayQ.isRefetching} onRefresh={() => qc.invalidateQueries({ queryKey: ['programs'] })} tintColor={t.colors.accent} />}>
        {todayQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            {today.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Today&apos;s tasks</Eyebrow>
                {today.map((task) => <TaskRow key={task.id} task={task} onToggle={() => toggleMut.mutate(task.id)} busy={toggleMut.isPending} />)}
              </View>
            ) : null}

            {assigned.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Your programs</Eyebrow>
                {assigned.map((a) => <AssignedCard key={a.id} a={a} />)}
              </View>
            ) : null}

            {today.length === 0 && assigned.length === 0 ? (
              <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
                <Ionicons name="clipboard-outline" size={26} color={t.colors.textFaint} />
                <AppText variant="muted" tone="muted">No active programs yet.</AppText>
              </Card>
            ) : null}

            {catalog.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Explore</Eyebrow>
                {catalog.map((c) => (
                  <CatalogCard key={c.id} c={c} onEnroll={() => enrollMut.mutate(c.id)} busy={enrollMut.isPending && enrollMut.variables === c.id} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function TaskRow({ task, onToggle, busy }: { task: TodayTask; onToggle: () => void; busy: boolean }) {
  const t = useTheme();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Pressable onPress={onToggle} disabled={busy} hitSlop={8}>
        <View style={[styles.check, task.done ? { backgroundColor: t.colors.accent, borderColor: t.colors.accent } : { borderColor: t.colors.border }]}>
          {task.done ? <Ionicons name="checkmark" size={16} color={t.colors.onBrand} /> : null}
        </View>
      </Pressable>
      <View style={{ flex: 1 }}>
        <AppText variant="body" style={{ textDecorationLine: task.done ? 'line-through' : 'none', opacity: task.done ? 0.6 : 1 }}>{task.title}</AppText>
        <AppText variant="caption" tone="muted">{task.program}</AppText>
      </View>
    </Card>
  );
}

function AssignedCard({ a }: { a: Assignment }) {
  const t = useTheme();
  const pct = a.progress?.pct ?? parseFloat(a.progress_pct) ?? 0;
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="heading" style={{ flex: 1 }}>{a.name}</AppText>
        <AppText variant="caption" tone="accent">{Math.round(pct)}%</AppText>
      </View>
      <View style={[styles.track, { backgroundColor: t.colors.surfaceStrong }]}>
        <View style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 999, backgroundColor: t.colors.accent }} />
      </View>
      <AppText variant="caption" tone="muted">{a.duration_weeks} weeks · {a.status}{a.progress ? ` · ${a.progress.daily_done}/${a.progress.daily_tasks} today` : ''}</AppText>
    </Card>
  );
}

function CatalogCard({ c, onEnroll, busy }: { c: CatalogProgram; onEnroll: () => void; busy: boolean }) {
  return (
    <Card style={{ gap: spacing.sm }}>
      <AppText variant="heading">{c.name}</AppText>
      {c.tagline ? <AppText variant="muted" tone="muted">{c.tagline}</AppText> : null}
      <AppText variant="caption" tone="faint">{c.duration_weeks} weeks · {c.difficulty} · {c.task_count} tasks</AppText>
      <GhostButton label={busy ? 'Enrolling…' : 'Enroll'} onPress={onEnroll} />
    </Card>
  );
}

const styles = StyleSheet.create({
  check: { width: 30, height: 30, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 999, overflow: 'hidden' },
});
