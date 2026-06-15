import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PenLine, Plus, Trash2, Loader2, Sparkles } from 'lucide-react';
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

  return (
    <ClientLayout
      firstName={profileQ.data?.name?.split(' ')[0]}
      onRefresh={() => qc.invalidateQueries({ queryKey: ['wellness', 'journal'] })}
    >
      <div className="mx-auto w-full max-w-2xl px-5 py-6">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-5">
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300">
              <PenLine className="h-4 w-4" /><span className="text-xs uppercase tracking-[0.18em]">Journal</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reflect on your day</h1>
          </motion.div>

          {/* New entry */}
          <motion.div variants={fadeUp}>
            <Glass className="space-y-3 p-4">
              <textarea
                value={body} onChange={(e) => setBody(e.target.value)} rows={3}
                placeholder="How are you feeling? What went well today?"
                className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2.5 text-sm focus:border-violet-400/50 focus:outline-none"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {MOODS.map((m, i) => (
                    <button key={m} type="button" onClick={() => setMood(mood === i + 1 ? null : i + 1)}
                      className={cn('grid h-9 w-9 place-items-center rounded-full text-lg transition-all',
                        mood === i + 1 ? 'bg-violet-400/20 ring-2 ring-violet-400/50' : 'hover:bg-foreground/[0.05]')}>
                      {m}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => body.trim() && addMut.mutate()} disabled={!body.trim() || addMut.isPending}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                  {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Save
                </button>
              </div>
            </Glass>
          </motion.div>

          {/* Entries */}
          {journalQ.isLoading ? (
            <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
          ) : entries.length === 0 ? (
            <motion.div variants={fadeUp}><Glass className="p-8 text-center">
              <PenLine className="mx-auto h-8 w-8 text-foreground/25" />
              <div className="mt-3 text-sm text-foreground/70">Your journal is empty.</div>
              <div className="mt-1 text-xs text-foreground/50">Write your first reflection above.</div>
            </Glass></motion.div>
          ) : (
            <motion.div variants={fadeUp} className="space-y-3">
              {entries.map((e) => (
                <JournalCard key={e.id} entry={e} reflecting={reflectingId === e.id}
                  onReflect={() => reflect(e.id)} onDelete={() => delMut.mutate(e.id)} />
              ))}
            </motion.div>
          )}
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
    <Glass className="group p-4">
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
            <Sparkles className="h-3 w-3" /> Wellness AI
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
    </Glass>
  );
}
