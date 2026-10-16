import { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Camera, Dumbbell, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { clientsApi, type ExerciseLog, type ProgressPhoto } from '@/modules/workspace/api/clients';

const PHOTO_STALE = 5 * 60_000; // signed URLs last an hour

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const dateTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * What the client has sent in: exercise sessions with photos, and their
 * progress photos.
 *
 * The progress photos half is new — clients have been able to upload them
 * since the feature shipped, but the practice had no way to open them.
 */
export function ClientPhotosTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [tab, setTab] = useState<'exercise' | 'progress'>('exercise');
  const [lightbox, setLightbox] = useState<{ url: string; caption: string } | null>(null);

  const exerciseQ = useQuery({
    queryKey: ['client', clientId, 'exercise'],
    queryFn: () => clientsApi.clientExercise(clientId, 90),
  });
  const photosQ = useQuery({
    queryKey: ['client', clientId, 'progress-photos'],
    queryFn: () => clientsApi.clientProgressPhotos(clientId),
  });

  const first = clientName.split(' ').filter(Boolean)[0] || 'This client';
  const logs = exerciseQ.data?.items ?? [];
  const photos = photosQ.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="inline-flex w-fit rounded-full bg-foreground/[0.05] p-0.5">
        {([['exercise', 'Exercise', logs.length], ['progress', 'Progress photos', photos.length]] as const).map(
          ([id, label, n]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={cn('rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                tab === id ? 'bg-card shadow-sm' : 'text-foreground/60 hover:text-foreground')}>
              {label}{n > 0 && <span className="ml-1.5 text-foreground/45">{n}</span>}
            </button>
          ),
        )}
      </div>

      {tab === 'exercise' ? (
        exerciseQ.isLoading ? <Spinner /> :
        exerciseQ.isError ? <Failed onRetry={() => void exerciseQ.refetch()} /> :
        logs.length === 0 ? (
          <Empty icon={Dumbbell} text={`${first} hasn’t logged any exercise yet.`}
            hint="Entries appear here as soon as they save one in the app." />
        ) : (
          <>
            <Streak days={exerciseQ.data?.days ?? []} />
            <div className="grid gap-3">
              {logs.map((log) => <ExerciseCard key={log.id} log={log} onOpen={setLightbox} />)}
            </div>
          </>
        )
      ) : photosQ.isLoading ? <Spinner /> :
        photosQ.isError ? <Failed onRetry={() => void photosQ.refetch()} /> :
        photos.length === 0 ? (
          <Empty icon={Camera} text={`${first} hasn’t added any progress photos.`}
            hint="They can add them from Progress in the app." />
        ) : (
          <ProgressGrid clientId={clientId} photos={photos} onOpen={setLightbox} />
        )}

      {lightbox && (
        <div role="dialog" aria-modal="true" aria-label={lightbox.caption}
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}>
          <button type="button" aria-label="Close" onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          <figure className="grid max-h-full gap-2" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.caption}
              className="max-h-[80vh] rounded-xl object-contain" />
            <figcaption className="text-center text-sm text-white/80">{lightbox.caption}</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

/** Which of the last 28 days had an entry. */
function Streak({ days }: { days: string[] }) {
  const set = new Set(days);
  const cells = Array.from({ length: 28 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (27 - i));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { iso, on: set.has(iso) };
  });
  return (
    <div className="rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground/45">Last 4 weeks</span>
        <span className="text-xs text-foreground/55">{cells.filter((c) => c.on).length} of 28 days</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {cells.map((c) => (
          <span key={c.iso} title={dayLabel(c.iso)}
            className={cn('h-4 w-4 rounded-[4px]', c.on ? 'bg-emerald-600' : 'bg-foreground/[0.08]')} />
        ))}
      </div>
    </div>
  );
}

function ExerciseCard({ log, onOpen }: { log: ExerciseLog; onOpen: (v: { url: string; caption: string }) => void }) {
  const urls = useQueries({
    queries: log.photos.map((p) => ({
      queryKey: ['exercise-photo', p.id],
      queryFn: () => clientsApi.exercisePhotoUrl(p.id),
      staleTime: PHOTO_STALE,
    })),
  });

  const meta = [log.performed_at, log.duration_min ? `${log.duration_min} min` : null, log.kind]
    .filter(Boolean).join(' · ');
  // Logged well after the fact? Worth seeing, without making a fuss of it.
  const lateBy = Math.round(
    (new Date(log.submitted_at).getTime() - new Date(`${log.performed_on}T${log.performed_at ?? '12:00'}:00`).getTime()) / 3_600_000,
  );

  return (
    <div className="rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <b className="text-sm font-bold">{log.name}</b>
          <div className="text-xs text-foreground/55">{dayLabel(log.performed_on)}{meta ? ` · ${meta}` : ''}</div>
        </div>
        <span className="text-[11px] text-foreground/45" title={`Submitted ${dateTimeLabel(log.submitted_at)}`}>
          {lateBy >= 12 ? `logged ${Math.round(lateBy / 24) || 1}d later` : 'logged same day'}
        </span>
      </div>

      {log.notes && <p className="mt-2 text-sm leading-relaxed text-foreground/70">{log.notes}</p>}

      {log.photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {log.photos.map((p, i) => {
            const url = urls[i]?.data?.url;
            const caption = `${log.name} · ${dayLabel(log.performed_on)}`;
            return (
              <button key={p.id} type="button" disabled={!url}
                onClick={() => url && onOpen({ url, caption })}
                className="h-24 w-24 overflow-hidden rounded-xl bg-foreground/[0.05] transition hover:opacity-90 disabled:cursor-default">
                {url
                  ? <img src={url} alt={caption} loading="lazy" className="h-full w-full object-cover" />
                  : <span className="grid h-full w-full place-items-center"><Loader2 className="h-4 w-4 animate-spin text-foreground/30" /></span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProgressGrid({
  clientId, photos, onOpen,
}: { clientId: string; photos: ProgressPhoto[]; onOpen: (v: { url: string; caption: string }) => void }) {
  const urls = useQueries({
    queries: photos.map((p) => ({
      queryKey: ['progress-photo', p.id],
      queryFn: () => clientsApi.clientProgressPhotoUrl(clientId, p.id),
      staleTime: PHOTO_STALE,
    })),
  });
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((p, i) => {
        const url = urls[i]?.data?.url;
        const caption = [dateTimeLabel(p.taken_at), p.angle, p.weight_kg ? `${p.weight_kg} kg` : null]
          .filter(Boolean).join(' · ');
        return (
          <figure key={p.id} className="grid gap-1.5">
            <button type="button" disabled={!url} onClick={() => url && onOpen({ url, caption })}
              className="aspect-square overflow-hidden rounded-xl bg-foreground/[0.05] transition hover:opacity-90 disabled:cursor-default">
              {url
                ? <img src={url} alt={caption} loading="lazy" className="h-full w-full object-cover" />
                : <span className="grid h-full w-full place-items-center"><Loader2 className="h-4 w-4 animate-spin text-foreground/30" /></span>}
            </button>
            <figcaption className="truncate text-xs text-foreground/55" title={caption}>{caption}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

const Spinner = () => (
  <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-foreground/40" /></div>
);

const Failed = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-5 text-sm text-rose-700 dark:text-rose-300">
    Couldn’t load this.
    <button type="button" onClick={onRetry} className="rounded-full border border-current/30 px-3 py-1 text-xs font-semibold">Try again</button>
  </div>
);

const Empty = ({ icon: Icon, text, hint }: { icon: typeof Camera; text: string; hint: string }) => (
  <div className="rounded-2xl border border-dashed border-foreground/15 px-6 py-12 text-center">
    <Icon className="mx-auto h-7 w-7 text-foreground/30" />
    <p className="mt-3 text-sm font-semibold">{text}</p>
    <p className="mt-1 text-sm text-foreground/55">{hint}</p>
  </div>
);
