import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { notificationsApi, type AppNotification } from '@/lib/notifications-api';
import { spacing } from '@/lib/theme';

export default function Notifications() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => notificationsApi.list(40), retry: 1 });
  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <Screen edges={[]}>
      <ScreenScroll refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        {unread > 0 ? (
          <Pressable onPress={() => markAll.mutate()} style={{ alignSelf: 'flex-end' }}>
            <AppText variant="muted" tone="accent">{markAll.isPending ? 'Marking…' : `Mark all read (${unread})`}</AppText>
          </Pressable>
        ) : null}

        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : items.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name="notifications-outline" size={26} color={t.colors.textFaint} />
            <AppText variant="muted" tone="muted">You&apos;re all caught up.</AppText>
          </Card>
        ) : (
          items.map((n) => <NotifRow key={n.id} n={n} onPress={() => !n.read_at && markOne.mutate(n.id)} />)
        )}
      </ScreenScroll>
    </Screen>
  );
}

function NotifRow({ n, onPress }: { n: AppNotification; onPress: () => void }) {
  const t = useTheme();
  const unread = !n.read_at;
  return (
    <Pressable onPress={onPress}>
      <Card style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', opacity: unread ? 1 : 0.7 }}>
        <View style={[styles.dot, { backgroundColor: unread ? t.colors.accent : t.colors.border }]} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="body" style={{ fontWeight: unread ? '600' : '400' }}>{n.title}</AppText>
          {n.body ? <AppText variant="muted" tone="muted">{n.body}</AppText> : null}
          <AppText variant="caption" tone="faint">{new Date(n.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</AppText>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
