import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PenLine, Plus, Trash2, Loader2, Sparkles, Flame, CalendarDays, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { wellnessApi, type JournalEntry } from '@/modules/wellness/api';
import { cn } from '@/lib/utils';

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

export default function ClientJournal() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const journalQ = useQuery({ queryKey: ['wellness', 'journal'], queryFn: wellnessApi.listJournal });

  const [body, setBody] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [reflectingId, setReflectingId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['wellness', 'journal'] });

  const addMut = useMutation({
    mutationFn: () => wellnessApi.createJournal({ body: body.trim(), ...(mood ? { mood } : {}) }),
    onSuccess: () => { setBody(''); setMood(null); invalidate(); },
    onError: () => toast.error('Could not save entry.'),
  });
  const delMut = useMutation({ mutationFn: (id: string) => wellnessApi.deleteJournal(id), onSuccess: invalidate });

  async function reflect(id: string) {
    setReflectingId(id);
    try { await wellnessApi.reflectJournal(id); invalidate(); }
    catch { toast.error('Could not generate a reflection.'); }
    finally { setReflectingId(null); }
  }

  const entries = journalQ.data ?? [];

  // ── Derived stats (computed from real entries only) ──────────────────────
  const total = entries.length;
  const weekAgo = Date.now() - 7 * 86_400_000;
  const thisWeek = entries.filter((e) => {
    const t = new Date(e.entry_date).getTime();
    return !Number.isNaN(t) && t >= weekAgo;
  }).length;
  const streak = computeStreak(entries);

  const stats: Array<{ label: string; value: number; icon: typeof PenLine; tint: string }> = [
    { label: 'This week', value: thisWeek, icon: CalendarDays, tint: 'text-blue-600 dark:text-blue-300' },
    { label: 'Total entries', value: total, icon: NotebookPen, tint: 'text-violet-600 dark:text-violet-300' },
    { label: 'Day streak', value: streak, icon: Flame, tint: 'text-amber-600 dark:text-amber-300' },
  ];

  return (
    <ClientLayout
      firstName={profileQ.data?.name?.split(' ')[0]}
      onRefresh={() => qc.invalidateQueries({ queryKey: ['wellness', 'journal'] })}
    >
      <div className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300">
              <PenLine className="h-4 w-4" /><span className="text-xs uppercase tracking-[0.18em]">Journal</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Reflect on your day</h1>
            <p className="mt-1.5 text-sm text-foreground/60">Capture how you feel, then let your assistant reflect with you.</p>
          </motion.div>

          {/* Stat strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <Glass key={s.label} className="p-4">
                <div className="flex items-center gap-2">
                  <s.icon className={cn('h-3.5 w-3.5', s.tint)} strokeWidth={1.8} />
                  <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{s.label}</span>
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</div>
              </Glass>
            ))}
          </motion.div>

          {/* Body: composer (sticky) + entries list */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Composer */}
            <motion.div variants={fadeUp} className="lg:col-span-1">
              <Glass className="overflow-hidden lg:sticky lg:top-6">
                <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-4">
                  <Plus className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                  <span className="text-sm font-medium">New reflection</span>
                </div>
                <div className="space-y-4 p-5">
                  <textarea
                    value={body} onChange={(e) => setBody(e.target.value)} rows={6}
                    placeholder="How are you feeling? What went well today?"
                    className="w-full resize-none rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-3 text-sm leading-relaxed focus:border-violet-400/50 focus:outline-none"
                  />
                  <div>
                    <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/55">Mood</div>
                    <div className="flex items-center gap-1.5">
                      {MOODS.map((m, i) => (
                        <button key={m} type="button" onClick={() => setMood(mood === i + 1 ? null : i + 1)}
                          className={cn('grid h-10 w-10 flex-1 place-items-center rounded-xl text-lg transition-all',
                            mood === i + 1 ? 'bg-violet-400/20 ring-2 ring-violet-400/50' : 'hover:bg-foreground/[0.05]')}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="button" onClick={() => body.trim() && addMut.mutate()} disabled={!body.trim() || addMut.isPending}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.01] disabled:opacity-40 disabled:hover:scale-100">
                    {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Save entry
                  </button>
                </div>
              </Glass>
            </motion.div>

            {/* Entries */}
            <motion.div variants={fadeUp} className="lg:col-span-2">
              <Glass className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                  <span className="text-sm font-medium">Past reflections</span>
                  <span className="text-[11px] text-foreground/45">{total} {total === 1 ? 'entry' : 'entries'}</span>
                </div>

                {journalQ.isLoading ? (
                  <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
                ) : entries.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-16 text-center">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/15 to-fuchsia-500/15 text-violet-700 dark:text-violet-300">
                      <PenLine className="h-6 w-6" />
                    </div>
                    <div className="mt-4 text-sm font-medium text-foreground/80">Your journal is empty</div>
                    <div className="mt-1 max-w-xs text-xs text-foreground/55">Write your first reflection on the left — a few honest lines about your day is all it takes.</div>
                  </div>
                ) : (
                  <div className="space-y-3 p-5">
                    {entries.map((e) => (
                      <JournalCard key={e.id} entry={e} reflecting={reflectingId === e.id}
                        onReflect={() => reflect(e.id)} onDelete={() => delMut.mutate(e.id)} />
                    ))}
                  </div>
                )}
              </Glass>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </ClientLayout>
  );
}

function JournalCard({ entry, reflecting, onReflect, onDelete }: {
  entry: JournalEntry; reflecting: boolean; onReflect: () => void; onDelete: () => void;
}) {
  const date = new Date(entry.entry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="group rounded-2xl border border-foreground/[0.06] bg-foreground/[0.015] p-4 transition-colors hover:bg-foreground/[0.04]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] text-foreground/50">
          {entry.mood ? <span className="text-base">{MOODS[entry.mood - 1]}</span> : null}
          {date}
        </div>
        <button type="button" onClick={onDelete} className="opacity-0 transition-opacity group-hover:opacity-100">
          <Trash2 className="h-3.5 w-3.5 text-foreground/30 hover:text-rose-500" />
        </button>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/85">{entry.body}</p>

      {entry.ai_reflection ? (
        <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-violet-600 dark:text-violet-300">
            <Sparkles className="h-3 w-3" /> Client Assistant
          </div>
          <p className="mt-1 text-xs leading-relaxed text-foreground/75">{entry.ai_reflection}</p>
        </div>
      ) : (
        <button type="button" onClick={onReflect} disabled={reflecting}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.06] disabled:opacity-50">
          {reflecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Reflect with AI
        </button>
      )}
    </div>
  );
}

/** Consecutive days (ending today or yesterday) that have at least one entry. */
function computeStreak(entries: JournalEntry[]): number {
  const days = new Set<string>();
  for (const e of entries) {
    const d = new Date(e.entry_date);
    if (!Number.isNaN(d.getTime())) days.add(d.toDateString());
  }
  if (days.size === 0) return 0;
  let streak = 0;
  const cursor = new Date();
  // Allow the streak to start today or yesterday.
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
