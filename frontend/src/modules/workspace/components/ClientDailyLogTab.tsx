import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { clientsApi, type AssessmentFormQuestion, type DailyLogSeries } from '@/modules/workspace/api/clients';

const RANGES = [7, 30, 90] as const;

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** Answers come back as whatever the client typed; show them readably. */
function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * One client's daily log: today's answers, a chart per number they record,
 * and the recent history. Read-only — the client fills it in from the app.
 */
export function ClientDailyLogTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const q = useQuery({
    queryKey: ['client', clientId, 'daily-log', days],
    queryFn: () => clientsApi.clientDailyLog(clientId, days),
  });

  const first = clientName.split(' ').filter(Boolean)[0] || 'This client';
  const today = q.data?.today ?? null;
  const entry = today?.entry ?? null;

  // Question order drives the display order, so today's answers read in the
  // same order the client saw them.
  const questions: AssessmentFormQuestion[] = useMemo(
    () => (today?.form.questions ?? []).filter((x) => x.type !== 'section'),
    [today],
  );

  if (q.isLoading) {
    return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-foreground/40" /></div>;
  }
  if (q.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-5 text-sm text-rose-700 dark:text-rose-300">
        Couldn’t load the daily log.
        <button type="button" onClick={() => void q.refetch()} className="rounded-full border border-current/30 px-3 py-1 text-xs font-semibold">Try again</button>
      </div>
    );
  }

  if (!today) {
    return (
      <div className="rounded-2xl border border-dashed border-foreground/15 px-6 py-10 text-center">
        <CalendarClock className="mx-auto h-7 w-7 text-foreground/30" />
        <p className="mt-3 text-sm font-semibold">{first} isn’t on a daily log yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-foreground/55">
          Go to <b>Assessments</b>, pick a form and press <b>Daily</b> to choose who fills it in each day.
        </p>
      </div>
    );
  }

  const series = q.data?.series ?? [];
  const history = q.data?.history ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold">{today.form.name}</h3>
          <p className="text-xs text-foreground/55">
            {questions.length} question{questions.length === 1 ? '' : 's'} a day
            {today.form.reminder_time ? ` · reminder at ${today.form.reminder_time}` : ' · no reminder set'}
          </p>
        </div>
        <div className="inline-flex rounded-full bg-foreground/[0.05] p-0.5">
          {RANGES.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={cn('rounded-full px-3 py-1 text-xs font-semibold transition',
                days === d ? 'bg-card shadow-sm' : 'text-foreground/60 hover:text-foreground')}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Today */}
      <section className="rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-bold">Today</h4>
          {entry ? (
            <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              {entry.filled_count} of {entry.field_count} filled
            </span>
          ) : (
            <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              Not filled in yet
            </span>
          )}
        </div>
        {!entry ? (
          <p className="text-sm text-foreground/55">{first} hasn’t logged today.</p>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {questions.map((x) => {
              const v = entry.responses[x.id];
              const blank = v === null || v === undefined || v === '';
              return (
                <li key={x.id} className="flex items-baseline justify-between gap-3 border-b border-foreground/[0.05] py-1.5 text-sm last:border-0">
                  <span className="min-w-0 flex-1 truncate text-foreground/65" title={x.question}>{x.question}</span>
                  <b className={cn('shrink-0 font-semibold tabular-nums', blank && 'font-normal text-foreground/30')}>{show(v)}</b>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Charts, one per number they record */}
      {series.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2">
          {series.map((s) => <Chart key={s.field_id} s={s} days={days} />)}
        </section>
      )}

      {/* History */}
      <section className="rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-sm">
        <h4 className="mb-2 text-sm font-bold">Recent days</h4>
        {history.length === 0 ? (
          <p className="text-sm text-foreground/55">Nothing logged in the last {days} days.</p>
        ) : (
          <ul className="divide-y divide-foreground/[0.05]">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2 text-sm">
                <b className="w-20 shrink-0 font-semibold">{dayLabel(h.entry_date)}</b>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                  <span className="block h-full rounded-full bg-emerald-600"
                    style={{ width: `${h.field_count ? Math.round((h.filled_count / h.field_count) * 100) : 0}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-foreground/55">
                  {h.filled_count}/{h.field_count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** A number recorded over time. One point per day they logged it. */
function Chart({ s, days }: { s: DailyLogSeries; days: number }) {
  const pts = s.points;
  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat line should sit in the middle rather than divide by zero.
  const span = max - min || 1;
  const W = 300;
  const H = 70;
  const x = (i: number) => (pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * (W - 8) + 4);
  const y = (v: number) => H - 10 - ((v - min) / span) * (H - 22);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

  return (
    <div className="rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[13px] font-semibold" title={s.label ?? s.field_id}>{s.label ?? s.field_id}</span>
        <span className="shrink-0 text-xs text-foreground/50">
          avg {s.average}{s.unit ? ` ${s.unit}` : ''}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <b className="text-[22px] font-extrabold tabular-nums tracking-tight">{s.latest}</b>
        {s.unit && <span className="text-xs font-semibold text-foreground/50">{s.unit}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" style={{ height: H }} role="img"
        aria-label={`${s.label ?? s.field_id}: ${pts.length} readings over ${days} days, latest ${s.latest}${s.unit ? ' ' + s.unit : ''}`}>
        <line x1="0" y1={H - 6} x2={W} y2={H - 6} stroke="currentColor" strokeWidth="1" className="text-foreground/10" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className="text-emerald-600" />
        {pts.length === 1 && <circle cx={x(0)} cy={y(pts[0].value)} r="3.5" className="fill-emerald-600" />}
      </svg>
      <div className="flex justify-between text-[10.5px] text-foreground/45">
        <span>{dayLabel(pts[0].entry_date)}</span>
        <span>{pts.length} reading{pts.length === 1 ? '' : 's'}</span>
        <span>{dayLabel(pts[pts.length - 1].entry_date)}</span>
      </div>
    </div>
  );
}
