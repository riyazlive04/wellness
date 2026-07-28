import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, View } from 'react-native';

import { AppText, Card, GradientButton, Screen, ScreenScroll } from '@/components/ui';
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

function humanSize(bytes: number | null): string {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
}

export default function Files() {
  const t = useTheme();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const q = useQuery({ queryKey: ['me', 'files'], queryFn: () => clientsApi.myFiles(), retry: 1 });
  const files = [...(q.data ?? [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  const deleteMut = useMutation({
    mutationFn: (id: string) => clientsApi.deleteMyFile(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me', 'files'] }),
    onError: (err: Error) => Alert.alert('Could not delete', err.message),
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
    try {
      const name = asset.name || `file-${Date.now()}`;
      const mime = asset.mimeType ?? 'application/octet-stream';
      const ticket = await clientsApi.fileUploadTicket(name);
      const fileRes = await fetch(asset.uri);
      const blob = await fileRes.blob();
      const put = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: blob,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await clientsApi.addMyFile({
        storage_key: ticket.storageKey,
        file_name: name,
        file_type: mime,
        file_size: asset.size ?? blob.size,
      });
      void qc.invalidateQueries({ queryKey: ['me', 'files'] });
    } catch (e) {
      Alert.alert('Could not upload', (e as Error).message);
    } finally {
      setBusy(false);
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
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={t.colors.accent} />
        }>
        <GradientButton label={busy ? 'Uploading…' : '＋ Upload file'} onPress={() => void upload()} loading={busy} />

        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : files.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name="folder-outline" size={26} color={t.colors.textFaint} />
            <AppText variant="muted" tone="muted">
              No files shared yet.
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
}: {
  f: FileItem;
  onOpen: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const t = useTheme();
  const fromCoach = f.uploaded_by === 'workspace';
  return (
    <Pressable onPress={onOpen} onLongPress={onDelete}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            backgroundColor: t.colors.surfaceStrong,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons name={iconFor(f.file_type)} size={20} color={t.colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={1}>
            {f.file_name}
          </AppText>
          <AppText variant="caption" tone="muted">
            {fromCoach ? 'From coach' : 'Uploaded by you'}
            {f.file_size ? ` · ${humanSize(f.file_size)}` : ''}
          </AppText>
        </View>
        {deleting ? <ActivityIndicator size="small" color={t.colors.textMuted} /> : null}
      </Card>
    </Pressable>
  );
}
