import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { brand, radius, spacing, status } from '@/lib/theme';
import { wellnessApi, type TimelineItem } from '@/lib/wellness-api';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Each activity kind gets its own soft wellness tint + icon chip.
const KIND_META: Record<TimelineItem['kind'], { icon: IoniconName; tint: string }> = {
  goal: { icon: 'flag-outline', tint: brand.teal },
  journal: { icon: 'create-outline', tint: '#7C6BD6' },
  appointment: { icon: 'calendar-outline', tint: brand.blue },
  milestone: { icon: 'trophy-outline', tint: status.warning },
  report: { icon: 'document-text-outline', tint: status.success },
};

const fill = (color: string, dark: boolean) => color + (dark ? '2E' : '1A');
const chipBg = (color: string) => color + '33';

export default function Timeline() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['wellness', 'timeline'], queryFn: () => wellnessApi.getTimeline(), retry: 1 });
  const items = q.data ?? [];

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />
        }>
        <View style={{ gap: 4 }}>
          <Eyebrow>Your journey</Eyebrow>
          <AppText variant="title">Activity timeline</AppText>
        </View>

        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : items.length === 0 ? (
          <Card
            style={{
              alignItems: 'center',
              gap: spacing.md,
              paddingVertical: spacing['2xl'],
              backgroundColor: fill(brand.teal, t.dark),
              borderColor: brand.teal + (t.dark ? '33' : '24'),
            }}>
            <View style={[styles.emptyChip, { backgroundColor: chipBg(brand.teal) }]}>
              <Ionicons name="time-outline" size={26} color={brand.teal} />
            </View>
            <AppText variant="heading">Nothing here yet</AppText>
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
              Your goals, journals and milestones will appear here as you go.
            </AppText>
          </Card>
        ) : (
          items.map((it, i) => {
            const meta = KIND_META[it.kind] ?? { icon: 'ellipse-outline' as IoniconName, tint: t.colors.accent };
            const last = i === items.length - 1;
            return (
              <View key={`${it.kind}-${i}`} style={{ flexDirection: 'row', gap: spacing.md }}>
                {/* Soft rail with a tinted type chip */}
                <View style={{ alignItems: 'center' }}>
                  <View style={[styles.railChip, { backgroundColor: fill(meta.tint, t.dark) }]}>
                    <Ionicons name={meta.icon} size={17} color={meta.tint} />
                  </View>
                  {!last ? <View style={[styles.rail, { backgroundColor: t.colors.border }]} /> : null}
                </View>
                <Card style={{ flex: 1, gap: spacing.xs, marginBottom: spacing.sm }}>
                  <AppText variant="body">{it.title}</AppText>
                  {it.detail ? (
                    <AppText variant="muted" tone="muted">
                      {it.detail}
                    </AppText>
                  ) : null}
                  {it.at ? (
                    <View style={[styles.datePill, { backgroundColor: fill(meta.tint, t.dark) }]}>
                      <Ionicons name="calendar-outline" size={11} color={meta.tint} />
                      <AppText variant="caption" style={{ color: meta.tint }}>
                        {new Date(it.at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </AppText>
                    </View>
                  ) : null}
                </Card>
              </View>
            );
          })
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyChip: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railChip: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rail: {
    width: 2,
    flex: 1,
    marginTop: 2,
    borderRadius: 999,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: 2,
  },
});
