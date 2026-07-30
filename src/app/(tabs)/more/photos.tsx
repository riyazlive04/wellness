import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type ProgressPhoto } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

const ANGLES = ['front', 'side', 'back'] as const;
type Angle = (typeof ANGLES)[number];

/** Append an alpha byte to a 6-digit hex color (or pass through others unchanged). */
function alpha(hex: string, a: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const clamped = Math.max(0, Math.min(1, a));
  return hex + Math.round(clamped * 255).toString(16).padStart(2, '0');
}

export default function Photos() {
  const t = useTheme();
  const qc = useQueryClient();
  const [angle, setAngle] = useState<Angle>('front');
  const [busy, setBusy] = useState(false);

  const photosQ = useQuery({ queryKey: ['me', 'photos'], queryFn: () => clientsApi.progressPhotos(), retry: 1 });
  const photos = [...(photosQ.data ?? [])].sort((a, b) => +new Date(b.taken_at) - +new Date(a.taken_at));

  // Signed download URLs (storage keys aren't directly viewable).
  const urlQs = useQueries({
    queries: photos.slice(0, 24).map((p) => ({
      queryKey: ['me', 'photos', 'url', p.id],
      queryFn: () => clientsApi.photoDownload(p.id),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });
  const urlFor = (i: number) => urlQs[i]?.data?.url;

  const deleteMut = useMutation({
    mutationFn: (id: string) => clientsApi.deletePhoto(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'photos'] }),
  });

  const pickAndUpload = async (source: 'camera' | 'library') => {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: 'images' })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: 'images' });
    if (res.canceled || !res.assets?.[0]) return;

    const asset = res.assets[0];
    setBusy(true);
    try {
      const name = asset.fileName ?? `progress-${Date.now()}.jpg`;
      const mime = asset.mimeType ?? 'image/jpeg';
      // 1) ticket → 2) PUT the bytes to the signed URL → 3) register the photo
      const ticket = await clientsApi.photoUploadTicket(name);
      const fileRes = await fetch(asset.uri);
      const blob = await fileRes.blob();
      const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mime }, body: blob });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await clientsApi.addPhoto({ storage_key: ticket.storageKey, angle });
      qc.invalidateQueries({ queryKey: ['me', 'photos'] });
    } catch (e) {
      Alert.alert('Could not upload', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (p: ProgressPhoto) =>
    Alert.alert('Delete photo?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(p.id) },
    ]);

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={photosQ.isRefetching} onRefresh={() => photosQ.refetch()} tintColor={t.colors.accent} />}>
        <View style={{ gap: 4, marginTop: spacing.xs }}>
          <Eyebrow>Your journey</Eyebrow>
          <AppText variant="title">Progress photos</AppText>
        </View>

        <Card style={{ gap: spacing.md, borderRadius: radius['2xl'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={[styles.headChip, { backgroundColor: alpha(t.colors.primary, t.dark ? 0.2 : 0.12) }]}>
              <Ionicons name="camera-outline" size={18} color={t.colors.primary} />
            </View>
            <Eyebrow>New photo</Eyebrow>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {ANGLES.map((a) => {
              const active = a === angle;
              return (
                <Pressable
                  key={a}
                  onPress={() => setAngle(a)}
                  style={[
                    styles.angle,
                    {
                      backgroundColor: active ? alpha(t.colors.primary, t.dark ? 0.2 : 0.12) : t.colors.surfaceStrong,
                      borderColor: active ? t.colors.primary : 'transparent',
                    },
                  ]}>
                  <AppText variant="caption" tone={active ? 'accent' : 'muted'} style={{ textTransform: 'capitalize' }}>
                    {a}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <GradientButton label={busy ? 'Uploading…' : 'Take photo'} onPress={() => pickAndUpload('camera')} loading={busy} />
          <GhostButton label="Choose from library" onPress={() => pickAndUpload('library')} />
        </Card>

        {photosQ.isLoading ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : photos.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing['2xl'], borderRadius: radius['2xl'] }}>
            <View style={[styles.emptyIcon, { backgroundColor: alpha(t.colors.primary, t.dark ? 0.18 : 0.1) }]}>
              <Ionicons name="images-outline" size={26} color={t.colors.primary} />
            </View>
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
              No progress photos yet. Take one to start your visual timeline.
            </AppText>
          </Card>
        ) : (
          <View style={styles.grid}>
            {photos.slice(0, 24).map((p, i) => {
              const url = urlFor(i);
              return (
                <Pressable key={p.id} onLongPress={() => confirmDelete(p)} style={styles.cell}>
                  <View style={[styles.thumb, { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border }]}>
                    {url ? (
                      <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <ActivityIndicator size="small" color={t.colors.textFaint} />
                    )}
                  </View>
                  <View style={[styles.dateChip, { backgroundColor: alpha(t.colors.primary, t.dark ? 0.18 : 0.1) }]}>
                    <AppText variant="caption" style={{ color: t.colors.primary, textTransform: 'capitalize' }} numberOfLines={1}>
                      {p.angle ? `${p.angle} · ` : ''}
                      {new Date(p.taken_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        {photos.length ? (
          <AppText variant="caption" tone="faint" style={{ textAlign: 'center' }}>
            Long-press a photo to delete it.
          </AppText>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  angle: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headChip: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  cell: { width: '31%', gap: 6 },
  thumb: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
