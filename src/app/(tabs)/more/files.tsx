import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type FileItem } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

const MAX_BYTES = 25 * 1024 * 1024;

type IoniconName = keyof typeof Ionicons.glyphMap;

function iconFor(type: string | null): IoniconName {
  if (!type) return 'document-outline';
  if (type.startsWith('image/')) return 'image-outline';
  if (type.includes('pdf')) return 'document-text-outline';
  if (type.startsWith('video/')) return 'videocam-outline';
  return 'document-outline';
}

/** Distinct pastel tint per file family so the list reads at a glance. */
function tintFor(type: string | null, t: ReturnType<typeof useTheme>): string {
  if (!type) return t.colors.textMuted;
  if (type.startsWith('image/')) return t.colors.success;
  if (type.includes('pdf')) return t.colors.danger;
  if (type.startsWith('video/')) return t.colors.primary;
  if (type.includes('word') || type.includes('doc')) return t.colors.accent;
  return t.colors.warning;
}

function humanSize(bytes: number | null): string {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(+d)) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Files() {
  const t = useTheme();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  /** 0-100 while a file is going up, so a slow link does not look like a hang. */
  const [progress, setProgress] = useState(0);
  /** Name of the file just uploaded, highlighted briefly so it is findable. */
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const q = useQuery({ queryKey: ['me', 'files'], queryFn: () => clientsApi.myFiles(), retry: 1 });
  const files = [...(q.data ?? [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  const deleteMut = useMutation({
    mutationFn: (id: string) => clientsApi.deleteMyFile(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me', 'files'] }),
    onError: (err: Error) => Alert.alert('Could not delete', err.message),
  });

  /**
   * PUT the file to storage, reporting progress.
   *
   * XMLHttpRequest rather than fetch: fetch cannot report upload progress, and
   * a report over mobile data can take a minute. A spinner with no number
   * looks indistinguishable from a hang, which is what people were seeing.
   */
  const putWithProgress = (url: string, blob: Blob, mime: string) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', mime);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
      xhr.ontimeout = () => reject(new Error('Upload timed out.'));
      xhr.send(blob);
    });

  const upload = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    if (asset.size != null && asset.size > MAX_BYTES) {
      Alert.alert('Too large', 'Keep files under 25 MB.');
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      const name = asset.name || `file-${Date.now()}`;
      const mime = asset.mimeType ?? 'application/octet-stream';
      const ticket = await clientsApi.fileUploadTicket(name);
      const fileRes = await fetch(asset.uri);
      const blob = await fileRes.blob();
      await putWithProgress(ticket.uploadUrl, blob, mime);
      await clientsApi.addMyFile({
        storage_key: ticket.storageKey,
        file_name: name,
        file_type: mime,
        file_size: asset.size ?? blob.size,
      });
      // Mark it so the new row is obvious in a long list, then let the
      // highlight fade - it is a confirmation, not a permanent state.
      setJustAdded(name);
      setTimeout(() => setJustAdded(null), 6000);
      void qc.invalidateQueries({ queryKey: ['me', 'files'] });
      // Said out loud, because the whole point of uploading a report is
      // knowing the nutritionist got it.
      Alert.alert('Uploaded', `${name} was sent to your nutritionist.`);
    } catch (e) {
      Alert.alert('Could not upload', (e as Error).message);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const openFile = async (f: FileItem) => {
    try {
      const { url } = await clientsApi.signFile(f.id);
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Could not open', (e as Error).message);
    }
  };

  const confirmDelete = (f: FileItem) =>
    Alert.alert('Delete file?', f.file_name, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(f.id) },
    ]);

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={t.colors.accent} />
        }>
        <View style={{ gap: 4 }}>
          <Eyebrow>Shared files</Eyebrow>
          <AppText variant="title">Documents & media</AppText>
        </View>

        <GradientButton
          label={busy ? (progress > 0 ? `Uploading… ${progress}%` : 'Preparing…') : '＋ Upload file'}
          onPress={() => void upload()}
          loading={busy}
        />

        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : files.length === 0 ? (
          <Card
            style={{
              alignItems: 'center',
              gap: spacing.sm,
              paddingVertical: spacing['2xl'],
              borderRadius: radius['2xl'],
              backgroundColor: t.colors.accent + (t.dark ? '14' : '0D'),
              borderColor: t.colors.accent + (t.dark ? '2E' : '1F'),
            }}>
            <View style={[styles.iconChip, { width: 52, height: 52, borderRadius: radius.xl, backgroundColor: t.colors.accent + (t.dark ? '2E' : '1F') }]}>
              <Ionicons name="folder-open-outline" size={26} color={t.colors.accent} />
            </View>
            <AppText variant="heading">No files yet</AppText>
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
              Files you upload or your coach shares will appear here.
            </AppText>
          </Card>
        ) : (
          files.map((f) => (
            <FileRow
              key={f.id}
              f={f}
              onOpen={() => void openFile(f)}
              onDelete={f.uploaded_by === 'client' ? () => confirmDelete(f) : undefined}
              deleting={deleteMut.isPending && deleteMut.variables === f.id}
              justAdded={f.file_name === justAdded}
            />
          ))
        )}
      </ScreenScroll>
    </Screen>
  );
}

function FileRow({
  f,
  onOpen,
  onDelete,
  deleting,
  justAdded,
}: {
  f: FileItem;
  onOpen: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  /** Just uploaded: ringed briefly so it is findable in a long list. */
  justAdded?: boolean;
}) {
  const t = useTheme();
  const fromCoach = f.uploaded_by === 'workspace';
  const tint = tintFor(f.file_type, t);
  const date = shortDate(f.created_at);
  const size = humanSize(f.file_size);
  return (
    <Pressable onPress={onOpen} onLongPress={onDelete} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          borderRadius: radius.xl,
          ...(justAdded
            ? { borderWidth: 1.5, borderColor: t.colors.primary }
            : null),
        }}>
        <View style={[styles.iconChip, { backgroundColor: tint + (t.dark ? '2E' : '1A') }]}>
          <Ionicons name={iconFor(f.file_type)} size={20} color={tint} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <AppText variant="heading" numberOfLines={1}>
            {f.file_name}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs }}>
            <View style={[styles.pill, { backgroundColor: (fromCoach ? t.colors.accent : t.colors.textMuted) + (t.dark ? '24' : '14') }]}>
              <Ionicons
                name={fromCoach ? 'person-outline' : 'cloud-upload-outline'}
                size={11}
                color={fromCoach ? t.colors.accent : t.colors.textMuted}
              />
              <AppText variant="caption" style={{ color: fromCoach ? t.colors.accent : t.colors.textMuted }}>
                {fromCoach ? 'From coach' : 'By you'}
              </AppText>
            </View>
            {date ? (
              <View style={[styles.pill, { backgroundColor: t.colors.surfaceStrong }]}>
                <Ionicons name="calendar-outline" size={11} color={t.colors.textFaint} />
                <AppText variant="caption" tone="faint">{date}</AppText>
              </View>
            ) : null}
            {size ? (
              <View style={[styles.pill, { backgroundColor: t.colors.surfaceStrong }]}>
                <AppText variant="caption" tone="faint">{size}</AppText>
              </View>
            ) : null}
          </View>
        </View>
        {deleting ? (
          <ActivityIndicator size="small" color={t.colors.textMuted} />
        ) : (
          <View style={[styles.chevron, { backgroundColor: t.colors.surfaceStrong }]}>
            <Ionicons name="open-outline" size={15} color={t.colors.accent} />
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
