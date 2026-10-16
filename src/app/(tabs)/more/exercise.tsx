import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Card, Eyebrow, GradientButton, KeyboardAwareScroll, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type ExerciseLog } from '@/lib/clients-api';
import { pickPhoto, putPhoto, type PickedPhoto } from '@/lib/photo-upload';
import { radius, spacing } from '@/lib/theme';

/** Common activities, as one tap. Anything else goes in the name field. */
const KINDS = ['Walking', 'Running', 'Yoga', 'Gym', 'Cycling', 'Swimming', 'Other'];
const MAX_PHOTOS = 6;

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  const today = todayISO();
  if (iso === today) return 'Today';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

/**
 * Daily exercise — the client photographs what they did, names it, and their
 * practice sees it. Photos are shrunk before upload and go straight to
 * storage with a signed URL; only the object key reaches the database.
 */
export default function ExerciseScreen() {
  const t = useTheme();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [time, setTime] = useState(nowHHMM());
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);

  const listQ = useQuery({
    queryKey: ['me', 'exercise'],
    queryFn: () => clientsApi.myExercise(60),
    retry: 1,
  });

  const reset = () => {
    setName(''); setKind(null); setDuration(''); setNotes('');
    setPhotos([]); setTime(nowHHMM());
  };

  const addPhoto = async (source: 'camera' | 'library') => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('That is plenty', `You can add up to ${MAX_PHOTOS} photos to one entry.`);
      return;
    }
    try {
      const picked = await pickPhoto(source);
      if (picked) setPhotos((p) => [...p, picked]);
    } catch (e) {
      Alert.alert('Could not add the photo', (e as Error).message);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      // Upload each photo first, then record the entry with the keys.
      const keys: Array<{ storage_key: string }> = [];
      for (const p of photos) {
        const ticket = await clientsApi.exerciseUploadTicket(p.name);
        await putPhoto(ticket.uploadUrl, p);
        keys.push({ storage_key: ticket.storageKey });
      }
      const mins = Number(duration);
      return clientsApi.addExercise({
        name: name.trim(),
        kind: kind ?? undefined,
        performed_on: todayISO(),
        performed_at: time || undefined,
        duration_min: Number.isFinite(mins) && mins > 0 ? Math.round(mins) : undefined,
        notes: notes.trim() || undefined,
        photos: keys,
      });
    },
    onSuccess: async () => {
      reset();
      await qc.invalidateQueries({ queryKey: ['me', 'exercise'] });
      Alert.alert('Saved', 'Your nutritionist can see it now.');
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  const onSave = () => {
    if (!name.trim()) {
      Alert.alert('What did you do?', 'Give it a name, like “Morning walk”.');
      return;
    }
    setBusy(true);
    save.mutate(undefined, { onSettled: () => setBusy(false) });
  };

  const logs = listQ.data ?? [];

  return (
    <Screen edges={[]}>
      <KeyboardAwareScroll>
        <Eyebrow>Daily exercise</Eyebrow>
        <AppText variant="title">What did you do today?</AppText>
        <AppText variant="muted" tone="muted">
          Add a photo and a few words. Your nutritionist sees it straight away.
        </AppText>

        <Card style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <AppText variant="heading">Exercise</AppText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Morning walk, leg day, yoga…"
              placeholderTextColor={t.colors.textFaint}
              style={[styles.input, { borderColor: t.colors.border, color: t.colors.text, backgroundColor: t.colors.surface }]}
            />
          </View>

          <View style={styles.chips}>
            {KINDS.map((k) => {
              const on = kind === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setKind(on ? null : k)}
                  style={[styles.chip, { borderColor: on ? t.colors.accent : t.colors.border, backgroundColor: on ? t.colors.surfaceStrong : 'transparent' }]}>
                  <AppText variant="caption" tone={on ? 'accent' : 'muted'}>{k}</AppText>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <AppText variant="caption" tone="muted">Time</AppText>
              <TextInput
                value={time}
                onChangeText={setTime}
                placeholder="07:30"
                placeholderTextColor={t.colors.textFaint}
                style={[styles.input, { borderColor: t.colors.border, color: t.colors.text, backgroundColor: t.colors.surface }]}
              />
            </View>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <AppText variant="caption" tone="muted">Minutes (optional)</AppText>
              <TextInput
                value={duration}
                onChangeText={(v) => setDuration(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="30"
                placeholderTextColor={t.colors.textFaint}
                style={[styles.input, { borderColor: t.colors.border, color: t.colors.text, backgroundColor: t.colors.surface }]}
              />
            </View>
          </View>

          <View style={{ gap: spacing.xs }}>
            <AppText variant="caption" tone="muted">Notes (optional)</AppText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="How it felt, where you went…"
              placeholderTextColor={t.colors.textFaint}
              style={[styles.input, { minHeight: 76, textAlignVertical: 'top', borderColor: t.colors.border, color: t.colors.text, backgroundColor: t.colors.surface }]}
            />
          </View>

          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {photos.map((p, i) => (
                <Pressable
                  key={p.uri}
                  onLongPress={() => setPhotos((list) => list.filter((_, j) => j !== i))}
                  style={styles.thumbWrap}>
                  <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          )}
          {photos.length > 0 && (
            <AppText variant="caption" tone="muted">Long-press a photo to remove it.</AppText>
          )}

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() => void addPhoto('camera')}
              style={[styles.ghost, { borderColor: t.colors.border }]}>
              <AppText variant="caption">Take photo</AppText>
            </Pressable>
            <Pressable
              onPress={() => void addPhoto('library')}
              style={[styles.ghost, { borderColor: t.colors.border }]}>
              <AppText variant="caption">Choose photo</AppText>
            </Pressable>
          </View>

          <GradientButton
            label={busy ? 'Saving…' : 'Save today’s exercise'}
            onPress={onSave}
            loading={busy}
            disabled={busy}
          />
        </Card>

        <AppText variant="heading" style={{ marginTop: spacing.sm }}>Recent</AppText>
        {listQ.isLoading ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : logs.length === 0 ? (
          <Card>
            <AppText variant="muted" tone="muted">
              Nothing logged yet. Your first entry will appear here.
            </AppText>
          </Card>
        ) : (
          logs.map((log) => <LogCard key={log.id} log={log} />)
        )}
      </KeyboardAwareScroll>
    </Screen>
  );
}

function LogCard({ log }: { log: ExerciseLog }) {
  const t = useTheme();
  const qc = useQueryClient();

  // Signed URLs expire in an hour, so they're fetched per photo and cached.
  const urls = useQueries({
    queries: log.photos.map((p) => ({
      queryKey: ['me', 'exercise-photo', p.id],
      queryFn: () => clientsApi.exercisePhotoUrl(p.id),
      staleTime: 5 * 60_000,
    })),
  });

  const remove = useMutation({
    mutationFn: () => clientsApi.deleteExercise(log.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'exercise'] }),
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  const meta = [
    log.performed_at,
    log.duration_min ? `${log.duration_min} min` : null,
    log.kind,
  ].filter(Boolean).join(' · ');

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{log.name}</AppText>
          <AppText variant="caption" tone="muted">
            {dayLabel(log.performed_on)}{meta ? ` · ${meta}` : ''}
          </AppText>
        </View>
        <Pressable
          onPress={() =>
            Alert.alert('Delete this entry?', 'The photos go too.', [
              { text: 'Keep', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
            ])
          }
          hitSlop={10}>
          <AppText variant="caption" tone="muted">Delete</AppText>
        </Pressable>
      </View>

      {log.notes ? <AppText variant="muted" tone="muted">{log.notes}</AppText> : null}

      {log.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {log.photos.map((p, i) => {
            const url = urls[i]?.data?.url;
            return (
              <View key={p.id} style={[styles.thumbWrap, { backgroundColor: t.colors.surfaceStrong }]}>
                {url ? <Image source={{ uri: url }} style={styles.thumb} contentFit="cover" /> : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ghost: {
    flex: 1,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  thumbWrap: { width: 92, height: 92, borderRadius: radius.md, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
});
