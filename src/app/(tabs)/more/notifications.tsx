import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { notificationsApi, type AppNotification } from '@/lib/notifications-api';
import { brand, radius, spacing, status } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Soft pastel fill alphas: lighter in light mode, a touch stronger in dark so
// the tint reads on the ink canvas (matching the polished More/Today screens).
const chipBg = (color: string, dark: boolean) => color + (dark ? '2E' : '1A'); // ~0.18 / ~0.10

// Map a notification type to a warm icon chip. Keyword-matched so new backend
// types still land on a sensible icon instead of a bare dot.
function visualFor(type: string): { icon: IoniconName; tint: string } {
  const k = (type || '').toLowerCase();
  if (k.includes('message') || k.includes('chat') || k.includes('reply')) return { icon: 'chatbubble-ellipses-outline', tint: brand.blue };
  if (k.includes('appointment') || k.includes('meeting') || k.includes('call')) return { icon: 'calendar-outline', tint: brand.teal };
  if (k.includes('reminder') || k.includes('due') || k.includes('task')) return { icon: 'alarm-outline', tint: status.warning };
  if (k.includes('meal') || k.includes('food') || k.includes('nutrition')) return { icon: 'restaurant-outline', tint: '#3FAE88' };
  if (k.includes('program') || k.includes('plan')) return { icon: 'clipboard-outline', tint: '#7C6BD6' };
  if (k.includes('order') || k.includes('shop') || k.includes('payment') || k.includes('invoice')) return { icon: 'bag-outline', tint: brand.cyan };
  if (k.includes('goal') || k.includes('achievement') || k.includes('streak')) return { icon: 'trophy-outline', tint: status.warning };
  if (k.includes('report') || k.includes('file') || k.includes('document')) return { icon: 'document-text-outline', tint: brand.blue };
  return { icon: 'notifications-outline', tint: brand.teal };
}

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
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        <View style={styles.header}>
          <Eyebrow>Notifications</Eyebrow>
          {unread > 0 ? (
            <Pressable
              onPress={() => markAll.mutate()}
              hitSlop={8}
              style={({ pressed }) => [
                styles.markAll,
                { backgroundColor: chipBg(brand.teal, t.dark), opacity: pressed ? 0.6 : 1 },
              ]}>
              <Ionicons name="checkmark-done-outline" size={15} color={t.colors.primary} />
              <AppText variant="caption" tone="accent">
                {markAll.isPending ? 'Marking…' : `Mark all read (${unread})`}
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : items.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing['2xl'] }}>
            <View style={[styles.emptyChip, { backgroundColor: chipBg(brand.teal, t.dark) }]}>
              <Ionicons name="notifications-outline" size={26} color={t.colors.primary} />
            </View>
            <AppText variant="heading">You&apos;re all caught up</AppText>
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
              New messages, reminders and updates will show up here.
            </AppText>
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {items.map((n) => (
              <NotifRow key={n.id} n={n} onPress={() => !n.read_at && markOne.mutate(n.id)} />
            ))}
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function NotifRow({ n, onPress }: { n: AppNotification; onPress: () => void }) {
  const t = useTheme();
  const unread = !n.read_at;
  const { icon, tint } = visualFor(n.type);
  return (
    <Pressable onPress={onPress}>
      <Card style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', opacity: unread ? 1 : 0.72 }}>
        <View style={[styles.chip, { backgroundColor: chipBg(tint, t.dark) }]}>
          <Ionicons name={icon} size={19} color={tint} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="body" style={{ flex: 1, fontWeight: unread ? '600' : '400' }}>
              {n.title}
            </AppText>
            {unread ? <View style={[styles.dot, { backgroundColor: t.colors.accent }]} /> : null}
          </View>
          {n.body ? (
            <AppText variant="muted" tone="muted">
              {n.body}
            </AppText>
          ) : null}
          <AppText variant="caption" tone="faint">
            {new Date(n.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  markAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  chip: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChip: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
