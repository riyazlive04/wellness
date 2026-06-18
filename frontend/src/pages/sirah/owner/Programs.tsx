import { useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ClipboardList, Plus, Users, Activity, CheckCircle2, Loader2, ChevronRight, Layers, X, Target, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { programEngineApi, type ProgramTemplate } from '@/modules/workspace/api/programEngine';
import { cn } from '@/lib/utils';

const CATEGORIES = ['weight_management', 'lifestyle', 'sports', 'clinical', 'corporate', 'custom'];

/** Banner colour palette for program templates. `accent_color` stores the key. */
export const PROGRAM_PALETTE: Record<string, { label: string; gradient: string; swatch: string }> = {
  violet: { label: 'Violet', gradient: 'from-violet-500 to-fuchsia-500', swatch: 'from-violet-500 to-fuchsia-500' },
  blue: { label: 'Blue', gradient: 'from-blue-600 to-cyan-500', swatch: 'from-blue-600 to-cyan-500' },
  emerald: { label: 'Emerald', gradient: 'from-emerald-500 to-teal-500', swatch: 'from-emerald-500 to-teal-500' },
  amber: { label: 'Amber', gradient: 'from-amber-500 to-orange-500', swatch: 'from-amber-500 to-orange-500' },
  rose: { label: 'Rose', gradient: 'from-rose-500 to-pink-500', swatch: 'from-rose-500 to-pink-500' },
  indigo: { label: 'Indigo', gradient: 'from-indigo-500 to-violet-600', swatch: 'from-indigo-500 to-violet-600' },
  teal: { label: 'Teal', gradient: 'from-teal-500 to-emerald-500', swatch: 'from-teal-500 to-emerald-500' },
  slate: { label: 'Slate', gradient: 'from-slate-600 to-slate-800', swatch: 'from-slate-600 to-slate-800' },
};
export const PALETTE_KEYS = Object.keys(PROGRAM_PALETTE);
const DEFAULT_ACCENT = 'violet';
export function paletteGradient(key: string | null | undefined): string {
  return PROGRAM_PALETTE[key ?? '']?.gradient ?? PROGRAM_PALETTE[DEFAULT_ACCENT].gradient;
}

const STATUS_CHIP: Record<string, string> = {
  draft: 'border-foreground/15 bg-foreground/[0.04] text-foreground/60',
  published: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
  archived: 'border-foreground/15 bg-foreground/[0.04] text-foreground/45',
};

export default function OwnerPrograms() {
  const ws = readWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [goalDraft, setGoalDraft] = useState('');
  const [category, setCategory] = useState('custom');
  const [weeks, setWeeks] = useState(4);
  const [unit, setUnit] = useState<'weeks' | 'days'>('weeks');
  const [accent, setAccent] = useState(DEFAULT_ACCENT);

  // List controls
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'archived'>('all');

  function addGoal() {
    const g = goalDraft.trim();
    if (g && !goals.includes(g)) setGoals((prev) => [...prev, g]);
    setGoalDraft('');
  }

  const templatesQ = useQuery({ queryKey: ['programs', 'templates'], queryFn: programEngineApi.listTemplates });
  const analyticsQ = useQuery({ queryKey: ['programs', 'analytics'], queryFn: programEngineApi.analytics });

  const createMut = useMutation({
    mutationFn: () => programEngineApi.createTemplate({
      name: name.trim(),
      description: description.trim() || undefined,
      goals: goals.length ? goals : undefined,
      category, durationWeeks: weeks, durationUnit: unit, accentColor: accent,
    }),
    onSuccess: (created) => {
      setName(''); setDescription(''); setGoals([]); setGoalDraft('');
      setCategory('custom'); setAccent(DEFAULT_ACCENT); setUnit('weeks'); setWeeks(4); setCreating(false);
      qc.invalidateQueries({ queryKey: ['programs', 'templates'] });
      qc.invalidateQueries({ queryKey: ['programs', 'analytics'] });
      toast.success('Program created — add details, tasks, then publish.');
      if (created?.id) navigate(`/programs/${created.id}`);
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not create program.'),
  });

  const publishMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'published' | 'draft' }) =>
      programEngineApi.updateTemplate(id, { status }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['programs', 'templates'] });
      qc.invalidateQueries({ queryKey: ['programs', 'analytics'] });
      toast.success(v.status === 'published' ? 'Program published.' : 'Moved back to draft.');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not update program.'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => programEngineApi.deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programs', 'templates'] });
      qc.invalidateQueries({ queryKey: ['programs', 'analytics'] });
      toast.success('Program deleted.');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not delete program.'),
  });

  const templates = templatesQ.data ?? [];
  const a = analyticsQ.data;

  const q = query.trim().toLowerCase();
  const filtered = templates.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (q && !(`${t.name} ${t.description ?? ''} ${t.category}`.toLowerCase().includes(q))) return false;
    return true;
  });
  const STATUS_TABS: Array<{ key: typeof statusFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'published', label: 'Published' },
    { key: 'draft', label: 'Draft' },
    { key: 'archived', label: 'Archived' },
  ];
  const countFor = (k: typeof statusFilter) => (k === 'all' ? templates.length : templates.filter((t) => t.status === k).length);

  return (
    <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials}
      trialDaysLeft={null} topbarContext="Program Engine">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-foreground/60">Programs</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Program Engine</h1>
              <p className="mt-1 text-sm text-foreground/60">Build reusable programs, assign them to clients, and track adherence.</p>
            </div>
            <button type="button" onClick={() => setCreating((v) => !v)}
              className="inline-flex items-center gap-2 self-start rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white">
              <Plus className="h-4 w-4" /> New program
            </button>
          </motion.div>

          {/* Analytics */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KPICard icon={Layers} label="Templates" value={String(a?.total_templates ?? 0)} hint={`${a?.published_templates ?? 0} published`} accent="indigo" />
            <KPICard icon={Activity} label="Active programs" value={String(a?.published_templates ?? 0)} hint={`${a?.active_programs ?? 0} running with clients`} accent="sage" />
            <KPICard icon={Users} label="Clients enrolled" value={String(a?.clients_enrolled ?? 0)} hint="active" accent="sand" />
            <KPICard icon={CheckCircle2} label="Avg progress" value={`${a?.avg_progress ?? 0}%`} hint={`${a?.completed_programs ?? 0} completed`} accent="sage" />
          </motion.div>

          {/* Create form */}
          {creating && (
            <motion.div variants={fadeUp}>
              <Glass className="space-y-3 p-4">
                {/* Compact row preview in the chosen accent colour */}
                <div className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
                  <span className={cn('h-9 w-9 flex-shrink-0 rounded-lg bg-gradient-to-br', paletteGradient(accent))} />
                  <span className="text-sm font-semibold">{name.trim() || 'Program name'}</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">Program name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 12-Week Weight Management"
                    className="h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-violet-400/50 focus:outline-none" />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                    placeholder="What is this program about? Who is it for and what does it cover?"
                    className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm leading-relaxed focus:border-violet-400/50 focus:outline-none" />
                </div>

                {/* Goals */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">Goals</label>
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-2 py-2">
                    {goals.map((g) => (
                      <span key={g} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs text-foreground/80">
                        {g}
                        <button type="button" onClick={() => setGoals((prev) => prev.filter((x) => x !== g))}
                          className="text-foreground/40 hover:text-foreground" aria-label={`Remove ${g}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={goalDraft}
                      onChange={(e) => setGoalDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addGoal(); }
                        else if (e.key === 'Backspace' && !goalDraft && goals.length) setGoals((prev) => prev.slice(0, -1));
                      }}
                      onBlur={addGoal}
                      placeholder={goals.length ? 'Add another…' : 'e.g. Lose 5kg, Build a daily routine — press Enter'}
                      className="min-w-[140px] flex-1 bg-transparent px-1 text-sm focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-foreground/40">Press Enter or comma to add each goal.</p>
                </div>

                {/* Accent colour palette */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-foreground/55">Accent colour</span>
                  {PALETTE_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAccent(key)}
                      title={PROGRAM_PALETTE[key].label}
                      aria-label={PROGRAM_PALETTE[key].label}
                      className={cn(
                        'h-6 w-6 rounded-full bg-gradient-to-br ring-offset-2 ring-offset-background transition-transform hover:scale-110',
                        PROGRAM_PALETTE[key].swatch,
                        accent === key ? 'ring-2 ring-foreground/70' : 'ring-1 ring-foreground/15',
                      )}
                    />
                  ))}
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">
                    Category
                    <select value={category} onChange={(e) => setCategory(e.target.value)}
                      className="h-9 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs capitalize text-foreground focus:outline-none">
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">
                    Duration
                    <span className="flex items-center gap-1.5">
                    <input type="number" min={1} max={unit === 'days' ? 730 : 104} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}
                      className="h-9 w-16 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs focus:outline-none" />
                    <select value={unit} onChange={(e) => setUnit(e.target.value as 'weeks' | 'days')}
                      className="h-9 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs focus:outline-none">
                      <option value="weeks">weeks</option>
                      <option value="days">days</option>
                    </select>
                    </span>
                  </label>
                  <button type="button" onClick={() => name.trim() && createMut.mutate()} disabled={!name.trim() || createMut.isPending}
                    className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-br from-blue-600 to-fuchsia-500 px-3 text-xs font-medium text-white disabled:opacity-40">
                    {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
                  </button>
                </div>
              </Glass>
            </motion.div>
          )}

          {/* Toolbar: search + status filter */}
          {templates.length > 0 && (
            <motion.div variants={fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                {STATUS_TABS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStatusFilter(s.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                      statusFilter === s.key
                        ? 'bg-foreground/10 text-foreground'
                        : 'text-foreground/60 hover:bg-foreground/[0.05]',
                    )}
                  >
                    {s.label}
                    <span className="text-[10px] text-foreground/45">{countFor(s.key)}</span>
                  </button>
                ))}
              </div>
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search programs…"
                  className="h-9 w-full rounded-full border border-foreground/10 bg-foreground/[0.03] pl-9 pr-3 text-sm focus:border-violet-400/50 focus:outline-none"
                />
              </div>
            </motion.div>
          )}

          {/* Programs list */}
          {templatesQ.isLoading ? (
            <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
          ) : templates.length === 0 ? (
            <motion.div variants={fadeUp}><Glass className="p-10 text-center">
              <ClipboardList className="mx-auto h-9 w-9 text-foreground/25" />
              <div className="mt-3 text-sm text-foreground/70">No programs yet</div>
              <div className="mt-1 text-xs text-foreground/50">Create your first reusable program to assign to clients.</div>
            </Glass></motion.div>
          ) : filtered.length === 0 ? (
            <motion.div variants={fadeUp}><Glass className="p-10 text-center text-sm text-foreground/55">
              No programs match your filters.
            </Glass></motion.div>
          ) : (
            <motion.div variants={fadeUp}>
              <Glass className="divide-y divide-foreground/[0.05] overflow-hidden">
                {filtered.map((t) => (
                  <TemplateRow
                    key={t.id}
                    t={t}
                    onPublish={(id, status) => publishMut.mutate({ id, status })}
                    pendingId={publishMut.isPending ? publishMut.variables?.id ?? null : null}
                    onDelete={(id) => deleteMut.mutate(id)}
                    deletingId={deleteMut.isPending ? deleteMut.variables ?? null : null}
                  />
                ))}
              </Glass>
            </motion.div>
          )}
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

interface TemplateRowProps {
  t: ProgramTemplate;
  onPublish: (id: string, status: 'published' | 'draft') => void;
  pendingId: string | null;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

function TemplateRow({ t, onPublish, pendingId, onDelete, deletingId }: TemplateRowProps) {
  const busy = pendingId === t.id;
  const deleting = deletingId === t.id;
  const [confirmDel, setConfirmDel] = useState(false);
  const isPublished = t.status === 'published';
  const canPublish = (t.task_count ?? 0) > 0;

  function togglePublish(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (!isPublished && !canPublish) {
      toast.error('Add at least one task before publishing.');
      return;
    }
    onPublish(t.id, isPublished ? 'draft' : 'published');
  }

  function askDelete(e: MouseEvent) { e.preventDefault(); e.stopPropagation(); setConfirmDel(true); }
  function cancelDelete(e: MouseEvent) { e.preventDefault(); e.stopPropagation(); setConfirmDel(false); }
  function doDelete(e: MouseEvent) { e.preventDefault(); e.stopPropagation(); onDelete(t.id); }

  return (
    <Link to={`/programs/${t.id}`} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-foreground/[0.03]">
      {/* Accent swatch */}
      <span className={cn('grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br text-sm font-semibold text-white shadow-sm', paletteGradient(t.accent_color))}>
        {t.name.charAt(0).toUpperCase()}
      </span>

      {/* Name + description + goals */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{t.name}</span>
          <span className={cn('flex-shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]', STATUS_CHIP[t.status])}>{t.status}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-foreground/55">
          <span className="capitalize">{t.category.replace('_', ' ')}</span>
          {t.description && <span className="hidden truncate text-foreground/45 sm:inline">· {t.description}</span>}
        </div>
        {t.goals?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {t.goals.slice(0, 3).map((g) => (
              <span key={g} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[10px] text-foreground/65">
                <Target className="h-2.5 w-2.5 text-foreground/40" />{g}
              </span>
            ))}
            {t.goals.length > 3 && (
              <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[10px] text-foreground/45">+{t.goals.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="hidden flex-shrink-0 items-center gap-4 text-[11px] text-foreground/55 md:flex">
        <span title="Duration">{t.duration_weeks}{t.duration_unit === 'days' ? 'd' : 'w'}</span>
        <span title="Tasks">{t.task_count ?? 0} tasks</span>
        <span title="Assigned">{t.assigned_count ?? 0} assigned</span>
      </div>

      {/* Publish toggle */}
      <button
        type="button"
        onClick={togglePublish}
        disabled={busy}
        title={!isPublished && !canPublish ? 'Add a task first' : isPublished ? 'Move back to draft' : 'Publish this program'}
        className={cn(
          'inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-60',
          isPublished
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-400/20'
            : !canPublish
              ? 'border-foreground/10 text-foreground/40'
              : 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20',
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : isPublished ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        <span className="hidden sm:inline">{isPublished ? 'Published' : 'Publish'}</span>
      </button>

      {/* Delete (two-step inline confirm) */}
      {confirmDel ? (
        <span className="flex flex-shrink-0 items-center gap-1">
          <button type="button" onClick={doDelete} disabled={deleting}
            className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-500/20 disabled:opacity-60 dark:text-rose-300">
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            <span className="hidden sm:inline">Delete</span>
          </button>
          <button type="button" onClick={cancelDelete}
            className="rounded-full border border-foreground/10 px-2 py-1 text-[11px] text-foreground/55 hover:bg-foreground/[0.04]">Cancel</button>
        </span>
      ) : (
        <button type="button" onClick={askDelete} title="Delete program"
          className="flex-shrink-0 rounded-full p-1.5 text-foreground/30 transition-colors hover:bg-rose-500/10 hover:text-rose-500">
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      <ChevronRight className="h-4 w-4 flex-shrink-0 text-foreground/30 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

interface WS { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WS {
  let practiceName = 'Your Practice';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; }
  } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials };
}
