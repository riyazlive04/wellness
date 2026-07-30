import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { TrendChart } from '@/components/trend-chart';
import { AppText, Card, Eyebrow, GhostButton, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type Measurement } from '@/lib/clients-api';
import { brand, radius, spacing, status, tintFill } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Each body-tape site gets its own soft icon + tint so the log reads as a
// friendly wellness snapshot instead of a flat table. Presentation only —
// f.key / f.label drive the mutation + modal exactly as before.
const FIELDS = [
  { key: 'chest_inches', label: 'Chest', icon: 'body-outline', tint: brand.blue },
  { key: 'waist_inches', label: 'Waist', icon: 'resize-outline', tint: brand.teal },
  { key: 'hip_inches', label: 'Hip', icon: 'ellipse-outline', tint: status.warning },
  { key: 'arm_inches', label: 'Arm', icon: 'barbell-outline', tint: status.success },
  { key: 'thigh_inches', label: 'Thigh', icon: 'walk-outline', tint: status.info },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

export default function Measurements() {
  const t = useTheme();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});

  const q = useQuery({ queryKey: ['me', 'measurements'], queryFn: () => clientsApi.myMeasurements(30), retry: 1 });
  const createMut = useMutation({
    mutationFn: () => {
      const body: Record<string, number> = {};
      for (const f of FIELDS) {
        const n = parseFloat(vals[f.key] ?? '');
        if (!isNaN(n) && n > 0) body[f.key] = n;
      }
      return clientsApi.logMeasurement(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'measurements'] });
      setAdding(false);
      setVals({});
    },
  });

  const rows = q.data ?? [];
  const latest = rows[0];

  // Oldest -> newest per field, for the sparkline + since-first delta.
  const series = useMemo(() => {
    const asc = [...rows].reverse();
    const out = {} as Record<FieldKey, number[]>;
    for (const f of FIELDS) {
      out[f.key] = asc.map((m) => m[f.key as FieldKey]).filter((v): v is number => v != null);
    }
    return out;
  }, [rows]);

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <Eyebrow>Your body</Eyebrow>
              <AppText variant="title">Measurements</AppText>
            </View>

            <GradientButton label="＋ Log measurements" onPress={() => setAdding(true)} />

            {latest ? (
              <>
                {/* ── Latest snapshot ─────────────────────────────────── */}
                <Card style={{ gap: spacing.lg, overflow: 'hidden', borderRadius: radius['2xl'] }}>
                  <LinearGradient
                    colors={[t.gradient[2] + (t.dark ? '1F' : '14'), t.gradient[1] + '08', 'transparent']}
                    start={{ x: 1, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ gap: spacing.xs, flex: 1 }}>
                      <Eyebrow>Latest snapshot</Eyebrow>
                      <AppText variant="heading">{fmtLong(latest.recorded_at)}</AppText>
                      <AppText variant="caption" tone="faint">
                        {rows.length > 1 ? `${rows.length} check-ins logged` : 'Your first check-in'}
                      </AppText>
                    </View>
                    <View style={[styles.heroIcon, { backgroundColor: t.colors.accent + (t.dark ? '2E' : '1A'), borderColor: t.colors.accent + '3A' }]}>
                      <Ionicons name="resize-outline" size={22} color={t.colors.accent} />
                    </View>
                  </View>

                  <View style={styles.grid}>
                    {FIELDS.map((f) => {
                      const v = latest[f.key as FieldKey];
                      const d = delta(series[f.key]);
                      return (
                        <View key={f.key} style={styles.gridCell}>
                          <View style={[styles.miniChip, { backgroundColor: chipBg(f.tint, t.dark) }]}>
                            <Ionicons name={f.icon as IoniconName} size={15} color={f.tint} />
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                            <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
                              {v != null ? `${v}` : '–'}
                            </AppText>
                            {v != null ? (
                              <AppText variant="caption" tone="faint" style={{ marginBottom: 2 }}>
                                in
                              </AppText>
                            ) : null}
                          </View>
                          <AppText variant="caption" tone="muted">
                            {f.label}
                          </AppText>
                          {d ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                              <Ionicons name={d.down ? 'arrow-down' : 'arrow-up'} size={10} color={d.tint(t)} />
                              <AppText variant="caption" style={{ color: d.tint(t), fontSize: 11 }}>
                                {d.text}
                              </AppText>
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </Card>

                {/* ── Per-site trends ─────────────────────────────────── */}
                {FIELDS.some((f) => series[f.key].length >= 2) ? (
                  <View style={{ gap: spacing.sm }}>
                    <Eyebrow>Trends</Eyebrow>
                    {FIELDS.filter((f) => series[f.key].length >= 2).map((f) => (
                      <TrendCard key={f.key} field={f} values={series[f.key]} />
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing['2xl'], borderRadius: radius['2xl'] }}>
                <View style={[styles.emptyChip, { backgroundColor: fill(t.colors.primary, t.dark) }]}>
                  <Ionicons name="resize-outline" size={24} color={t.colors.primary} />
                </View>
                <AppText variant="heading" style={{ textAlign: 'center' }}>
                  No measurements yet
                </AppText>
                <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                  Log your body-tape numbers to watch your shape change over time.
                </AppText>
              </Card>
            )}

            {rows.length > 1 ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>History</Eyebrow>
                {rows.slice(1).map((m) => <HistoryRow key={m.id} m={m} />)}
              </View>
            ) : null}
          </>
        )}
      </ScreenScroll>

      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={() => setAdding(false)}>
            <Pressable style={[styles.sheet, { backgroundColor: t.colors.canvas, borderColor: t.colors.border }]} onPress={(e) => e.stopPropagation()}>
              <AppText variant="heading">Log measurements (inches)</AppText>
              {FIELDS.map((f) => (
                <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View style={[styles.miniChip, { backgroundColor: chipBg(f.tint, t.dark) }]}>
                    <Ionicons name={f.icon as IoniconName} size={15} color={f.tint} />
                  </View>
                  <AppText variant="body" tone="muted" style={{ width: 56 }}>{f.label}</AppText>
                  <TextInput
                    value={vals[f.key] ?? ''}
                    onChangeText={(v) => setVals((s) => ({ ...s, [f.key]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="–"
                    placeholderTextColor={t.colors.textFaint}
                    style={[styles.input, { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border }]}
                  />
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                <GhostButton label="Cancel" onPress={() => setAdding(false)} style={{ flex: 1 }} />
                <GradientButton label="Save" onPress={() => createMut.mutate()} loading={createMut.isPending} style={{ flex: 1 }} />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

/** One body-site trend card — tinted icon chip, latest value, since-first delta pill, sparkline. */
function TrendCard({ field, values }: { field: (typeof FIELDS)[number]; values: number[] }) {
  const t = useTheme();
  const latest = values[values.length - 1];
  const d = delta(values);
  return (
    <Card style={{ gap: spacing.md, borderRadius: radius.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={[styles.mealChip, { backgroundColor: chipBg(field.tint, t.dark) }]}>
          <Ionicons name={field.icon as IoniconName} size={20} color={field.tint} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <AppText variant="caption" style={{ color: field.tint, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {field.label}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
            <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
              {latest}
            </AppText>
            <AppText variant="caption" tone="faint" style={{ marginBottom: 2 }}>
              in
            </AppText>
          </View>
        </View>
        {d ? (
          <View style={[styles.chip, { backgroundColor: d.tint(t) + '1A', borderColor: d.tint(t) + '33' }]}>
            <Ionicons name={d.down ? 'arrow-down' : 'arrow-up'} size={12} color={d.tint(t)} />
            <AppText variant="caption" style={{ color: d.tint(t) }}>
              {d.text}
            </AppText>
          </View>
        ) : null}
      </View>
      <TrendChart values={values} height={72} emptyLabel="Log again to see your trend." />
    </Card>
  );
}

function HistoryRow({ m }: { m: Measurement }) {
  const t = useTheme();
  const parts = FIELDS.filter((f) => m[f.key as FieldKey] != null).map((f) => `${f.label} ${m[f.key as FieldKey]}"`);
  return (
    <Card style={{ borderRadius: radius.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={[styles.mealChip, { backgroundColor: chipBg(t.colors.primary, t.dark) }]}>
          <Ionicons name="calendar-outline" size={18} color={t.colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" tone="faint">
            {new Date(m.recorded_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </AppText>
          <AppText variant="muted" tone="muted">{parts.join(' · ') || 'No values'}</AppText>
        </View>
      </View>
    </Card>
  );
}

// ── Presentation helpers (mirror Today/Progress tint conventions) ──────────
const fill = (c: string, dark: boolean) => tintFill(c, dark);
const chipBg = (c: string, dark: boolean) => c + (dark ? '33' : '24');

/** Since-first change for a series; down reads as success (shrinking tape). */
function delta(values: number[]): { down: boolean; text: string; tint: (t: ReturnType<typeof useTheme>) => string } | null {
  if (values.length < 2) return null;
  const diff = values[values.length - 1] - values[0];
  if (Math.abs(diff) < 0.05) return null;
  const down = diff < 0;
  return {
    down,
    text: `${Math.abs(diff).toFixed(1)} in`,
    tint: (t) => (down ? t.colors.success : t.colors.warning),
  };
}

function fmtLong(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  gridCell: { width: '33.33%', gap: 3, paddingRight: spacing.sm },
  mealChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniChip: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyChip: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  sheet: { width: '100%', maxWidth: 400, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: 16 },
});
