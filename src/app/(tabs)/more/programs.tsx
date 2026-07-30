import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { programsApi, type Assignment, type CatalogProgram, type TodayTask } from '@/lib/programs-api';
import { brand, radius, spacing, status, tintFill } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Soft pastel fill alphas: whisper-light in light mode, a touch stronger in
// dark so the tint reads on the ink canvas. Matches Today/Progress.
const fill = (color: string, dark: boolean) => tintFill(color, dark);
const chipBg = (color: string) => color + '33'; // ~0.20

/** Warm accent per difficulty — beginner=emerald, intermediate=teal, advanced=amber. */
function difficultyTint(difficulty: string): string {
  if (difficulty === 'advanced') return status.warning;
  if (difficulty === 'intermediate') return brand.teal;
  return status.success;
}

/** Colour for an assignment status pill. */
function statusTint(s: Assignment['status'], t: ReturnType<typeof useTheme>): string {
  if (s === 'completed') return t.colors.success;
  if (s === 'paused') return t.colors.warning;
  if (s === 'cancelled') return t.colors.danger;
  return t.colors.primary;
}

export default function Programs() {
  const t = useTheme();
  const qc = useQueryClient();
  const router = useRouter();
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
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={todayQ.isRefetching} onRefresh={() => qc.invalidateQueries({ queryKey: ['programs'] })} tintColor={t.colors.accent} />}>
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
              <Card
                style={{
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing['2xl'],
                  backgroundColor: fill(t.colors.primary, t.dark),
                  borderColor: t.colors.primary + (t.dark ? '33' : '24'),
                  borderRadius: radius['2xl'],
                }}>
                <View style={[styles.emptyChip, { backgroundColor: chipBg(t.colors.primary) }]}>
                  <Ionicons name="clipboard-outline" size={24} color={t.colors.primary} />
                </View>
                <AppText variant="heading">No active programs yet</AppText>
                <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                  Explore a program below to start your wellness journey.
                </AppText>
              </Card>
            ) : null}

            {catalog.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Explore</Eyebrow>
                {catalog.map((c) => (
                  <CatalogCard
                    key={c.id}
                    c={c}
                    onEnroll={() => enrollMut.mutate(c.id)}
                    onOpen={() => router.push({ pathname: '/(tabs)/more/program/[id]', params: { id: c.id } })}
                    busy={enrollMut.isPending && enrollMut.variables === c.id}
                  />
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
  const done = task.done;
  return (
    <Card
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.xl,
        backgroundColor: done ? fill(t.colors.success, t.dark) : t.colors.surface,
        borderColor: done ? t.colors.success + (t.dark ? '33' : '24') : t.colors.border,
      }}>
      <Pressable onPress={onToggle} disabled={busy} hitSlop={8}>
        <View style={[styles.check, done ? { backgroundColor: t.colors.success, borderColor: t.colors.success } : { borderColor: t.colors.primary + '55' }]}>
          {done ? <Ionicons name="checkmark" size={16} color={t.colors.onBrand} /> : null}
        </View>
      </Pressable>
      <View style={{ flex: 1 }}>
        <AppText variant="body" style={{ textDecorationLine: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{task.title}</AppText>
        <AppText variant="caption" tone="muted">{task.program}</AppText>
      </View>
    </Card>
  );
}

function AssignedCard({ a }: { a: Assignment }) {
  const t = useTheme();
  const pct = a.progress?.pct ?? parseFloat(a.progress_pct) ?? 0;
  const sTint = statusTint(a.status, t);
  return (
    <Card style={{ gap: spacing.md, borderRadius: radius['2xl'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={[styles.iconChip, { backgroundColor: fill(t.colors.primary, t.dark) }]}>
          <Ionicons name="ribbon-outline" size={20} color={t.colors.primary} />
        </View>
        <AppText variant="heading" style={{ flex: 1 }}>{a.name}</AppText>
        <AppText variant="heading" tone="accent" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(pct)}%</AppText>
      </View>
      <View style={[styles.track, { backgroundColor: t.colors.primary + (t.dark ? '24' : '1A') }]}>
        <View style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 999, backgroundColor: t.colors.primary }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Pill icon="calendar-outline" label={`${a.duration_weeks} weeks`} tint={t.colors.textMuted} />
        <Pill icon="ellipse" label={a.status} tint={sTint} solid />
        {a.progress ? (
          <Pill icon="checkmark-done-outline" label={`${a.progress.daily_done}/${a.progress.daily_tasks} today`} tint={t.colors.accent} />
        ) : null}
      </View>
    </Card>
  );
}

function CatalogCard({ c, onEnroll, onOpen, busy }: { c: CatalogProgram; onEnroll: () => void; onOpen: () => void; busy: boolean }) {
  const t = useTheme();
  const diffTint = difficultyTint(c.difficulty);
  return (
    <Card style={{ gap: spacing.md, borderRadius: radius['2xl'] }}>
      <Pressable onPress={onOpen} style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={[styles.iconChip, { backgroundColor: fill(diffTint, t.dark) }]}>
            <Ionicons name="sparkles-outline" size={20} color={diffTint} />
          </View>
          <AppText variant="heading" style={{ flex: 1 }}>{c.name}</AppText>
          <Ionicons name="chevron-forward" size={16} color={t.colors.textFaint} />
        </View>
        {c.tagline ? <AppText variant="muted" tone="muted">{c.tagline}</AppText> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Pill icon="calendar-outline" label={`${c.duration_weeks} weeks`} tint={t.colors.textMuted} />
          <Pill icon="barbell-outline" label={c.difficulty} tint={diffTint} />
          <Pill icon="list-outline" label={`${c.task_count} tasks`} tint={t.colors.accent} />
        </View>
      </Pressable>
      <GradientButton label={busy ? 'Enrolling…' : 'Enroll'} onPress={onEnroll} loading={busy} />
    </Card>
  );
}

/** Small tinted tag/status pill chip. */
function Pill({ icon, label, tint, solid }: { icon: IoniconName; label: string; tint: string; solid?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: tint + (t.dark ? '26' : '1A'),
          borderColor: tint + (t.dark ? '3A' : '2B'),
        },
      ]}>
      <Ionicons name={icon} size={solid ? 9 : 12} color={tint} />
      <AppText variant="caption" style={{ color: tint, textTransform: solid ? 'capitalize' : 'none' }}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  check: { width: 30, height: 30, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 999, overflow: 'hidden' },
  iconChip: { width: 40, height: 40, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  emptyChip: { width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
