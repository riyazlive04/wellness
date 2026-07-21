import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';

/**
 * Circular wellness-score ring (0-100). Mirrors the web Today hero's SVG ring.
 */
export function ScoreRing({
  score,
  size = 116,
  stroke = 9,
  label,
}: {
  score: number | null;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score != null ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const offset = c * (1 - pct);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <SvgGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.gradient[0]} />
            <Stop offset="0.5" stopColor={t.gradient[1]} />
            <Stop offset="1" stopColor={t.gradient[2]} />
          </SvgGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.colors.border} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#scoreGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          fill="none"
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <AppText variant="display" style={{ fontVariant: ['tabular-nums'] }}>
          {score ?? '–'}
        </AppText>
        {label ? (
          <AppText variant="caption" tone="muted">
            {label}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
