import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CalendarClock, Loader2, RefreshCw } from 'lucide-react';

import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { cn } from '@/lib/utils';
import { clientsApi, clientSlug, type DailyLogCompliance } from '@/modules/workspace/api/clients';

const initials = (s: string) =>
  s.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

const sinceLabel = (d: number | null) =>
  d === null ? 'never' : d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;

/**
 * Daily logs across the practice: who filled theirs in, who hasn't, and
 * what today's answers were.
 *
 * Without this the only way to read a daily log was to open each client's
 * page one at a time, which defeats the point of a daily check-in.
 */
export default function DailyLogUpdates() {
  const ws = readWorkspace();
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['daily-log-compliance'],
    queryFn: () => clientsApi.dailyLogCompliance(),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const loggedToday = rows.filter((r) => r.days_since === 0).length;
  const quiet = rows.filter((r) => r.days_since === null || r.days_since >= 3);

  return (
    <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials}
      topbarContext="Daily logs">
      <PageHeader
        eyebrow="Clients"
        title="Daily logs"
        description="Who filled in their daily log, and what they recorded. Clients answer these in the app."
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-emerald-500/12 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          {loggedToday} logged today
        </span>
        {quiet.length > 0 && (
          <span className="rounded-full bg-amber-400/15 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            {quiet.length} haven’t in 3+ days
          </span>
        )}
        <button type="button" onClick={() => void q.refetch()} aria-label="Refresh"
          className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-foreground/10 hover:bg-foreground/[0.04]">
          <RefreshCw className={cn('h-4 w-4', q.isFetching && 'animate-spin')} />
        </button>
      </div>

      <div className="mt-5">
        {q.isLoading ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-foreground/40" /></div>
        ) : q.isError ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-5 text-sm text-rose-700 dark:text-rose-300">
            Couldn’t load daily logs.
            <button type="button" onClick={() => void q.refetch()} className="rounded-full border border-current/30 px-3 py-1 text-xs font-semibold">Try again</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-foreground/15 px-6 py-16 text-center">
            <CalendarClock className="mx-auto h-7 w-7 text-foreground/30" />
            <p className="mt-3 text-sm font-semibold">Nobody is on a daily log yet.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-foreground/55">
              Go to <Link to="/assessments" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">Assessments</Link>,
              pick a form and press <b>Daily</b> to choose who fills it in each day.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2.5">
            {rows.map((r) => (
              <ClientRow key={r.client_id} row={r}
                open={openId === r.client_id}
                onToggle={() => setOpenId(openId === r.client_id ? null : r.client_id)} />
            ))}
          </ul>
        )}
      </div>
    </OwnerLayout>
  );
}

function ClientRow({ row, open, onToggle }: { row: DailyLogCompliance; open: boolean; onToggle: () => void }) {
  // Today's answers are only fetched when the row is opened.
  const detail = useQuery({
    queryKey: ['client', row.client_id, 'daily-log', 7],
    queryFn: () => clientsApi.clientDailyLog(row.client_id, 7),
    enabled: open,
  });

  const name = row.name ?? 'Unnamed client';
  const late = row.days_since === null || row.days_since >= 3;
  const entry = detail.data?.today?.entry ?? null;
  const questions = (detail.data?.today?.form.questions ?? []).filter((x) => x.type !== 'section');

  return (
    <li className="overflow-hidden rounded-2xl border border-foreground/[0.07] bg-card shadow-sm">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-foreground/[0.02]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/12 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm font-semibold">{name}</b>
          <span className="text-xs text-foreground/55">
            Last logged {sinceLabel(row.days_since)} · {row.logged_last_7} of the last 7 days
          </span>
        </span>
        <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
          row.days_since === 0 ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
            : late ? 'bg-amber-400/15 text-amber-700 dark:text-amber-300'
            : 'bg-foreground/[0.06] text-foreground/70')}>
          {row.days_since === 0 ? 'Logged today' : sinceLabel(row.days_since)}
        </span>
      </button>

      {open && (
        <div className="border-t border-foreground/[0.06] bg-foreground/[0.02] p-4">
          {detail.isLoading ? (
            <div className="grid place-items-center py-6"><Loader2 className="h-5 w-5 animate-spin text-foreground/40" /></div>
          ) : !detail.data?.today ? (
            <p className="text-sm text-foreground/55">No daily form assigned to {name.split(' ')[0]}.</p>
          ) : !entry ? (
            <p className="text-sm text-foreground/55">Nothing filled in today yet.</p>
          ) : (
            <>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <b className="text-sm">Today</b>
                <span className="text-xs text-foreground/55">{entry.filled_count} of {entry.field_count} filled</span>
              </div>
              <ul className="grid gap-x-6 sm:grid-cols-2">
                {questions.map((x) => {
                  const v = entry.responses[x.id];
                  const blank = v === null || v === undefined || v === '';
                  if (blank) return null;   // under a summary, blanks are noise
                  return (
                    <li key={x.id} className="flex items-baseline justify-between gap-3 border-b border-foreground/[0.05] py-1.5 text-sm last:border-0">
                      <span className="min-w-0 flex-1 truncate text-foreground/65" title={x.question}>{x.question}</span>
                      <b className="shrink-0 font-semibold tabular-nums">{String(v)}</b>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <Link to={`/clients/${clientSlug(name, row.client_id)}/daily-log`}
            className="mt-3 inline-block text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
            Full history and charts →
          </Link>
        </div>
      )}
    </li>
  );
}

/** Layout chrome, read the same way the other owner pages read it. */
function readWorkspace(): { practiceName: string; ownerName: string; initials: string } {
  let practiceName = 'Your Practice';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }
  const init =
    practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials: init };
}
