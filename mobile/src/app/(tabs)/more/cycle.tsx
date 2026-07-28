import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type CycleEvent, type CycleEventType } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

const LABEL: Record<CycleEventType, string> = {
  period_start: 'Period started',
  period_end: 'Period ended',
  ovulation: 'Ovulation',
  pms: 'PMS',
  cramps: 'Cramps',
  spotting: 'Spotting',
};

const TYPES: CycleEventType[] = ['period_start', 'period_end', 'ovulation', 'pms', 'cramps', 'spotting'];
const FLOW_TYPES = new Set<CycleEventType>(['period_start', 'spotting']);

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Cycle() {
  const t = useTheme();
  const qc = useQueryClient();
  const [logOpen, setLogOpen] = useState(false);

  const eventsQ = useQuery({
    queryKey: ['me', 'cycle', 'events'],
    queryFn: () => clientsApi.cycleEvents(180),
    retry: 1,
  });
  const predQ = useQuery({
    queryKey: ['me', 'cycle', 'prediction'],
    queryFn: () => clientsApi.cyclePrediction(),
    retry: 1,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => clientsApi.deleteCycleEvent(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'cycle'] });
    },
    onError: (err: Error) => Alert.alert('Could not delete', err.message),
  });

  const events = [...(eventsQ.data ?? [])].sort((a, b) => +new Date(b.event_date) - +new Date(a.event_date));
  const p = predQ.data;

  const confirmDelete = (e: CycleEvent) =>
    Alert.alert('Delete entry?', LABEL[e.event_type], [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(e.id) },
    ]);

  return (
    <Screen edges={[]}>
      <ScreenScroll
        refreshControl={
          <RefreshControl
            refreshing={eventsQ.isRefetching}
            onRefresh={() => {
              void eventsQ.refetch();
              void predQ.refetch();
            }}
            tintColor={t.colors.accent}
          />
        }>
        <GradientButton label="＋ Log event" onPress={() => setLogOpen(true)} />

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
                  <View
                    style={[
                      styles.fertile,
                      { backgroundColor: t.colors.accent + '14', borderColor: t.colors.accent + '33' },
                    ]}>
                    <Ionicons name="flower-outline" size={15} color={t.colors.accent} />
                    <AppText variant="muted" tone="muted">
                      Fertile window {fmt(p.fertile_window_start)} – {fmt(p.fertile_window_end)}
                    </AppText>
                  </View>
                ) : null}
              </Card>
            ) : null}

            <Eyebrow>History</Eyebrow>
            {events.length === 0 ? (
              <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
                <Ionicons name="water-outline" size={26} color={t.colors.textFaint} />
                <AppText variant="muted" tone="muted">
                  No cycle entries yet.
                </AppText>
              </Card>
            ) : (
              <Card style={{ padding: 0 }}>
                {events.map((e, i) => (
                  <Pressable
                    key={e.id}
                    onLongPress={() => confirmDelete(e)}
                    style={[
                      styles.row,
                      {
                        borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                        borderTopColor: t.colors.border,
                      },
                    ]}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="body">{LABEL[e.event_type]}</AppText>
                      {e.flow_level != null ? (
                        <AppText variant="caption" tone="muted">
                          Flow {e.flow_level}/3
                        </AppText>
                      ) : null}
                      {e.notes ? (
                        <AppText variant="caption" tone="muted">
                          {e.notes}
                        </AppText>
                      ) : null}
                    </View>
                    <AppText variant="caption" tone="faint">
                      {fmt(e.event_date)}
                    </AppText>
                  </Pressable>
                ))}
              </Card>
            )}
            {events.length ? (
              <AppText variant="caption" tone="faint" style={{ textAlign: 'center' }}>
                Long-press an entry to delete it.
              </AppText>
            ) : null}
          </>
        )}
      </ScreenScroll>

      <LogModal
        visible={logOpen}
        onClose={() => setLogOpen(false)}
        onSaved={() => {
          setLogOpen(false);
          void qc.invalidateQueries({ queryKey: ['me', 'cycle'] });
        }}
      />
    </Screen>
  );
}

function LogModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTheme();
  const [type, setType] = useState<CycleEventType>('period_start');
  const [date, setDate] = useState(todayYmd);
  const [flow, setFlow] = useState(2);
  const [notes, setNotes] = useState('');

  const logMut = useMutation({
    mutationFn: () =>
      clientsApi.logCycleEvent({
        event_type: type,
        event_date: date.trim() || undefined,
        flow_level: FLOW_TYPES.has(type) ? flow : undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: onSaved,
    onError: (err: Error) => Alert.alert('Could not save', err.message),
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* padding on both platforms — edge-to-edge Android breaks adjustResize,
          so undefined here left the sheet's inputs under the keyboard. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { backgroundColor: t.colors.canvas, borderColor: t.colors.border }]}
            onPress={(e) => e.stopPropagation()}>
            <AppText variant="heading">Log cycle event</AppText>
            <View style={styles.chips}>
              {TYPES.map((ev) => {
                const on = type === ev;
                return (
                  <Pressable
                    key={ev}
                    onPress={() => setType(ev)}
                    style={[
                      styles.chip,
                      {
                        borderColor: t.colors.border,
                        backgroundColor: on ? t.colors.surfaceStrong : 'transparent',
                      },
                    ]}>
                    <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                      {LABEL[ev]}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <AppText variant="caption" tone="muted">
              Date (YYYY-MM-DD)
            </AppText>
            <TextInput
              value={date}
              onChangeText={setDate}
              autoCapitalize="none"
              placeholder={todayYmd()}
              placeholderTextColor={t.colors.textFaint}
              style={[
                styles.input,
                { borderColor: t.colors.border, color: t.colors.text, backgroundColor: t.colors.surfaceStrong },
              ]}
            />

            {FLOW_TYPES.has(type) ? (
              <>
                <AppText variant="caption" tone="muted">
                  Flow (0–3)
                </AppText>
                <View style={styles.chips}>
                  {[0, 1, 2, 3].map((n) => {
                    const on = flow === n;
                    return (
                      <Pressable
                        key={n}
                        onPress={() => setFlow(n)}
                        style={[
                          styles.chip,
                          {
                            borderColor: t.colors.border,
                            backgroundColor: on ? t.colors.surfaceStrong : 'transparent',
                          },
                        ]}>
                        <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                          {n}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <AppText variant="caption" tone="muted">
              Notes
            </AppText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              placeholderTextColor={t.colors.textFaint}
              style={[
                styles.input,
                { borderColor: t.colors.border, color: t.colors.text, backgroundColor: t.colors.surfaceStrong },
              ]}
            />

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <GhostButton label="Close" onPress={onClose} style={{ flex: 1 }} />
              <GradientButton
                label="Save"
                onPress={() => logMut.mutate()}
                loading={logMut.isPending}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

function fmt(iso: string): string {
  return new Date(iso.includes('T') ? iso : `${iso}T12:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: spacing.md },
  fertile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
});
