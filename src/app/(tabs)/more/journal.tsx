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
import { wellnessApi, type JournalEntry } from '@/lib/wellness-api';
import { radius, spacing } from '@/lib/theme';

const MOODS = ['😔', '😕', '🙂', '😊', '🤩'];
const MOOD_WORDS = ['Low', 'Meh', 'Okay', 'Good', 'Great'];

// Soft pastel fill for a brand/status hex — whisper-light in light mode, a touch
// warmer in dark so the tint reads on the ink canvas.
const soft = (hex: string, dark: boolean) => hex + (dark ? '2E' : '1A'); // ~0.18 / ~0.10
const chipBg = (hex: string) => hex + '33'; // ~0.20

export default function Journal() {
  const t = useTheme();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<number | null>(null);

  const entriesQ = useQuery({ queryKey: ['wellness', 'journal'], queryFn: () => wellnessApi.listJournal(), retry: 1 });

  const createMut = useMutation({
    mutationFn: () => wellnessApi.createJournal({ body: body.trim(), mood: mood ?? undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wellness', 'journal'] });
      setAdding(false);
      setBody('');
      setMood(null);
    },
  });
  const reflectMut = useMutation({
    mutationFn: (id: string) => wellnessApi.reflectJournal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wellness', 'journal'] }),
  });

  const entries = entriesQ.data ?? [];

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={entriesQ.isRefetching} onRefresh={() => entriesQ.refetch()} tintColor={t.colors.accent} />
        }>
        {entriesQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            {/* ── Friendly header ─────────────────────────────────────── */}
            <View style={{ gap: 4, marginTop: spacing.xs }}>
              <Eyebrow>Reflect</Eyebrow>
              <AppText variant="title">Journal</AppText>
            </View>

            <GradientButton label="＋ New entry" onPress={() => setAdding(true)} />

            {entries.length === 0 ? (
              <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing['2xl'] }}>
                <View style={[styles.emptyChip, { backgroundColor: soft(t.colors.accent, t.dark) }]}>
                  <Ionicons name="create-outline" size={26} color={t.colors.accent} />
                </View>
                <AppText variant="heading" style={{ textAlign: 'center' }}>
                  Your journal is empty
                </AppText>
                <AppText variant="muted" tone="muted" style={{ textAlign: 'center', maxWidth: 240 }}>
                  Take a quiet moment to reflect on how today went.
                </AppText>
              </Card>
            ) : (
              entries.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  onReflect={() => reflectMut.mutate(e.id)}
                  reflecting={reflectMut.isPending && reflectMut.variables === e.id}
                />
              ))
            )}
          </>
        )}
      </ScreenScroll>

      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: t.colors.canvas, borderColor: t.colors.border }]}>
            <View style={{ gap: 2 }}>
              <Eyebrow>New entry</Eyebrow>
              <AppText variant="heading">What&apos;s on your mind?</AppText>
            </View>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Write a few lines about your day…"
              placeholderTextColor={t.colors.textFaint}
              multiline
              autoFocus
              style={[styles.input, { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border }]}
            />
            <View style={{ gap: spacing.sm }}>
              <AppText variant="caption" tone="muted">
                How are you feeling?
              </AppText>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {MOODS.map((m, i) => {
                  const active = mood === i + 1;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setMood(i + 1)}
                      style={[
                        styles.moodBtn,
                        {
                          backgroundColor: active
                            ? soft(t.colors.accent, t.dark)
                            : t.colors.accent + (t.dark ? '14' : '0D'),
                          borderColor: active ? t.colors.accent : 'transparent',
                        },
                      ]}>
                      <AppText style={{ fontSize: 24 }}>{m}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <GhostButton label="Cancel" onPress={() => setAdding(false)} style={{ flex: 1 }} />
              <GradientButton
                label="Save"
                onPress={() => body.trim() && createMut.mutate()}
                loading={createMut.isPending}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function EntryCard({ entry, onReflect, reflecting }: { entry: JournalEntry; onReflect: () => void; reflecting: boolean }) {
  const t = useTheme();
  return (
    <Card style={{ gap: spacing.sm, borderRadius: radius.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Eyebrow>{formatDate(entry.entry_date)}</Eyebrow>
        {entry.mood ? (
          <View style={[styles.moodPill, { backgroundColor: soft(t.colors.accent, t.dark) }]}>
            <AppText style={{ fontSize: 15 }}>{MOODS[entry.mood - 1]}</AppText>
            <AppText variant="caption" tone="accent">
              {MOOD_WORDS[entry.mood - 1]}
            </AppText>
          </View>
        ) : null}
      </View>
      {entry.title ? <AppText variant="heading">{entry.title}</AppText> : null}
      <AppText variant="body" tone="muted" style={{ lineHeight: 21 }}>
        {entry.body}
      </AppText>

      {entry.ai_reflection ? (
        <View style={[styles.reflection, { backgroundColor: soft(t.colors.accent, t.dark), borderColor: t.colors.accent + '33' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <View style={[styles.reflectChip, { backgroundColor: chipBg(t.colors.accent) }]}>
              <Ionicons name="sparkles" size={12} color={t.colors.accent} />
            </View>
            <AppText variant="caption" tone="accent" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Reflection
            </AppText>
          </View>
          <AppText variant="muted" tone="muted" style={{ lineHeight: 20 }}>
            {entry.ai_reflection}
          </AppText>
        </View>
      ) : (
        <Pressable
          onPress={onReflect}
          disabled={reflecting}
          style={[styles.reflectCta, { backgroundColor: soft(t.colors.accent, t.dark), borderColor: t.colors.accent + '2E' }]}>
          {reflecting ? (
            <ActivityIndicator size="small" color={t.colors.accent} />
          ) : (
            <Ionicons name="sparkles-outline" size={15} color={t.colors.accent} />
          )}
          <AppText variant="muted" tone="accent">
            {reflecting ? 'Reflecting…' : 'Get AI reflection'}
          </AppText>
        </Pressable>
      )}
    </Card>
  );
}

function formatDate(yyyymmdd: string): string {
  const d = new Date(yyyymmdd);
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  emptyChip: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: spacing.xl,
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  },
  input: {
    minHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  moodBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  reflection: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: 2,
  },
  reflectChip: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reflectCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
