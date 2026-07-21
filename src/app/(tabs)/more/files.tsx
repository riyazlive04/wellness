import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Linking, Pressable, RefreshControl, View } from 'react-native';

import { AppText, Card, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type FileItem } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

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
  const q = useQuery({ queryKey: ['me', 'files'], queryFn: () => clientsApi.myFiles(), retry: 1 });
  const files = [...(q.data ?? [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  return (
    <Screen edges={[]}>
      <ScreenScroll refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : files.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name="folder-outline" size={26} color={t.colors.textFaint} />
            <AppText variant="muted" tone="muted">No files shared yet.</AppText>
          </Card>
        ) : (
          files.map((f) => <FileRow key={f.id} f={f} />)
        )}
      </ScreenScroll>
    </Screen>
  );
}

function FileRow({ f }: { f: FileItem }) {
  const t = useTheme();
  const fromCoach = f.uploaded_by === 'workspace';
  return (
    <Pressable onPress={() => f.file_url && Linking.openURL(f.file_url)}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: t.colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={iconFor(f.file_type)} size={20} color={t.colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="body" numberOfLines={1}>{f.file_name}</AppText>
          <AppText variant="caption" tone="muted">
            {fromCoach ? 'From your coach' : 'You uploaded'}
            {humanSize(f.file_size) ? ` · ${humanSize(f.file_size)}` : ''}
          </AppText>
        </View>
        <Ionicons name="download-outline" size={18} color={t.colors.textFaint} />
      </Card>
    </Pressable>
  );
}
