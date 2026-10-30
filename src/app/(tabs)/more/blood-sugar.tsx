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

import { SugarChart, SugarWeekChart, type SugarPoint } from '@/components/sugar-chart';
import { AppText, Card, Eyebrow, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { labsApi } from '@/lib/labs-api';
import {
  BAND_COLOR, BAND_LABEL, SPIKE_NOTE, SUGAR_LABEL, SUGAR_MARKERS, SUGAR_REFERENCE_NOTE,
  SUGAR_SHORT, TREND_COLOR, TREND_LABEL, annotateSugarTrend, sugarBand, sugarTrendReason,
  sugarWeek, sugarWeekStarts, weekRangeLabel, weekStart,
  type SugarMarker, type SugarTrendPoint, type SugarWeekDay,
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
  // 'week' is the default: a consultation talks in weeks, and the brief asks
  // for Day 1..Day 7. 'all' keeps the long continuous trend, which answers a
  // question a single week cannot ("am I better than three months ago?").
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  // An offset from the newest week with data: 0 is the latest, -1 the one
  // before. Stored as an offset rather than a date so it survives new readings
  // arriving while the screen is open.
  const [weekBack, setWeekBack] = useState(0);

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
  //
  // Annotated with the spike rule over the FULL history, even when only one
  // week is on screen, so a Monday's flag is judged against the previous week
  // instead of losing its baseline at the week boundary.
  const trendByMarker = useMemo(() => {
    const out = {} as Record<SugarMarker, SugarTrendPoint[]>;
    for (const code of SUGAR_MARKERS) {
      const s = historyQ.data?.series.find((x) => x.markerCode === code);
      out[code] = annotateSugarTrend(
        (s?.points ?? [])
          .filter((p) => p.value != null)
          .map((p) => ({ takenOn: p.takenOn, value: p.value as number })),
      );
    }
    return out;
  }, [historyQ.data]);

  /** The all-readings line, with each dot's flag carried along. */
  const seriesByMarker = useMemo(() => {
    const out = {} as Record<SugarMarker, SugarPoint[]>;
    for (const code of SUGAR_MARKERS) {
      out[code] = trendByMarker[code].map(
        (p): SugarPoint => ({ takenOn: p.takenOn, value: p.value, flag: p.flag }),
      );
    }
    return out;
  }, [trendByMarker]);

  /** Weeks with at least one reading of any marker, oldest first. */
  const weeks = useMemo(() => {
    const set = new Set<string>();
    for (const code of SUGAR_MARKERS) {
      for (const w of sugarWeekStarts(trendByMarker[code])) set.add(w);
    }
    return [...set].sort();
  }, [trendByMarker]);

  // Clamped rather than validated: readings arriving can change how many weeks
  // exist, and an offset past the end should land on the oldest week, not on
  // an empty chart.
  const weekIdx = Math.max(0, weeks.length - 1 + weekBack);
  const start = weeks[Math.min(weekIdx, Math.max(0, weeks.length - 1))];

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

        {anyData ? (
          <View style={{ gap: spacing.sm }}>
            {/* Week vs the whole history. Both are kept: the week is how a
                consultation talks, the full line is how progress reads. */}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {([['week', 'This week'], ['all', 'All readings']] as const).map(([key, label]) => {
                const active = period === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setPeriod(key)}
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
                      {label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {period === 'week' && start ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.sm,
                }}>
                <Pressable
                  onPress={() => setWeekBack(weekBack - 1)}
                  disabled={weekIdx <= 0}
                  accessibilityRole="button"
                  accessibilityLabel="Previous week"
                  style={[
                    styles.weekArrow,
                    { borderColor: t.colors.border, opacity: weekIdx <= 0 ? 0.3 : 1 },
                  ]}>
                  <Ionicons name="chevron-back" size={15} color={t.colors.textMuted} />
                </Pressable>
                <View style={{ alignItems: 'center' }}>
                  <AppText variant="caption" tone="muted">
                    {weekRangeLabel(start)}
                  </AppText>
                  {start === weekStart(todayISO()) ? (
                    <AppText variant="caption" tone="faint">
                      this week
                    </AppText>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => setWeekBack(Math.min(0, weekBack + 1))}
                  disabled={weekIdx >= weeks.length - 1}
                  accessibilityRole="button"
                  accessibilityLabel="Next week"
                  style={[
                    styles.weekArrow,
                    {
                      borderColor: t.colors.border,
                      opacity: weekIdx >= weeks.length - 1 ? 0.3 : 1,
                    },
                  ]}>
                  <Ionicons name="chevron-forward" size={15} color={t.colors.textMuted} />
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

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
            const week = period === 'week' && start ? sugarWeek(trendByMarker[code], start) : null;
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

                {week ? (
                  <SugarWeekChart marker={code} week={week} />
                ) : (
                  <SugarChart marker={code} points={pts} />
                )}

                {/* Which days of the week nobody logged, named. The chart's
                    hollow tick says it visually; the words are what make it
                    read as absence rather than as a rendering accident. */}
                {week ? <NotLogged week={week} /> : null}

                {/* Every flagged reading in words. The red ring is never the
                    only cue - this is the same information for a red-green
                    colourblind reader, and it is where the WHY lives. */}
                <TrendNotes
                  days={(week ?? trendByMarker[code].map(
                    (p): SugarWeekDay => ({
                      day: 0, takenOn: p.takenOn, weekday: '', value: p.value, trend: p,
                    }),
                  )).filter((d) => d.trend?.flag)}
                />
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
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Ionicons name="trending-up-outline" size={15} color={TREND_COLOR.spike} />
            <AppText variant="caption" tone="faint" style={{ flex: 1, lineHeight: 17 }}>
              {SPIKE_NOTE}
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

/** 'Not logged: Wed, Sat' - absence stated, never drawn as a zero. */
function NotLogged({ week }: { week: SugarWeekDay[] }) {
  const missing = week.filter((d) => d.value == null);
  if (missing.length === 0) return null;
  return (
    <AppText variant="caption" tone="faint">
      {missing.length === 7
        ? 'No readings logged this week.'
        : `Not logged: ${missing.map((d) => `${d.weekday} (Day ${d.day})`).join(', ')}`}
    </AppText>
  );
}

/**
 * The reasons behind the rings, as sentences.
 *
 * Deliberately the arithmetic and not a verdict: '+14 vs your 7-day average of
 * 91' can be checked against the numbers on the chart, where 'high spike'
 * cannot. A spike pill is red, a dip pill is blue - a fall is never dressed as
 * an alarm (see the note in sugar-bands.ts).
 */
function TrendNotes({ days }: { days: SugarWeekDay[] }) {
  const t = useTheme();
  if (days.length === 0) return null;
  return (
    <View style={{ gap: 5 }}>
      {days.slice(-4).map((d) => {
        const flag = d.trend?.flag;
        if (!flag || !d.trend) return null;
        return (
          <View
            key={`${d.takenOn}-${flag}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={[
                styles.bandPill,
                {
                  backgroundColor: TREND_COLOR[flag] + (t.dark ? '2E' : '1A'),
                  borderColor: TREND_COLOR[flag] + '55',
                },
              ]}>
              <AppText variant="caption" style={{ color: TREND_COLOR[flag] }}>
                {TREND_LABEL[flag]}
              </AppText>
            </View>
            <AppText variant="caption" tone="faint" style={{ flex: 1 }}>
              {`${prettyDate(d.takenOn)} · ${sugarTrendReason(d.trend) ?? ''}`}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  weekArrow: {
    width: 30,
    height: 30,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
