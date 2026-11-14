import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Film, Pencil, Search, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { AdminHeader, adminBtnGhost } from './AdminHeader';

/**
 * The marketing video-script library.
 *
 * Sirah Digital's own content, not a tenant feature — it sits beside Leads and
 * the demo-call SOP because it is the same job (selling NUSI) at a different
 * stage of the funnel.
 *
 * Seeded once from films/sirah-life/*.md via scripts/parse-video-scripts.mjs;
 * after that this page is the source of truth, because scripts get revised
 * after every shoot and a redeploy per wording change is not a usable loop.
 *
 * Search runs client-side over the whole library (50 scripts, ~550 lines is
 * nothing to hold in memory) so typing filters instantly, including the VO
 * text, which the API deliberately does not scan.
 */

const STATUSES = ['draft', 'ready', 'produced', 'retired'] as const;
type Status = (typeof STATUSES)[number];

interface ScriptLine {
  n: number;
  vo: string;
  on_screen: string;
}

interface VideoScript {
  id: string;
  number: number;
  title: string;
  bucket: number;
  bucket_title: string;
  duration_seconds: number;
  kind: string | null;
  avatar: string | null;
  hook_type: string | null;
  lines: ScriptLine[];
  status: Status;
  notes: string | null;
  updated_at: string;
}

/** What a length is actually for — the reason an operator picks one. */
function useCase(seconds: number): string {
  if (seconds <= 30) return 'Cold ads';
  if (seconds <= 60) return 'Retargeting';
  if (seconds >= 180) return 'Website';
  return 'VSL';
}

function durationTone(seconds: number): string {
  if (seconds <= 30) return 'text-rose-600 dark:text-rose-400';
  if (seconds <= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

const STATUS_TONE: Record<Status, string> = {
  draft: 'bg-foreground/5 text-muted-foreground',
  ready: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  produced: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  retired: 'bg-foreground/5 text-muted-foreground line-through',
};

type LengthFilter = 'all' | 'short' | 'mid' | 'long';

export default function AdminVideoScripts() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [len, setLen] = useState<LengthFilter>('all');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [editing, setEditing] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'video-scripts'],
    queryFn: () => api.get<{ items: VideoScript[] }>('/api/v1/admin/video-scripts'),
  });

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<VideoScript> }) =>
      api.patch<VideoScript>(`/api/v1/admin/video-scripts/${id}`, { body: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'video-scripts'] });
      toast.success('Script saved');
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Could not save the script'),
  });

  const all = useMemo(() => data?.items ?? [], [data]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((s) => {
      if (status !== 'all' && s.status !== status) return false;
      if (len === 'short' && s.duration_seconds > 30) return false;
      if (len === 'mid' && (s.duration_seconds <= 30 || s.duration_seconds > 60)) return false;
      if (len === 'long' && s.duration_seconds <= 60) return false;
      if (!term) return true;
      // Search the script body too — that is what an operator actually looks
      // for ("which script mentions Plate Vision?").
      return (
        s.title.toLowerCase().includes(term) ||
        (s.avatar ?? '').toLowerCase().includes(term) ||
        (s.hook_type ?? '').toLowerCase().includes(term) ||
        s.bucket_title.toLowerCase().includes(term) ||
        s.lines.some(
          (l) =>
            l.vo.toLowerCase().includes(term) ||
            l.on_screen.toLowerCase().includes(term),
        )
      );
    });
  }, [all, q, len, status]);

  /** Rail groups, in bucket then number order. */
  const groups = useMemo(() => {
    const by = new Map<number, { title: string; items: VideoScript[] }>();
    for (const s of shown) {
      if (!by.has(s.bucket)) by.set(s.bucket, { title: s.bucket_title, items: [] });
      by.get(s.bucket)!.items.push(s);
    }
    return [...by.entries()].sort((a, b) => a[0] - b[0]);
  }, [shown]);

  const copyVo = async (s: VideoScript) => {
    const text = s.lines.map((l) => l.vo).filter(Boolean).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Script ${s.number} voice-over copied`);
    } catch {
      toast.error('Could not copy — clipboard blocked by the browser');
    }
  };

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Operations · Marketing"
        title="Video scripts"
        subtitle={
          all.length
            ? `${all.length} sales-video scripts across ${new Set(all.map((s) => s.bucket)).size} angles. Edit a line and it saves to the library.`
            : 'The sales-video script library.'
        }
      />

      {/* filters */}
      <Glass className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search titles and script text…"
              aria-label="Search scripts"
              className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>

          <Seg
            value={len}
            onChange={setLen}
            options={[
              ['all', 'All'],
              ['short', '30s'],
              ['mid', '60s'],
              ['long', 'Long'],
            ]}
          />
          <Seg
            value={status}
            onChange={setStatus}
            options={[
              ['all', 'Any status'],
              ...STATUSES.map((s) => [s, s[0].toUpperCase() + s.slice(1)] as [Status, string]),
            ]}
          />
        </div>
        {!isLoading && (
          <p className="mt-3 text-xs text-muted-foreground">
            {shown.length} {shown.length === 1 ? 'script' : 'scripts'}
            {q.trim() && <> matching “{q.trim()}”</>}.
          </p>
        )}
      </Glass>

      {isLoading && <Glass className="p-8 text-sm text-muted-foreground">Loading scripts…</Glass>}

      {error && (
        <Glass className="p-8">
          <p className="text-sm font-medium">Could not load the script library.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Unknown error.'}
          </p>
        </Glass>
      )}

      {!isLoading && !error && !all.length && (
        <Glass className="p-8">
          <Film className="h-5 w-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No scripts imported yet.</p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Generate the payload with{' '}
            <code className="rounded bg-foreground/5 px-1.5 py-0.5 text-xs">
              node scripts/parse-video-scripts.mjs -o payload.json
            </code>{' '}
            and POST it to{' '}
            <code className="rounded bg-foreground/5 px-1.5 py-0.5 text-xs">
              /api/v1/admin/video-scripts/import
            </code>
            .
          </p>
        </Glass>
      )}

      {!isLoading && !error && all.length > 0 && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* rail */}
          <Glass className="w-full shrink-0 self-stretch p-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:w-72 lg:overflow-auto">
            {groups.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">Nothing matches.</p>
            )}
            {groups.map(([bucket, g]) => (
              <div key={bucket} className="mb-3">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {bucket} · {g.title}
                </p>
                {g.items.map((s) => (
                  <a
                    key={s.id}
                    href={`#script-${s.number}`}
                    className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-primary/5"
                  >
                    <span className="w-6 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
                      {String(s.number).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <span className={cn('shrink-0 text-[11px] font-semibold', durationTone(s.duration_seconds))}>
                      {s.duration_seconds}s
                    </span>
                  </a>
                ))}
              </div>
            ))}
          </Glass>

          {/* scripts */}
          <div className="min-w-0 flex-1 space-y-4">
            {shown.map((s) => (
              <ScriptCard
                key={s.id}
                script={s}
                editing={editing === s.id}
                onEdit={() => setEditing(editing === s.id ? null : s.id)}
                onCopy={() => copyVo(s)}
                onSave={(patch) => {
                  save.mutate({ id: s.id, patch });
                  setEditing(null);
                }}
                saving={save.isPending}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
            value === val
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-muted-foreground hover:border-primary hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ScriptCard({
  script: s,
  editing,
  onEdit,
  onCopy,
  onSave,
  saving,
}: {
  script: VideoScript;
  editing: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onSave: (patch: Partial<VideoScript>) => void;
  saving: boolean;
}) {
  const [lines, setLines] = useState<ScriptLine[]>(s.lines);
  const [status, setStatus] = useState<Status>(s.status);

  // Re-seed the draft whenever the editor opens, so a cancelled edit never
  // leaks into the next one.
  const open = () => {
    setLines(s.lines);
    setStatus(s.status);
    onEdit();
  };

  return (
    <Glass id={`script-${s.number}`} className="scroll-mt-20 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
          {String(s.number).padStart(2, '0')}
        </span>
        <h2 className="text-lg font-bold tracking-tight">{s.title}</h2>
        <span className={cn('rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] font-bold', durationTone(s.duration_seconds))}>
          {s.duration_seconds}s
        </span>
        <span className="rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {useCase(s.duration_seconds)}
        </span>
        {s.kind && (
          <span className="rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            {s.kind}
          </span>
        )}
        <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', STATUS_TONE[s.status])}>
          {s.status}
        </span>

        <div className="ml-auto flex gap-1">
          <button type="button" onClick={onCopy} className={adminBtnGhost} title="Copy the voice-over">
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Copy VO</span>
          </button>
          <button type="button" onClick={open} className={adminBtnGhost} title={editing ? 'Cancel' : 'Edit'}>
            {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{editing ? 'Cancel' : 'Edit'}</span>
          </button>
        </div>
      </div>

      {(s.avatar || s.hook_type) && (
        <p className="mt-2 text-sm text-muted-foreground">
          {s.avatar && (
            <>
              <strong className="font-semibold text-foreground">Avatar:</strong> {s.avatar}
            </>
          )}
          {s.avatar && s.hook_type && <span className="px-2">·</span>}
          {s.hook_type && (
            <>
              <strong className="font-semibold text-foreground">Hook:</strong> {s.hook_type}
            </>
          )}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-10 border border-border bg-primary/5 p-2 text-left text-[10px] font-bold uppercase tracking-wider text-primary">
                #
              </th>
              <th className="w-[46%] border border-border bg-primary/5 p-2 text-left text-[10px] font-bold uppercase tracking-wider text-primary">
                Voice-over
              </th>
              <th className="border border-border bg-primary/5 p-2 text-left text-[10px] font-bold uppercase tracking-wider text-primary">
                On screen
              </th>
            </tr>
          </thead>
          <tbody>
            {(editing ? lines : s.lines).map((l, i) => (
              <tr key={l.n} className={i % 2 ? 'bg-primary/[0.02]' : undefined}>
                <td className="border border-border p-2 text-right align-top text-xs tabular-nums text-muted-foreground">
                  {l.n}
                </td>
                <td className="border border-border p-2 align-top font-medium">
                  {editing ? (
                    <textarea
                      value={l.vo}
                      onChange={(e) =>
                        setLines(lines.map((x, j) => (j === i ? { ...x, vo: e.target.value } : x)))
                      }
                      rows={2}
                      className="w-full resize-y rounded border border-border bg-background p-1.5 text-sm outline-none focus:border-primary"
                    />
                  ) : (
                    l.vo
                  )}
                </td>
                <td className="border border-border p-2 align-top text-muted-foreground">
                  {editing ? (
                    <textarea
                      value={l.on_screen}
                      onChange={(e) =>
                        setLines(lines.map((x, j) => (j === i ? { ...x, on_screen: e.target.value } : x)))
                      }
                      rows={2}
                      className="w-full resize-y rounded border border-border bg-background p-1.5 text-sm outline-none focus:border-primary"
                    />
                  ) : (
                    l.on_screen
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Seg
            value={status}
            onChange={setStatus}
            options={STATUSES.map((x) => [x, x[0].toUpperCase() + x.slice(1)] as [Status, string])}
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave({ lines, status })}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save script'}
          </button>
        </div>
      )}
    </Glass>
  );
}
