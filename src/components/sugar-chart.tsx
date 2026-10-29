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
 * Deliberately no charting library: this is four rects, a polyline and some
 * circles, and a dependency would cost more than it saves.
 */
import { View } from 'react-native';
import Svg, { Circle, Line, Rect, Path, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import {
  BAND_COLOR, SERIES_COLOR, SUGAR_LABEL, bandsFor, sugarBand,
  type SugarMarker,
} from '@/lib/sugar-bands';
import { spacing } from '@/lib/theme';

export interface SugarPoint {
  takenOn: string;
  value: number;
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

  const pts = points.map((p, i) => ({ x: xOf(i), y: yOf(p.value), value: p.value }));
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
