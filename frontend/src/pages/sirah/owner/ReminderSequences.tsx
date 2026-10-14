import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Check, Layers, Loader2, Pencil, Plus, Search, Send, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';

import { Sheet } from '@/components/Sheet';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { cn } from '@/lib/utils';
import { clientsApi } from '@/modules/workspace/api/clients';
import {
  BLANK_REMINDERS, SEQUENCE_STARTERS, formatTime, reminderSummary, remindersApi, remindersValid,
  type ReminderSequence, type ReminderSettings,
} from '@/modules/workspace/api/reminders';
import { ReminderEditor } from '@/modules/workspace/reminders/ReminderEditor';
import { usePracticeSchedule } from '@/modules/workspace/reminders/usePracticeSchedule';

type Editing = { id?: string; name: string; description: string; settings: ReminderSettings; clientCount: number };

/**
 * Reminder sequences: a daily routine (meal times, water, the nutritionist's own
 * reminders) built once and given to any number of clients. Each client's phone
 * schedules it the next time they open the NUSI app.
 */
export default function ReminderSequences() {
  const qc = useQueryClient();
  const schedule = usePracticeSchedule();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [applying, setApplying] = useState<ReminderSequence | null>(null);
  const q = useQuery({ queryKey: ['workspace', 'reminder-sequences'], queryFn: () => remindersApi.sequences() });

  const del = useMutation({
    mutationFn: (id: string) => remindersApi.deleteSequence(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workspace', 'reminder-sequences'] });
      toast.success('Sequence deleted. Clients keep the reminders they have.');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not delete'),
  });

  const sequences = q.data ?? [];
  const startNew = (from?: (typeof SEQUENCE_STARTERS)[number]) =>
    setEditing({
      name: from?.name ?? '',
      description: from?.description ?? '',
      settings: structuredClone(from?.settings ?? BLANK_REMINDERS),
      clientCount: 0,
    });

  return (
    <OwnerLayout practiceName="Your Practice" ownerName="You" initials="" topbarContext="Reminders">
      <div className="mx-auto w-full max-w-5xl px-4 py-7 md:px-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageHeader
            eyebrow="Clients · Reminders"
            title="Reminder sequences"
            description="Build a daily routine once (meal times, water and your own reminders) and give it to any client. It reaches their phone the next time they open the NUSI app."
          />
          <button
            type="button"
            onClick={() => startNew()}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" /> New sequence
          </button>
        </div>

        {q.isLoading ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-5 w-5 animate-spin text-foreground/40" /></div>
        ) : q.isError ? (
          <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-rose-400/30 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
            Couldn&apos;t load your sequences.
            <button type="button" onClick={() => void q.refetch()} className="rounded-full border border-current/30 px-3 py-1 text-xs font-semibold">Try again</button>
          </div>
        ) : (
          <>
            {sequences.length > 0 && (
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {sequences.map((s) => (
                  <article key={s.id} className="flex flex-col gap-3 rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-300">
                        <Layers className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-base font-bold">{s.name}</h2>
                        {s.description && <p className="line-clamp-2 text-xs text-foreground/60">{s.description}</p>}
                      </div>
                    </div>
                    <div className="text-xs text-foreground/65">{reminderSummary(s.settings, schedule)}</div>
                    {s.settings.custom_enabled && s.settings.custom.length > 0 && (
                      <ul className="space-y-1 text-xs text-foreground/70">
                        {s.settings.custom.slice(0, 4).map((c) => (
                          <li key={c.id ?? c.title} className="flex gap-2">
                            <span className="w-16 shrink-0 font-semibold tabular-nums">{formatTime(c.time)}</span>
                            <span className="truncate">{c.title}</span>
                          </li>
                        ))}
                        {s.settings.custom.length > 4 && <li className="text-foreground/50">+{s.settings.custom.length - 4} more</li>}
                      </ul>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-foreground/[0.06] pt-3">
                      <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-foreground/60">
                        <Users className="h-3.5 w-3.5" /> {s.client_count} client{s.client_count === 1 ? '' : 's'}
                      </span>
                      <button type="button" onClick={() => setApplying(s)} className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">
                        <Send className="h-3.5 w-3.5" /> Apply to clients
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing({ id: s.id, name: s.name, description: s.description ?? '', settings: structuredClone(s.settings), clientCount: s.client_count })}
                        className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-xs font-medium hover:bg-foreground/[0.04]"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${s.name}`}
                        disabled={del.isPending}
                        onClick={() => {
                          if (confirm(`Delete “${s.name}”? Clients on it keep their current reminders.`)) del.mutate(s.id);
                        }}
                        className="grid h-8 w-8 place-items-center rounded-full text-foreground/50 hover:bg-rose-500/10 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <section className="mt-6 rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm md:p-6">
              <h2 className="flex items-center gap-2 text-base font-extrabold">
                <AlarmClock className="h-4 w-4 text-[hsl(var(--brand-blue))]" /> {sequences.length ? 'Start from a ready-made routine' : 'Start with a ready-made routine'}
              </h2>
              <p className="mt-1 text-xs text-foreground/60">Every line can be changed before you save it.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {SEQUENCE_STARTERS.map((st) => (
                  <button
                    key={st.name}
                    type="button"
                    onClick={() => startNew(st)}
                    className="rounded-2xl border border-foreground/[0.07] p-4 text-left transition-colors hover:border-teal-400/50 hover:bg-teal-500/[0.04]"
                  >
                    <div className="text-sm font-bold">{st.name}</div>
                    <div className="mt-1 text-xs text-foreground/60">{st.description}</div>
                    <div className="mt-2 text-[11px] font-semibold text-teal-700 dark:text-teal-300">Use this →</div>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {editing && <SequenceSheet editing={editing} onClose={() => setEditing(null)} />}
      {applying && <ApplySheet sequence={applying} onClose={() => setApplying(null)} />}
    </OwnerLayout>
  );
}

function SequenceSheet({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const qc = useQueryClient();
  const schedule = usePracticeSchedule();
  const [draft, setDraft] = useState(editing);
  const [reapply, setReapply] = useState(true);

  const save = useMutation({
    mutationFn: async () => {
      const body = { name: draft.name.trim(), description: draft.description.trim() || undefined, settings: draft.settings };
      if (!draft.id) {
        await remindersApi.createSequence(body);
        return 'Sequence saved. Apply it to clients when you’re ready.';
      }
      const r = await remindersApi.updateSequence(draft.id, { ...body, reapply });
      return r.updated_clients ? `Saved and updated ${r.updated_clients} client${r.updated_clients === 1 ? '' : 's'}.` : 'Sequence saved.';
    },
    onSuccess: (msg) => {
      void qc.invalidateQueries({ queryKey: ['workspace', 'reminder-sequences'] });
      void qc.invalidateQueries({ queryKey: ['workspace', 'client-reminders'] });
      toast.success(msg);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not save the sequence'),
  });

  return (
    <Sheet onClose={() => !save.isPending && onClose()} ariaLabel="Reminder sequence" className="sm:max-w-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-foreground/[0.06] px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">{draft.id ? 'Edit sequence' : 'New reminder sequence'}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.06]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
        <label className="block">
          <div className="mb-1.5 text-xs font-medium text-foreground/70">Name</div>
          <input
            autoFocus
            value={draft.name}
            maxLength={80}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. PCOS routine"
            className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
          />
        </label>
        <label className="block">
          <div className="mb-1.5 text-xs font-medium text-foreground/70">Description (optional)</div>
          <input
            value={draft.description}
            maxLength={300}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Who it's for"
            className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
          />
        </label>
        <ReminderEditor value={draft.settings} onChange={(settings) => setDraft({ ...draft, settings })} schedule={schedule} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/[0.06] px-5 py-4">
        {draft.id && editing.clientCount > 0 ? (
          <label className="flex items-center gap-2 text-xs text-foreground/75">
            <input type="checkbox" checked={reapply} onChange={(e) => setReapply(e.target.checked)} className="h-3.5 w-3.5 accent-teal-600" />
            Also update the {editing.clientCount} client{editing.clientCount === 1 ? '' : 's'} on this sequence
          </label>
        ) : <span />}
        <button
          type="button"
          disabled={!draft.name.trim() || !remindersValid(draft.settings) || save.isPending}
          onClick={() => save.mutate()}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save sequence
        </button>
      </div>
    </Sheet>
  );
}

function ApplySheet({ sequence, onClose }: { sequence: ReminderSequence; onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const clientsQ = useQuery({
    queryKey: ['workspace', 'clients', 'apply-reminders', q],
    queryFn: () => clientsApi.list({ q: q || undefined, limit: 50 }),
    staleTime: 30_000,
  });
  const options = clientsQ.data?.items ?? [];
  const toggle = (id: string, name: string) =>
    setPicked((cur) => {
      const next = new Map(cur);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });

  const apply = useMutation({
    mutationFn: () => remindersApi.apply(sequence.id, [...picked.keys()]),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['workspace', 'reminder-sequences'] });
      void qc.invalidateQueries({ queryKey: ['workspace', 'client-reminders'] });
      toast.success(`“${sequence.name}” given to ${r.updated} client${r.updated === 1 ? '' : 's'}. They get it the next time they open the app.`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not apply the sequence'),
  });

  return (
    <Sheet onClose={() => !apply.isPending && onClose()} ariaLabel="Apply sequence" className="sm:max-w-lg">
      <div className="flex items-start justify-between gap-3 border-b border-foreground/[0.06] px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Apply “{sequence.name}”</h2>
          <p className="mt-0.5 text-xs text-foreground/60">Replaces the picked clients&apos; current reminders.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.06]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-3 px-5 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients by name or email"
            className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] py-2.5 pl-9 pr-3.5 text-sm focus:border-teal-400/60 focus:outline-none"
          />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-xl border border-foreground/[0.08]">
          {clientsQ.isLoading ? (
            <div className="flex items-center gap-2 px-3.5 py-3 text-xs text-foreground/55"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading clients…</div>
          ) : clientsQ.isError ? (
            <div className="flex items-center justify-between gap-2 px-3.5 py-3 text-xs text-rose-600 dark:text-rose-300">
              Couldn&apos;t load your clients.
              <button type="button" onClick={() => void clientsQ.refetch()} className="font-semibold underline">Try again</button>
            </div>
          ) : options.length === 0 ? (
            <div className="px-3.5 py-3 text-xs text-foreground/55">{q ? `No client matches "${q}".` : 'No clients yet.'}</div>
          ) : (
            options.map((c) => {
              const name = c.display_name || c.name;
              const on = picked.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id, name)}
                  className={cn('flex w-full items-center gap-3 border-b border-foreground/[0.05] px-3.5 py-2.5 text-left last:border-b-0', on ? 'bg-teal-500/10' : 'hover:bg-foreground/[0.03]')}
                >
                  <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border', on ? 'border-teal-600 bg-teal-600 text-white' : 'border-foreground/25')}>
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="block truncate text-[11px] text-foreground/55">{c.email}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.06] px-5 py-4">
        <span className="text-xs text-foreground/60">{picked.size} picked</span>
        <button
          type="button"
          disabled={!picked.size || apply.isPending}
          onClick={() => apply.mutate()}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100"
        >
          {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Apply to {picked.size || ''} client{picked.size === 1 ? '' : 's'}
        </button>
      </div>
    </Sheet>
  );
}
