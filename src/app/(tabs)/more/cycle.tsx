import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
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
import { brand, radius, spacing, status, tintFill } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const LABEL: Record<CycleEventType, string> = {
  period_start: 'Period started',
  period_end: 'Period ended',
  ovulation: 'Ovulation',
  pms: 'PMS',
  cramps: 'Cramps',
  spotting: 'Spotting',
};

// Each event type gets its own soft wellness tint + icon, echoing the phase
// palette on the web app: rose for menstrual, teal for the fertile window,
// violet for PMS, amber for cramps.
const TYPE_META: Record<CycleEventType, { icon: IoniconName; tint: string }> = {
  period_start: { icon: 'water', tint: '#E5556E' },
  period_end: { icon: 'water-outline', tint: '#E5556E' },
  ovulation: { icon: 'flower-outline', tint: brand.cyan },
  pms: { icon: 'pulse-outline', tint: '#7C6BD6' },
  cramps: { icon: 'flash-outline', tint: status.warning },
  spotting: { icon: 'ellipse-outline', tint: '#D98BA6' },
};

const TYPES: CycleEventType[] = ['period_start', 'period_end', 'ovulation', 'pms', 'cramps', 'spotting'];
const FLOW_TYPES = new Set<CycleEventType>(['period_start', 'spotting']);

// Soft pastel fill alphas — lighter in light mode, a touch stronger on the ink canvas.
const fill = (color: string, dark: boolean) => tintFill(color, dark);
const chipBg = (color: string) => color + '33';

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
        contentContainerStyle={{ paddingBottom: 110 }}
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
        <View style={{ gap: 4 }}>
          <Eyebrow>Cycle tracker</Eyebrow>
          <AppText variant="title">Your rhythm</AppText>
        </View>

        <GradientButton label="＋ Log event" onPress={() => setLogOpen(true)} />

        {eventsQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            {p && (p.predicted_next_period || p.cycle_length_days) ? (
              <Card style={{ padding: 0, overflow: 'hidden', borderRadius: radius['2xl'] }}>
                <LinearGradient
                  colors={t.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ padding: spacing.xl, gap: spacing.lg }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AppText
                      variant="label"
                      tone="onBrand"
                      style={{ opacity: 0.85, textTransform: 'uppercase', letterSpacing: 1.4 }}>
                      Cycle prediction
                    </AppText>
                    <View style={styles.heroBadge}>
                      <Ionicons name="sync-outline" size={13} color={t.colors.onBrand} />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg }}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="display" tone="onBrand">
                        {p.predicted_next_period ? fmt(p.predicted_next_period) : '–'}
                      </AppText>
                      <AppText variant="muted" tone="onBrand" style={{ opacity: 0.85 }}>
                        Next period
                      </AppText>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <AppText variant="heading" tone="onBrand">
                        {p.cycle_length_days ? `${p.cycle_length_days} days` : '–'}
                      </AppText>
                      <AppText variant="caption" tone="onBrand" style={{ opacity: 0.85 }}>
                        Cycle length
                      </AppText>
                    </View>
                  </View>

                  {p.fertile_window_start && p.fertile_window_end ? (
                    <View style={styles.fertile}>
                      <Ionicons name="flower-outline" size={15} color={t.colors.onBrand} />
                      <AppText variant="caption" tone="onBrand">
                        Fertile window {fmt(p.fertile_window_start)} – {fmt(p.fertile_window_end)}
                      </AppText>
                    </View>
                  ) : null}
                </LinearGradient>
              </Card>
            ) : null}

            <Eyebrow>History</Eyebrow>
            {events.length === 0 ? (
              <Card
                style={{
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing['2xl'],
                  backgroundColor: fill('#E5556E', t.dark),
                  borderColor: '#E5556E' + (t.dark ? '33' : '24'),
                }}>
                <View style={[styles.emptyChip, { backgroundColor: chipBg('#E5556E') }]}>
                  <Ionicons name="water-outline" size={26} color="#E5556E" />
                </View>
                <AppText variant="heading">No cycle entries yet</AppText>
                <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                  Log a period, ovulation or symptom to start seeing your rhythm.
                </AppText>
              </Card>
            ) : (
              <Card style={{ padding: 0 }}>
                {events.map((e, i) => {
                  const meta = TYPE_META[e.event_type];
                  return (
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
                      <View style={[styles.rowChip, { backgroundColor: fill(meta.tint, t.dark) }]}>
                        <Ionicons name={meta.icon} size={18} color={meta.tint} />
                      </View>
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
                      <View style={[styles.datePill, { backgroundColor: t.colors.surfaceStrong }]}>
                        <AppText variant="caption" tone="muted">
                          {fmt(e.event_date)}
                        </AppText>
                      </View>
                    </Pressable>
                  );
                })}
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
                const meta = TYPE_META[ev];
                return (
                  <Pressable
                    key={ev}
                    onPress={() => setType(ev)}
                    style={[
                      styles.chip,
                      {
                        borderColor: on ? meta.tint + (t.dark ? '55' : '40') : t.colors.border,
                        backgroundColor: on ? fill(meta.tint, t.dark) : 'transparent',
                      },
                    ]}>
                    <Ionicons name={meta.icon} size={13} color={on ? meta.tint : t.colors.textFaint} />
                    <AppText variant="caption" style={{ color: on ? meta.tint : t.colors.textMuted }}>
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
                            borderColor: on ? '#E5556E' + (t.dark ? '55' : '40') : t.colors.border,
                            backgroundColor: on ? fill('#E5556E', t.dark) : 'transparent',
                          },
                        ]}>
                        <AppText variant="caption" style={{ color: on ? '#E5556E' : t.colors.textMuted }}>
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

function fmt(iso: string): string {
  return new Date(iso.includes('T') ? iso : `${iso}T12:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  heroBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fertile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  emptyChip: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  rowChip: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
