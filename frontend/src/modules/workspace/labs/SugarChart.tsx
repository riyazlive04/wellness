import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, Legend,
} from 'recharts';

import { cn } from '@/lib/utils';
import type { LabHistory } from '@/modules/workspace/api/labs';
import {
  BAND_CLASS, BAND_FILL, BAND_LABEL, SERIES_COLOR, SUGAR_LABEL, SUGAR_MARKERS,
  SUGAR_REFERENCE_NOTE, bandsFor, sugarBand, type SugarMarker,
} from './sugarBands';

/**
 * Daily blood sugar as a traffic-light trend.
 *
 * One component for both sides: the client watching their own numbers and the
 * practitioner reviewing them see the same chart, because two renderings of
 * the same readings is how the two end up discussing different pictures.
 *
 * Two views, because they answer different questions:
 *   - "All together" — are my sugars drifting up? Three lines, one scale.
 *   - One marker     — is it the 1st or the 2nd meal that spikes? One line
 *                      against its own reference bands, which is the only
 *                      view where colour bands are meaningful (fasting and
 *                      post-meal have different thresholds, so bands drawn
 *                      under all three at once would be wrong for two).
 */
export function SugarChart({ history, className }: { history: LabHistory; className?: string }) {
  const [view, setView] = useState<'all' | SugarMarker>('all');

  /** The sugar series that actually have readings, in a fixed order. */
  const available = useMemo(
    () => SUGAR_MARKERS.filter((code) =>
      history.series.some((s) => s.markerCode === code && s.points.some((p) => p.value != null))),
    [history.series],
  );

  /** One row per date, with a column per marker, so recharts can share an axis. */
  const rows = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const code of SUGAR_MARKERS) {
      const series = history.series.find((s) => s.markerCode === code);
      for (const p of series?.points ?? []) {
        if (p.value == null) continue;
        const row = byDate.get(p.takenOn) ?? { date: p.takenOn };
        row[code] = p.value;
        byDate.set(p.takenOn, row);
      }
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [history.series]);

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

  return (
    <div className={cn('space-y-3', className)}>
      {/* View switch */}
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
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(d: string) =>
                new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
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
              labelFormatter={(d) => new Date(String(d)).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
              formatter={(v, name) => {
                const code = String(name) as SugarMarker;
                const n = Number(v);
                return [`${n} mg/dL · ${BAND_LABEL[sugarBand(code, n)]}`, SUGAR_LABEL[code]];
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
                dot={{ r: 2.5 }}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] leading-relaxed text-foreground/50">
        {SUGAR_REFERENCE_NOTE}
      </p>
    </div>
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
