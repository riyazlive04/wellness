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
  BAND_COLOR, BAND_LABEL, MARKER_UNIT, SPIKE_NOTE, SUGAR_LABEL, SUGAR_MARKERS,
  referenceNoteFor,
  SUGAR_SHORT, TREND_COLOR, TREND_LABEL, annotateSugarTrend, sugarBand, sugarTrendReason,
  sugarWeek, sugarWeekStarts, sugarMonths, monthLabel, weekRangeLabel, weekStart,
  type TrackedMarker, type SugarTrendPoint, type SugarWeekDay,
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
  return (
    <ReadingsScreen
      markers={SUGAR_MARKERS}
      title="Today's blood sugar"
      hint="Fill in what you tested. Leave the rest blank."
      trendTitle="Daily blood sugar"
      emptyHint="No readings yet. Save today&apos;s numbers above and your coloured trend starts here."
    />
  );
}

/**
 * One screen for any set of self-logged readings.
 *
 * Sugar and blood pressure differ only in which markers they show and what
 * the headings say: the entry card, bands, spike rings, weekly and monthly
 * views are identical. They get separate screens rather than separate
 * components because mg/dL and mmHg cannot share a chart axis.
 */
export function ReadingsScreen({
  markers,
  title,
  hint,
  trendTitle,
  emptyHint,
}: {
  markers: readonly TrackedMarker[];
  title: string;
  hint: string;
  trendTitle: string;
  emptyHint: string;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // 'week' is the default: a consultation talks in weeks, and the brief asks
  // for Day 1..Day 7. 'all' keeps the long continuous trend, which answers a
  // question a single week cannot ("am I better than three months ago?").
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');
  // An offset from the newest week with data: 0 is the latest, -1 the one
  // before. Stored as an offset rather than a date so it survives new readings
  // arriving while the screen is open.
  const [weekBack, setWeekBack] = useState(0);
  const [monthBack, setMonthBack] = useState(0);

  const historyQ = useQuery({
    queryKey: ['me', 'labs'],
    queryFn: () => labsApi.mine(),
    retry: 1,
  });

  // Only the boxes with a usable number in them get sent.
  const entered = markers
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
    const out = {} as Record<TrackedMarker, SugarTrendPoint[]>;
    for (const code of markers) {
      const s = historyQ.data?.series.find((x) => x.markerCode === code);
      out[code] = annotateSugarTrend(
        (s?.points ?? [])
          .filter((p) => p.value != null)
          .map((p) => ({ takenOn: p.takenOn, value: p.value as number })),
      );
    }
    return out;
  }, [historyQ.data, markers]);

  /** The all-readings line, with each dot's flag carried along. */
  const seriesByMarker = useMemo(() => {
    const out = {} as Record<TrackedMarker, SugarPoint[]>;
    for (const code of markers) {
      out[code] = trendByMarker[code].map(
        (p): SugarPoint => ({ takenOn: p.takenOn, value: p.value, flag: p.flag }),
      );
    }
    return out;
  }, [trendByMarker, markers]);

  /** Weeks with at least one reading of any marker, oldest first. */
  const weeks = useMemo(() => {
    const set = new Set<string>();
    for (const code of markers) {
      for (const w of sugarWeekStarts(trendByMarker[code])) set.add(w);
    }
    return [...set].sort();
  }, [trendByMarker, markers]);

  /** Months with at least one reading, oldest first. */
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const code of markers) {
      for (const m of sugarMonths(trendByMarker[code])) set.add(m);
    }
    return [...set].sort();
  }, [trendByMarker, markers]);

  const monthIdx = Math.max(0, months.length - 1 + monthBack);
  const month = months[Math.min(monthIdx, Math.max(0, months.length - 1))];

  // Clamped rather than validated: readings arriving can change how many weeks
  // exist, and an offset past the end should land on the oldest week, not on
  // an empty chart.
  const weekIdx = Math.max(0, weeks.length - 1 + weekBack);
  const start = weeks[Math.min(weekIdx, Math.max(0, weeks.length - 1))];

  const anyData = markers.some((c) => seriesByMarker[c].length > 0);

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
              <AppText variant="heading">{title}</AppText>
              <AppText variant="caption" tone="faint">
                {hint}
              </AppText>
            </View>
          </View>

          {/* Which day these readings are for — not when they were typed in.
              Arrows step any distance back, because a client joining in
              November needs to enter September's readings to see whether
              anything has changed. Three chips only reached the day before
              yesterday, which made the history impossible to enter.

              Arrows rather than a native date picker: @react-native-community
              /datetimepicker is a native module, so adding it would need a new
              APK and this could not ship over the air. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pressable
              onPress={() => setDate(shiftDays(date, -1))}
              hitSlop={10}
              accessibilityLabel="Previous day"
              style={[styles.dateChip, { borderColor: t.colors.border, backgroundColor: t.colors.surfaceStrong }]}>
              <Ionicons name="chevron-back" size={13} color={t.colors.textMuted} />
            </Pressable>

            <View style={{ flex: 1, alignItems: 'center' }}>
              <AppText variant="caption" tone={date === todayISO() ? 'muted' : 'accent'}>
                {prettyDate(date)}
              </AppText>
            </View>

            <Pressable
              onPress={() => setDate(shiftDays(date, 1))}
              // A reading dated tomorrow is a mis-set clock; the server
              // refuses it, so do not let them get that far.
              disabled={date >= todayISO()}
              hitSlop={10}
              accessibilityLabel="Next day"
              style={[
                styles.dateChip,
                {
                  borderColor: t.colors.border,
                  backgroundColor: t.colors.surfaceStrong,
                  opacity: date >= todayISO() ? 0.35 : 1,
                },
              ]}>
              <Ionicons name="chevron-forward" size={13} color={t.colors.textMuted} />
            </Pressable>

            {date !== todayISO() && (
              <Pressable
                onPress={() => setDate(todayISO())}
                hitSlop={10}
                style={[
                  styles.dateChip,
                  {
                    backgroundColor: t.colors.accent + (t.dark ? '2E' : '1A'),
                    borderColor: t.colors.accent + '55',
                  },
                ]}>
                <AppText variant="caption" tone="accent">Today</AppText>
              </Pressable>
            )}
          </View>

          {markers.map((code) => {
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
                    {MARKER_UNIT[code]}
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
          <AppText variant="title">{trendTitle}</AppText>
        </View>

        {anyData ? (
          <View style={{ gap: spacing.sm }}>
            {/* Week vs the whole history. Both are kept: the week is how a
                consultation talks, the full line is how progress reads. */}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {([['week', 'This week'], ['month', 'By month'], ['all', 'All readings']] as const).map(([key, label]) => {
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

            {period === 'month' && month ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.sm,
                }}>
                <Pressable
                  onPress={() => setMonthBack(monthBack - 1)}
                  disabled={monthIdx <= 0}
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  style={[
                    styles.weekArrow,
                    { borderColor: t.colors.border, opacity: monthIdx <= 0 ? 0.3 : 1 },
                  ]}>
                  <Ionicons name="chevron-back" size={15} color={t.colors.textMuted} />
                </Pressable>
                <AppText variant="caption" tone="muted">
                  {monthLabel(month)}
                </AppText>
                <Pressable
                  onPress={() => setMonthBack(Math.min(0, monthBack + 1))}
                  disabled={monthIdx >= months.length - 1}
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  style={[
                    styles.weekArrow,
                    {
                      borderColor: t.colors.border,
                      opacity: monthIdx >= months.length - 1 ? 0.3 : 1,
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
              {emptyHint}
            </AppText>
          </Card>
        ) : (
          markers.map((code) => {
            const pts = seriesByMarker[code];
            if (pts.length === 0) return null;
            const week = period === 'week' && start ? sugarWeek(trendByMarker[code], start) : null;
            // Month mode is the all-time chart narrowed to one month. Flags
            // were annotated over the full history, so a reading on the 1st
            // keeps its baseline from the end of the previous month.
            const shownPts = period === 'month' && month
              ? pts.filter((pt) => pt.takenOn.startsWith(month))
              : pts;
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
                        {MARKER_UNIT[code]}
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
                  <SugarChart marker={code} points={shownPts} />
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
              {referenceNoteFor(markers)}
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
