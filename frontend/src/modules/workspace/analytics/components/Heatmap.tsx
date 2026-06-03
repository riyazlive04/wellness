import { useState } from 'react';

interface HeatmapProps {
  /** 7 rows × 24 cols of activity counts */
  grid: number[][];
  max: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Heatmap({ grid, max }: HeatmapProps) {
  const [hover, setHover] = useState<{ dow: number; hour: number } | null>(null);

  function colorFor(v: number): string {
    if (v === 0) return 'rgba(255,255,255,0.04)';
    const t = v / Math.max(max, 1);
    // Indigo-to-emerald ramp with low alpha
    const r = Math.round(99 + (125 - 99) * t);
    const g = Math.round(102 + (190 - 102) * t);
    const b = Math.round(241 + (157 - 241) * t);
    const a = 0.15 + 0.75 * t;
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
  }

  return (
    <div className="w-full">
      {/* Hour labels (every 4 hours) */}
      <div className="grid grid-cols-[40px_repeat(24,1fr)] gap-[2px] pl-1">
        <div />
        {Array.from({ length: 24 }).map((_, h) => (
          <div
            key={h}
            className="text-center text-[8px] text-foreground/35"
            style={{ visibility: h % 4 === 0 ? 'visible' : 'hidden' }}
          >
            {h.toString().padStart(2, '0')}
          </div>
        ))}
      </div>

      {/* Rows */}
      {grid.map((row, dow) => (
        <div key={dow} className="mt-[2px] grid grid-cols-[40px_repeat(24,1fr)] gap-[2px]">
          <div className="flex items-center text-[10px] text-foreground/75 dark:text-foreground/60">{DAYS[dow]}</div>
          {row.map((v, h) => {
            const isHover = hover?.dow === dow && hover?.hour === h;
            return (
              <button
                key={h}
                type="button"
                onMouseEnter={() => setHover({ dow, hour: h })}
                onMouseLeave={() => setHover(null)}
                className={`h-5 rounded-[3px] border transition-transform ${
                  isHover ? 'scale-[1.15] border-foreground/40' : 'border-transparent'
                }`}
                style={{
                  background: colorFor(v),
                }}
                aria-label={`${DAYS[dow]} ${h}:00 — ${v} interactions`}
              />
            );
          })}
        </div>
      ))}

      {/* Legend + hover detail */}
      <div className="mt-4 flex items-center justify-between text-[10px] text-foreground/75 dark:text-foreground/60">
        <div className="flex items-center gap-1">
          <span>Less</span>
          {[0.05, 0.25, 0.5, 0.75, 1].map((t) => (
            <span
              key={t}
              className="h-2.5 w-4 rounded-[2px]"
              style={{ background: colorFor(t * max) }}
            />
          ))}
          <span>More</span>
        </div>

        {hover && (
          <div className="rounded-lg border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1 text-[11px]">
            <span className="text-foreground/75 dark:text-foreground/55">
              {DAYS[hover.dow]} at {hover.hour.toString().padStart(2, '0')}:00 —
            </span>
            <span className="ml-1 text-foreground/85">{grid[hover.dow][hover.hour]} actions</span>
          </div>
        )}
      </div>
    </div>
  );
}
