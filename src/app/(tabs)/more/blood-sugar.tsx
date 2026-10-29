/**
 * Daily blood sugar — the client's own glucometer readings.
 *
 * This is a thing someone does every morning while holding a meter, so the log
 * card is three boxes and a date and nothing else: anything longer gets
 * abandoned by the second week. Blank boxes are simply not sent, so a client
 * who only ever tests fasting is not nagged for two readings they never take.
 *
 * The band appears as you type, which is the whole reason a client keeps
 * logging — immediate meaning, not a number filed away until the next
 * consultation. It is always worded as a range, never as a diagnosis.
 *
 * Re-sending a day overwrites it (the backend upserts on client+marker+date),
 * so a mistyped 1004 is fixed by typing 104 again rather than by hunting for a
 * delete button.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, StyleSheet, TextInput, View,
} from 'react-native';

import { SugarChart, type SugarPoint } from '@/components/sugar-chart';
import { AppText, Card, Eyebrow, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { labsApi } from '@/lib/labs-api';
import {
  BAND_COLOR, BAND_LABEL, SUGAR_LABEL, SUGAR_MARKERS, SUGAR_REFERENCE_NOTE, SUGAR_SHORT,
  sugarBand,
} from '@/lib/sugar-bands';
import { radius, spacing } from '@/lib/theme';

/** Today in the device's own date, as YYYY-MM-DD. */
function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** A day offset from an ISO date, for the "I forgot to log yesterday" case. */
function shiftDays(iso: string, by: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + by);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function prettyDate(iso: string): string {
  if (iso === todayISO()) return 'Today';
  if (iso === shiftDays(todayISO(), -1)) return 'Yesterday';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function BloodSugar() {
  const t = useTheme();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const historyQ = useQuery({
    queryKey: ['me', 'labs'],
    queryFn: () => labsApi.mine(),
    retry: 1,
  });

  // Only the boxes with a usable number in them get sent.
  const entered = SUGAR_MARKERS
    .map((code) => ({ code, value: Number(values[code]) }))
    .filter((r) => values[r.code]?.trim() && Number.isFinite(r.value) && r.value > 0);

  const save = useMutation({
    mutationFn: () =>
      labsApi.logSelf(date, entered.map((r) => ({ markerCode: r.code, value: r.value }))),
    onMutate: () => {
      setError(null);
      setSaved(false);
    },
    onSuccess: (history) => {
      setValues({});
      setSaved(true);
      // The response is the whole refreshed history, so the charts below
      // update from it without a second round trip.
      qc.setQueryData(['me', 'labs'], history);
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'Could not save your readings. Try again.'),
  });

  // One chart per marker, oldest reading first, self-logged and lab rows alike:
  // a client who had a fasting sugar drawn at a lab should see it on the same
  // line as their home readings, not on a separate chart.
  const seriesByMarker = useMemo(() => {
    const out: Record<string, SugarPoint[]> = {};
    for (const code of SUGAR_MARKERS) {
      const s = historyQ.data?.series.find((x) => x.markerCode === code);
      out[code] = (s?.points ?? [])
        .filter((p) => p.value != null)
        .map((p) => ({ takenOn: p.takenOn, value: p.value as number }))
        .sort((a, b) => a.takenOn.localeCompare(b.takenOn));
    }
    return out;
  }, [historyQ.data]);

  const anyData = SUGAR_MARKERS.some((c) => seriesByMarker[c].length > 0);

  if (historyQ.isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={historyQ.isRefetching}
            onRefresh={() => historyQ.refetch()}
            tintColor={t.colors.accent}
          />
        }>
        {/* ── Log card ─────────────────────────────────────────────── */}
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={[styles.icon, { backgroundColor: '#E11D48' + (t.dark ? '2E' : '1A') }]}>
              <Ionicons name="water" size={16} color="#E11D48" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="heading">Today&apos;s blood sugar</AppText>
              <AppText variant="caption" tone="faint">
                Fill in what you tested. Leave the rest blank.
              </AppText>
            </View>
          </View>

          {/* Which day these readings are for — not when they were typed in. */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {[0, -1, -2].map((off) => {
              const d = shiftDays(todayISO(), off);
              const active = d === date;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDate(d)}
                  style={[
                    styles.dateChip,
                    {
                      backgroundColor: active
                        ? t.colors.accent + (t.dark ? '2E' : '1A')
                        : t.colors.surfaceStrong,
                      borderColor: active ? t.colors.accent + '55' : t.colors.border,
                    },
                  ]}>
                  <AppText variant="caption" tone={active ? 'accent' : 'muted'}>
                    {prettyDate(d)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {SUGAR_MARKERS.map((code) => {
            const raw = values[code] ?? '';
            const num = Number(raw);
            const show = raw.trim() !== '' && Number.isFinite(num) && num > 0;
            const band = show ? sugarBand(code, num) : null;
            return (
              <View key={code} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <AppText variant="muted" style={{ flex: 1 }}>
                    {SUGAR_LABEL[code]}
                  </AppText>
                  <TextInput
                    value={raw}
                    onChangeText={(v) =>
                      setValues((s) => ({ ...s, [code]: v.replace(/[^0-9.]/g, '') }))
                    }
                    keyboardType="numeric"
                    placeholder="—"
                    placeholderTextColor={t.colors.textFaint}
                    maxLength={5}
                    style={[
                      styles.input,
                      {
                        color: t.colors.text,
                        backgroundColor: t.colors.surfaceStrong,
                        borderColor: band ? BAND_COLOR[band] + '66' : t.colors.border,
                      },
                    ]}
                  />
                  <AppText variant="caption" tone="faint" style={{ width: 38 }}>
                    mg/dL
                  </AppText>
                </View>
                {band ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <View
                      style={[
                        styles.bandPill,
                        {
                          backgroundColor: BAND_COLOR[band] + (t.dark ? '2E' : '1A'),
                          borderColor: BAND_COLOR[band] + '55',
                        },
                      ]}>
                      <AppText variant="caption" style={{ color: BAND_COLOR[band] }}>
                        {BAND_LABEL[band]}
                      </AppText>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          {error ? (
            <AppText variant="caption" tone="danger">
              {error}
            </AppText>
          ) : null}
          {saved && !save.isPending ? (
            <AppText variant="caption" tone="success">
              Saved. Your chart is updated.
            </AppText>
          ) : null}

          <GradientButton
            label={
              save.isPending
                ? 'Saving…'
                : entered.length === 0
                  ? 'Enter a reading'
                  : `Save ${entered.length} reading${entered.length === 1 ? '' : 's'}`
            }
            disabled={entered.length === 0 || save.isPending}
            onPress={() => save.mutate()}
          />
        </Card>

        {/* ── Charts ───────────────────────────────────────────────── */}
        <View style={{ gap: 4, marginTop: spacing.sm }}>
          <Eyebrow>Your trend</Eyebrow>
          <AppText variant="title">Daily blood sugar</AppText>
        </View>

        {!anyData ? (
          <Card>
            <AppText variant="muted" tone="muted">
              No readings yet. Save today&apos;s numbers above and your coloured trend starts here.
            </AppText>
          </Card>
        ) : (
          SUGAR_MARKERS.map((code) => {
            const pts = seriesByMarker[code];
            if (pts.length === 0) return null;
            const last = pts[pts.length - 1];
            const band = sugarBand(code, last.value);
            return (
              <Card key={code} style={{ gap: spacing.md }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                  }}>
                  <View style={{ gap: 2 }}>
                    <Eyebrow>{SUGAR_SHORT[code]}</Eyebrow>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
                      <AppText
                        variant="display"
                        style={{ fontVariant: ['tabular-nums'], lineHeight: 40 }}>
                        {last.value}
                      </AppText>
                      <AppText variant="muted" tone="muted" style={{ marginBottom: 7 }}>
                        mg/dL
                      </AppText>
                    </View>
                    <AppText variant="caption" tone="faint">
                      {prettyDate(last.takenOn)}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.bandPill,
                      {
                        backgroundColor: BAND_COLOR[band] + (t.dark ? '2E' : '1A'),
                        borderColor: BAND_COLOR[band] + '55',
                      },
                    ]}>
                    <AppText variant="caption" style={{ color: BAND_COLOR[band] }}>
                      {BAND_LABEL[band]}
                    </AppText>
                  </View>
                </View>

                <SugarChart marker={code} points={pts} />
              </Card>
            );
          })
        )}

        {/* Whose reference this is, and what it is not. Required, not decoration. */}
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Ionicons name="information-circle-outline" size={15} color={t.colors.textFaint} />
            <AppText variant="caption" tone="faint" style={{ flex: 1, lineHeight: 17 }}>
              {SUGAR_REFERENCE_NOTE}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(['normal', 'borderline', 'high', 'low'] as const).map((b) => (
              <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View
                  style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BAND_COLOR[b] }}
                />
                <AppText variant="caption" tone="faint">
                  {BAND_LABEL[b]}
                </AppText>
              </View>
            ))}
          </View>
        </Card>
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    width: 78,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bandPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
