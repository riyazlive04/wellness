/**
 * Daily blood sugar as a traffic-light chart.
 *
 * The coloured bands behind the line are the whole point: a wavy line of
 * glucose numbers tells a client nothing, while "my dot sat in the green for
 * nine days" is immediately legible. The line itself is one colour per series
 * and each marker dot takes the colour of the band it lands in, so a single
 * spike is visible without reading the axis.
 *
 * Mirrors the web SugarChart (frontend/src/modules/workspace/labs/SugarChart.tsx);
 * thresholds live in one shared place (`@/lib/sugar-bands`) so a client's phone
 * and a practitioner's laptop can never disagree about what green means.
 *
 * Two things are drawn on each dot, and keeping them apart is the point (see
 * the long note in sugar-bands.ts): the dot's FILL is its clinical band, and a
 * red RING means the reading jumped sharply against the client's own 7-day
 * average. A dot can be green-with-a-ring (in range but a sharp rise) or
 * red-with-no-ring (above range but steady). The ring is never the only cue -
 * the caller prints the reason in words underneath.
 *
 * Deliberately no charting library: this is four rects, a polyline and some
 * circles, and a dependency would cost more than it saves.
 */
import { View } from 'react-native';
import Svg, { Circle, Line, Rect, Path, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import {
  BAND_COLOR, SERIES_COLOR, SUGAR_LABEL, TREND_COLOR, bandsFor, sugarBand,
  type SugarMarker, type SugarTrendFlag, type SugarWeekDay,
} from '@/lib/sugar-bands';
import { spacing } from '@/lib/theme';

export interface SugarPoint {
  takenOn: string;
  value: number;
  /** Spike / dip against the client's own trailing average, when known. */
  flag?: SugarTrendFlag;
}

/** Translucent band fill — same hue as the band colour, at chart-background strength. */
function bandFill(hex: string, dark: boolean): string {
  return hex + (dark ? '26' : '1C');
}

/** 'd' for a smooth-enough line: straight segments, rounded joins. */
function linePath(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

/** 'Oct 29' from '2026-10-29', without pulling in a date library. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  const mi = Number(m) - 1;
  return MONTHS[mi] ? `${MONTHS[mi]} ${Number(d)}` : iso.slice(5);
}

export function SugarChart({
  marker,
  points,
  height = 180,
}: {
  marker: SugarMarker;
  points: SugarPoint[];
  height?: number;
}) {
  const t = useTheme();

  // Fixed viewBox scaled to the container: responsive without measuring.
  const W = 320;
  const H = 180;
  const padL = 30;   // room for the y-axis numbers
  const padR = 8;
  const padT = 8;
  const padB = 18;   // room for the date labels

  if (points.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="muted" tone="faint">
          Log a reading to start your chart.
        </AppText>
      </View>
    );
  }

  const values = points.map((p) => p.value);
  const { top, bands } = bandsFor(marker, Math.max(...values));

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const yOf = (v: number) => padT + (1 - Math.min(v, top) / top) * plotH;
  // A single reading has no span to spread over, so it sits in the middle.
  const xOf = (i: number) =>
    points.length === 1 ? padL + plotW / 2 : padL + (i / (points.length - 1)) * plotW;

  const pts = points.map((p, i) => ({ x: xOf(i), y: yOf(p.value), value: p.value, flag: p.flag }));
  const lineColor = SERIES_COLOR[marker];

  // Only label the first, middle and last dates: three fit, eight overlap.
  const labelIdx = points.length <= 2
    ? points.map((_, i) => i)
    : [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ height }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`}>
          {/* Reference bands, bottom to top. */}
          {bands.map((b) => {
            const yTop = yOf(b.to);
            const yBottom = yOf(b.from);
            return (
              <Rect
                key={b.band}
                x={padL}
                y={yTop}
                width={plotW}
                height={Math.max(0, yBottom - yTop)}
                fill={bandFill(BAND_COLOR[b.band], t.dark)}
              />
            );
          })}

          {/* Threshold lines with their value, so the colours have numbers. */}
          {bands.slice(0, -1).map((b) => (
            <Line
              key={`edge-${b.band}`}
              x1={padL}
              y1={yOf(b.to)}
              x2={W - padR}
              y2={yOf(b.to)}
              stroke={BAND_COLOR[b.band]}
              strokeOpacity={0.35}
              strokeWidth={0.75}
              strokeDasharray="3 3"
            />
          ))}
          {bands.slice(0, -1).map((b) => (
            <SvgText
              key={`tick-${b.band}`}
              x={padL - 4}
              y={yOf(b.to) + 3}
              fill={t.colors.textFaint}
              fontSize={8}
              textAnchor="end">
              {String(b.to)}
            </SvgText>
          ))}

          {/* The trend itself. */}
          {pts.length > 1 ? (
            <Path
              d={linePath(pts)}
              stroke={lineColor}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {/* A ring for a sharp change against the client's own average. Drawn
              under the dot so the band colour stays readable through it. */}
          {pts.map((p, i) =>
            p.flag ? (
              <Circle
                key={`flag-${points[i].takenOn}-${i}`}
                cx={p.x}
                cy={p.y}
                r={6.5}
                fill="none"
                stroke={TREND_COLOR[p.flag]}
                strokeWidth={p.flag === 'spike' ? 2 : 1.25}
                strokeDasharray={p.flag === 'spike' ? undefined : '2 2'}
              />
            ) : null,
          )}

          {/* Each dot coloured by the band it lands in. */}
          {pts.map((p, i) => (
            <Circle
              key={`${points[i].takenOn}-${i}`}
              cx={p.x}
              cy={p.y}
              r={3.4}
              fill={BAND_COLOR[sugarBand(marker, p.value)]}
              stroke={t.colors.surface}
              strokeWidth={1.2}
            />
          ))}

          {/* Dates under the dots they belong to. */}
          {labelIdx.map((i) => (
            <SvgText
              key={`d-${i}`}
              x={xOf(i)}
              y={H - 5}
              fill={t.colors.textFaint}
              fontSize={8}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
              {shortDate(points[i].takenOn)}
            </SvgText>
          ))}
        </Svg>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 10, height: 2.5, borderRadius: 2, backgroundColor: lineColor }} />
        <AppText variant="caption" tone="faint">
          {`${SUGAR_LABEL[marker]} · mg/dL · ${points.length} ${points.length === 1 ? 'reading' : 'readings'}`}
        </AppText>
      </View>
    </View>
  );
}

/**
 * The same chart as a fixed Day 1..Day 7 week.
 *
 * Separate from `SugarChart` rather than a mode flag on it, because almost
 * nothing is shared once the x-axis stops being "the readings I have": here
 * there are always exactly seven slots whether or not they were logged, the
 * axis is labelled Day 1..Day 7 as the brief asks, and a day with no reading
 * must be drawn as a GAP — a hollow tick on the axis and a break in the line,
 * never a dot at zero. A zero would sit on the floor of the chart and read as
 * a catastrophic hypo, which is the worst thing this chart could say.
 */
export function SugarWeekChart({
  marker,
  week,
  height = 180,
}: {
  marker: SugarMarker;
  week: SugarWeekDay[];
  height?: number;
}) {
  const t = useTheme();

  const W = 320;
  const H = 180;
  const padL = 30;
  const padR = 8;
  const padT = 8;
  const padB = 24;   // a little more: two rows of labels (Day n, and the weekday)

  const logged = week.filter((d) => d.value != null);
  const { top, bands } = bandsFor(marker, logged.length ? Math.max(...logged.map((d) => d.value as number)) : 0);

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const yOf = (v: number) => padT + (1 - Math.min(v, top) / top) * plotH;
  // Seven fixed slots, inset half a slot so Day 1 and Day 7 are not on the edge.
  const slot = plotW / 7;
  const xOf = (i: number) => padL + slot * (i + 0.5);

  /** Contiguous runs of logged days, so the line breaks across a missed day. */
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  week.forEach((d, i) => {
    if (d.value == null) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    run.push({ x: xOf(i), y: yOf(d.value) });
  });
  if (run.length) runs.push(run);

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ height }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`}>
          {bands.map((b) => {
            const yTop = yOf(b.to);
            const yBottom = yOf(b.from);
            return (
              <Rect
                key={b.band}
                x={padL}
                y={yTop}
                width={plotW}
                height={Math.max(0, yBottom - yTop)}
                fill={bandFill(BAND_COLOR[b.band], t.dark)}
              />
            );
          })}

          {bands.slice(0, -1).map((b) => (
            <Line
              key={`edge-${b.band}`}
              x1={padL}
              y1={yOf(b.to)}
              x2={W - padR}
              y2={yOf(b.to)}
              stroke={BAND_COLOR[b.band]}
              strokeOpacity={0.35}
              strokeWidth={0.75}
              strokeDasharray="3 3"
            />
          ))}
          {bands.slice(0, -1).map((b) => (
            <SvgText
              key={`tick-${b.band}`}
              x={padL - 4}
              y={yOf(b.to) + 3}
              fill={t.colors.textFaint}
              fontSize={8}
              textAnchor="end">
              {String(b.to)}
            </SvgText>
          ))}

          {/* One segment per run of consecutive logged days. */}
          {runs.map((r, i) =>
            r.length > 1 ? (
              <Path
                key={`run-${i}`}
                d={linePath(r)}
                stroke={SERIES_COLOR[marker]}
                strokeWidth={2}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}

          {/* Spike / dip rings, under the dots. */}
          {week.map((d, i) =>
            d.value != null && d.trend?.flag ? (
              <Circle
                key={`flag-${d.takenOn}`}
                cx={xOf(i)}
                cy={yOf(d.value)}
                r={6.5}
                fill="none"
                stroke={TREND_COLOR[d.trend.flag]}
                strokeWidth={d.trend.flag === 'spike' ? 2 : 1.25}
                strokeDasharray={d.trend.flag === 'spike' ? undefined : '2 2'}
              />
            ) : null,
          )}

          {week.map((d, i) =>
            d.value != null ? (
              <Circle
                key={`dot-${d.takenOn}`}
                cx={xOf(i)}
                cy={yOf(d.value)}
                r={3.4}
                fill={BAND_COLOR[sugarBand(marker, d.value)]}
                stroke={t.colors.surface}
                strokeWidth={1.2}
              />
            ) : (
              // Not logged: a hollow tick on the baseline, so the day is
              // present and visibly empty rather than silently missing.
              <Circle
                key={`gap-${d.takenOn}`}
                cx={xOf(i)}
                cy={H - padB}
                r={2}
                fill="none"
                stroke={t.colors.textFaint}
                strokeWidth={1}
                strokeDasharray="1.5 1.5"
              />
            ),
          )}

          {/* Day 1..Day 7 on top, the weekday under it. */}
          {week.map((d, i) => (
            <SvgText
              key={`day-${d.takenOn}`}
              x={xOf(i)}
              y={H - 12}
              fill={d.value == null ? t.colors.textFaint : t.colors.textMuted}
              fontSize={8}
              textAnchor="middle">
              {`D${d.day}`}
            </SvgText>
          ))}
          {week.map((d, i) => (
            <SvgText
              key={`wd-${d.takenOn}`}
              x={xOf(i)}
              y={H - 3}
              fill={t.colors.textFaint}
              fontSize={7}
              textAnchor="middle">
              {d.weekday}
            </SvgText>
          ))}
        </Svg>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View
          style={{ width: 10, height: 2.5, borderRadius: 2, backgroundColor: SERIES_COLOR[marker] }}
        />
        <AppText variant="caption" tone="faint">
          {`${SUGAR_LABEL[marker]} · mg/dL · ${logged.length} of 7 days logged`}
        </AppText>
      </View>
    </View>
  );
}
