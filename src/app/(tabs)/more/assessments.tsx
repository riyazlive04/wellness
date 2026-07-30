import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type AssessmentCard } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Each assessment type gets its own soft accent so the list reads as a warm,
// designed set of wellness cards (matching the Today screen's tinted tiles).
const TYPE_META: Record<string, { label: string; icon: IoniconName; tint: string }> = {
  health_assessment: { label: 'Health assessment', icon: 'heart-outline', tint: '#EC6A8C' },
  stress_card: { label: 'Stress', icon: 'pulse-outline', tint: '#F59E0B' },
  sleep_card: { label: 'Sleep', icon: 'moon-outline', tint: '#7C6BD6' },
  action_plan: { label: 'Action plan', icon: 'list-outline', tint: '#0F9AA9' },
  diet_plan: { label: 'Diet plan', icon: 'restaurant-outline', tint: '#3FAE88' },
  custom_form: { label: 'Form', icon: 'document-text-outline', tint: '#22A3C3' },
};

// Soft pastel fill alpha: lighter in light mode, a touch stronger in dark.
const fill = (color: string, dark: boolean) => color + (dark ? '2E' : '1A'); // ~0.18 / ~0.10
const chipBg = (color: string) => color + '33'; // ~0.20

export default function Assessments() {
  const t = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['me', 'assessments'], queryFn: () => clientsApi.myAssessments(), retry: 1 });
  const cards = [...(q.data ?? [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: spacing['3xl'] * 2 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : cards.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing['2xl'] }}>
            <View style={[styles.emptyIcon, { backgroundColor: fill(t.colors.primary, t.dark) }]}>
              <Ionicons name="checkbox-outline" size={28} color={t.colors.primary} />
            </View>
            <View style={{ gap: spacing.xs, alignItems: 'center' }}>
              <AppText variant="heading">Nothing to fill in yet</AppText>
              <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                Assessments your nutritionist shares will appear here.
              </AppText>
            </View>
          </Card>
        ) : (
          cards.map((c) => (
            <Pressable key={c.id} onPress={() => router.push(`/(tabs)/more/assessment/${c.id}`)}>
              <AssessmentRow c={c} />
            </Pressable>
          ))
        )}
      </ScreenScroll>
    </Screen>
  );
}

function AssessmentRow({ c }: { c: AssessmentCard }) {
  const t = useTheme();
  const meta = TYPE_META[c.card_type] ?? { label: c.card_type, icon: 'document-outline' as IoniconName, tint: t.colors.primary };
  const done = c.has_responses;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={[styles.iconChip, { backgroundColor: chipBg(meta.tint) }]}>
        <Ionicons name={meta.icon} size={22} color={meta.tint} />
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="heading">{meta.label}</AppText>
        <AppText variant="caption" tone="muted">
          {new Date(c.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
        </AppText>
        {done ? (
          <View style={[styles.statusChip, { backgroundColor: fill(t.colors.success, t.dark) }]}>
            <Ionicons name="checkmark-circle" size={13} color={t.colors.success} />
            <AppText variant="caption" tone="success">Completed</AppText>
          </View>
        ) : (
          <View style={[styles.statusChip, { backgroundColor: fill(t.colors.warning, t.dark) }]}>
            <Ionicons name="time-outline" size={13} color={t.colors.warning} />
            <AppText variant="caption" tone="warning">Pending</AppText>
          </View>
        )}
      </View>

      {done ? (
        <View style={[styles.reviewPill, { borderColor: t.colors.border, backgroundColor: t.colors.surfaceStrong }]}>
          <AppText variant="caption" tone="muted">Review</AppText>
          <Ionicons name="chevron-forward" size={13} color={t.colors.textFaint} />
        </View>
      ) : (
        <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.startPill}>
          <AppText variant="caption" tone="onBrand">Start</AppText>
          <Ionicons name="arrow-forward" size={13} color={t.colors.onBrand} />
        </LinearGradient>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  iconChip: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  startPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  reviewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
