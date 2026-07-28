import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';

import { AppText, Card, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type AssessmentCard } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;
const TYPE_META: Record<string, { label: string; icon: IoniconName }> = {
  health_assessment: { label: 'Health assessment', icon: 'heart-outline' },
  stress_card: { label: 'Stress', icon: 'pulse-outline' },
  sleep_card: { label: 'Sleep', icon: 'moon-outline' },
  action_plan: { label: 'Action plan', icon: 'list-outline' },
  diet_plan: { label: 'Diet plan', icon: 'restaurant-outline' },
  custom_form: { label: 'Form', icon: 'document-text-outline' },
};

export default function Assessments() {
  const t = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['me', 'assessments'], queryFn: () => clientsApi.myAssessments(), retry: 1 });
  const cards = [...(q.data ?? [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  return (
    <Screen edges={[]}>
      <ScreenScroll refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : cards.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name="checkbox-outline" size={26} color={t.colors.textFaint} />
            <AppText variant="muted" tone="muted">No assessments shared with you yet.</AppText>
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
  const meta = TYPE_META[c.card_type] ?? { label: c.card_type, icon: 'document-outline' as IoniconName };
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: t.colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={meta.icon} size={20} color={t.colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="heading">{meta.label}</AppText>
        <AppText variant="caption" tone="muted">{new Date(c.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</AppText>
      </View>
      {c.has_responses ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="checkmark-circle" size={16} color={t.colors.success} />
          <AppText variant="caption" tone="success">Completed</AppText>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <AppText variant="caption" tone="warning">Take</AppText>
          <Ionicons name="chevron-forward" size={14} color={t.colors.warning} />
        </View>
      )}
    </Card>
  );
}
