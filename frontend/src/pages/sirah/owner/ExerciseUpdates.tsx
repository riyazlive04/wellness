import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Dumbbell, Loader2, RefreshCw, X } from 'lucide-react';

import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { cn } from '@/lib/utils';
import { clientsApi, clientSlug, type ExerciseLog } from '@/modules/workspace/api/clients';

const PHOTO_STALE = 5 * 60_000;
const RANGES = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: 'all', label: 'All', days: 0 },
] as const;

const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayLabel = (iso: string) => {
  const today = isoDaysAgo(0);
  if (iso === today) return 'Today';
  if (iso === isoDaysAgo(1)) return 'Yesterday';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
};
const initials = (s: string) =>
  s.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

/**
 * Everything clients have been doing, newest first — the practice's feed of
 * exercise submissions, grouped by the day they were performed.
 */
export default function ExerciseUpdates() {
  const ws = readWorkspace();
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('30');
  const [kind, setKind] = useState('');
  const [clientId, setClientId] = useState('');
  const [lightbox, setLightbox] = useState<{ url: string; caption: string } | null>(null);

  const days = RANGES.find((r) => r.id === range)!.days;
  const q = useQuery({
    queryKey: ['exercise-feed', { range, kind, clientId }],
    queryFn: () => clientsApi.exerciseFeed({
      from: days ? isoDaysAgo(days) : undefined,
      kind: kind || undefined,
      clientId: clientId || undefined,
      limit: 200,
    }),
    refetchInterval: 60_000,
  });

  const clientsQ = useQuery({
    queryKey: ['clients', 'for-exercise-filter'],
    queryFn: () => clientsApi.list({ limit: 200 }),
  });

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const byDay = useMemo(() => {
    const map = new Map<string, ExerciseLog[]>();
    for (const log of items) {
      const list = map.get(log.performed_on) ?? [];
      list.push(log);
      map.set(log.performed_on, list);
    }
    return [...map.entries()];
  }, [items]);

  const filtersOn = !!kind || !!clientId || range !== '30';

  return (
    <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials}
      topbarContext="Exercise">
      <PageHeader
        eyebrow="Clients"
        title="Exercise updates"
        description="What your clients have been doing, newest first. They add these from the app."
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-foreground/[0.05] p-0.5">
          {RANGES.map((r) => (
            <button key={r.id} type="button" onClick={() => setRange(r.id)}
              className={cn('rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                range === r.id ? 'bg-card shadow-sm' : 'text-foreground/60 hover:text-foreground')}>
              {r.label}
            </button>
          ))}
        </div>

        <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Filter by client"
          className="h-9 rounded-full border border-foreground/10 bg-background px-3 text-xs font-semibold outline-none">
          <option value="">All clients</option>
          {(clientsQ.data?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name ?? 'Unnamed client'}</option>
          ))}
        </select>

        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by exercise type"
          className="h-9 rounded-full border border-foreground/10 bg-background px-3 text-xs font-semibold outline-none">
          <option value="">All types</option>
          {(q.data?.kinds ?? []).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>

        {filtersOn && (
          <button type="button" onClick={() => { setKind(''); setClientId(''); setRange('30'); }}
            className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
            Clear
          </button>
        )}

        <button type="button" onClick={() => void q.refetch()} aria-label="Refresh"
          className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-foreground/10 hover:bg-foreground/[0.04]">
          <RefreshCw className={cn('h-4 w-4', q.isFetching && 'animate-spin')} />
        </button>
      </div>

      <div className="mt-5 grid gap-5">
        {q.isLoading ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-foreground/40" /></div>
        ) : q.isError ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-5 text-sm text-rose-700 dark:text-rose-300">
            Couldn’t load exercise updates.
            <button type="button" onClick={() => void q.refetch()} className="rounded-full border border-current/30 px-3 py-1 text-xs font-semibold">Try again</button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-foreground/15 px-6 py-16 text-center">
            <Dumbbell className="mx-auto h-7 w-7 text-foreground/30" />
            <p className="mt-3 text-sm font-semibold">
              {filtersOn ? 'Nothing matches those filters.' : 'No exercise logged yet.'}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-foreground/55">
              {filtersOn
                ? 'Try a wider date range.'
                : 'Clients add these from Daily exercise in the app — a photo, what they did, and how long.'}
            </p>
          </div>
        ) : (
          byDay.map(([day, logs]) => (
            <section key={day} className="grid gap-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-bold">{dayLabel(day)}</h2>
                <span className="text-xs text-foreground/45">{logs.length} update{logs.length === 1 ? '' : 's'}</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {logs.map((log) => <FeedCard key={log.id} log={log} onOpen={setLightbox} />)}
              </div>
            </section>
          ))
        )}
      </div>

      {lightbox && (
        <div role="dialog" aria-modal="true" aria-label={lightbox.caption}
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <button type="button" aria-label="Close" onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          <figure className="grid max-h-full gap-2" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.caption} className="max-h-[80vh] rounded-xl object-contain" />
            <figcaption className="text-center text-sm text-white/80">{lightbox.caption}</figcaption>
          </figure>
        </div>
      )}
    </OwnerLayout>
  );
}

function FeedCard({ log, onOpen }: { log: ExerciseLog; onOpen: (v: { url: string; caption: string }) => void }) {
  const urls = useQueries({
    queries: log.photos.map((p) => ({
      queryKey: ['exercise-photo', p.id],
      queryFn: () => clientsApi.exercisePhotoUrl(p.id),
      staleTime: PHOTO_STALE,
    })),
  });
  const who = log.client_name ?? 'Client';
  const meta = [log.performed_at, log.duration_min ? `${log.duration_min} min` : null, log.kind]
    .filter(Boolean).join(' · ');

  return (
    <article className="grid gap-3 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/12 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
          {initials(who)}
        </span>
        <div className="min-w-0 flex-1">
          <Link to={`/clients/${clientSlug(who, log.client_id)}/photos`}
            className="block truncate text-sm font-bold hover:underline">
            {who}
          </Link>
          <div className="truncate text-xs text-foreground/55">
            <b className="font-semibold text-foreground/75">{log.name}</b>{meta ? ` · ${meta}` : ''}
          </div>
        </div>
      </div>

      {log.notes && <p className="text-sm leading-relaxed text-foreground/70">{log.notes}</p>}

      {log.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {log.photos.map((p, i) => {
            const url = urls[i]?.data?.url;
            const caption = `${who} · ${log.name}`;
            return (
              <button key={p.id} type="button" disabled={!url} onClick={() => url && onOpen({ url, caption })}
                className="h-28 w-28 overflow-hidden rounded-xl bg-foreground/[0.05] transition hover:opacity-90 disabled:cursor-default">
                {url
                  ? <img src={url} alt={caption} loading="lazy" className="h-full w-full object-cover" />
                  : <span className="grid h-full w-full place-items-center"><Loader2 className="h-4 w-4 animate-spin text-foreground/30" /></span>}
              </button>
            );
          })}
        </div>
      )}
    </article>
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
  const initials =
    practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials };
}
