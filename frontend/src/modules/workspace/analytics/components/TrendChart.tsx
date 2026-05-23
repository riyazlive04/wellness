import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

interface TrendChartProps {
  /** Series to plot — y values 0..max */
  series: { label: string; value: number }[];
  height?: number;
  /** Color tone */
  accent?: 'indigo' | 'sage' | 'sand';
  /** Y-axis label */
  yLabel?: string;
  /** Number of x-axis labels to render (1..series.length) */
  xLabelCount?: number;
  /** Format the value displayed in the hover tooltip */
  formatValue?: (v: number) => string;
}

/**
 * TrendChart — clean SVG area chart with hover tooltip + gradient fill.
 * Smooths via Catmull-Rom-like control points for organic curve.
 */
export function TrendChart({
  series,
  height = 200,
  accent = 'indigo',
  yLabel,
  xLabelCount = 5,
  formatValue,
}: TrendChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const { path, areaPath, points, width, max, min } = useMemo(() => {
    const w = 800;
    const h = height;
    const pad = { top: 16, right: 8, bottom: 22, left: 30 };
    const values = series.map((s) => s.value);
    const mx = Math.max(...values, 1);
    const mn = Math.min(...values, 0);
    const range = Math.max(mx - mn, 1);
    const step = (w - pad.left - pad.right) / Math.max(series.length - 1, 1);

    const pts = series.map((s, i) => ({
      x: pad.left + i * step,
      y: pad.top + (1 - (s.value - mn) / range) * (h - pad.top - pad.bottom),
      v: s.value,
      label: s.label,
    }));

    let p = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cur = pts[i];
      const nxt = pts[i + 1];
      const cpx = (cur.x + nxt.x) / 2;
      p += ` C ${cpx} ${cur.y}, ${cpx} ${nxt.y}, ${nxt.x} ${nxt.y}`;
    }

    const ap = `${p} L ${pts[pts.length - 1].x} ${h - pad.bottom} L ${pts[0].x} ${h - pad.bottom} Z`;

    return { path: p, areaPath: ap, points: pts, width: w, max: mx, min: mn };
  }, [series, height]);

  const colors = {
    indigo: { stroke: '#A5ABFF', fillTop: 'rgba(99,102,241,0.45)', fillBot: 'rgba(99,102,241,0)' },
    sage:   { stroke: '#8FC7A8', fillTop: 'rgba(125,190,157,0.4)', fillBot: 'rgba(125,190,157,0)' },
    sand:   { stroke: '#E5C58C', fillTop: 'rgba(229,197,140,0.4)', fillBot: 'rgba(229,197,140,0)' },
  }[accent];

  // X-axis labels (evenly spaced)
  const xLabels = useMemo(() => {
    const n = Math.min(xLabelCount, series.length);
    if (n < 2) return [{ idx: 0, x: points[0]?.x ?? 0, label: series[0]?.label ?? '' }];
    return Array.from({ length: n }).map((_, i) => {
      const idx = Math.round((i / (n - 1)) * (series.length - 1));
      return { idx, x: points[idx].x, label: series[idx].label };
    });
  }, [series, points, xLabelCount]);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`area-${accent}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colors.fillTop} />
            <stop offset="100%" stopColor={colors.fillBot} />
          </linearGradient>
        </defs>

        {/* Y gridlines + labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = 16 + t * (height - 16 - 22);
          const v = Math.round(max - t * (max - min));
          return (
            <g key={t}>
              <line
                x1={30}
                x2={width - 8}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.04)"
              />
              <text
                x={26}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fill="rgba(255,255,255,0.35)"
                fontFamily="ui-sans-serif"
              >
                {v.toLocaleString('en-IN')}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <motion.path
          d={areaPath}
          fill={`url(#area-${accent})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        />

        {/* Stroke */}
        <motion.path
          d={path}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${colors.stroke}55)` }}
        />

        {/* Hover capture rects */}
        {points.map((p, i) => (
          <rect
            key={i}
            x={p.x - 6}
            y={0}
            width={12}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {/* Hover indicator */}
        {hover !== null && (
          <>
            <line
              x1={points[hover].x}
              x2={points[hover].x}
              y1={16}
              y2={height - 22}
              stroke={colors.stroke}
              strokeOpacity="0.4"
              strokeDasharray="3 3"
            />
            <circle
              cx={points[hover].x}
              cy={points[hover].y}
              r="4"
              fill={colors.stroke}
              style={{ filter: `drop-shadow(0 0 6px ${colors.stroke})` }}
            />
          </>
        )}

        {/* X-axis labels */}
        {xLabels.map((lab) => (
          <text
            key={lab.idx}
            x={lab.x}
            y={height - 6}
            textAnchor="middle"
            fontSize="9"
            fill="rgba(255,255,255,0.4)"
          >
            {lab.label}
          </text>
        ))}
      </svg>

      {/* Tooltip readout */}
      {hover !== null && (
        <div className="mt-2 inline-flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px]">
          <span className="text-white/55">{points[hover].label}</span>
          <span className="text-white/85">
            {yLabel && <span className="mr-1 text-white/55">{yLabel}:</span>}
            {formatValue
              ? formatValue(points[hover].v)
              : points[hover].v.toLocaleString('en-IN')}
          </span>
        </div>
      )}
    </div>
  );
}
