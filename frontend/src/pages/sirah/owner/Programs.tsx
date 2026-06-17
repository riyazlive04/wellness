import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ClipboardList, Plus, Users, Activity, CheckCircle2, Loader2, ArrowRight, Layers, X, Target } from 'lucide-react';
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
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [goalDraft, setGoalDraft] = useState('');
  const [category, setCategory] = useState('custom');
  const [weeks, setWeeks] = useState(4);
  const [unit, setUnit] = useState<'weeks' | 'days'>('weeks');
  const [accent, setAccent] = useState(DEFAULT_ACCENT);

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
    onSuccess: () => {
      setName(''); setDescription(''); setGoals([]); setGoalDraft('');
      setCategory('custom'); setAccent(DEFAULT_ACCENT); setUnit('weeks'); setWeeks(4); setCreating(false);
      qc.invalidateQueries({ queryKey: ['programs', 'templates'] });
      qc.invalidateQueries({ queryKey: ['programs', 'analytics'] });
      toast.success('Program created — add tasks and publish it.');
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

  const templates = templatesQ.data ?? [];
  const a = analyticsQ.data;

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
                {/* Live banner preview in the chosen colour */}
                <div className={cn('relative flex h-20 items-end overflow-hidden rounded-xl bg-gradient-to-br p-3', paletteGradient(accent))}>
                  <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,255,255,0.25),transparent_60%)]" />
                  <span className="relative text-sm font-semibold text-white drop-shadow">{name.trim() || 'Program name'}</span>
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

                {/* Banner colour palette */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-foreground/55">Banner colour</span>
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

          {/* Templates grid */}
          {templatesQ.isLoading ? (
            <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
          ) : templates.length === 0 ? (
            <motion.div variants={fadeUp}><Glass className="p-10 text-center">
              <ClipboardList className="mx-auto h-9 w-9 text-foreground/25" />
              <div className="mt-3 text-sm text-foreground/70">No programs yet</div>
              <div className="mt-1 text-xs text-foreground/50">Create your first reusable program to assign to clients.</div>
            </Glass></motion.div>
          ) : (
            <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  t={t}
                  onPublish={(id, status) => publishMut.mutate({ id, status })}
                  pendingId={publishMut.isPending ? publishMut.variables?.id ?? null : null}
                />
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

interface TemplateCardProps {
  t: ProgramTemplate;
  onPublish: (id: string, status: 'published' | 'draft') => void;
  pendingId: string | null;
}

function TemplateCard({ t, onPublish, pendingId }: TemplateCardProps) {
  const busy = pendingId === t.id;
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

  return (
    <Link to={`/programs/${t.id}`}>
      <Glass className="group flex h-full flex-col overflow-hidden transition-transform hover:-translate-y-0.5">
        {/* Coloured banner */}
        <div className={cn('relative h-16 bg-gradient-to-br', paletteGradient(t.accent_color))}>
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,255,255,0.22),transparent_60%)]" />
          {/* Publish toggle */}
          <button
            type="button"
            onClick={togglePublish}
            disabled={busy}
            title={!isPublished && !canPublish ? 'Add a task first' : isPublished ? 'Move back to draft' : 'Publish this program'}
            className={cn(
              'absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur transition-colors disabled:opacity-60',
              isPublished
                ? 'bg-white/20 text-white hover:bg-white/30'
                : !canPublish
                  ? 'bg-black/20 text-white/70'
                  : 'bg-white text-emerald-700 hover:bg-white/90',
            )}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : isPublished ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {isPublished ? 'Published' : 'Publish'}
          </button>
        </div>
        <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]', STATUS_CHIP[t.status])}>{t.status}</span>
          <span className="text-[11px] capitalize text-foreground/45">{t.category.replace('_', ' ')}</span>
        </div>
        <div className="mt-3 text-base font-semibold">{t.name}</div>
        {t.description && <div className="mt-1 line-clamp-2 text-xs text-foreground/55">{t.description}</div>}
        {t.goals?.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
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
        <div className="mt-auto flex items-center gap-3 pt-4 text-[11px] text-foreground/55">
          <span>{t.duration_weeks}{t.duration_unit === 'days' ? 'd' : 'w'}</span>
          <span>· {t.task_count ?? 0} tasks</span>
          <span>· {t.assigned_count ?? 0} assigned</span>
          <ArrowRight className="ml-auto h-3.5 w-3.5 text-foreground/30 transition-transform group-hover:translate-x-0.5" />
        </div>
        </div>
      </Glass>
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
