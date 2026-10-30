import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, Legend,
} from 'recharts';

import { cn } from '@/lib/utils';
import type { LabHistory } from '@/modules/workspace/api/labs';
import {
  BAND_CLASS, BAND_FILL, BAND_LABEL, SERIES_COLOR, SPIKE_NOTE, SUGAR_LABEL, SUGAR_MARKERS,
  SUGAR_REFERENCE_NOTE, TREND_CLASS, TREND_COLOR, TREND_LABEL, annotateSugarTrend, bandsFor,
  sugarBand, sugarTrendReason, sugarWeek, sugarWeekStarts, weekRangeLabel, weekStart,
  type SugarMarker, type SugarTrendPoint, type SugarWeekDay,
} from './sugarBands';

/**
 * Daily blood sugar as a traffic-light trend.
 *
 * One component for both sides: the client watching their own numbers and the
 * practitioner reviewing them see the same chart, because two renderings of
 * the same readings is how the two end up discussing different pictures.
 *
 * Two kinds of view, because they answer different questions:
 *   - This week    — Day 1..Day 7 of one week, with a day for every day
 *                    whether it was logged or not. Answers "how was last
 *                    week?", which is the unit a consultation works in.
 *   - All readings — the long continuous trend, kept because "am I better
 *                    than three months ago?" is not a weekly question.
 * And within either, all three markers together or one marker against its own
 * reference bands (fasting and post-meal have different thresholds, so bands
 * drawn under all three at once would be wrong for two).
 *
 * Two independent signals are drawn at once, and keeping them apart is the
 * point (see the long note in sugarBands.ts): the dot's FILL is its clinical
 * band, and a red RING around it means the reading jumped sharply against the
 * client's own 7-day average. A dot can be green-with-a-ring (in range but a
 * sharp rise — the client's 90 to 100 case) or red-with-no-ring (above range
 * but steady). Every ring is also spelled out in words in the tooltip and in
 * the list under the chart, so it is never colour alone.
 */
export function SugarChart({ history, className }: { history: LabHistory; className?: string }) {
  const [view, setView] = useState<'all' | SugarMarker>('all');
  const [period, setPeriod] = useState<'week' | 'allTime'>('week');

  /** The sugar series that actually have readings, in a fixed order. */
  const available = useMemo(
    () => SUGAR_MARKERS.filter((code) =>
      history.series.some((s) => s.markerCode === code && s.points.some((p) => p.value != null))),
    [history.series],
  );

  /**
   * Every marker's readings annotated with their baseline and spike flag.
   *
   * Annotated over the FULL history even when only one week is shown, so a
   * Monday's flag is judged against the previous week rather than losing its
   * baseline at the week boundary.
   */
  const trend = useMemo(() => {
    const out = {} as Record<SugarMarker, SugarTrendPoint[]>;
    for (const code of SUGAR_MARKERS) {
      const series = history.series.find((s) => s.markerCode === code);
      out[code] = annotateSugarTrend(
        (series?.points ?? [])
          .filter((p) => p.value != null)
          .map((p) => ({ takenOn: p.takenOn, value: p.value as number })),
      );
    }
    return out;
  }, [history.series]);

  /** Weeks that have at least one reading of any marker, oldest first. */
  const weeks = useMemo(() => {
    const set = new Set<string>();
    for (const code of SUGAR_MARKERS) for (const w of sugarWeekStarts(trend[code])) set.add(w);
    return [...set].sort();
  }, [trend]);

  // Open on the most recent week with data, not on today's possibly-empty one.
  const [weekIdx, setWeekIdx] = useState(0);
  useEffect(() => setWeekIdx(Math.max(0, weeks.length - 1)), [weeks.length]);
  const idx = Math.min(weekIdx, Math.max(0, weeks.length - 1));
  const start = weeks[idx];

  /**
   * One row per x-position, with a column per marker.
   *
   * In weekly mode there are always exactly seven rows — Day 1..Day 7 — and a
   * day nobody logged simply has no value for that marker. Recharts leaves a
   * gap for an absent key, which is the honest drawing: a zero would sit on
   * the floor of the chart and read as a catastrophic hypo.
   */
  const rows = useMemo(() => {
    if (period === 'week') {
      if (!start) return [];
      const perMarker = {} as Record<SugarMarker, SugarWeekDay[]>;
      for (const code of SUGAR_MARKERS) perMarker[code] = sugarWeek(trend[code], start);
      return perMarker.fbs.map((d, i) => {
        const row: ChartRow = {
          date: d.takenOn,
          label: `Day ${d.day}`,
          weekday: d.weekday,
        };
        for (const code of SUGAR_MARKERS) {
          const day = perMarker[code][i];
          if (day.value != null) {
            row[code] = day.value;
            if (day.trend?.flag) row[`${code}__flag`] = day.trend.flag;
            const why = day.trend ? sugarTrendReason(day.trend) : null;
            if (why) row[`${code}__why`] = why;
          }
        }
        return row;
      });
    }

    const byDate = new Map<string, ChartRow>();
    for (const code of SUGAR_MARKERS) {
      for (const p of trend[code]) {
        const row = byDate.get(p.takenOn) ?? { date: p.takenOn, label: p.takenOn };
        row[code] = p.value;
        if (p.flag) row[`${code}__flag`] = p.flag;
        const why = sugarTrendReason(p);
        if (why) row[`${code}__why`] = why;
        byDate.set(p.takenOn, row);
      }
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [period, start, trend]);

  if (!available.length) return null;

  const shown: SugarMarker[] = view === 'all' ? available : [view];
  const dataMax = Math.max(
    0,
    ...rows.flatMap((r) => shown.map((c) => Number(r[c] ?? 0))),
  );
  // Bands only make sense against a single marker's thresholds.
  const single = view === 'all' ? null : view;
  const { top, bands } = bandsFor(single ?? 'fbs', dataMax);

  const latest = single
    ? history.series.find((s) => s.markerCode === single)?.latest
    : null;

  /** Flagged readings in what is on screen, for the text list under the chart. */
  const flagged = rows.flatMap((r) =>
    shown
      .filter((c) => r[`${c}__flag`])
      .map((c) => ({
        code: c,
        date: String(r.date),
        flag: r[`${c}__flag`] as 'spike' | 'dip',
        why: String(r[`${c}__why`] ?? ''),
        value: Number(r[c]),
      })),
  );

  return (
    <div className={cn('space-y-3', className)}>
      {/* Period switch, then the week navigator it controls. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Tab active={period === 'week'} onClick={() => setPeriod('week')}>This week</Tab>
        <Tab active={period === 'allTime'} onClick={() => setPeriod('allTime')}>All readings</Tab>

        {period === 'week' && weeks.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekIdx(idx - 1)}
              disabled={idx <= 0}
              aria-label="Previous week"
              className="rounded-full border border-foreground/10 p-1 text-foreground/60 hover:bg-foreground/[0.04] disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[8.5rem] text-center text-[11px] font-semibold tabular-nums text-foreground/70">
              {weekRangeLabel(start)}
              {start === weekStart(todayISO()) && (
                <span className="ml-1 font-normal text-foreground/45">· this week</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setWeekIdx(idx + 1)}
              disabled={idx >= weeks.length - 1}
              aria-label="Next week"
              className="rounded-full border border-foreground/10 p-1 text-foreground/60 hover:bg-foreground/[0.04] disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Marker switch */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Tab active={view === 'all'} onClick={() => setView('all')}>All together</Tab>
        {available.map((code) => (
          <Tab key={code} active={view === code} onClick={() => setView(code)}>
            {SUGAR_LABEL[code]}
          </Tab>
        ))}

        {/* The latest reading's band, as a word and a colour - the colour
            alone would be unreadable for a red-green colourblind client. */}
        {latest?.value != null && single && (
          <span className={cn(
            'ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            BAND_CLASS[sugarBand(single, latest.value)],
          )}>
            {latest.value} mg/dL · {BAND_LABEL[sugarBand(single, latest.value)]}
          </span>
        )}
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 2, left: -18 }}>
            {/* Reference bands, only under a single-marker view. */}
            {single && bands.map((b) => (
              <ReferenceArea
                key={b.band}
                y1={b.from}
                y2={b.to}
                fill={BAND_FILL[b.band]}
                stroke="none"
                ifOverflow="hidden"
              />
            ))}

            <XAxis
              dataKey={period === 'week' ? 'label' : 'date'}
              tick={{ fontSize: 10 }}
              tickFormatter={(d: string) =>
                period === 'week'
                  ? d
                  : new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              stroke="currentColor"
              className="text-foreground/40"
            />
            <YAxis
              domain={[0, top]}
              tick={{ fontSize: 10 }}
              stroke="currentColor"
              className="text-foreground/40"
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 10 }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as ChartRow | undefined;
                const iso = String(row?.date ?? '');
                const d = iso
                  ? new Date(iso).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })
                  : '';
                return period === 'week' ? `${row?.label} · ${row?.weekday} ${d}` : d;
              }}
              formatter={(v, name, item) => {
                const code = String(name) as SugarMarker;
                const n = Number(v);
                const row = item?.payload as ChartRow | undefined;
                const why = row?.[`${code}__why`];
                // Band first, then the spike reason as its own clause: the two
                // are different claims and reading them as one ("above range,
                // +14") would collapse the distinction the ring exists for.
                const band = `${n} mg/dL · ${BAND_LABEL[sugarBand(code, n)]}`;
                return [why ? `${band} · ${why}` : band, SUGAR_LABEL[code]];
              }}
            />
            {view === 'all' && available.length > 1 && (
              <Legend
                formatter={(name) => SUGAR_LABEL[String(name) as SugarMarker]}
                wrapperStyle={{ fontSize: 10 }}
              />
            )}

            {shown.map((code) => (
              <Line
                key={code}
                type="monotone"
                dataKey={code}
                name={code}
                stroke={SERIES_COLOR[code]}
                strokeWidth={2}
                // Gaps rather than a straight line across a missed day: a
                // client who skipped Tuesday did not glide through it.
                connectNulls={false}
                dot={(props) => <SugarDot {...props} code={code} />}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Days in this week with no reading, named. The chart's gap says it
          visually; saying it in words is what makes "not logged" readable as
          absence rather than as a rendering accident. */}
      {period === 'week' && single && <NotLogged week={sugarWeek(trend[single], start)} />}

      {/* Every flagged reading in words. The red ring is never the only cue -
          this list is the same information for a colourblind reader, and it is
          where a practitioner reads WHY a dot was flagged. */}
      {flagged.length > 0 && (
        <ul className="space-y-1">
          {flagged.map((f) => (
            <li key={`${f.code}-${f.date}-${f.flag}`} className="flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className={cn(
                'rounded-full border px-1.5 py-0.5 font-semibold',
                TREND_CLASS[f.flag],
              )}>
                {TREND_LABEL[f.flag]}
              </span>
              <span className="text-foreground/60">
                {SUGAR_LABEL[f.code]} {f.value} mg/dL on{' '}
                {new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                {' — '}{f.why}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] leading-relaxed text-foreground/50">
        {SUGAR_REFERENCE_NOTE}
      </p>
      <p className="text-[10px] leading-relaxed text-foreground/50">
        {SPIKE_NOTE}
      </p>
    </div>
  );
}

/** A chart row: the x-axis keys, plus a value / flag / reason per marker. */
type ChartRow = Record<string, number | string | undefined> & {
  date: string;
  label: string;
  weekday?: string;
};

/** Today in the browser's own date, to mark which week is the current one. */
function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * One dot: band colour as the fill, a red ring when the reading spiked.
 *
 * The ring rather than a different fill is the whole trick that lets both
 * signals coexist on one dot - recolouring the fill would mean a spike inside
 * the normal range looked identical to a reading above range, which is exactly
 * the confusion the brief warns about.
 */
function SugarDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
  code: SugarMarker;
}) {
  const { cx, cy, payload, code } = props;
  if (cx == null || cy == null) return null;
  const value = Number(payload?.[code]);
  if (!Number.isFinite(value)) return null;

  const flag = payload?.[`${code}__flag`] as 'spike' | 'dip' | undefined;
  const fill = SERIES_COLOR[code];

  return (
    <g>
      {flag === 'spike' && (
        <circle cx={cx} cy={cy} r={6} fill="none" stroke={TREND_COLOR.spike} strokeWidth={2} />
      )}
      {flag === 'dip' && (
        <circle
          cx={cx}
          cy={cy}
          r={6}
          fill="none"
          stroke={TREND_COLOR.dip}
          strokeWidth={1.25}
          strokeDasharray="2 2"
        />
      )}
      <circle cx={cx} cy={cy} r={2.5} fill={fill} stroke="none" />
    </g>
  );
}

/** "Not logged: Wed, Sat" - absence stated, never drawn as a zero. */
function NotLogged({ week }: { week: SugarWeekDay[] }) {
  const missing = week.filter((d) => d.value == null);
  if (!missing.length) return null;
  return (
    <p className="text-[10px] text-foreground/45">
      {missing.length === 7
        ? 'No readings logged this week.'
        : `Not logged: ${missing.map((d) => `${d.weekday} (Day ${d.day})`).join(', ')}`}
    </p>
  );
}

function Tab({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'border-foreground/20 bg-foreground/[0.07] text-foreground'
          : 'border-foreground/10 text-foreground/60 hover:bg-foreground/[0.04]',
      )}
    >
      {children}
    </button>
  );
}
