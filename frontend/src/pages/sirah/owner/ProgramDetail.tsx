import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Plus, Trash2, Loader2, Users, Sparkles, Send, Check, X, CalendarClock, Target,
  Image as ImageIcon, Star, Save, ListChecks, LayoutGrid, FileText, Settings2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { paletteGradient, PROGRAM_PALETTE, PALETTE_KEYS } from './Programs';
import { programEngineApi, type TemplateTask, type Assignment, type ProgramContent, type ProgramTemplateInput } from '@/modules/workspace/api/programEngine';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

const TASK_TYPES = ['task', 'activity', 'nutrition', 'habit', 'checkin'];
const CADENCES = ['daily', 'weekly', 'once'];
const CATEGORIES = ['weight_management', 'lifestyle', 'sports', 'clinical', 'corporate', 'custom'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
const GOAL_PRESETS = ['Lose Weight', 'Build Healthy Eating Habits', 'Reduce Body Fat', 'Improve Energy', 'Improve Gut Health', 'Increase Muscle Mass', 'Better Lifestyle'];
const AUDIENCE_TAGS = ['Men', 'Women', 'Office Workers', 'Homemakers', 'Students', 'Athletes', 'Beginners', 'Intermediate Clients'];
const DELIVERABLES = ['Personalized Meal Plan', 'Weekly Meal Updates', 'Grocery Lists', 'Healthy Recipes', 'Exercise Guidance', 'Educational Resources', 'Weekly Reviews', 'Progress Reports', 'AI Nutrition Assistant', 'WhatsApp Support', 'Community Access'];
const SUPPORT = ['Chat Support', 'Weekly Consultation', 'Monthly Consultation', 'AI Assistant', 'Community Access', 'Emergency Support'];

type TopTab = 'details' | 'tasks' | 'clients';
type Section = 'basics' | 'overview' | 'audience' | 'eligibility' | 'outcomes' | 'roadmap' | 'deliverables' | 'faqs' | 'notes' | 'publish';

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'basics', label: 'Basics' },
  { key: 'overview', label: 'Overview' },
  { key: 'audience', label: 'Audience' },
  { key: 'eligibility', label: 'Eligibility' },
  { key: 'outcomes', label: 'Outcomes' },
  { key: 'roadmap', label: 'Roadmap' },
  { key: 'deliverables', label: 'Deliverables & Support' },
  { key: 'faqs', label: 'FAQs' },
  { key: 'notes', label: 'Internal notes' },
  { key: 'publish', label: 'Publish' },
];

interface Form {
  name: string; tagline: string; description: string; category: string;
  durationWeeks: number; durationUnit: 'weeks' | 'days'; accent: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  coverImageUrl: string; featured: boolean; visible: boolean; allowEnrollment: boolean;
  maxEnrollments: string; internalNotes: string; goals: string[];
}

export default function OwnerProgramDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showAssign, setShowAssign] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [tab, setTab] = useState<TopTab>('details');
  const [section, setSection] = useState<Section>('basics');

  const tplQ = useQuery({ queryKey: ['programs', 'template', id], queryFn: () => programEngineApi.getTemplate(id), enabled: !!id });
  const assignmentsQ = useQuery({ queryKey: ['programs', 'assignments'], queryFn: () => programEngineApi.listAssignments() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['programs', 'template', id] });
    qc.invalidateQueries({ queryKey: ['programs', 'templates'] });
  };

  const tpl = tplQ.data;
  const tasks = tpl?.tasks ?? [];
  const myAssignments = (assignmentsQ.data ?? []).filter((x) => x.template_id === id);

  // ── editable local state, hydrated once from the loaded template ──
  const [form, setForm] = useState<Form | null>(null);
  const [content, setContent] = useState<ProgramContent>({});
  const [dirty, setDirty] = useState(false);
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!tpl) return;
    if (hydratedFor.current === tpl.id && dirty) return; // don't clobber unsaved edits
    hydratedFor.current = tpl.id;
    setForm({
      name: tpl.name, tagline: tpl.tagline ?? '', description: tpl.description ?? '', category: tpl.category,
      durationWeeks: tpl.duration_weeks, durationUnit: tpl.duration_unit, accent: tpl.accent_color ?? 'violet',
      difficulty: tpl.difficulty ?? 'beginner', coverImageUrl: tpl.cover_image_url ?? '',
      featured: !!tpl.featured, visible: tpl.visible !== false, allowEnrollment: tpl.allow_enrollment !== false,
      maxEnrollments: tpl.max_enrollments != null ? String(tpl.max_enrollments) : '',
      internalNotes: tpl.internal_notes ?? '', goals: Array.isArray(tpl.goals) ? tpl.goals : [],
    });
    setContent(tpl.content ?? {});
    setDirty(false);
  }, [tpl, dirty]);

  const setF = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((p) => (p ? { ...p, [k]: v } : p)); setDirty(true); };
  const setC = (updater: (c: ProgramContent) => ProgramContent) => { setContent((c) => updater(c)); setDirty(true); };

  const publishMut = useMutation({
    mutationFn: (status: string) => programEngineApi.updateTemplate(id, { status }),
    onSuccess: () => { invalidate(); toast.success('Program updated.'); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not update.'),
  });

  const deleteMut = useMutation({
    mutationFn: () => programEngineApi.deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programs', 'templates'] });
      qc.invalidateQueries({ queryKey: ['programs', 'analytics'] });
      toast.success('Program deleted.');
      navigate('/programs');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not delete.'),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('Not ready');
      const body: ProgramTemplateInput = {
        name: form.name.trim(), tagline: form.tagline.trim() || undefined,
        description: form.description.trim() || undefined, category: form.category,
        durationWeeks: form.durationWeeks, durationUnit: form.durationUnit, accentColor: form.accent,
        difficulty: form.difficulty, coverImageUrl: form.coverImageUrl || undefined,
        featured: form.featured, visible: form.visible, allowEnrollment: form.allowEnrollment,
        maxEnrollments: form.maxEnrollments.trim() ? Number(form.maxEnrollments) : undefined,
        internalNotes: form.internalNotes.trim() || undefined, goals: form.goals, content,
      };
      return programEngineApi.updateTemplate(id, body as Record<string, unknown>);
    },
    onSuccess: () => { setDirty(false); invalidate(); toast.success('Saved.'); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not save.'),
  });

  const addTaskMut = useMutation({
    mutationFn: (body: Partial<TemplateTask> & { title: string }) => programEngineApi.addTask(id, body),
    onSuccess: invalidate,
  });
  const delTaskMut = useMutation({
    mutationFn: (taskId: string) => programEngineApi.deleteTask(id, taskId),
    onSuccess: invalidate,
  });

  async function onCoverPick(file: File) {
    try {
      const url = await downscaleToDataUrl(file, 1280, 0.82);
      setF('coverImageUrl', url);
    } catch { toast.error('Could not process that image.'); }
  }

  return (
    <OwnerLayout practiceName="Program" ownerName="You" initials="SL" trialDaysLeft={null} topbarContext="Program Engine">
      <div className="mx-auto w-full max-w-4xl px-6 py-8 pb-28">
        <Link to="/programs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> All programs
        </Link>

        {tplQ.isLoading || !tpl || !form ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
        ) : (
          <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-6">
            {/* Header */}
            <motion.div variants={fadeUp}>
              <Glass className="overflow-hidden">
                <div className={cn('relative h-28 bg-gradient-to-br', paletteGradient(form.accent))}>
                  {form.coverImageUrl
                    ? <img src={form.coverImageUrl} alt="" className="h-full w-full object-cover" />
                    : <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,255,255,0.22),transparent_60%)]" />}
                </div>
                <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-semibold tracking-tight">{form.name || 'Untitled program'}</h1>
                      <span className="rounded-full border border-foreground/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/55">{tpl.status}</span>
                      <span className="rounded-full border border-foreground/10 px-2 py-0.5 text-[10px] capitalize text-foreground/55">{form.difficulty}</span>
                      {form.featured && <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300"><Star className="h-2.5 w-2.5" /> Featured</span>}
                    </div>
                    {form.tagline && <p className="mt-1 text-sm text-foreground/70">{form.tagline}</p>}
                    <div className="mt-1 text-sm capitalize text-foreground/55">
                      {form.category.replace('_', ' ')} · {form.durationWeeks} {form.durationUnit === 'days' ? 'days' : 'weeks'} · v{tpl.version}
                    </div>
                    {form.goals.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {form.goals.map((g) => (
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
                        title={tasks.length === 0 ? 'Add a task first' : 'Publish'}
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
                    {confirmDel ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/[0.06] px-2 py-1">
                        <span className="text-xs text-rose-600 dark:text-rose-300">Delete?</span>
                        <button type="button" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
                          className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60">
                          {deleteMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Yes
                        </button>
                        <button type="button" onClick={() => setConfirmDel(false)} className="rounded-full px-2 py-1 text-xs text-foreground/55 hover:text-foreground">No</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmDel(true)} title="Delete program"
                        className="rounded-full border border-foreground/10 p-2 text-foreground/40 hover:bg-rose-500/10 hover:text-rose-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </Glass>
            </motion.div>

            {/* Top tabs */}
            <motion.div variants={fadeUp} className="flex items-center gap-1.5">
              <TopTabBtn active={tab === 'details'} onClick={() => setTab('details')} icon={LayoutGrid} label="Details" />
              <TopTabBtn active={tab === 'tasks'} onClick={() => setTab('tasks')} icon={ListChecks} label={`Tasks (${tasks.length})`} />
              <TopTabBtn active={tab === 'clients'} onClick={() => setTab('clients')} icon={Users} label={`Clients (${myAssignments.length})`} />
            </motion.div>

            {/* DETAILS */}
            {tab === 'details' && (
              <motion.div variants={fadeUp} className="space-y-4">
                {/* Section strip */}
                <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
                  {SECTIONS.map((s) => (
                    <button key={s.key} type="button" onClick={() => setSection(s.key)}
                      className={cn('flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                        section === s.key ? 'bg-foreground/10 text-foreground' : 'text-foreground/55 hover:bg-foreground/[0.05]')}>
                      {s.label}
                    </button>
                  ))}
                </div>

                <Glass className="space-y-5 p-5">
                  {section === 'basics' && (
                    <>
                      <TextField label="Program name" value={form.name} onChange={(v) => setF('name', v)} placeholder="e.g. 12-Week Weight Management" />
                      <TextField label="Short tagline" value={form.tagline} onChange={(v) => setF('tagline', v)} placeholder="One line clients see first" />
                      <TextArea label="Description" value={form.description} onChange={(v) => setF('description', v)} rows={3} placeholder="What is this program about?" />

                      {/* Cover image */}
                      <div className="space-y-1.5">
                        <Label>Cover image / banner</Label>
                        <div className="flex items-center gap-3">
                          <div className={cn('relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br', paletteGradient(form.accent))}>
                            {form.coverImageUrl && <img src={form.coverImageUrl} alt="" className="h-full w-full object-cover" />}
                          </div>
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-foreground/10 px-3 py-2 text-xs hover:bg-foreground/[0.04]">
                            <ImageIcon className="h-3.5 w-3.5" /> {form.coverImageUrl ? 'Replace' : 'Upload'}
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCoverPick(f); }} />
                          </label>
                          {form.coverImageUrl && (
                            <button type="button" onClick={() => setF('coverImageUrl', '')} className="text-xs text-foreground/50 hover:text-rose-500">Remove</button>
                          )}
                        </div>
                      </div>

                      {/* Accent */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-foreground/55">Accent colour</span>
                        {PALETTE_KEYS.map((k) => (
                          <button key={k} type="button" onClick={() => setF('accent', k)} title={PROGRAM_PALETTE[k].label}
                            className={cn('h-6 w-6 rounded-full bg-gradient-to-br transition-transform hover:scale-110', PROGRAM_PALETTE[k].swatch,
                              form.accent === k ? 'ring-2 ring-foreground/70' : 'ring-1 ring-foreground/15')} />
                        ))}
                      </div>

                      <div className="flex flex-wrap items-end gap-3">
                        <SelectField label="Category" value={form.category} onChange={(v) => setF('category', v)}
                          options={CATEGORIES.map((c) => ({ value: c, label: c.replace('_', ' ') }))} />
                        <SelectField label="Difficulty" value={form.difficulty} onChange={(v) => setF('difficulty', v as Form['difficulty'])}
                          options={DIFFICULTIES.map((d) => ({ value: d, label: d }))} />
                        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">
                          Duration
                          <span className="flex items-center gap-1.5">
                            <input type="number" min={1} max={form.durationUnit === 'days' ? 730 : 104} value={form.durationWeeks}
                              onChange={(e) => setF('durationWeeks', Number(e.target.value))}
                              className="h-9 w-16 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs focus:outline-none" />
                            <select value={form.durationUnit} onChange={(e) => setF('durationUnit', e.target.value as 'weeks' | 'days')}
                              className="h-9 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs focus:outline-none">
                              <option value="weeks">weeks</option><option value="days">days</option>
                            </select>
                          </span>
                        </label>
                      </div>

                      <Chips label="Goals" items={form.goals} onChange={(v) => setF('goals', v)} suggestions={GOAL_PRESETS} placeholder="Add a goal — press Enter" />
                    </>
                  )}

                  {section === 'overview' && (
                    <>
                      <TextArea label="Purpose of the program" value={content.overview?.purpose ?? ''} rows={2}
                        onChange={(v) => setC((c) => ({ ...c, overview: { ...c.overview, purpose: v } }))} placeholder="Why does this program exist?" />
                      <TextArea label="What the client will achieve" value={content.overview?.achieve ?? ''} rows={2}
                        onChange={(v) => setC((c) => ({ ...c, overview: { ...c.overview, achieve: v } }))} placeholder="The end result" />
                      <Chips label="Key benefits" items={content.overview?.benefits ?? []}
                        onChange={(v) => setC((c) => ({ ...c, overview: { ...c.overview, benefits: v } }))} placeholder="Add a benefit" />
                      <TextArea label="Transformation summary" value={content.overview?.transformation ?? ''} rows={2}
                        onChange={(v) => setC((c) => ({ ...c, overview: { ...c.overview, transformation: v } }))} placeholder="Before → after, in a sentence" />
                    </>
                  )}

                  {section === 'audience' && (
                    <>
                      <Chips label="Suitable for" items={content.audience?.tags ?? []} suggestions={AUDIENCE_TAGS}
                        onChange={(v) => setC((c) => ({ ...c, audience: { ...c.audience, tags: v } }))} placeholder="Add an audience" />
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <NumField label="Min age" value={content.audience?.min_age} onChange={(n) => setC((c) => ({ ...c, audience: { ...c.audience, min_age: n } }))} />
                        <NumField label="Max age" value={content.audience?.max_age} onChange={(n) => setC((c) => ({ ...c, audience: { ...c.audience, max_age: n } }))} />
                        <NumField label="BMI min" value={content.audience?.bmi_min} onChange={(n) => setC((c) => ({ ...c, audience: { ...c.audience, bmi_min: n } }))} />
                        <NumField label="BMI max" value={content.audience?.bmi_max} onChange={(n) => setC((c) => ({ ...c, audience: { ...c.audience, bmi_max: n } }))} />
                      </div>
                    </>
                  )}

                  {section === 'eligibility' && (
                    <>
                      <Chips label="Medical conditions allowed" items={content.eligibility?.conditions_allowed ?? []}
                        onChange={(v) => setC((c) => ({ ...c, eligibility: { ...c.eligibility, conditions_allowed: v } }))} placeholder="e.g. PCOS, Pre-diabetes" />
                      <Chips label="Not suitable for (conditions)" items={content.eligibility?.conditions_not_suitable ?? []}
                        onChange={(v) => setC((c) => ({ ...c, eligibility: { ...c.eligibility, conditions_not_suitable: v } }))} placeholder="e.g. Severe kidney disease" />
                      <Chips label="Prerequisites" items={content.eligibility?.prerequisites ?? []}
                        onChange={(v) => setC((c) => ({ ...c, eligibility: { ...c.eligibility, prerequisites: v } }))} placeholder="e.g. Recent blood report" />
                      <Toggle label="Pregnancy restriction applies" checked={!!content.eligibility?.pregnancy_restriction}
                        onChange={(b) => setC((c) => ({ ...c, eligibility: { ...c.eligibility, pregnancy_restriction: b } }))} />
                      <Toggle label="Doctor approval required" checked={!!content.eligibility?.doctor_approval}
                        onChange={(b) => setC((c) => ({ ...c, eligibility: { ...c.eligibility, doctor_approval: b } }))} />
                    </>
                  )}

                  {section === 'outcomes' && (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <TextField label="Expected weight loss" value={content.outcomes?.weight_loss ?? ''} onChange={(v) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, weight_loss: v } }))} placeholder="e.g. 4–6 kg" />
                        <TextField label="Waist reduction" value={content.outcomes?.waist ?? ''} onChange={(v) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, waist: v } }))} placeholder="e.g. 2–4 inches" />
                        <TextField label="Body fat reduction" value={content.outcomes?.body_fat ?? ''} onChange={(v) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, body_fat: v } }))} placeholder="e.g. 3–5%" />
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <Toggle label="Improved energy" checked={!!content.outcomes?.energy} onChange={(b) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, energy: b } }))} />
                        <Toggle label="Better sleep" checked={!!content.outcomes?.sleep} onChange={(b) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, sleep: b } }))} />
                        <Toggle label="Better eating habits" checked={!!content.outcomes?.habits} onChange={(b) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, habits: b } }))} />
                      </div>
                      <TextArea label="Disclaimer" value={content.outcomes?.disclaimer ?? 'Results vary by individual.'} rows={2}
                        onChange={(v) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, disclaimer: v } }))} placeholder="Results vary by individual." />
                    </>
                  )}

                  {section === 'roadmap' && (
                    <RoadmapEditor value={content.roadmap ?? []} onChange={(v) => setC((c) => ({ ...c, roadmap: v }))} />
                  )}

                  {section === 'deliverables' && (
                    <>
                      <Chips label="Deliverables (what the client receives)" items={content.deliverables ?? []} suggestions={DELIVERABLES}
                        onChange={(v) => setC((c) => ({ ...c, deliverables: v }))} placeholder="Add a deliverable" />
                      <Chips label="Support included" items={content.support ?? []} suggestions={SUPPORT}
                        onChange={(v) => setC((c) => ({ ...c, support: v }))} placeholder="Add a support option" />
                    </>
                  )}

                  {section === 'faqs' && (
                    <FaqEditor value={content.faqs ?? []} onChange={(v) => setC((c) => ({ ...c, faqs: v }))} />
                  )}

                  {section === 'notes' && (
                    <>
                      <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                        <FileText className="h-3.5 w-3.5" /> Private — never shown to clients.
                      </div>
                      <TextArea label="Internal notes" value={form.internalNotes} onChange={(v) => setF('internalNotes', v)} rows={5} placeholder="Notes only your team can see" />
                    </>
                  )}

                  {section === 'publish' && (
                    <>
                      <Toggle label="Visible to clients" checked={form.visible} onChange={(b) => setF('visible', b)} hint="Hidden programs never appear in the client catalog, even when published." />
                      <Toggle label="Featured program" checked={form.featured} onChange={(b) => setF('featured', b)} hint="Pinned to the top of the catalog." />
                      <Toggle label="Allow enrollment" checked={form.allowEnrollment} onChange={(b) => setF('allowEnrollment', b)} hint="Turn off to stop new clients joining." />
                      <TextField label="Maximum enrollments (optional)" type="number" value={form.maxEnrollments} onChange={(v) => setF('maxEnrollments', v)} placeholder="Leave blank for unlimited" />
                      <div className="text-xs text-foreground/55">
                        Status is controlled by the <span className="font-medium">Publish</span> / <span className="font-medium">Archive</span> button in the header. Publishing requires at least one task.
                      </div>
                    </>
                  )}
                </Glass>
              </motion.div>
            )}

            {/* TASKS */}
            {tab === 'tasks' && (
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
            )}

            {/* CLIENTS */}
            {tab === 'clients' && (
              <motion.div variants={fadeUp}>
                <div className="mb-2 text-sm font-medium">Assigned clients ({myAssignments.length})</div>
                {myAssignments.length === 0 ? (
                  <Glass className="p-6 text-center text-xs text-foreground/45">Not assigned to anyone yet. Clients can also self-enroll from their portal once this program is published.</Glass>
                ) : (
                  <div className="space-y-2">{myAssignments.map((a) => <AssignmentRow key={a.id} a={a} />)}</div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </div>

      {/* Sticky save bar (Details only) */}
      {tab === 'details' && form && (
        <AnimatePresence>
          {dirty && (
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground/10 bg-background/85 backdrop-blur-md">
              <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-foreground/60"><Settings2 className="h-3.5 w-3.5" /> Unsaved changes</span>
                <button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-40">
                  {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

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

// ── tiny form primitives ──────────────────────────────────────────────
function Label({ children }: { children: ReactNode }) {
  return <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">{children}</label>;
}
function TextField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-violet-400/50 focus:outline-none" />
    </div>
  );
}
function NumField({ label, value, onChange }: { label: string; value: number | null | undefined; onChange: (n: number | null) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value.trim() === '' ? null : Number(e.target.value))}
        className="h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-violet-400/50 focus:outline-none" />
    </div>
  );
}
function TextArea({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm leading-relaxed focus:border-violet-400/50 focus:outline-none" />
    </div>
  );
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs capitalize text-foreground focus:outline-none">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (b: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <button type="button" onClick={() => onChange(!checked)}
        className={cn('mt-0.5 h-5 w-9 flex-shrink-0 rounded-full p-0.5 transition-colors', checked ? 'bg-emerald-500' : 'bg-foreground/15')}>
        <span className={cn('block h-4 w-4 rounded-full bg-white transition-transform', checked && 'translate-x-4')} />
      </button>
      <span className="text-sm">
        {label}
        {hint && <span className="block text-[11px] text-foreground/50">{hint}</span>}
      </span>
    </label>
  );
}
function Chips({ label, items, onChange, placeholder, suggestions }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => { const g = raw.trim(); if (g && !items.includes(g)) onChange([...items, g]); setDraft(''); };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-2 py-2">
        {items.map((g) => (
          <span key={g} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs text-foreground/80">
            {g}
            <button type="button" onClick={() => onChange(items.filter((x) => x !== g))} className="text-foreground/40 hover:text-foreground"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); } else if (e.key === 'Backspace' && !draft && items.length) onChange(items.slice(0, -1)); }}
          onBlur={() => draft && add(draft)} placeholder={placeholder}
          className="min-w-[140px] flex-1 bg-transparent px-1 text-sm focus:outline-none" />
      </div>
      {suggestions && suggestions.filter((s) => !items.includes(s)).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.filter((s) => !items.includes(s)).map((s) => (
            <button key={s} type="button" onClick={() => add(s)}
              className="inline-flex items-center gap-1 rounded-full border border-foreground/10 px-2 py-0.5 text-[11px] text-foreground/60 hover:bg-foreground/[0.05]">
              <Plus className="h-2.5 w-2.5" />{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RoadmapEditor({ value, onChange }: { value: ProgramContent['roadmap']; onChange: (v: NonNullable<ProgramContent['roadmap']>) => void }) {
  const phases = value ?? [];
  const set = (i: number, patch: Partial<{ title: string; description: string; duration: string }>) =>
    onChange(phases.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Program roadmap (phases)</Label>
        <button type="button" onClick={() => onChange([...phases, { title: '', description: '', duration: '' }])}
          className="inline-flex items-center gap-1 rounded-full border border-foreground/10 px-2.5 py-1 text-xs hover:bg-foreground/[0.04]"><Plus className="h-3 w-3" /> Add phase</button>
      </div>
      {phases.length === 0 && <div className="rounded-xl border border-dashed border-foreground/10 p-4 text-center text-xs text-foreground/45">No phases yet. Add Phase 1 to outline the journey.</div>}
      {phases.map((p, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-[11px] font-semibold">{i + 1}</span>
            <input value={p.title} onChange={(e) => set(i, { title: e.target.value })} placeholder={`Phase ${i + 1} title — e.g. Assessment`}
              className="h-9 flex-1 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:outline-none" />
            <input value={p.duration ?? ''} onChange={(e) => set(i, { duration: e.target.value })} placeholder="Duration"
              className="h-9 w-28 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs focus:outline-none" />
            <button type="button" onClick={() => onChange(phases.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4 text-foreground/30 hover:text-rose-500" /></button>
          </div>
          <textarea value={p.description ?? ''} onChange={(e) => set(i, { description: e.target.value })} rows={2} placeholder="What happens in this phase"
            className="w-full resize-none rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:outline-none" />
        </div>
      ))}
    </div>
  );
}

function FaqEditor({ value, onChange }: { value: ProgramContent['faqs']; onChange: (v: NonNullable<ProgramContent['faqs']>) => void }) {
  const faqs = value ?? [];
  const set = (i: number, patch: Partial<{ q: string; a: string }>) => onChange(faqs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>FAQs</Label>
        <button type="button" onClick={() => onChange([...faqs, { q: '', a: '' }])}
          className="inline-flex items-center gap-1 rounded-full border border-foreground/10 px-2.5 py-1 text-xs hover:bg-foreground/[0.04]"><Plus className="h-3 w-3" /> Add FAQ</button>
      </div>
      {faqs.length === 0 && <div className="rounded-xl border border-dashed border-foreground/10 p-4 text-center text-xs text-foreground/45">No FAQs yet.</div>}
      {faqs.map((f, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
          <div className="flex items-center gap-2">
            <input value={f.q} onChange={(e) => set(i, { q: e.target.value })} placeholder="Question"
              className="h-9 flex-1 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 text-sm font-medium focus:outline-none" />
            <button type="button" onClick={() => onChange(faqs.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4 text-foreground/30 hover:text-rose-500" /></button>
          </div>
          <textarea value={f.a} onChange={(e) => set(i, { a: e.target.value })} rows={2} placeholder="Answer"
            className="w-full resize-none rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:outline-none" />
        </div>
      ))}
    </div>
  );
}

function TopTabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Users; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
        active ? 'bg-foreground/10 text-foreground' : 'text-foreground/55 hover:bg-foreground/[0.05]')}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

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
      {reco && <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-3 text-xs leading-relaxed text-foreground/75">{reco}</div>}
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

// Client-side image downscale → JPEG data URL (mirrors client Settings avatar flow).
async function downscaleToDataUrl(file: File, max = 1280, quality = 0.82): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not decode the image.'));
    i.src = raw;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
