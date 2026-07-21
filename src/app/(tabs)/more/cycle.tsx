import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type CycleEvent } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

const LABEL: Record<CycleEvent['event_type'], string> = {
  period_start: 'Period started',
  period_end: 'Period ended',
  ovulation: 'Ovulation',
  pms: 'PMS',
  cramps: 'Cramps',
  spotting: 'Spotting',
};

export default function Cycle() {
  const t = useTheme();
  const eventsQ = useQuery({ queryKey: ['me', 'cycle', 'events'], queryFn: () => clientsApi.cycleEvents(180), retry: 1 });
  const predQ = useQuery({ queryKey: ['me', 'cycle', 'prediction'], queryFn: () => clientsApi.cyclePrediction(), retry: 1 });

  const events = [...(eventsQ.data ?? [])].sort((a, b) => +new Date(b.event_date) - +new Date(a.event_date));
  const p = predQ.data;

  return (
    <Screen edges={[]}>
      <ScreenScroll refreshControl={<RefreshControl refreshing={eventsQ.isRefetching} onRefresh={() => { eventsQ.refetch(); predQ.refetch(); }} tintColor={t.colors.accent} />}>
        {eventsQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            {p && (p.predicted_next_period || p.cycle_length_days) ? (
              <Card style={{ gap: spacing.md }}>
                <Eyebrow>Prediction</Eyebrow>
                <View style={styles.grid}>
                  <Stat label="Next period" value={p.predicted_next_period ? fmt(p.predicted_next_period) : '–'} />
                  <Stat label="Cycle length" value={p.cycle_length_days ? `${p.cycle_length_days} days` : '–'} />
                </View>
                {p.fertile_window_start && p.fertile_window_end ? (
                  <View style={[styles.fertile, { backgroundColor: t.colors.accent + '14', borderColor: t.colors.accent + '33' }]}>
                    <Ionicons name="flower-outline" size={15} color={t.colors.accent} />
                    <AppText variant="muted" tone="muted">Fertile window {fmt(p.fertile_window_start)} – {fmt(p.fertile_window_end)}</AppText>
                  </View>
                ) : null}
              </Card>
            ) : null}

            <Eyebrow>History</Eyebrow>
            {events.length === 0 ? (
              <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
                <Ionicons name="water-outline" size={26} color={t.colors.textFaint} />
                <AppText variant="muted" tone="muted">No cycle entries yet.</AppText>
              </Card>
            ) : (
              <Card style={{ padding: 0 }}>
                {events.map((e, i) => (
                  <View key={e.id} style={[styles.row, { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: t.colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="body">{LABEL[e.event_type]}</AppText>
                      {e.notes ? <AppText variant="caption" tone="muted">{e.notes}</AppText> : null}
                    </View>
                    <AppText variant="caption" tone="faint">{fmt(e.event_date)}</AppText>
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" tone="muted">{label}</AppText>
    </View>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: spacing.md },
  fertile: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 13 },
});
