import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Plus, Trash2, Loader2, Users, Send, Check, X, CalendarClock, Target,
  Image as ImageIcon, Star, Save, ListChecks, LayoutGrid, FileText, Settings2, MessagesSquare, UserMinus, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import i18n from '@/i18n';
import { Glass, fadeUp, stagger } from '@/design-system';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { ProgramChatPanel } from '@/modules/workspace/programs/ProgramChatPanel';
import { paletteGradient, PROGRAM_PALETTE, PALETTE_KEYS } from './Programs';
import { programEngineApi, type ProgramTemplate, type TemplateTask, type Assignment, type ProgramContent, type ProgramTemplateInput } from '@/modules/workspace/api/programEngine';
import { clientsApi } from '@/modules/workspace/api/clients';
import { optimistic } from '@/lib/optimistic';
import { cn } from '@/lib/utils';

const TASK_TYPES = ['task', 'activity', 'nutrition', 'habit', 'checkin'];
const CADENCES = ['daily', 'weekly', 'once'];
const CATEGORIES = ['weight_management', 'lifestyle', 'sports', 'clinical', 'corporate', 'custom'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
const GOAL_PRESETS = ['Lose Weight', 'Build Healthy Eating Habits', 'Reduce Body Fat', 'Improve Energy', 'Improve Gut Health', 'Increase Muscle Mass', 'Better Lifestyle'];
const AUDIENCE_TAGS = ['Men', 'Women', 'Office Workers', 'Homemakers', 'Students', 'Athletes', 'Beginners', 'Intermediate Clients'];
const DELIVERABLES = ['Personalized Meal Plan', 'Weekly Meal Updates', 'Grocery Lists', 'Healthy Recipes', 'Exercise Guidance', 'Educational Resources', 'Weekly Reviews', 'Progress Reports', 'AI Nutrition Assistant', 'WhatsApp Support', 'Community Access'];
const SUPPORT = ['Chat Support', 'Weekly Consultation', 'Monthly Consultation', 'AI Assistant', 'Community Access', 'Emergency Support'];

type TopTab = 'details' | 'tasks' | 'clients' | 'chat';
type Section = 'basics' | 'overview' | 'audience' | 'eligibility' | 'outcomes' | 'roadmap' | 'deliverables' | 'notes' | 'publish';

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'basics', label: 'Basics' },
  { key: 'overview', label: 'Overview' },
  { key: 'audience', label: 'Audience' },
  { key: 'eligibility', label: 'Eligibility' },
  { key: 'outcomes', label: 'Outcomes' },
  { key: 'roadmap', label: 'Roadmap' },
  { key: 'deliverables', label: 'Deliverables & Support' },
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
  const { t } = useTranslation('ownerProgramDetail');
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
  // Cancelled assignments are removed clients — kept in the DB for history but
  // hidden from the owner's roster (count + list) so "Remove" reads as gone.
  const myAssignments = (assignmentsQ.data ?? []).filter((x) => x.template_id === id && x.status !== 'cancelled');

  const syncMut = useMutation({
    mutationFn: () => programEngineApi.syncToAssignments(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['programs', 'assignments'] });
      qc.invalidateQueries({ queryKey: ['programs', 'template', id] });
      if (r.assignments === 0) {
        toast.info(t('toast.syncNone'));
      } else {
        const bits = [r.added && t('toast.syncAdded', { count: r.added }), r.removed && t('toast.syncRemoved', { count: r.removed })].filter(Boolean).join(', ');
        const base = t(r.assignments === 1 ? 'toast.syncDoneOne' : 'toast.syncDoneOther', { count: r.assignments });
        toast.success(`${base}${bits ? ` (${bits})` : ''}.`);
      }
    },
    onError: (e: Error) => toast.error(e.message ?? t('toast.syncError')),
  });

  const removeMut = useMutation({
    mutationFn: (assignmentId: string) => programEngineApi.setAssignmentStatus(assignmentId, 'cancelled'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programs', 'assignments'] });
      qc.invalidateQueries({ queryKey: ['programs', 'template', id] });
      qc.invalidateQueries({ queryKey: ['programs', 'templates'] });
      toast.success(t('toast.clientRemoved'));
    },
    onError: (e: Error) => toast.error(e.message ?? t('toast.removeError')),
  });

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
    // Optimistic: the header status chip + Publish/Archive button flip instantly.
    ...optimistic<ProgramTemplate & { tasks: TemplateTask[] }, string>(
      qc,
      ['programs', 'template', id],
      (old, status) => ({ ...old, status }),
      { errorMessage: t('toast.updateError'), also: [['programs', 'templates']] },
    ),
    onSuccess: () => toast.success(t('toast.programUpdated')),
  });

  const deleteMut = useMutation({
    mutationFn: () => programEngineApi.deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programs', 'templates'] });
      qc.invalidateQueries({ queryKey: ['programs', 'analytics'] });
      toast.success(t('toast.programDeleted'));
      navigate('/programs');
    },
    onError: (e: Error) => toast.error(e.message ?? t('toast.deleteError')),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      if (!form) throw new Error(t('toast.notReady'));
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
    onSuccess: () => { setDirty(false); invalidate(); toast.success(t('toast.saved')); },
    onError: (e: Error) => toast.error(e.message ?? t('toast.saveError')),
  });

  const addTaskMut = useMutation({
    mutationFn: (body: Partial<TemplateTask> & { title: string }) => programEngineApi.addTask(id, body),
    onSuccess: invalidate,
  });
  const delTaskMut = useMutation({
    mutationFn: (taskId: string) => programEngineApi.deleteTask(id, taskId),
    // Optimistic: the task disappears from the list the moment you hit delete.
    ...optimistic<ProgramTemplate & { tasks: TemplateTask[] }, string>(
      qc,
      ['programs', 'template', id],
      (old, taskId) => ({ ...old, tasks: old.tasks.filter((t) => t.id !== taskId) }),
      { errorMessage: t('toast.taskDeleteError'), also: [['programs', 'templates']] },
    ),
  });

  async function onCoverPick(file: File) {
    try {
      const url = await downscaleToDataUrl(file, 1280, 0.82);
      setF('coverImageUrl', url);
    } catch { toast.error(t('toast.imageError')); }
  }

  return (
    <OwnerLayout practiceName={t('header.practiceName')} ownerName={t('header.ownerName')} initials="SL" trialDaysLeft={null} topbarContext={t('header.topbarContext')}>
      <div className="mx-auto w-full max-w-4xl px-6 py-8 pb-28">
        <Link to="/programs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> {t('header.backLink')}
        </Link>

        {tplQ.isLoading || !tpl || !form ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
        ) : (
          <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-6">
            {/* Header */}
            <motion.div variants={fadeUp}>
              <div className="overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card shadow-sm">
                {/* Cover banner.
                    `object-cover` on a wide, short strip crops any square or
                    portrait upload down to a band through its middle - you see a
                    fragment, not the picture. So the real cover is `object-contain`
                    (whole, uncropped) over a blurred, scaled copy of itself, which
                    fills the strip with the image's own colours instead of leaving
                    dead space beside it. */}
                <div className={cn('relative h-40 overflow-hidden bg-gradient-to-br', paletteGradient(form.accent))}>
                  {form.coverImageUrl ? (
                    <>
                      <img
                        src={form.coverImageUrl}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl saturate-150"
                      />
                      <div aria-hidden className="absolute inset-0 bg-black/10" />
                      <img
                        src={form.coverImageUrl}
                        alt=""
                        className="relative h-full w-full object-contain"
                      />
                    </>
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,255,255,0.22),transparent_60%)]" />
                  )}
                </div>
                <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-extrabold tracking-tight">{form.name || t('header.untitled')}</h1>
                      <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:bg-teal-500/[0.12] dark:text-teal-300">{tpl.status}</span>
                      <span className="rounded-full bg-foreground/[0.05] px-2.5 py-0.5 text-[10px] font-bold capitalize text-foreground/60">{form.difficulty}</span>
                      {form.featured && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/[0.12] dark:text-amber-300"><Star className="h-2.5 w-2.5" /> {t('header.featured')}</span>}
                    </div>
                    {form.tagline && <p className="mt-1 text-sm text-foreground/70">{form.tagline}</p>}
                    <div className="mt-1 text-sm capitalize text-foreground/55">
                      {form.category.replace('_', ' ')} · {form.durationWeeks} {form.durationUnit === 'days' ? t('header.durationDays') : t('header.durationWeeks')} · v{tpl.version}
                    </div>
                    {form.goals.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {form.goals.map((g) => (
                          <span key={g} className="inline-flex items-center gap-1 rounded-full border border-teal-600/16 bg-teal-600/[0.07] px-2.5 py-1 text-xs text-teal-700 dark:text-teal-300">
                            <Target className="h-3 w-3 opacity-70" />{g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {tpl.status !== 'published' ? (
                      <button type="button" onClick={() => publishMut.mutate('published')} disabled={publishMut.isPending || tasks.length === 0}
                        title={tasks.length === 0 ? t('header.publishNeedsTask') : t('header.publishTitle')}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100">
                        <Check className="h-3.5 w-3.5" /> {t('header.publish')}
                      </button>
                    ) : (
                      <button type="button" onClick={() => publishMut.mutate('archived')}
                        className="rounded-full border border-foreground/[0.08] px-3.5 py-2 text-xs font-bold text-foreground/60 hover:bg-foreground/[0.04]">{t('header.archive')}</button>
                    )}
                    <button type="button" onClick={() => setShowAssign(true)} disabled={tasks.length === 0}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 cta-glow">
                      <Users className="h-3.5 w-3.5" /> {t('header.assign')}
                    </button>
                    {confirmDel ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/[0.06] px-2 py-1">
                        <span className="text-xs text-rose-600 dark:text-rose-300">{t('header.deletePrompt')}</span>
                        <button type="button" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
                          className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-60">
                          {deleteMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} {t('header.yes')}
                        </button>
                        <button type="button" onClick={() => setConfirmDel(false)} className="rounded-full px-2 py-1 text-xs text-foreground/55 hover:text-foreground">{t('header.no')}</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmDel(true)} title={t('header.deleteTitle')}
                        className="rounded-full border border-foreground/[0.08] p-2 text-foreground/40 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Top tabs */}
            <motion.div variants={fadeUp} className="flex items-center gap-1.5">
              <TopTabBtn active={tab === 'details'} onClick={() => setTab('details')} icon={LayoutGrid} label={t('tabs.details')} />
              <TopTabBtn active={tab === 'tasks'} onClick={() => setTab('tasks')} icon={ListChecks} label={t('tabs.tasks', { count: tasks.length })} />
              <TopTabBtn active={tab === 'clients'} onClick={() => setTab('clients')} icon={Users} label={t('tabs.clients', { count: myAssignments.length })} />
              <TopTabBtn active={tab === 'chat'} onClick={() => setTab('chat')} icon={MessagesSquare} label={t('tabs.chat')} />
            </motion.div>

            {/* DETAILS */}
            {tab === 'details' && (
              <motion.div variants={fadeUp} className="space-y-4">
                {/* Section strip */}
                <div className="-mx-1 flex gap-1.5 overflow-x-auto pb-1">
                  {SECTIONS.map((s) => (
                    <button key={s.key} type="button" onClick={() => setSection(s.key)}
                      className={cn('flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors',
                        section === s.key ? 'bg-teal-100 text-teal-800 dark:bg-teal-500/[0.14] dark:text-teal-200' : 'text-foreground/55 hover:bg-foreground/[0.05]')}>
                      {t(`sections.${s.key}`)}
                    </button>
                  ))}
                </div>

                <div className="space-y-5 rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
                  {section === 'basics' && (
                    <>
                      <TextField label={t('basics.name')} value={form.name} onChange={(v) => setF('name', v)} placeholder={t('basics.namePlaceholder')} />
                      <TextField label={t('basics.tagline')} value={form.tagline} onChange={(v) => setF('tagline', v)} placeholder={t('basics.taglinePlaceholder')} />
                      <TextArea label={t('basics.description')} value={form.description} onChange={(v) => setF('description', v)} rows={3} placeholder={t('basics.descriptionPlaceholder')} />

                      {/* Cover image */}
                      <div className="space-y-1.5">
                        <Label>{t('basics.cover')}</Label>
                        <div className="flex items-center gap-3">
                          <div className={cn('relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br', paletteGradient(form.accent))}>
                            {form.coverImageUrl && <img src={form.coverImageUrl} alt="" className="h-full w-full object-cover" />}
                          </div>
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-foreground/10 px-3 py-2 text-xs hover:bg-foreground/[0.04]">
                            <ImageIcon className="h-3.5 w-3.5" /> {form.coverImageUrl ? t('basics.replace') : t('basics.upload')}
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCoverPick(f); }} />
                          </label>
                          {form.coverImageUrl && (
                            <button type="button" onClick={() => setF('coverImageUrl', '')} className="text-xs text-foreground/50 hover:text-rose-500">{t('basics.remove')}</button>
                          )}
                        </div>
                      </div>

                      {/* Accent */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-foreground/55">{t('basics.accent')}</span>
                        {PALETTE_KEYS.map((k) => (
                          <button key={k} type="button" onClick={() => setF('accent', k)} title={PROGRAM_PALETTE[k].label}
                            className={cn('h-6 w-6 rounded-full bg-gradient-to-br transition-transform hover:scale-110', PROGRAM_PALETTE[k].swatch,
                              form.accent === k ? 'ring-2 ring-foreground/70' : 'ring-1 ring-foreground/15')} />
                        ))}
                      </div>

                      <div className="flex flex-wrap items-end gap-3">
                        <SelectField label={t('basics.category')} value={form.category} onChange={(v) => setF('category', v)}
                          options={CATEGORIES.map((c) => ({ value: c, label: c.replace('_', ' ') }))} />
                        <SelectField label={t('basics.difficulty')} value={form.difficulty} onChange={(v) => setF('difficulty', v as Form['difficulty'])}
                          options={DIFFICULTIES.map((d) => ({ value: d, label: d }))} />
                        {/* A <div>, not a <label>: <button> is a labelable element, so a
                            wrapping label forwards its click to the Radix trigger on top of
                            the trigger's own click - the menu opens and instantly closes.
                            The controls carry aria-labels instead. */}
                        <div className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">
                          {t('basics.duration')}
                          <span className="flex items-center gap-1.5">
                            <input type="number" aria-label={t('basics.duration')} min={1} max={form.durationUnit === 'days' ? 730 : 104} value={form.durationWeeks}
                              onChange={(e) => setF('durationWeeks', Number(e.target.value))}
                              className="h-9 w-16 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs focus:outline-none" />
                            <Select value={form.durationUnit} onValueChange={(v) => setF('durationUnit', v as 'weeks' | 'days')}>
                              <SelectTrigger
                                aria-label={t('basics.durationUnit')}
                                className="h-9 w-[86px] rounded-lg border-foreground/10 bg-foreground/[0.03] px-2 text-xs"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="weeks" className="text-xs">{t('basics.unitWeeks')}</SelectItem>
                                <SelectItem value="days" className="text-xs">{t('basics.unitDays')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </span>
                        </div>
                      </div>

                      <Chips label={t('basics.goals')} items={form.goals} onChange={(v) => setF('goals', v)} suggestions={GOAL_PRESETS} placeholder={t('basics.goalsPlaceholder')} />
                    </>
                  )}

                  {section === 'overview' && (
                    <>
                      <TextArea label={t('overview.purpose')} value={content.overview?.purpose ?? ''} rows={2}
                        onChange={(v) => setC((c) => ({ ...c, overview: { ...c.overview, purpose: v } }))} placeholder={t('overview.purposePlaceholder')} />
                      <TextArea label={t('overview.achieve')} value={content.overview?.achieve ?? ''} rows={2}
                        onChange={(v) => setC((c) => ({ ...c, overview: { ...c.overview, achieve: v } }))} placeholder={t('overview.achievePlaceholder')} />
                      <Chips label={t('overview.benefits')} items={content.overview?.benefits ?? []}
                        onChange={(v) => setC((c) => ({ ...c, overview: { ...c.overview, benefits: v } }))} placeholder={t('overview.benefitsPlaceholder')} />
                      <TextArea label={t('overview.transformation')} value={content.overview?.transformation ?? ''} rows={2}
                        onChange={(v) => setC((c) => ({ ...c, overview: { ...c.overview, transformation: v } }))} placeholder={t('overview.transformationPlaceholder')} />
                    </>
                  )}

                  {section === 'audience' && (
                    <>
                      <Chips label={t('audience.suitableFor')} items={content.audience?.tags ?? []} suggestions={AUDIENCE_TAGS}
                        onChange={(v) => setC((c) => ({ ...c, audience: { ...c.audience, tags: v } }))} placeholder={t('audience.suitablePlaceholder')} />
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <NumField label={t('audience.minAge')} value={content.audience?.min_age} onChange={(n) => setC((c) => ({ ...c, audience: { ...c.audience, min_age: n } }))} />
                        <NumField label={t('audience.maxAge')} value={content.audience?.max_age} onChange={(n) => setC((c) => ({ ...c, audience: { ...c.audience, max_age: n } }))} />
                        <NumField label={t('audience.bmiMin')} value={content.audience?.bmi_min} onChange={(n) => setC((c) => ({ ...c, audience: { ...c.audience, bmi_min: n } }))} />
                        <NumField label={t('audience.bmiMax')} value={content.audience?.bmi_max} onChange={(n) => setC((c) => ({ ...c, audience: { ...c.audience, bmi_max: n } }))} />
                      </div>
                    </>
                  )}

                  {section === 'eligibility' && (
                    <>
                      <Chips label={t('eligibility.conditionsAllowed')} items={content.eligibility?.conditions_allowed ?? []}
                        onChange={(v) => setC((c) => ({ ...c, eligibility: { ...c.eligibility, conditions_allowed: v } }))} placeholder={t('eligibility.conditionsAllowedPlaceholder')} />
                      <Chips label={t('eligibility.notSuitable')} items={content.eligibility?.conditions_not_suitable ?? []}
                        onChange={(v) => setC((c) => ({ ...c, eligibility: { ...c.eligibility, conditions_not_suitable: v } }))} placeholder={t('eligibility.notSuitablePlaceholder')} />
                      <Chips label={t('eligibility.prerequisites')} items={content.eligibility?.prerequisites ?? []}
                        onChange={(v) => setC((c) => ({ ...c, eligibility: { ...c.eligibility, prerequisites: v } }))} placeholder={t('eligibility.prerequisitesPlaceholder')} />
                      <Toggle label={t('eligibility.pregnancy')} checked={!!content.eligibility?.pregnancy_restriction}
                        onChange={(b) => setC((c) => ({ ...c, eligibility: { ...c.eligibility, pregnancy_restriction: b } }))} />
                      <Toggle label={t('eligibility.doctorApproval')} checked={!!content.eligibility?.doctor_approval}
                        onChange={(b) => setC((c) => ({ ...c, eligibility: { ...c.eligibility, doctor_approval: b } }))} />
                    </>
                  )}

                  {section === 'outcomes' && (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <TextField label={t('outcomes.weightLoss')} value={content.outcomes?.weight_loss ?? ''} onChange={(v) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, weight_loss: v } }))} placeholder={t('outcomes.weightLossPlaceholder')} />
                        <TextField label={t('outcomes.waist')} value={content.outcomes?.waist ?? ''} onChange={(v) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, waist: v } }))} placeholder={t('outcomes.waistPlaceholder')} />
                        <TextField label={t('outcomes.bodyFat')} value={content.outcomes?.body_fat ?? ''} onChange={(v) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, body_fat: v } }))} placeholder={t('outcomes.bodyFatPlaceholder')} />
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <Toggle label={t('outcomes.energy')} checked={!!content.outcomes?.energy} onChange={(b) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, energy: b } }))} />
                        <Toggle label={t('outcomes.sleep')} checked={!!content.outcomes?.sleep} onChange={(b) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, sleep: b } }))} />
                        <Toggle label={t('outcomes.habits')} checked={!!content.outcomes?.habits} onChange={(b) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, habits: b } }))} />
                      </div>
                      <TextArea label={t('outcomes.disclaimer')} value={content.outcomes?.disclaimer ?? t('outcomes.disclaimerDefault')} rows={2}
                        onChange={(v) => setC((c) => ({ ...c, outcomes: { ...c.outcomes, disclaimer: v } }))} placeholder={t('outcomes.disclaimerPlaceholder')} />
                    </>
                  )}

                  {section === 'roadmap' && (
                    <RoadmapEditor value={content.roadmap ?? []} onChange={(v) => setC((c) => ({ ...c, roadmap: v }))} />
                  )}

                  {section === 'deliverables' && (
                    <>
                      <Chips label={t('deliverables.deliverables')} items={content.deliverables ?? []} suggestions={DELIVERABLES}
                        onChange={(v) => setC((c) => ({ ...c, deliverables: v }))} placeholder={t('deliverables.deliverablesPlaceholder')} />
                      <Chips label={t('deliverables.support')} items={content.support ?? []} suggestions={SUPPORT}
                        onChange={(v) => setC((c) => ({ ...c, support: v }))} placeholder={t('deliverables.supportPlaceholder')} />
                    </>
                  )}

                  {section === 'notes' && (
                    <>
                      <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-100 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-500/[0.10] dark:text-amber-300">
                        <FileText className="h-3.5 w-3.5" /> {t('notes.private')}
                      </div>
                      <TextArea label={t('notes.internalNotes')} value={form.internalNotes} onChange={(v) => setF('internalNotes', v)} rows={5} placeholder={t('notes.internalNotesPlaceholder')} />
                    </>
                  )}

                  {section === 'publish' && (
                    <>
                      <Toggle label={t('publish.visible')} checked={form.visible} onChange={(b) => setF('visible', b)} hint={t('publish.visibleHint')} />
                      <Toggle label={t('publish.featured')} checked={form.featured} onChange={(b) => setF('featured', b)} hint={t('publish.featuredHint')} />
                      <Toggle label={t('publish.allowEnrollment')} checked={form.allowEnrollment} onChange={(b) => setF('allowEnrollment', b)} hint={t('publish.allowEnrollmentHint')} />
                      <TextField label={t('publish.maxEnrollments')} type="number" value={form.maxEnrollments} onChange={(v) => setF('maxEnrollments', v)} placeholder={t('publish.maxEnrollmentsPlaceholder')} />
                      <div className="text-xs text-foreground/55">
                        {t('publish.statusNoteBefore')}<span className="font-medium">{t('publish.statusPublish')}</span>{t('publish.statusNoteMid')}<span className="font-medium">{t('publish.statusArchive')}</span>{t('publish.statusNoteAfter')}
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}

            {/* TASKS */}
            {tab === 'tasks' && (
              <motion.div variants={fadeUp}>
                {/* Task edits auto-apply to active clients (the backend re-syncs
                    each assignment on every add/edit/delete). This is just a
                    reassurance line + a manual re-sync in case anything drifted. */}
                {myAssignments.length > 0 && (
                  <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-teal-500/20 bg-teal-500/[0.05] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-foreground/70">
                      <Check className="h-3.5 w-3.5 flex-shrink-0 text-teal-500" />
                      <span>{t(myAssignments.length === 1 ? 'tasks.syncNoteOne' : 'tasks.syncNoteOther', { count: myAssignments.length })}</span>
                    </div>
                    <button type="button" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}
                      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-teal-500/30 bg-transparent px-3.5 py-1.5 text-xs font-bold text-teal-700 transition-colors hover:bg-teal-500/10 disabled:opacity-50 dark:text-teal-300">
                      {syncMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {t('tasks.resync')}
                    </button>
                  </div>
                )}
                <div className="overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card shadow-sm">
                  <div className="border-b border-foreground/[0.06] px-5 py-3.5 text-sm font-extrabold">{t('tasks.listTitle', { count: tasks.length })}</div>
                  <ul className="divide-y divide-foreground/[0.04]">
                    {tasks.map((task) => (
                      <li key={task.id} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-foreground/[0.02]">
                        <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:bg-teal-500/[0.12] dark:text-teal-300">{task.type}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{task.title}</div>
                          <div className="text-[11px] text-foreground/45">
                            {task.cadence}{task.cadence !== 'daily' && (task.week_number ? ` · ${t('tasks.week', { n: task.week_number })}` : '')}{task.day_of_week != null ? ` · ${t(`dow.${task.day_of_week}`)}` : ''}
                          </div>
                        </div>
                        <button type="button" onClick={() => delTaskMut.mutate(task.id)} className="opacity-0 transition-opacity group-hover:opacity-100">
                          <Trash2 className="h-4 w-4 text-foreground/30 hover:text-rose-500" />
                        </button>
                      </li>
                    ))}
                    {tasks.length === 0 && <li className="px-5 py-6 text-center text-xs text-foreground/45">{t('tasks.empty')}</li>}
                  </ul>
                  <AddTaskRow onAdd={(b) => addTaskMut.mutate(b)} pending={addTaskMut.isPending} />
                </div>
              </motion.div>
            )}

            {/* CLIENTS */}
            {tab === 'clients' && (
              <motion.div variants={fadeUp}>
                <div className="mb-2.5 text-sm font-extrabold">{t('clients.title', { count: myAssignments.length })}</div>
                {myAssignments.length === 0 ? (
                  <div className="rounded-3xl border border-foreground/[0.06] bg-card p-6 text-center text-xs text-foreground/45 shadow-sm">{t('clients.empty')}</div>
                ) : (
                  <div className="space-y-2">{myAssignments.map((a) => (
                    <AssignmentRow key={a.id} a={a}
                      onRemove={() => removeMut.mutate(a.id)}
                      removing={removeMut.isPending && removeMut.variables === a.id} />
                  ))}</div>
                )}
              </motion.div>
            )}

            {tab === 'chat' && (
              <motion.div variants={fadeUp} className="space-y-2">
                <p className="text-xs text-foreground/55">
                  {t('chat.description')}
                </p>
                <ProgramChatPanel
                  queryKey={['programs', 'template', id, 'chat']}
                  list={() => programEngineApi.chatList(id)}
                  send={(content) => programEngineApi.chatSend(id, content)}
                  // On the owner side, every non-client (practice/staff) message is "mine".
                  isMine={(m) => m.sender_role !== 'client'}
                  memberHint={memberHint(myAssignments.map((a) => a.client_name))}
                  emptyHint={t('chat.emptyHint')}
                />
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
                <span className="inline-flex items-center gap-1.5 text-xs text-foreground/60"><Settings2 className="h-3.5 w-3.5" /> {t('save.unsaved')}</span>
                <button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white disabled:opacity-40">
                  {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('save.saveChanges')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <AnimatePresence>
        {showAssign && tpl && (
          <AssignModal templateId={id}
            assignedClientIds={new Set(myAssignments.filter((a) => a.status === 'active').map((a) => a.client_id))}
            onClose={() => setShowAssign(false)}
            onAssigned={() => { setShowAssign(false); qc.invalidateQueries({ queryKey: ['programs', 'assignments'] }); qc.invalidateQueries({ queryKey: ['programs', 'template', id] }); }} />
        )}
      </AnimatePresence>
    </OwnerLayout>
  );
}

// ── tiny form primitives ──────────────────────────────────────────────
function Label({ children }: { children: ReactNode }) {
  return <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/45">{children}</label>;
}
function TextField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-teal-400/50 focus:outline-none" />
    </div>
  );
}
function NumField({ label, value, onChange }: { label: string; value: number | null | undefined; onChange: (n: number | null) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value.trim() === '' ? null : Number(e.target.value))}
        className="h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-teal-400/50 focus:outline-none" />
    </div>
  );
}
function TextArea({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm leading-relaxed focus:border-teal-400/50 focus:outline-none" />
    </div>
  );
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    // A <div>, not a <label>: <button> is a labelable element, so a wrapping
    // label forwards its click to the Radix trigger on top of the trigger's own
    // click — the menu opens and instantly closes. The trigger gets an aria-label.
    <div className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={label}
          className="h-9 rounded-lg border-foreground/10 bg-foreground/[0.03] px-2 text-xs capitalize text-foreground"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs capitalize">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (b: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <button type="button" onClick={() => onChange(!checked)}
        className={cn('mt-0.5 h-5 w-9 flex-shrink-0 rounded-full p-0.5 transition-colors', checked ? 'bg-teal-500' : 'bg-foreground/15')}>
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
  const { t } = useTranslation('ownerProgramDetail');
  const phases = value ?? [];
  const set = (i: number, patch: Partial<{ title: string; description: string; duration: string }>) =>
    onChange(phases.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{t('roadmap.label')}</Label>
        <button type="button" onClick={() => onChange([...phases, { title: '', description: '', duration: '' }])}
          className="inline-flex items-center gap-1 rounded-full border border-foreground/10 px-2.5 py-1 text-xs hover:bg-foreground/[0.04]"><Plus className="h-3 w-3" /> {t('roadmap.addPhase')}</button>
      </div>
      {phases.length === 0 && <div className="rounded-xl border border-dashed border-foreground/10 p-4 text-center text-xs text-foreground/45">{t('roadmap.empty')}</div>}
      {phases.map((p, i) => (
        <div key={i} className="space-y-2 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-3">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-teal-100 text-[11px] font-bold text-teal-700 dark:bg-teal-500/[0.14] dark:text-teal-300">{i + 1}</span>
            <input value={p.title} onChange={(e) => set(i, { title: e.target.value })} placeholder={t('roadmap.titlePlaceholder', { n: i + 1 })}
              className="h-9 flex-1 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:outline-none" />
            <input value={p.duration ?? ''} onChange={(e) => set(i, { duration: e.target.value })} placeholder={t('roadmap.durationPlaceholder')}
              className="h-9 w-28 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs focus:outline-none" />
            <button type="button" onClick={() => onChange(phases.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4 text-foreground/30 hover:text-rose-500" /></button>
          </div>
          <textarea value={p.description ?? ''} onChange={(e) => set(i, { description: e.target.value })} rows={2} placeholder={t('roadmap.descriptionPlaceholder')}
            className="w-full resize-none rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:outline-none" />
        </div>
      ))}
    </div>
  );
}


/** Header caption naming the enrolled clients: "You + Aakash, Priya +3 more". */
function memberHint(names: Array<string | null | undefined>): string {
  const clean = names.map((n) => (n ?? '').trim()).filter(Boolean);
  if (clean.length === 0) return i18n.t('ownerProgramDetail:chat.memberJustYou');
  const shown = clean.slice(0, 3).join(', ');
  const extra = clean.length - 3;
  const base = i18n.t('ownerProgramDetail:chat.memberHint', { names: shown });
  return extra > 0 ? base + i18n.t('ownerProgramDetail:chat.memberMore', { count: extra }) : base;
}

function TopTabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Users; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors',
        active ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm' : 'text-foreground/55 hover:bg-foreground/[0.05]')}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function AddTaskRow({ onAdd, pending }: { onAdd: (b: Partial<TemplateTask> & { title: string }) => void; pending: boolean }) {
  const { t } = useTranslation('ownerProgramDetail');
  const [title, setTitle] = useState('');
  const [type, setType] = useState('task');
  const [cadence, setCadence] = useState('daily');
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-foreground/[0.06] px-5 py-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('tasks.addPlaceholder')}
        onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) { onAdd({ title: title.trim(), type, cadence } as never); setTitle(''); } }}
        className="h-9 flex-1 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-teal-400/50 focus:outline-none" />
      <Select value={type} onValueChange={setType}>
        <SelectTrigger aria-label={t('tasks.typeLabel')} className="h-9 w-[124px] rounded-lg border-foreground/10 bg-foreground/[0.03] px-2 text-xs capitalize">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_TYPES.map((opt) => <SelectItem key={opt} value={opt} className="text-xs capitalize">{opt}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={cadence} onValueChange={setCadence}>
        <SelectTrigger aria-label={t('tasks.cadenceLabel')} className="h-9 w-[112px] rounded-lg border-foreground/10 bg-foreground/[0.03] px-2 text-xs capitalize">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CADENCES.map((opt) => <SelectItem key={opt} value={opt} className="text-xs capitalize">{opt}</SelectItem>)}
        </SelectContent>
      </Select>
      <button type="button" onClick={() => { if (title.trim()) { onAdd({ title: title.trim(), type, cadence } as never); setTitle(''); } }} disabled={!title.trim() || pending}
        className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-40 disabled:hover:scale-100">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </button>
    </div>
  );
}

function AssignmentRow({ a, onRemove, removing }: { a: Assignment; onRemove: () => void; removing: boolean }) {
  const pct = a.progress?.pct ?? Math.round(Number(a.progress_pct));
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="rounded-2xl border border-foreground/[0.06] bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold">{a.client_name ?? 'Client'}</span>
            <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-foreground/55">{a.status}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-teal-500/10">
              <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] font-bold tabular-nums text-foreground/55">{pct}%</span>
          </div>
        </div>

        {/* Remove client from this program (soft-cancel; re-assignable later). */}
        {confirm ? (
          <span className="flex flex-shrink-0 items-center gap-1.5">
            <span className="hidden text-xs text-foreground/55 sm:inline">Remove?</span>
            <button type="button" onClick={onRemove} disabled={removing}
              className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-60">
              {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Yes
            </button>
            <button type="button" onClick={() => setConfirm(false)} disabled={removing}
              className="rounded-full px-2 py-1 text-xs text-foreground/55 hover:text-foreground">No</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} title="Remove client from program"
            className="flex-shrink-0 rounded-full border border-foreground/[0.08] p-2 text-foreground/40 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-500">
            <UserMinus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function AssignModal({ templateId, assignedClientIds, onClose, onAssigned }: { templateId: string; assignedClientIds: Set<string>; onClose: () => void; onAssigned: () => void }) {
  const clientsQ = useQuery({ queryKey: ['workspace', 'clients', 'all'], queryFn: () => clientsApi.list({ limit: 200 }) });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');

  const assignMut = useMutation({
    mutationFn: () => programEngineApi.assign(templateId, Array.from(selected)),
    onSuccess: (r) => {
      toast.success(`Assigned to ${r.assigned} client${r.assigned === 1 ? '' : 's'}.${r.skipped ? ` ${r.skipped} already on this program.` : ''}`);
      onAssigned();
    },
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
            <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-teal-500" /><span className="text-sm font-semibold">Assign program</span></div>
            <button type="button" onClick={onClose} className="rounded p-1 text-foreground/50 hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="border-b border-foreground/[0.06] px-5 py-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…"
              className="h-9 w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-teal-400/50 focus:outline-none" />
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {clientsQ.isLoading ? <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
              : clients.length === 0 ? <div className="py-8 text-center text-xs text-foreground/45">No clients found.</div>
              : clients.map((c) => {
                const alreadyOn = assignedClientIds.has(c.id);
                return (
                <button key={c.id} type="button" disabled={alreadyOn} onClick={() => toggle(c.id)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-foreground/[0.04]', selected.has(c.id) && 'bg-teal-400/[0.08]', alreadyOn && 'cursor-not-allowed opacity-45 hover:bg-transparent')}>
                  <span className={cn('grid h-5 w-5 place-items-center rounded-full border', selected.has(c.id) ? 'border-teal-500 bg-teal-500 text-white' : 'border-foreground/20')}>
                    {selected.has(c.id) && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{c.name ?? 'Unnamed'}</span>
                    <span className="block truncate text-[11px] text-foreground/45">{c.email}</span>
                  </span>
                  {alreadyOn && <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-foreground/55">Assigned</span>}
                </button>
                );
              })}
          </div>
          <div className="flex items-center justify-between border-t border-foreground/[0.08] px-5 py-3">
            <span className="text-xs text-foreground/55">{selected.size} selected</span>
            <button type="button" onClick={() => assignMut.mutate()} disabled={selected.size === 0 || assignMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
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
