import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Info, Layers, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import {
  BLANK_REMINDERS, reminderSummary, remindersApi, remindersValid, type ReminderSettings,
} from '../api/reminders';
import { ReminderEditor } from './ReminderEditor';
import { usePracticeSchedule } from './usePracticeSchedule';

/**
 * A client's reminders, set by the nutritionist: apply one of the practice's
 * sequences, or set the times by hand. They reach the client's phone the next
 * time the client opens the NUSI app.
 */
export function ClientRemindersTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const q = useQuery({ queryKey: ['workspace', 'client-reminders', clientId], queryFn: () => remindersApi.forClient(clientId) });
  if (q.isLoading) {
    return <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-foreground/40" /></div>;
  }
  if (q.isError) {
    return (
      <Glass className="flex items-center justify-between gap-3 p-5 text-sm text-rose-700 dark:text-rose-200">
        Couldn&apos;t load {clientName}&apos;s reminders.
        <button type="button" onClick={() => void q.refetch()} className="rounded-full border border-current/30 px-3 py-1 text-xs font-semibold">Try again</button>
      </Glass>
    );
  }
  // Keyed so a fresh server copy (after applying a sequence) resets the form.
  return <Form key={JSON.stringify(q.data)} clientId={clientId} clientName={clientName} saved={q.data ?? null} />;
}

function Form({ clientId, clientName, saved }: { clientId: string; clientName: string; saved: ReminderSettings | null }) {
  const qc = useQueryClient();
  const schedule = usePracticeSchedule();
  const [draft, setDraft] = useState<ReminderSettings>(saved ?? BLANK_REMINDERS);
  const [sequenceId, setSequenceId] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved ?? BLANK_REMINDERS);

  const sequencesQ = useQuery({ queryKey: ['workspace', 'reminder-sequences'], queryFn: () => remindersApi.sequences() });
  const sequences = sequencesQ.data ?? [];

  const done = (msg: string) => {
    void qc.invalidateQueries({ queryKey: ['workspace', 'client-reminders', clientId] });
    void qc.invalidateQueries({ queryKey: ['workspace', 'reminder-sequences'] });
    toast.success(msg);
  };
  const save = useMutation({
    mutationFn: () => remindersApi.setForClient(clientId, draft),
    onSuccess: () => done(`Saved. ${clientName} gets them the next time they open the app.`),
    onError: (e: Error) => toast.error(e.message ?? 'Could not save the reminders'),
  });
  const apply = useMutation({
    mutationFn: () => remindersApi.apply(sequenceId, [clientId]),
    onSuccess: () => done(`Sequence applied. ${clientName} gets it the next time they open the app.`),
    onError: (e: Error) => toast.error(e.message ?? 'Could not apply the sequence'),
  });

  return (
    <div className="space-y-4">
      <Glass className="space-y-4 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-300">
            <AlarmClock className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">
              {!saved
                ? 'No reminders set yet'
                : saved.sequence_name
                  ? `On the “${saved.sequence_name}” sequence`
                  : 'Set by hand'}
            </div>
            <div className="text-xs text-foreground/60">
              {saved ? reminderSummary(saved, schedule) : `Apply a sequence or set ${clientName}'s times below.`}
              {saved?.updated_by === 'client' && saved.updated_at && (
                <> · {clientName} adjusted them on {new Date(saved.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-foreground/[0.06] pt-4">
          <Layers className="h-4 w-4 text-foreground/50" />
          <span className="text-sm">Apply a sequence</span>
          {sequences.length ? (
            <>
              <select
                value={sequenceId}
                onChange={(e) => setSequenceId(e.target.value)}
                className="min-w-[12rem] rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:border-teal-400/60 focus:outline-none"
              >
                <option value="">Choose…</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!sequenceId || apply.isPending}
                onClick={() => {
                  if (!saved || confirm(`Replace ${clientName}'s current reminders with this sequence?`)) apply.mutate();
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
              >
                {apply.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Apply
              </button>
            </>
          ) : sequencesQ.isSuccess ? (
            <span className="text-xs text-foreground/55">
              No sequences yet. <Link to="/reminders" className="font-semibold text-teal-700 underline dark:text-teal-300">Create one</Link> to reuse a routine across clients.
            </span>
          ) : null}
          <Link to="/reminders" className="ml-auto text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">Manage sequences</Link>
        </div>
      </Glass>

      <Glass className="space-y-4 p-5">
        <div className="text-sm font-semibold">Set by hand</div>
        <ReminderEditor value={draft} onChange={setDraft} schedule={schedule} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-start gap-1.5 text-xs text-foreground/55">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Times are on {clientName}&apos;s phone clock. They need the NUSI app with notifications allowed.
          </p>
          <button
            type="button"
            disabled={!dirty || !remindersValid(draft) || save.isPending}
            onClick={() => save.mutate()}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save reminders
          </button>
        </div>
      </Glass>
    </div>
  );
}
