import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Plus, Trash2, Loader2, Users, Sparkles, Send, Check, X, CalendarClock, Target,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { paletteGradient } from './Programs';
import { programEngineApi, type TemplateTask, type Assignment } from '@/modules/workspace/api/programEngine';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

const TASK_TYPES = ['task', 'activity', 'nutrition', 'habit', 'checkin'];
const CADENCES = ['daily', 'weekly', 'once'];

export default function OwnerProgramDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);

  const tplQ = useQuery({ queryKey: ['programs', 'template', id], queryFn: () => programEngineApi.getTemplate(id), enabled: !!id });
  const assignmentsQ = useQuery({ queryKey: ['programs', 'assignments'], queryFn: () => programEngineApi.listAssignments() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['programs', 'template', id] });
    qc.invalidateQueries({ queryKey: ['programs', 'templates'] });
  };

  const publishMut = useMutation({
    mutationFn: (status: string) => programEngineApi.updateTemplate(id, { status }),
    onSuccess: () => { invalidate(); toast.success('Program updated.'); },
  });
  const addTaskMut = useMutation({
    mutationFn: (body: Partial<TemplateTask> & { title: string }) => programEngineApi.addTask(id, body),
    onSuccess: invalidate,
  });
  const delTaskMut = useMutation({
    mutationFn: (taskId: string) => programEngineApi.deleteTask(id, taskId),
    onSuccess: invalidate,
  });

  const tpl = tplQ.data;
  const tasks = tpl?.tasks ?? [];
  const myAssignments = (assignmentsQ.data ?? []).filter((x) => x.template_id === id);

  return (
    <OwnerLayout practiceName="Program" ownerName="You" initials="SL" trialDaysLeft={null} topbarContext="Program Engine">
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <Link to="/programs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> All programs
        </Link>

        {tplQ.isLoading || !tpl ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
        ) : (
          <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-6">
            {/* Header */}
            <motion.div variants={fadeUp}>
              <Glass className="overflow-hidden">
                {/* Accent banner */}
                <div className={cn('relative h-20 bg-gradient-to-br', paletteGradient(tpl.accent_color))}>
                  <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,255,255,0.22),transparent_60%)]" />
                </div>
                <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight">{tpl.name}</h1>
                    <span className="rounded-full border border-foreground/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/55">{tpl.status}</span>
                  </div>
                  <div className="mt-1 text-sm capitalize text-foreground/55">
                    {tpl.category.replace('_', ' ')} · {tpl.duration_weeks} {tpl.duration_unit === 'days' ? 'days' : 'weeks'} · v{tpl.version}
                  </div>
                  {tpl.description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/70">{tpl.description}</p>}
                  {tpl.goals?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {tpl.goals.map((g) => (
                        <span key={g} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs text-foreground/75">
                          <Target className="h-3 w-3 text-foreground/40" />{g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {tpl.status !== 'published' ? (
                    <button type="button" onClick={() => publishMut.mutate('published')} disabled={publishMut.isPending || tasks.length === 0}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-400 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                      <Check className="h-3.5 w-3.5" /> Publish
                    </button>
                  ) : (
                    <button type="button" onClick={() => publishMut.mutate('archived')}
                      className="rounded-full border border-foreground/10 px-3 py-2 text-xs text-foreground/60 hover:bg-foreground/[0.04]">Archive</button>
                  )}
                  <button type="button" onClick={() => setShowAssign(true)} disabled={tasks.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                    <Users className="h-3.5 w-3.5" /> Assign
                  </button>
                </div>
                </div>
              </Glass>
            </motion.div>

            {/* Task builder */}
            <motion.div variants={fadeUp}>
              <Glass className="overflow-hidden">
                <div className="border-b border-foreground/[0.06] px-5 py-3 text-sm font-medium">Program tasks ({tasks.length})</div>
                <ul className="divide-y divide-foreground/[0.04]">
                  {tasks.map((t) => (
                    <li key={t.id} className="group flex items-center gap-3 px-5 py-3">
                      <span className="rounded-md bg-foreground/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/50">{t.type}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{t.title}</div>
                        <div className="text-[11px] text-foreground/45">
                          {t.cadence}{t.cadence !== 'daily' && (t.week_number ? ` · week ${t.week_number}` : '')}{t.day_of_week != null ? ` · ${DOW[t.day_of_week]}` : ''}
                        </div>
                      </div>
                      <button type="button" onClick={() => delTaskMut.mutate(t.id)} className="opacity-0 transition-opacity group-hover:opacity-100">
                        <Trash2 className="h-4 w-4 text-foreground/30 hover:text-rose-500" />
                      </button>
                    </li>
                  ))}
                  {tasks.length === 0 && <li className="px-5 py-6 text-center text-xs text-foreground/45">No tasks yet — add the program's daily activities below.</li>}
                </ul>
                <AddTaskRow onAdd={(b) => addTaskMut.mutate(b)} pending={addTaskMut.isPending} />
              </Glass>
            </motion.div>

            {/* Assignments */}
            <motion.div variants={fadeUp}>
              <div className="mb-2 text-sm font-medium">Assigned clients ({myAssignments.length})</div>
              {myAssignments.length === 0 ? (
                <Glass className="p-6 text-center text-xs text-foreground/45">Not assigned to anyone yet.</Glass>
              ) : (
                <div className="space-y-2">
                  {myAssignments.map((a) => <AssignmentRow key={a.id} a={a} />)}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showAssign && tpl && (
          <AssignModal templateId={id} onClose={() => setShowAssign(false)}
            onAssigned={() => { setShowAssign(false); qc.invalidateQueries({ queryKey: ['programs', 'assignments'] }); qc.invalidateQueries({ queryKey: ['programs', 'template', id] }); }} />
        )}
      </AnimatePresence>
    </OwnerLayout>
  );
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function AddTaskRow({ onAdd, pending }: { onAdd: (b: Partial<TemplateTask> & { title: string }) => void; pending: boolean }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('task');
  const [cadence, setCadence] = useState('daily');
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-foreground/[0.06] px-5 py-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task — e.g. 30-min walk"
        onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) { onAdd({ title: title.trim(), type, cadence } as never); setTitle(''); } }}
        className="h-9 flex-1 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-violet-400/50 focus:outline-none" />
      <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs capitalize focus:outline-none">
        {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="h-9 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs capitalize focus:outline-none">
        {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button type="button" onClick={() => { if (title.trim()) { onAdd({ title: title.trim(), type, cadence } as never); setTitle(''); } }} disabled={!title.trim() || pending}
        className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white disabled:opacity-40">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </button>
    </div>
  );
}

function AssignmentRow({ a }: { a: Assignment }) {
  const [reco, setReco] = useState<string | null>(null);
  const [loadingReco, setLoadingReco] = useState(false);
  const pct = a.progress?.pct ?? Math.round(Number(a.progress_pct));

  async function getReco() {
    setLoadingReco(true);
    try { const r = await programEngineApi.recommend(a.id); setReco(r.recommendation); }
    catch { toast.error('Could not get a recommendation.'); }
    finally { setLoadingReco(false); }
  }

  return (
    <Glass className="p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{a.client_name ?? 'Client'}</span>
            <span className="rounded-full border border-foreground/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-foreground/50">{a.status}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] tabular-nums text-foreground/55">{pct}%</span>
          </div>
        </div>
        <button type="button" onClick={getReco} disabled={loadingReco}
          className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-400/[0.08] px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-400/[0.15] disabled:opacity-50 dark:text-violet-200">
          {loadingReco ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI tips
        </button>
      </div>
      {reco && (
        <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-3 text-xs leading-relaxed text-foreground/75">{reco}</div>
      )}
    </Glass>
  );
}

function AssignModal({ templateId, onClose, onAssigned }: { templateId: string; onClose: () => void; onAssigned: () => void }) {
  const clientsQ = useQuery({ queryKey: ['workspace', 'clients', 'all'], queryFn: () => clientsApi.list({ limit: 200 }) });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');

  const assignMut = useMutation({
    mutationFn: () => programEngineApi.assign(templateId, Array.from(selected)),
    onSuccess: (r) => { toast.success(`Assigned to ${r.assigned} client${r.assigned === 1 ? '' : 's'}.`); onAssigned(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not assign.'),
  });

  const clients = (clientsQ.data?.items ?? []).filter((c) =>
    !q || (c.name ?? '').toLowerCase().includes(q.toLowerCase()) || (c.email ?? '').toLowerCase().includes(q.toLowerCase()));

  function toggle(idc: string) {
    setSelected((s) => { const n = new Set(s); n.has(idc) ? n.delete(idc) : n.add(idc); return n; });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative z-10 w-full max-w-md">
        <Glass variant="heavy" className="flex max-h-[80vh] flex-col p-0 shadow-2xl">
          <div className="flex items-center justify-between border-b border-foreground/[0.08] px-5 py-4">
            <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-violet-500" /><span className="text-sm font-semibold">Assign program</span></div>
            <button type="button" onClick={onClose} className="rounded p-1 text-foreground/50 hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="border-b border-foreground/[0.06] px-5 py-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…"
              className="h-9 w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-violet-400/50 focus:outline-none" />
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {clientsQ.isLoading ? <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
              : clients.length === 0 ? <div className="py-8 text-center text-xs text-foreground/45">No clients found.</div>
              : clients.map((c) => (
                <button key={c.id} type="button" onClick={() => toggle(c.id)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-foreground/[0.04]', selected.has(c.id) && 'bg-violet-400/[0.08]')}>
                  <span className={cn('grid h-5 w-5 place-items-center rounded-full border', selected.has(c.id) ? 'border-violet-500 bg-violet-500 text-white' : 'border-foreground/20')}>
                    {selected.has(c.id) && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{c.name ?? 'Unnamed'}</span>
                    <span className="block truncate text-[11px] text-foreground/45">{c.email}</span>
                  </span>
                </button>
              ))}
          </div>
          <div className="flex items-center justify-between border-t border-foreground/[0.08] px-5 py-3">
            <span className="text-xs text-foreground/55">{selected.size} selected</span>
            <button type="button" onClick={() => assignMut.mutate()} disabled={selected.size === 0 || assignMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
              {assignMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Assign
            </button>
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}
