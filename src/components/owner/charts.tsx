/**
 * Minimal SVG charts for the owner analytics screens.
 *
 * The web uses Recharts; that's a DOM library. Rather than pull a charting
 * dependency into the bundle for four small panels, these are hand-drawn with
 * react-native-svg (already a dependency, used by the client portal's
 * TrendChart and score ring). Deliberately unlabelled and un-interactive: on a
 * phone the number above the chart carries the meaning, the chart carries the
 * shape.
 */
import Svg, { Circle, Rect } from 'react-native-svg';
import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { spacing } from '@/lib/theme';

/** Vertical bars, scaled to the tallest value. */
export function BarChart({
  values,
  labels,
  height = 120,
  emptyLabel = 'No data yet.',
}: {
  values: number[];
  /** Optional sparse axis labels — first and last are shown. */
  labels?: string[];
  height?: number;
  emptyLabel?: string;
}) {
  const t = useTheme();
  if (!values.length || values.every((v) => !v)) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="muted" tone="faint">
          {emptyLabel}
        </AppText>
      </View>
    );
  }

  const W = 300;
  const H = 120;
  const pad = 4;
  const max = Math.max(...values) || 1;
  const slot = (W - pad * 2) / values.length;
  const barW = Math.max(2, slot * 0.62);

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ height }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {values.map((v, i) => {
            const h = (v / max) * (H - pad * 2);
            return (
              <Rect
                key={i}
                x={pad + i * slot + (slot - barW) / 2}
                y={H - pad - h}
                width={barW}
                height={Math.max(h, v > 0 ? 1.5 : 0)}
                rx={1.5}
                fill={t.colors.accent}
                opacity={0.85}
              />
            );
          })}
        </Svg>
      </View>
      {labels?.length ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" tone="faint">
            {labels[0]}
          </AppText>
          <AppText variant="caption" tone="faint">
            {labels[labels.length - 1]}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/** Horizontal proportion bars — for "by status" / "by plan" breakdowns. */
export function BreakdownBars({
  rows,
}: {
  rows: { label: string; value: number; hint?: string }[];
}) {
  const t = useTheme();
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="muted" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
              {r.label}
            </AppText>
            <AppText variant="muted">{r.hint ?? r.value}</AppText>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: t.colors.surfaceStrong, overflow: 'hidden' }}>
            <View
              style={{
                width: `${Math.max(2, (r.value / max) * 100)}%`,
                height: '100%',
                backgroundColor: t.colors.accent,
                borderRadius: 3,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Donut showing one share of a whole — used for macro splits. */
export function DonutRing({
  segments,
  size = 120,
}: {
  segments: { value: number; color: string; label: string }[];
  size?: number;
}) {
  const t = useTheme();
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;

  if (!total) {
    return (
      <AppText variant="muted" tone="faint">
        No data yet.
      </AppText>
    );
  }

  // Each arc starts where the previous one ended. Precomputed rather than
  // accumulated inside the map — a variable mutated across a render pass is a
  // React Compiler violation and can memoize to the wrong offsets.
  const arcs = segments.reduce<{ segment: (typeof segments)[number]; dash: string; offset: number }[]>(
    (acc, s) => {
      const start = acc.length ? acc[acc.length - 1].offset + (acc[acc.length - 1].segment.value / total) * c : 0;
      acc.push({ segment: s, dash: `${(s.value / total) * c} ${c}`, offset: start });
      return acc;
    },
    [],
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={r} stroke={t.colors.surfaceStrong} strokeWidth={12} fill="none" />
        {arcs.map((a, i) => (
          <Circle
            key={i}
            cx={50}
            cy={50}
            r={r}
            stroke={a.segment.color}
            strokeWidth={12}
            fill="none"
            strokeDasharray={a.dash}
            strokeDashoffset={-a.offset}
            // Start at 12 o'clock rather than 3 o'clock.
            transform="rotate(-90 50 50)"
            strokeLinecap="butt"
          />
        ))}
      </Svg>
      <View style={{ gap: spacing.xs, flex: 1 }}>
        {segments.map((s) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
            <AppText variant="muted" tone="muted" style={{ flex: 1 }}>
              {s.label}
            </AppText>
            <AppText variant="muted">{Math.round((s.value / total) * 100)}%</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
