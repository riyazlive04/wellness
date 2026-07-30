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
import { wellnessApi, type Habit } from '@/lib/wellness-api';
import { radius, spacing, tintFill } from '@/lib/theme';

// Soft pastel fill for a brand/status hex — whisper-light in light mode, a touch
// warmer in dark so the tint reads on the ink canvas.
const soft = (hex: string, dark: boolean) => tintFill(hex, dark);
const chipBg = (hex: string) => hex + '33'; // ~0.20

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
  const pct = habits.length ? doneCount / habits.length : 0;

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={habitsQ.isRefetching} onRefresh={() => habitsQ.refetch()} tintColor={t.colors.accent} />
        }>
        {habitsQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            {/* ── Friendly header ─────────────────────────────────────── */}
            <View style={{ gap: 4, marginTop: spacing.xs }}>
              <Eyebrow>Daily rituals</Eyebrow>
              <AppText variant="title">Habits</AppText>
            </View>

            {habits.length > 0 ? (
              <Card style={{ gap: spacing.md, borderRadius: radius['2xl'], backgroundColor: soft(t.colors.accent, t.dark), borderColor: t.colors.accent + (t.dark ? '3A' : '26') }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ gap: 2 }}>
                    <Eyebrow>Today&apos;s progress</Eyebrow>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                      <AppText variant="display" tone="accent" style={{ fontVariant: ['tabular-nums'] }}>
                        {doneCount}
                      </AppText>
                      <AppText variant="heading" tone="muted" style={{ marginBottom: 7 }}>
                        / {habits.length} done
                      </AppText>
                    </View>
                  </View>
                  <View style={[styles.summaryChip, { backgroundColor: chipBg(t.colors.accent) }]}>
                    <Ionicons name={pct >= 1 ? 'checkmark-done' : 'sunny-outline'} size={22} color={t.colors.accent} />
                  </View>
                </View>
                <View style={[styles.track, { backgroundColor: t.colors.accent + (t.dark ? '24' : '1A') }]}>
                  <View style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, height: '100%', backgroundColor: t.colors.accent, borderRadius: 999 }} />
                </View>
              </Card>
            ) : null}

            {habits.length === 0 ? (
              <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing['2xl'] }}>
                <View style={[styles.emptyChip, { backgroundColor: soft(t.colors.accent, t.dark) }]}>
                  <Ionicons name="repeat-outline" size={26} color={t.colors.accent} />
                </View>
                <AppText variant="heading" style={{ textAlign: 'center' }}>
                  No habits yet
                </AppText>
                <AppText variant="muted" tone="muted" style={{ textAlign: 'center', maxWidth: 240 }}>
                  Add your first habit and start building gentle daily streaks.
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
              <View style={{ gap: 2 }}>
                <Eyebrow>New habit</Eyebrow>
                <AppText variant="heading">Build a daily ritual</AppText>
              </View>
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
  const done = habit.done_today;
  return (
    <Card
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.xl,
        backgroundColor: done ? soft(tint, t.dark) : t.colors.surface,
        borderColor: done ? tint + (t.dark ? '3A' : '26') : t.colors.border,
      }}>
      <Pressable onPress={onToggle} disabled={busy} hitSlop={8}>
        <View
          style={[
            styles.check,
            done
              ? { backgroundColor: tint, borderColor: tint }
              : { backgroundColor: chipBg(tint), borderColor: tint + '55' },
          ]}>
          {done ? <Ionicons name="checkmark" size={18} color={t.colors.onBrand} /> : null}
        </View>
      </Pressable>
      <View style={{ flex: 1 }}>
        <AppText variant="body">{habit.title}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 }}>
          {habit.streak > 0 ? (
            <View style={[styles.streakPill, { backgroundColor: soft(t.colors.warning, t.dark) }]}>
              <Ionicons name="flame" size={12} color={t.colors.warning} />
              <AppText variant="caption" style={{ color: t.colors.warning }}>
                {habit.streak}
              </AppText>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {habit.last7.map((d) => (
              <View
                key={d.date}
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: radius.pill,
                  backgroundColor: d.done ? tint : tint + (t.dark ? '26' : '1F'),
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
  summaryChip: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChip: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  check: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
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
    gap: spacing.lg,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
  },
});
