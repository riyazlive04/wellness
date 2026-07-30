import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { optimistic } from '@/lib/optimistic';
import { wellnessApi, type Goal } from '@/lib/wellness-api';
import { radius, spacing } from '@/lib/theme';

export default function Goals() {
  const t = useTheme();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');

  const goalsQ = useQuery({ queryKey: ['wellness', 'goals'], queryFn: () => wellnessApi.listGoals(), retry: 1 });

  const createMut = useMutation({
    mutationFn: () =>
      wellnessApi.createGoal({
        title: title.trim(),
        targetValue: target ? parseFloat(target) : undefined,
        unit: unit.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wellness', 'goals'] });
      setAdding(false);
      setTitle('');
      setTarget('');
      setUnit('');
    },
  });
  const achieveMut = useMutation({
    mutationFn: (id: string) => wellnessApi.updateGoal(id, { status: 'achieved' }),
    // Optimistic: the goal moves to Achieved the instant you tap.
    ...optimistic<Goal[], string>(qc, ['wellness', 'goals'], (old, id) =>
      old.map((g) => (g.id === id ? { ...g, status: 'achieved' as const } : g)),
    ),
  });

  const goals = goalsQ.data ?? [];
  const active = goals.filter((g) => g.status === 'active');
  const done = goals.filter((g) => g.status === 'achieved');

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={goalsQ.isRefetching} onRefresh={() => goalsQ.refetch()} tintColor={t.colors.accent} />
        }>
        {goalsQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            <GradientButton label="＋ New goal" onPress={() => setAdding(true)} />

            {goals.length === 0 ? (
              <Card
                style={{
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing['2xl'],
                  borderRadius: radius['2xl'],
                  backgroundColor: softFill(t.dark, t.colors.primary).backgroundColor,
                  borderColor: softFill(t.dark, t.colors.primary).borderColor,
                }}>
                <View style={[styles.emptyChip, { backgroundColor: chipBg(t.colors.primary) }]}>
                  <Ionicons name="flag-outline" size={24} color={t.colors.primary} />
                </View>
                <AppText variant="heading" style={{ textAlign: 'center' }}>
                  No goals yet
                </AppText>
                <AppText variant="muted" tone="muted" style={{ textAlign: 'center', maxWidth: 240 }}>
                  Set a goal to give your plan direction and watch your progress fill in.
                </AppText>
              </Card>
            ) : null}

            {active.length ? (
              <View style={{ gap: spacing.md }}>
                <Eyebrow>Active goals</Eyebrow>
                {active.map((g) => (
                  <GoalCard key={g.id} goal={g} onAchieve={() => achieveMut.mutate(g.id)} busy={false} />
                ))}
              </View>
            ) : null}

            {done.length ? (
              <View style={{ gap: spacing.md }}>
                <Eyebrow>Achieved</Eyebrow>
                {done.map((g) => (
                  <GoalCard key={g.id} goal={g} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScreenScroll>

      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={() => setAdding(false)}>
            <Pressable
              style={[styles.sheet, { backgroundColor: t.colors.canvas, borderColor: t.colors.border }]}
              onPress={(e) => e.stopPropagation()}>
            <AppText variant="heading">New goal</AppText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Lose weight, Run 5k"
              placeholderTextColor={t.colors.textFaint}
              autoFocus
              style={[styles.input, { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border }]}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput
                value={target}
                onChangeText={setTarget}
                placeholder="Target"
                placeholderTextColor={t.colors.textFaint}
                keyboardType="decimal-pad"
                style={[styles.input, { flex: 1, backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border }]}
              />
              <TextInput
                value={unit}
                onChangeText={setUnit}
                placeholder="Unit (kg…)"
                placeholderTextColor={t.colors.textFaint}
                style={[styles.input, { flex: 1, backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border }]}
              />
            </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <GhostButton label="Cancel" onPress={() => setAdding(false)} style={{ flex: 1 }} />
                <GradientButton
                  label="Add"
                  onPress={() => title.trim() && createMut.mutate()}
                  loading={createMut.isPending}
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function GoalCard({ goal, onAchieve, busy }: { goal: Goal; onAchieve?: () => void; busy?: boolean }) {
  const t = useTheme();
  const cur = parseFloat(goal.current_value);
  const tgt = goal.target_value != null ? parseFloat(goal.target_value) : null;
  const pct = tgt && tgt > 0 && !isNaN(cur) ? Math.max(0, Math.min(1, cur / tgt)) : null;
  const achieved = goal.status === 'achieved';
  const tint = achieved ? t.colors.success : t.colors.primary;
  const fill = softFill(t.dark, tint);
  const pctLabel = pct != null ? Math.round(pct * 100) : null;

  return (
    <Card
      style={{
        gap: spacing.md,
        borderRadius: radius.xl,
        backgroundColor: fill.backgroundColor,
        borderColor: fill.borderColor,
        opacity: achieved ? 0.9 : 1,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={[styles.iconChip, { backgroundColor: chipBg(tint) }]}>
          <Ionicons name={achieved ? 'trophy' : 'flag'} size={18} color={tint} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading">{goal.title}</AppText>
          {goal.description ? (
            <AppText variant="muted" tone="muted">
              {goal.description}
            </AppText>
          ) : null}
        </View>
        {achieved ? (
          <View style={[styles.pill, { backgroundColor: chipBg(t.colors.success) }]}>
            <Ionicons name="checkmark" size={12} color={t.colors.success} />
            <AppText variant="caption" style={{ color: t.colors.success }}>
              Done
            </AppText>
          </View>
        ) : onAchieve ? (
          <Pressable onPress={onAchieve} disabled={busy} hitSlop={8}>
            <Ionicons name="checkmark-circle-outline" size={24} color={t.colors.success} />
          </Pressable>
        ) : null}
      </View>

      {tgt != null ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="caption" tone="muted">
              {goal.current_value}
              {goal.unit ? ` ${goal.unit}` : ''}
              {' / '}
              {goal.target_value}
              {goal.unit ? ` ${goal.unit}` : ''}
            </AppText>
            {pctLabel != null ? (
              <AppText variant="caption" style={{ color: tint, fontVariant: ['tabular-nums'] }}>
                {pctLabel}%
              </AppText>
            ) : null}
          </View>
          <View style={[styles.track, { backgroundColor: tint + (t.dark ? '24' : '18') }]}>
            <View
              style={{
                width: `${(pct ?? 0) * 100}%`,
                height: '100%',
                borderRadius: 999,
                backgroundColor: tint,
              }}
            />
          </View>
        </View>
      ) : null}
    </Card>
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
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChip: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
  },
});
