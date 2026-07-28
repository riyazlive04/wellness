import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, View } from 'react-native';

import { AppText, Card, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type Supplement } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

export default function Supplements() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['me', 'supplements'], queryFn: () => clientsApi.mySupplements(), retry: 1 });
  const list = q.data ?? [];
  const active = list.filter((s) => s.active);
  const inactive = list.filter((s) => !s.active);

  return (
    <Screen edges={[]}>
      <ScreenScroll refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : list.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name="medkit-outline" size={26} color={t.colors.textFaint} />
            <AppText variant="muted" tone="muted">No supplements prescribed.</AppText>
          </Card>
        ) : (
          <>
            {active.map((s) => <SupplementCard key={s.id} s={s} />)}
            {inactive.length ? (
              <>
                <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', marginTop: spacing.sm }}>Inactive</AppText>
                {inactive.map((s) => <SupplementCard key={s.id} s={s} />)}
              </>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function SupplementCard({ s }: { s: Supplement }) {
  const t = useTheme();
  return (
    <Card style={{ flexDirection: 'row', gap: spacing.md, opacity: s.active ? 1 : 0.6 }}>
      <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: t.colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="medkit-outline" size={20} color={t.colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="heading">{s.name}</AppText>
        {s.dosage ? <AppText variant="muted" tone="muted">{s.dosage}</AppText> : null}
        {s.schedule.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {s.schedule.map((slot) => (
              <View key={slot} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: t.colors.surfaceStrong }}>
                <AppText variant="caption" tone="muted">{slot}</AppText>
              </View>
            ))}
          </View>
        ) : null}
        {s.notes ? <AppText variant="caption" tone="faint" style={{ marginTop: 2 }}>{s.notes}</AppText> : null}
      </View>
    </Card>
  );
}
