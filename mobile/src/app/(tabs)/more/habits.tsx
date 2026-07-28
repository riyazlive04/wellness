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

import { AppText, Card, GhostButton, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { optimistic } from '@/lib/optimistic';
import { wellnessApi, type Habit } from '@/lib/wellness-api';
import { radius, spacing } from '@/lib/theme';

export default function Habits() {
  const t = useTheme();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  const habitsQ = useQuery({ queryKey: ['wellness', 'habits'], queryFn: () => wellnessApi.listHabits(), retry: 1 });

  // Optimistic: the checkmark + streak flip instantly on tap; the write and the
  // Today-screen totals reconcile in the background.
  const toggleMut = useMutation({
    mutationFn: (id: string) => wellnessApi.toggleHabit(id),
    ...optimistic<Habit[], string>(
      qc,
      ['wellness', 'habits'],
      (old, id) =>
        old.map((h) => {
          if (h.id !== id) return h;
          const done = !h.done_today;
          return { ...h, done_today: done, streak: Math.max(0, h.streak + (done ? 1 : -1)) };
        }),
      { also: [['me', 'home']] },
    ),
  });
  const createMut = useMutation({
    mutationFn: (t2: string) => wellnessApi.createHabit({ title: t2 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wellness', 'habits'] });
      setAdding(false);
      setTitle('');
    },
  });

  const habits = habitsQ.data ?? [];
  const doneCount = habits.filter((h) => h.done_today).length;

  return (
    <Screen edges={[]}>
      <ScreenScroll
        refreshControl={
          <RefreshControl refreshing={habitsQ.isRefetching} onRefresh={() => habitsQ.refetch()} tintColor={t.colors.accent} />
        }>
        {habitsQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            {habits.length > 0 ? (
              <Card style={{ alignItems: 'center', gap: 4 }}>
                <AppText variant="display" tone="accent">
                  {doneCount}/{habits.length}
                </AppText>
                <AppText variant="muted" tone="muted">
                  done today
                </AppText>
              </Card>
            ) : null}

            {habits.length === 0 ? (
              <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
                <Ionicons name="repeat-outline" size={26} color={t.colors.textFaint} />
                <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                  No habits yet. Add one to start building streaks.
                </AppText>
              </Card>
            ) : (
              habits.map((h) => (
                <HabitCard key={h.id} habit={h} onToggle={() => toggleMut.mutate(h.id)} busy={false} />
              ))
            )}

            <GradientButton label="＋ New habit" onPress={() => setAdding(true)} />
          </>
        )}
      </ScreenScroll>

      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={() => setAdding(false)}>
            <Pressable
              style={[styles.sheet, { backgroundColor: t.colors.canvas, borderColor: t.colors.border }]}
              onPress={(e) => e.stopPropagation()}>
              <AppText variant="heading">New habit</AppText>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Drink 2L water"
                placeholderTextColor={t.colors.textFaint}
                autoFocus
                style={[styles.input, { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border }]}
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <GhostButton label="Cancel" onPress={() => setAdding(false)} style={{ flex: 1 }} />
                <GradientButton
                  label="Add"
                  onPress={() => title.trim() && createMut.mutate(title.trim())}
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

function HabitCard({ habit, onToggle, busy }: { habit: Habit; onToggle: () => void; busy: boolean }) {
  const t = useTheme();
  const tint = habit.color ?? t.colors.accent;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Pressable onPress={onToggle} disabled={busy} hitSlop={8}>
        <View
          style={[
            styles.check,
            habit.done_today
              ? { backgroundColor: tint, borderColor: tint }
              : { borderColor: t.colors.border },
          ]}>
          {habit.done_today ? <Ionicons name="checkmark" size={18} color={t.colors.onBrand} /> : null}
        </View>
      </Pressable>
      <View style={{ flex: 1 }}>
        <AppText variant="body">{habit.title}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 }}>
          {habit.streak > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="flame" size={12} color={t.colors.warning} />
              <AppText variant="caption" tone="muted">
                {habit.streak}
              </AppText>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {habit.last7.map((d) => (
              <View
                key={d.date}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: d.done ? tint : t.colors.surfaceStrong,
                }}
              />
            ))}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  check: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
    maxWidth: 380,
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
