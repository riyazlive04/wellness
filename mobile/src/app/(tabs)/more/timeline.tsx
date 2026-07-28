import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, View } from 'react-native';

import { AppText, Card, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { spacing } from '@/lib/theme';
import { wellnessApi, type TimelineItem } from '@/lib/wellness-api';

type IoniconName = keyof typeof Ionicons.glyphMap;

const ICON: Record<TimelineItem['kind'], IoniconName> = {
  goal: 'flag-outline',
  journal: 'create-outline',
  appointment: 'calendar-outline',
  milestone: 'trophy-outline',
  report: 'document-text-outline',
};

export default function Timeline() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['wellness', 'timeline'], queryFn: () => wellnessApi.getTimeline(), retry: 1 });
  const items = q.data ?? [];

  return (
    <Screen edges={[]}>
      <ScreenScroll refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : items.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name="time-outline" size={26} color={t.colors.textFaint} />
            <AppText variant="muted" tone="muted">Your activity will appear here.</AppText>
          </Card>
        ) : (
          items.map((it, i) => (
            <View key={`${it.kind}-${i}`} style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={ICON[it.kind] ?? 'ellipse-outline'} size={16} color={t.colors.accent} />
                </View>
                {i < items.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: t.colors.border, marginTop: 2 }} /> : null}
              </View>
              <Card style={{ flex: 1, gap: 2, marginBottom: spacing.sm }}>
                <AppText variant="body">{it.title}</AppText>
                {it.detail ? <AppText variant="muted" tone="muted">{it.detail}</AppText> : null}
                {it.at ? <AppText variant="caption" tone="faint">{new Date(it.at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</AppText> : null}
              </Card>
            </View>
          ))
        )}
      </ScreenScroll>
    </Screen>
  );
}
