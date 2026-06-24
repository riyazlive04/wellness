import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, Plus, Users, Activity, CheckCircle2, Loader2, ChevronRight,
  Layers, X, Target, Search, Trash2, ListChecks, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
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
  draft: 'bg-foreground/[0.05] text-foreground/55',
  published: 'bg-teal-600/10 text-teal-700 dark:text-teal-300',
  archived: 'bg-foreground/[0.05] text-foreground/45',
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
              className="inline-flex items-center gap-2 self-start rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(15,118,110,0.7)] transition-colors hover:bg-teal-700">
              <Plus className="h-4 w-4" /> New program
            </button>
          </motion.div>

          {/* Analytics — count-up KPIs */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KPIStat icon={Layers} label="Templates" value={a?.total_templates ?? 0} hint={`${a?.published_templates ?? 0} published`} />
            <KPIStat icon={Activity} label="Active programs" value={a?.published_templates ?? 0} hint={`${a?.active_programs ?? 0} running with clients`} />
            <KPIStat icon={Users} label="Clients enrolled" value={a?.clients_enrolled ?? 0} hint="active" />
            <KPIStat icon={CheckCircle2} label="Avg progress" value={a?.avg_progress ?? 0} suffix="%" hint={`${a?.completed_programs ?? 0} completed`} />
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
                    className="h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-teal-500/50 focus:outline-none" />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                    placeholder="What is this program about? Who is it for and what does it cover?"
                    className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm leading-relaxed focus:border-teal-500/50 focus:outline-none" />
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
                    className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-40">
                    {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
                  </button>
                </div>
              </Glass>
            </motion.div>
          )}

          {/* Toolbar: status filter + search */}
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
                        ? 'bg-teal-600 text-white'
                        : 'text-foreground/60 hover:bg-foreground/[0.05]',
                    )}
                  >
                    {s.label}
                    <span className={cn('text-[10px]', statusFilter === s.key ? 'text-white/70' : 'text-foreground/45')}>{countFor(s.key)}</span>
                  </button>
                ))}
              </div>
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search programs…"
                  className="h-9 w-full rounded-full border border-foreground/10 bg-foreground/[0.03] pl-9 pr-3 text-sm focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
                />
              </div>
            </motion.div>
          )}

          {/* Programs grid */}
          {templatesQ.isLoading ? (
            <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
          ) : templates.length === 0 ? (
            <motion.div variants={fadeUp}><Glass className="p-10 text-center">
              <ClipboardList className="mx-auto h-9 w-9 text-foreground/25" />
              <div className="mt-3 text-sm text-foreground/70">No programs yet</div>
              <div className="mt-1 text-xs text-foreground/50">Create your first reusable program to assign to clients.</div>
              <button type="button" onClick={() => setCreating(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
                <Plus className="h-4 w-4" /> New program
              </button>
            </Glass></motion.div>
          ) : (
            <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((t, i) => (
                <ProgramCard
                  key={t.id}
                  t={t}
                  index={i}
                  expanded={expandedId === t.id}
                  onToggle={() => setExpandedId((prev) => (prev === t.id ? null : t.id))}
                  onPublish={(id, status) => publishMut.mutate({ id, status })}
                  publishing={publishMut.isPending ? publishMut.variables?.id ?? null : null}
                  onDelete={(id) => deleteMut.mutate(id)}
                  deletingId={deleteMut.isPending ? deleteMut.variables ?? null : null}
                />
              ))}
              {/* Ghost "new program" card — turns empty space into an invitation */}
              {statusFilter === 'all' && !q && (
                <motion.button
                  type="button"
                  onClick={() => setCreating(true)}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.05 * filtered.length, ease: [0.2, 0.7, 0.3, 1] }}
                  className="group flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-foreground/15 text-foreground/45 transition-colors hover:border-teal-600/40 hover:bg-teal-600/[0.04] hover:text-teal-600"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-2xl border border-foreground/10 bg-foreground/[0.02] transition-colors group-hover:border-teal-600/30">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold">New program</span>
                  <span className="max-w-[170px] text-center text-[11.5px] text-foreground/35">Build a reusable template to assign to clients</span>
                </motion.button>
              )}
              {filtered.length === 0 && (
                <Glass className="col-span-full p-10 text-center text-sm text-foreground/55">No programs match your filters.</Glass>
              )}
            </motion.div>
          )}
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

// ─── Program card (animated, expandable) ───────────────────────────

interface ProgramCardProps {
  t: ProgramTemplate;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onPublish: (id: string, status: 'published' | 'draft') => void;
  publishing: string | null;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

function ProgramCard({ t, index, expanded, onToggle, onPublish, publishing, onDelete, deletingId }: ProgramCardProps) {
  const busy = publishing === t.id;
  const deleting = deletingId === t.id;
  const [confirmDel, setConfirmDel] = useState(false);
  const isPublished = t.status === 'published';
  const canPublish = (t.task_count ?? 0) > 0;
  const gradient = paletteGradient(t.accent_color);
  const pct = Math.max(0, Math.min(100, Math.round(t.avg_progress ?? 0)));

  // Lazily load the template's tasks only when the drawer is opened.
  const tasksQ = useQuery({
    queryKey: ['programs', 'template', t.id, 'tasks'],
    queryFn: () => programEngineApi.getTemplate(t.id),
    enabled: expanded,
    staleTime: 30_000,
  });
  const tasks = tasksQ.data?.tasks ?? [];

  function togglePublish(e: MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    if (!isPublished && !canPublish) { toast.error('Add at least one task before publishing.'); return; }
    onPublish(t.id, isPublished ? 'draft' : 'published');
  }
  function askDelete(e: MouseEvent) { e.preventDefault(); e.stopPropagation(); setConfirmDel(true); }
  function cancelDelete(e: MouseEvent) { e.preventDefault(); e.stopPropagation(); setConfirmDel(false); }
  function doDelete(e: MouseEvent) { e.preventDefault(); e.stopPropagation(); onDelete(t.id); }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05 * index, ease: [0.2, 0.7, 0.3, 1] }}
      onClick={onToggle}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-foreground/[0.012] transition-[transform,box-shadow,border-color] duration-200',
        expanded
          ? '-translate-y-0.5 border-teal-600/30 shadow-[0_22px_46px_-24px_rgba(14,26,36,0.45)]'
          : 'border-foreground/[0.08] hover:-translate-y-1 hover:border-teal-600/30 hover:shadow-[0_22px_46px_-24px_rgba(14,26,36,0.45)]',
      )}
    >
      {/* Accent spine */}
      <span className={cn('absolute inset-y-0 left-0 z-10 w-[3px] bg-gradient-to-b', gradient)} />
      {/* Hover sheen */}
      <span className="pointer-events-none absolute inset-0 z-[1] -translate-x-[120%] bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.45)_50%,transparent_70%)] transition-transform duration-700 ease-out group-hover:translate-x-[120%] dark:bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.08)_50%,transparent_70%)]" />

      <div className="relative z-[2] flex flex-1 flex-col p-[18px] pl-5">
        {/* Top: seed + status */}
        <div className="flex items-start justify-between gap-2">
          <span className={cn(
            'grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-sm transition-transform duration-300 group-hover:-rotate-[4deg] group-hover:scale-[1.08]',
            gradient,
          )}>
            {t.name.charAt(0).toUpperCase()}
          </span>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em]', STATUS_CHIP[t.status])}>
            <span className={cn('h-1.5 w-1.5 rounded-full bg-current', isPublished && 'animate-pulse')} />
            {t.status}
          </span>
        </div>

        {/* Title + category */}
        <div className="mt-3.5">
          <div className="text-base font-semibold leading-snug tracking-[-0.01em]">{t.name}</div>
          <div className="mt-0.5 text-[11px] capitalize text-foreground/45">{t.category.replace('_', ' ')}</div>
        </div>

        {t.description && (
          <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-foreground/60">{t.description}</p>
        )}

        {/* Goals */}
        {t.goals?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {t.goals.slice(0, 3).map((g) => (
              <span key={g} className="inline-flex items-center gap-1 rounded-full border border-teal-600/16 bg-teal-600/[0.07] px-2 py-0.5 text-[10.5px] text-teal-700 dark:text-teal-300">
                <Target className="h-2.5 w-2.5 opacity-70" />{g}
              </span>
            ))}
            {t.goals.length > 3 && (
              <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[10.5px] text-foreground/45">+{t.goals.length - 3}</span>
            )}
          </div>
        )}

        {/* Meta + progress ring */}
        <div className="mt-auto flex items-center gap-4 border-t border-foreground/[0.05] pt-3.5">
          <Stat value={`${t.duration_weeks}${t.duration_unit === 'days' ? 'd' : 'w'}`} label="Duration" />
          <Stat value={String(t.task_count ?? 0)} label="Tasks" />
          <Stat value={String(t.assigned_count ?? 0)} label="Enrolled" />
          <div className="ml-auto"><ProgressRing pct={pct} /></div>
        </div>
      </div>

      {/* Card actions */}
      <div className="relative z-[2] flex items-center gap-2 px-5 pb-[18px]">
        <button
          type="button"
          onClick={togglePublish}
          disabled={busy}
          title={!isPublished && !canPublish ? 'Add a task first' : isPublished ? 'Move back to draft' : 'Publish this program'}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60',
            isPublished
              ? 'border-teal-600/30 bg-teal-600/[0.08] text-teal-700 hover:bg-teal-600 hover:text-white dark:text-teal-300'
              : !canPublish
                ? 'border-foreground/10 text-foreground/40'
                : 'border-teal-600/30 bg-teal-600/[0.08] text-teal-700 hover:bg-teal-600 hover:text-white dark:text-teal-300',
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isPublished ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {isPublished ? 'Published' : 'Publish'}
        </button>

        {confirmDel ? (
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={doDelete} disabled={deleting}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/20 disabled:opacity-60 dark:text-rose-300">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={cancelDelete}
              className="rounded-xl border border-foreground/10 px-2.5 py-2 text-xs text-foreground/55 hover:bg-foreground/[0.04]">Cancel</button>
          </span>
        ) : (
          <button type="button" onClick={askDelete} title="Delete program"
            className="flex-shrink-0 rounded-xl border border-foreground/10 p-2 text-foreground/35 transition-colors hover:border-rose-500/40 hover:bg-rose-500/[0.06] hover:text-rose-500">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Inline expand drawer — lazily loads tasks */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.2, 0.7, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-[2] cursor-default overflow-hidden border-t border-foreground/[0.06] bg-foreground/[0.02]"
          >
            <div className="p-5">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/45">
                <ListChecks className="h-3.5 w-3.5" /> Program tasks · {t.task_count ?? 0}
              </div>
              {tasksQ.isLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-foreground/50">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tasks…
                </div>
              ) : tasks.length === 0 ? (
                <div className="py-1 text-xs text-foreground/45">No tasks yet — open the program to add some.</div>
              ) : (
                <div className="space-y-0.5">
                  {tasks.slice(0, 5).map((task, i) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i, duration: 0.3 }}
                      className="flex items-center gap-2.5 py-1.5 text-[13px] text-foreground/80"
                    >
                      <span className="grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-md border-2 border-teal-600/60 text-teal-600">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      </span>
                      <span className="truncate">{task.title}</span>
                      <span className="ml-auto flex-shrink-0 text-[10px] uppercase tracking-wide text-foreground/35">{task.cadence}</span>
                    </motion.div>
                  ))}
                  {tasks.length > 5 && (
                    <div className="pt-1 text-[11px] text-foreground/40">+{tasks.length - 5} more</div>
                  )}
                </div>
              )}
              <Link
                to={`/programs/${t.id}`}
                onClick={(e) => e.stopPropagation()}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-600/[0.08] px-3 py-2 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-600 hover:text-white dark:text-teal-300"
              >
                Open program <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expand affordance */}
      <span className={cn(
        'pointer-events-none absolute bottom-[18px] right-5 z-[3] text-foreground/25 transition-transform',
        expanded ? 'rotate-90 text-teal-600' : 'group-hover:translate-x-0.5',
      )}>
        <ChevronRight className="h-4 w-4" />
      </span>
    </motion.div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-bold tabular-nums tracking-[-0.01em]">{value}</span>
      <span className="text-[9px] uppercase tracking-[0.1em] text-foreground/45">{label}</span>
    </div>
  );
}

// ─── Animated progress ring ────────────────────────────────────────

function ProgressRing({ pct, size = 46, stroke = 5 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-foreground/10" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className="stroke-teal-600"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (circ * pct) / 100 }}
          transition={{ duration: 1.1, ease: [0.2, 0.7, 0.3, 1], delay: 0.3 }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-bold tabular-nums">{pct}%</span>
    </div>
  );
}

// ─── Count-up KPI stat ─────────────────────────────────────────────

function KPIStat({
  icon: Icon, label, value, hint, suffix = '',
}: { icon: typeof Layers; label: string; value: number; hint: string; suffix?: string }) {
  const display = useCountUp(value);
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.012] p-[18px]">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground/45">{label}</span>
        <span className="grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-teal-600/10 text-teal-600">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3.5 text-[32px] font-bold leading-none tracking-[-0.02em] tabular-nums">{display}{suffix}</div>
      <div className="mt-[7px] text-xs text-foreground/45">{hint}</div>
      <span className="absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 bg-gradient-to-r from-teal-600 to-teal-400 transition-transform duration-300 group-hover:scale-x-100" />
    </div>
  );
}

/** Eases a number from 0 → target once on mount / when target changes. */
function useCountUp(target: number, durationMs = 700): number {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    let raf = 0;
    let startTs: number | null = null;
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const p = Math.min(1, (ts - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = Math.round(from + (target - from) * eased);
      setVal(next);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
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
