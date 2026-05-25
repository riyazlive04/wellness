import { motion } from 'framer-motion';
import { useMemo } from 'react';
import type { AiUsageSlice } from '../types';

interface DonutProps {
  slices: AiUsageSlice[];
  size?: number;
  thickness?: number;
}

/**
 * Donut — SVG ring chart with hovering segments. Center shows total.
 */
export function Donut({ slices, size = 180, thickness = 22 }: DonutProps) {
  const total = slices.reduce((a, s) => a + s.calls, 0);

  const segments = useMemo(() => {
    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    let cumulativeAngle = 0;
    return slices.map((s) => {
      const fraction = total > 0 ? s.calls / total : 0;
      const offset = cumulativeAngle * circumference;
      const len = fraction * circumference;
      cumulativeAngle += fraction;
      return {
        slice: s,
        fraction,
        offset,
        len,
        circumference,
        radius,
      };
    });
  }, [slices, size, thickness, total]);

  return (
    <div className="flex items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={(size - thickness) / 2}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={thickness}
          />
          {/* Segments */}
          {segments.map((seg) => (
            <motion.circle
              key={seg.slice.feature}
              cx={size / 2}
              cy={size / 2}
              r={seg.radius}
              fill="none"
              stroke={seg.slice.color}
              strokeWidth={thickness}
              strokeDasharray={`${seg.len} ${seg.circumference}`}
              strokeDashoffset={-seg.offset}
              strokeLinecap="butt"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            />
          ))}
        </svg>

        {/* Center label */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {total.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/40">AI calls</div>
        </div>
      </div>

      {/* Legend */}
      <ul className="flex-1 space-y-2 text-xs">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.calls / total) * 100) : 0;
          return (
            <li key={s.feature} className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                  style={{ background: s.color }}
                />
                <span className="truncate text-foreground/75">{s.label}</span>
              </div>
              <div className="text-right tabular-nums">
                <span className="text-foreground/85">{s.calls}</span>
                <span className="ml-1 text-[10px] text-foreground/40">{pct}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
