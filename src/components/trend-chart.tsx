import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';

/**
 * Lightweight area+line trend chart (e.g. weight over time). Uses a fixed
 * viewBox scaled to the container width, so it's responsive without measuring.
 */
export function TrendChart({
  values,
  height = 120,
  emptyLabel = 'No data yet.',
}: {
  values: number[];
  height?: number;
  emptyLabel?: string;
}) {
  const t = useTheme();
  const W = 300;
  const H = 120;
  const pad = 8;

  if (values.length < 2) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="muted" tone="faint">
          {emptyLabel}
        </AppText>
      </View>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (W - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => ({
    x: pad + i * stepX,
    y: pad + (1 - (v - min) / span) * (H - pad * 2),
  }));

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${H} L ${pts[0].x.toFixed(1)} ${H} Z`;

  return (
    <View style={{ height }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <SvgGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.colors.accent} stopOpacity={0.28} />
            <Stop offset="1" stopColor={t.colors.accent} stopOpacity={0} />
          </SvgGradient>
        </Defs>
        <Path d={area} fill="url(#trendFill)" />
        <Path d={line} stroke={t.colors.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3.5} fill={t.colors.accent} />
      </Svg>
    </View>
  );
}
