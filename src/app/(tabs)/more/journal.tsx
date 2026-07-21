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
        refreshControl={
          <RefreshControl refreshing={entriesQ.isRefetching} onRefresh={() => entriesQ.refetch()} tintColor={t.colors.accent} />
        }>
        {entriesQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            <GradientButton label="＋ New entry" onPress={() => setAdding(true)} />

            {entries.length === 0 ? (
              <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
                <Ionicons name="create-outline" size={26} color={t.colors.textFaint} />
                <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                  Your journal is empty. Reflect on how today went.
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
            <AppText variant="heading">New entry</AppText>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="What's on your mind?"
              placeholderTextColor={t.colors.textFaint}
              multiline
              autoFocus
              style={[styles.input, { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border }]}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {MOODS.map((m, i) => (
                <Pressable
                  key={m}
                  onPress={() => setMood(i + 1)}
                  style={[
                    styles.moodBtn,
                    mood === i + 1 && { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.accent },
                  ]}>
                  <AppText style={{ fontSize: 24 }}>{m}</AppText>
                </Pressable>
              ))}
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
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Eyebrow>{formatDate(entry.entry_date)}</Eyebrow>
        {entry.mood ? <AppText style={{ fontSize: 18 }}>{MOODS[entry.mood - 1]}</AppText> : null}
      </View>
      {entry.title ? <AppText variant="heading">{entry.title}</AppText> : null}
      <AppText variant="body" tone="muted">
        {entry.body}
      </AppText>

      {entry.ai_reflection ? (
        <View style={[styles.reflection, { backgroundColor: t.colors.accent + '14', borderColor: t.colors.accent + '33' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Ionicons name="sparkles" size={13} color={t.colors.accent} />
            <AppText variant="caption" tone="accent" style={{ textTransform: 'uppercase' }}>
              Reflection
            </AppText>
          </View>
          <AppText variant="muted" tone="muted">
            {entry.ai_reflection}
          </AppText>
        </View>
      ) : (
        <Pressable
          onPress={onReflect}
          disabled={reflecting}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 2 }}>
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
    gap: spacing.md,
  },
  input: {
    minHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  moodBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reflection: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
