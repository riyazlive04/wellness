import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ChevronDown, FlaskConical, Loader2, Minus } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea } from 'recharts';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import {
  myLabsApi, deltaTone, formatPoint, formatRange, STATUS_CLASS, STATUS_LABEL,
  type LabSeries,
} from '@/modules/workspace/api/labs';
import { cn } from '@/lib/utils';

/**
 * My lab results — read-only.
 *
 * Deliberately narrower than the practitioner's view: a client sees their own
 * numbers, how they are moving, and whether each sits inside the range their own
 * report printed. What it never does is interpret. There is no "abnormal", no
 * traffic-light verdict on the whole panel, and the empty state points at the
 * nutritionist rather than inviting self-diagnosis.
 */
export default function ClientLabs() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = useQuery({ queryKey: ['me', 'labs'], queryFn: () => myLabsApi.history(), retry: 1 });
  const history = q.data;

  const byPanel = useMemo(() => {
    const groups: Array<{ panel: string; label: string; series: LabSeries[] }> = [];
    for (const s of history?.series ?? []) {
      let g = groups.find((x) => x.panel === s.panel);
      if (!g) { g = { panel: s.panel, label: s.panelLabel, series: [] }; groups.push(g); }
      g.series.push(s);
    }
    return groups;
  }, [history]);

  return (
    <ClientLayout>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-3">
        <motion.div variants={fadeUp}>
          <h1 className="flex items-center gap-2 text-xl font-extrabold">
            <FlaskConical className="h-5 w-5 text-foreground/50" /> My lab results
          </h1>
          <p className="mt-0.5 text-xs text-foreground/50">
            The numbers from your blood reports, and how they have moved over time.
          </p>
        </motion.div>

        {q.isLoading ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
        ) : !history || history.totals.results === 0 ? (
          <motion.div variants={fadeUp}>
            <Glass className="rounded-3xl border-foreground/[0.06] px-5 py-12 text-center shadow-sm">
              <FlaskConical className="mx-auto mb-2 h-8 w-8 text-foreground/20" />
              <div className="text-sm font-semibold">No results yet</div>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-foreground/50">
                Once you share a blood report with your nutritionist, your results appear here so you can
                both watch them change.
              </p>
            </Glass>
          </motion.div>
        ) : (
          <>
            <motion.div variants={fadeUp}>
              <Glass className="grid grid-cols-3 divide-x divide-foreground/[0.05] rounded-3xl border-foreground/[0.06] shadow-sm">
                <Stat label="Markers" value={history.totals.markers} />
                <Stat label="Results" value={history.totals.results} />
                <Stat label="Outside range" value={history.totals.flagged} />
              </Glass>
            </motion.div>

            {history.totals.flagged > 0 && (
              <motion.p variants={fadeUp} className="px-1 text-[11px] leading-relaxed text-foreground/45">
                "Outside range" simply means a value sat above or below the range printed on your own
                report. It is not a diagnosis — your nutritionist will talk you through what it means.
              </motion.p>
            )}

            {byPanel.map((group) => (
              <motion.div variants={fadeUp} key={group.panel}>
                <Glass className="overflow-hidden rounded-3xl border-foreground/[0.06] shadow-sm">
                  <div className="border-b border-foreground/[0.06] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/50">
                    {group.label}
                  </div>
                  <div className="divide-y divide-foreground/[0.05]">
                    {group.series.map((s) => (
                      <MarkerRow
                        key={s.markerCode}
                        series={s}
                        open={expanded === s.markerCode}
                        onToggle={() => setExpanded(expanded === s.markerCode ? null : s.markerCode)}
                      />
                    ))}
                  </div>
                </Glass>
              </motion.div>
            ))}
          </>
        )}
      </motion.div>
    </ClientLayout>
  );
}

function MarkerRow({ series, open, onToggle }: { series: LabSeries; open: boolean; onToggle: () => void }) {
  const latest = series.latest;
  const status = latest?.status ?? 'unknown';
  const tone = deltaTone(series.delta, series.higherIsWorse);
  const range = latest ? formatRange(latest.refLow, latest.refHigh, latest.refText) : null;

  const chartData = series.points
    .filter((p) => p.value !== null)
    .map((p) => ({ date: p.takenOn, value: p.value as number }));

  return (
    <div>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-foreground/[0.02]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{series.markerLabel}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]', STATUS_CLASS[status])}>
              {STATUS_LABEL[status]}
            </span>
          </div>
          {range && <div className="mt-0.5 text-[11px] text-foreground/45">Your lab's range {range}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-base font-extrabold tabular-nums">
            {latest ? formatPoint(latest) : <span className="text-foreground/30">—</span>}
          </div>
          {series.delta !== null && (
            <div className={cn(
              'inline-flex items-center gap-0.5 text-[11px] tabular-nums',
              tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
              tone === 'bad' && 'text-rose-600 dark:text-rose-400',
              tone === null && 'text-foreground/45',
            )}>
              {series.delta > 0 ? <ArrowUp className="h-3 w-3" /> : series.delta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {Math.abs(series.delta)} since last
            </div>
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-foreground/35 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-2 bg-foreground/[0.015] px-5 pb-4 pt-1">
          {chartData.length > 1 ? (
            <div className="rounded-2xl border border-foreground/[0.06] bg-card p-3">
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  {latest?.refLow !== null && latest?.refHigh !== null && latest && (
                    <ReferenceArea y1={latest.refLow as number} y2={latest.refHigh as number} fill="#10b981" fillOpacity={0.07} />
                  )}
                  <XAxis dataKey="date" tick={{ fontSize: 10, stroke: 'currentColor', opacity: 0.5 }} tickLine={false} axisLine={false}
                    tickFormatter={(d: string) => fmt(d, true)} />
                  <YAxis tick={{ fontSize: 10, stroke: 'currentColor', opacity: 0.5 }} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid rgba(127,127,127,0.2)' }}
                    labelFormatter={(d) => fmt(String(d))}
                    formatter={(v: number) => [series.unit ? `${v} ${series.unit}` : v, series.markerLabel]}
                  />
                  <Line type="monotone" dataKey="value" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-foreground/[0.1] px-3 py-4 text-center text-[11px] text-foreground/40">
              Your next report will start the trend line.
            </div>
          )}

          {[...series.points].reverse().map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl border border-foreground/[0.06] bg-card px-3 py-2 text-xs">
              <span className="w-20 shrink-0 tabular-nums text-foreground/55">{fmt(p.takenOn, true)}</span>
              <span className="min-w-0 flex-1 font-semibold tabular-nums">{formatPoint(p)}</span>
              {p.labName && <span className="hidden truncate text-foreground/40 sm:block">{p.labName}</span>}
              <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase', STATUS_CLASS[p.status])}>
                {p.status === 'unknown' ? '—' : STATUS_LABEL[p.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-4 text-center">
      <div className="text-xl font-extrabold tabular-nums">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/45">{label}</div>
    </div>
  );
}

function fmt(iso: string, short = false): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, short
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}
