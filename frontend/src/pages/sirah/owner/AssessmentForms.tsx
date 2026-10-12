import { useMemo, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check, ClipboardList, Clock, Eye, FlaskConical, HeartPulse, ListChecks, Loader2, NotebookPen, Pencil, Plus,
  RefreshCcw, Salad, Search, Send, Sparkles, Stethoscope, Timer, Trash2, Users, Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { Sheet } from '@/components/Sheet';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { optimistic } from '@/lib/optimistic';
import { cn } from '@/lib/utils';
import { clientsApi, type AssessmentForm, type ClientListItem, type StarterForm } from '@/modules/workspace/api/clients';
import { relativeTime } from '@/modules/workspace/clients/helpers';

export default function OwnerAssessments() {
  const workspace = readWorkspace();
  const qc = useQueryClient();
  const [sendForm, setSendForm] = useState<AssessmentForm | null>(null);
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [preview, setPreview] = useState<StarterForm | null>(null);

  const formsQ = useQuery({
    queryKey: ['assessment-forms'],
    queryFn: () => clientsApi.listAssessmentForms(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => clientsApi.deleteAssessmentForm(id),
    // Optimistic: the card disappears the instant you confirm removal.
    ...optimistic<AssessmentForm[], string>(
      qc,
      ['assessment-forms'],
      (old, id) => old.filter((f) => f.id !== id),
      { errorMessage: 'Could not remove the form.' },
    ),
    onSuccess: () => toast.success('Form removed'),
  });

  const publishMut = useMutation({
    mutationFn: (f: AssessmentForm) =>
      clientsApi.updateAssessmentForm(f.id, {
        name: f.name,
        description: f.description ?? undefined,
        questions: f.questions,
        status: 'published',
      }),
    // Optimistic: the status flips to Published immediately.
    ...optimistic<AssessmentForm[], AssessmentForm>(
      qc,
      ['assessment-forms'],
      (old, f) => old.map((x) => (x.id === f.id ? { ...x, status: 'published' } : x)),
      { errorMessage: 'Could not publish the form.' },
    ),
    onSuccess: () => toast.success('Form published'),
  });

  // Ready-made clinical forms. Installing copies one in as a DRAFT so the owner
  // reviews the wording before it can be sent — assigning refuses drafts.
  const startersQ = useQuery({
    queryKey: ['assessment-form-starters'],
    queryFn: () => clientsApi.listStarterForms(),
  });

  const installMut = useMutation({
    mutationFn: (key: string) => clientsApi.installStarterForm(key),
    onSuccess: (f) => {
      toast.success(`“${f.name}” added as a draft - review it, then publish.`);
      qc.invalidateQueries({ queryKey: ['assessment-forms'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not add the form.'),
  });

  const forms = formsQ.data ?? [];
  const starters = startersQ.data ?? [];

  // The workspace already has a template if a form matches its exact name or an
  // auto-suffixed copy ("… (2)"). Re-adding then needs a confirm, so a stray
  // click doesn't spawn a duplicate.
  const owns = (s: StarterForm) => forms.some((f) => f.name === s.name || f.name.startsWith(`${s.name} (`));
  const install = (s: StarterForm) => {
    if (owns(s) && !window.confirm(`You already have “${s.name}”. Add another copy as a new draft?`)) return;
    installMut.mutate(s.key);
  };
  const categories = CATEGORIES.filter((c) => starters.some((s) => metaOf(s.key).category === c));
  const shown = starters.filter((s) => category === 'all' || metaOf(s.key).category === category);

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      topbarContext="Assessments"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-7 md:px-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageHeader
            eyebrow="Clients · Assessments"
            title="Assessment forms"
            description="Build intake questionnaires once, send them to any client, and get a report from their answers."
          />
          <Link
            to="/assessments/new"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" /> New form
          </Link>
        </div>

        {/* Ready-made templates: add one as an editable draft, adjust, publish. */}
        <section className="mt-6 rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-extrabold">
                <Sparkles className="h-4 w-4 text-[hsl(var(--brand-blue))]" /> Ready-made templates
              </h2>
              <p className="mt-0.5 text-xs text-foreground/60">Written by nutritionists. Add one, adjust the questions, publish.</p>
            </div>
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {(['all', ...categories] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                      category === c ? 'bg-foreground text-background' : 'bg-foreground/[0.05] text-foreground/65 hover:bg-foreground/[0.08]',
                    )}
                  >
                    {c === 'all' ? 'All' : c}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {startersQ.isLoading && Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl bg-foreground/[0.04]" />
            ))}
            {shown.map((s) => (
              <TemplateCard
                key={s.key}
                starter={s}
                owned={owns(s)}
                busy={installMut.isPending && installMut.variables === s.key}
                disabled={installMut.isPending}
                onUse={() => install(s)}
                onPreview={() => setPreview(s)}
              />
            ))}
            <Link
              to="/assessments/new"
              className="grid min-h-[13rem] place-items-center rounded-2xl border-2 border-dashed border-foreground/10 p-4 text-center transition-colors hover:border-[hsl(var(--brand-blue)_/_0.4)] hover:bg-foreground/[0.02]"
            >
              <div>
                <Plus className="mx-auto h-6 w-6 text-foreground/40" />
                <div className="mt-2 text-sm font-bold">Blank form</div>
                <div className="text-xs text-foreground/50">Build your own</div>
              </div>
            </Link>
          </div>
        </section>

        {/* The practice's own forms */}
        <section className="mt-8">
          <h2 className="text-base font-extrabold">
            Your forms {forms.length > 0 && <span className="text-foreground/40">· {forms.length}</span>}
          </h2>
          {formsQ.isLoading ? (
            <div className="grid place-items-center py-12 text-foreground/50"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : forms.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-foreground/10 px-6 py-8 text-center text-sm text-foreground/55">
              No forms yet. Add a template above, or build a blank form.
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {forms.map((f) => {
                const draft = f.status === 'draft';
                const meta = metaForForm(f.name, starters);
                const count = f.questions.filter((q) => q.type !== 'section').length;
                return (
                  <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-foreground/[0.06] bg-card p-3.5 shadow-sm">
                    <TemplateIcon meta={meta} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/assessments/${f.id}/edit`} className="block truncate text-sm font-bold hover:underline">{f.name}</Link>
                      <div className="truncate text-xs text-foreground/50">
                        {count} question{count === 1 ? '' : 's'} · updated {relativeTime(f.updated_at).toLowerCase()}
                      </div>
                    </div>
                    <span className={cn(
                      'hidden flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex',
                      draft ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.15] dark:text-amber-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/[0.15] dark:text-emerald-200',
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', draft ? 'bg-amber-500' : 'bg-emerald-500')} />
                      {draft ? 'Draft' : 'Published'}
                    </span>
                    {draft ? (
                      <button
                        type="button"
                        onClick={() => publishMut.mutate(f)}
                        disabled={publishMut.isPending}
                        title="Publish so you can send it to clients"
                        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                      >
                        {publishMut.isPending && publishMut.variables?.id === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Publish
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSendForm(f)}
                        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-[hsl(var(--brand-blue)_/_0.12)] px-3.5 py-2 text-[13px] font-bold text-[hsl(var(--brand-blue))] transition-colors hover:bg-[hsl(var(--brand-blue)_/_0.2)]"
                      >
                        <Send className="h-3.5 w-3.5" /> Send
                      </button>
                    )}
                    <div className="flex flex-shrink-0 items-center">
                      <Link
                        to={`/assessments/${f.id}/edit`}
                        className="grid h-8 w-8 place-items-center rounded-xl text-foreground/40 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                        aria-label={`Edit ${f.name}`}
                        title="View / edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Remove “${f.name}”? Clients already assigned keep their copy.`)) deleteMut.mutate(f.id);
                        }}
                        disabled={deleteMut.isPending}
                        className="grid h-8 w-8 place-items-center rounded-xl text-foreground/40 transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-40"
                        aria-label={`Remove ${f.name}`}
                      >
                        {deleteMut.isPending && deleteMut.variables === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {sendForm && <SendFormDialog form={sendForm} onClose={() => setSendForm(null)} />}
      {preview && (
        <TemplatePreview
          starter={preview}
          owned={owns(preview)}
          busy={installMut.isPending}
          onUse={() => { install(preview); setPreview(null); }}
          onClose={() => setPreview(null)}
        />
      )}
    </OwnerLayout>
  );
}

/* ── templates ──────────────────────────────────────────────────────── */

type Category = 'Intake' | 'Diet tracking' | 'Follow-up' | 'Clinical';
const CATEGORIES: Category[] = ['Intake', 'Diet tracking', 'Follow-up', 'Clinical'];

interface TemplateMeta {
  icon: ComponentType<{ className?: string }>;
  /** Accent colour (hex), used at low opacity behind the icon. */
  color: string;
  category: Category;
  /** One line for the card; the full text is in the preview. */
  blurb: string;
  /** How long it takes the client. */
  time: string;
}

const META: Record<string, TemplateMeta> = {
  general_nutritional_assessment: { icon: Stethoscope, color: '#2f8f46', category: 'Intake', blurb: 'Full clinical intake: body, labs, history, diet, sleep and stress.', time: '~20 min' },
  quick_intake: { icon: Zap, color: '#0ea5e9', category: 'Intake', blurb: 'Just the essentials before the first consult.', time: '~3 min' },
  diet_recall_24h: { icon: Clock, color: '#f59e0b', category: 'Diet tracking', blurb: 'Everything eaten and drunk in the last 24 hours.', time: '~10 min' },
  food_diary_3day: { icon: NotebookPen, color: '#8b5cf6', category: 'Diet tracking', blurb: 'Two weekdays and a weekend day, filled in as they go.', time: 'over 3 days' },
  followup_review: { icon: RefreshCcw, color: '#14b8a6', category: 'Follow-up', blurb: 'A quick check-in before the next consultation.', time: '~2 min' },
  lab_results: { icon: FlaskConical, color: '#ef4444', category: 'Clinical', blurb: 'Blood report values, units and reference ranges.', time: '~6 min' },
  food_preferences: { icon: Salad, color: '#65a30d', category: 'Intake', blurb: 'What they can, can’t and would rather not eat.', time: '~6 min' },
};
const FALLBACK: TemplateMeta = { icon: ClipboardList, color: '#2f8f46', category: 'Intake', blurb: '', time: '' };

function metaOf(key: string): TemplateMeta {
  return META[key] ?? FALLBACK;
}

/** A form copied from a template wears that template's icon; others a heart or clipboard. */
function metaForForm(name: string, starters: StarterForm[]): TemplateMeta {
  const s = starters.find((x) => name === x.name || name.startsWith(`${x.name} (`));
  if (s) return metaOf(s.key);
  return /pcos|cycle|heart|cardio/i.test(name) ? { ...FALLBACK, icon: HeartPulse, color: '#ec4899' } : FALLBACK;
}

function TemplateIcon({ meta, size = 'md' }: { meta: TemplateMeta; size?: 'sm' | 'md' }) {
  const Icon = meta.icon;
  return (
    <span
      className={cn('grid flex-shrink-0 place-items-center', size === 'md' ? 'h-11 w-11 rounded-2xl' : 'h-10 w-10 rounded-xl')}
      style={{ background: `${meta.color}1f`, color: meta.color }}
    >
      <Icon className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'} />
    </span>
  );
}

function TemplateCard({ starter, owned, busy, disabled, onUse, onPreview }: {
  starter: StarterForm; owned: boolean; busy: boolean; disabled: boolean; onUse: () => void; onPreview: () => void;
}) {
  const meta = metaOf(starter.key);
  return (
    <div
      className="flex flex-col rounded-2xl border border-foreground/[0.07] p-4 transition-shadow hover:shadow-md"
      style={{ background: `linear-gradient(180deg, ${meta.color}12, transparent 60%)` }}
    >
      <div className="flex items-start justify-between gap-2">
        <TemplateIcon meta={meta} />
        {owned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700 dark:bg-emerald-500/[0.15] dark:text-emerald-200">
            <Check className="h-3 w-3" /> Added
          </span>
        )}
      </div>
      <div className="mt-3 text-sm font-extrabold leading-snug">{starter.name}</div>
      <div className="mt-1 line-clamp-2 text-xs leading-snug text-foreground/60">{meta.blurb || starter.description}</div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-foreground/45">
        <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" />{starter.fieldCount} questions</span>
        {meta.time && <span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" />{meta.time}</span>}
      </div>
      <div className="mt-auto flex gap-2 pt-4">
        <button
          type="button"
          onClick={onUse}
          disabled={disabled}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[12.5px] font-bold transition-colors disabled:opacity-50',
            owned
              ? 'bg-foreground/[0.06] text-foreground/60 hover:bg-foreground/[0.09]'
              : 'bg-[hsl(var(--brand-blue))] text-white hover:brightness-110',
          )}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {owned ? 'Add again' : 'Use template'}
        </button>
        <button
          type="button"
          onClick={onPreview}
          className="inline-flex items-center gap-1 rounded-xl border border-foreground/10 px-3 text-[12.5px] font-semibold text-foreground/75 hover:bg-foreground/[0.04]"
        >
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
      </div>
    </div>
  );
}

/** Every question in a template, grouped by section, before adding it. */
function TemplatePreview({ starter, owned, busy, onUse, onClose }: {
  starter: StarterForm; owned: boolean; busy: boolean; onUse: () => void; onClose: () => void;
}) {
  const meta = metaOf(starter.key);
  let n = 0;
  return (
    <Sheet onClose={onClose} ariaLabel={`${starter.name} preview`} className="sm:max-w-xl">
      <div className="flex items-start gap-3 border-b border-foreground/[0.06] px-5 py-4">
        <TemplateIcon meta={meta} />
        <div className="min-w-0 flex-1">
          <div className="text-base font-extrabold leading-tight">{starter.name}</div>
          <div className="mt-0.5 text-xs text-foreground/55">
            {starter.fieldCount} questions{meta.time ? ` · ${meta.time}` : ''}{meta.category ? ` · ${meta.category}` : ''}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-foreground/60 hover:bg-foreground/[0.06]">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="text-[13px] leading-relaxed text-foreground/70">{starter.description}</p>
        <ol className="mt-4 space-y-1.5">
          {(starter.questions ?? []).map((q, i) => q.type === 'section' ? (
            <li key={i} className="pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--brand-blue))]">{q.question}</li>
          ) : (
            <li key={i} className="flex items-start gap-3 rounded-xl bg-foreground/[0.03] px-3 py-2">
              <span className="w-5 flex-shrink-0 pt-px text-[11px] font-bold text-foreground/40">{++n}</span>
              <span className="flex-1 text-[13px] leading-snug">{q.question}</span>
              <span className="flex-shrink-0 rounded-full border border-foreground/10 px-2 py-0.5 text-[10.5px] font-semibold text-foreground/55">{TYPE_LABEL[q.type] ?? q.type}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.06] px-5 py-3">
        <span className="text-xs text-foreground/50">Added as a draft you can edit before sending.</span>
        <button
          type="button"
          onClick={onUse}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[hsl(var(--brand-blue))] px-4 py-2 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {owned ? 'Add another copy' : 'Use template'}
        </button>
      </div>
    </Sheet>
  );
}

const TYPE_LABEL: Record<string, string> = {
  text: 'text', number: 'number', choice: 'choice', multi: 'multi-choice', yesno: 'yes/no', scale: 'scale', table: 'table',
};

/**
 * Client picker — send (assign) a saved form to one or many clients at once.
 * Each selected client gets their own copy via POST …/assessments { templateId }.
 */
function SendFormDialog({ form, onClose }: { form: AssessmentForm; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const clientsQ = useQuery({
    queryKey: ['clients', 'for-assessment-send'],
    queryFn: () => clientsApi.list({ limit: 200 }),
  });

  const clients: ClientListItem[] = clientsQ.data?.items ?? [];
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter(
      (c) => (c.name ?? '').toLowerCase().includes(term) || (c.email ?? '').toLowerCase().includes(term),
    );
  }, [clients, q]);

  const allShownSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) filtered.forEach((c) => next.delete(c.id));
      else filtered.forEach((c) => next.add(c.id));
      return next;
    });
  }

  const sendMut = useMutation({
    mutationFn: async () => {
      const ids = [...selected];
      const results = await Promise.allSettled(ids.map((id) => clientsApi.assignAssessmentForm(id, form.id)));
      const sent = results.filter((r) => r.status === 'fulfilled').length;
      return { sent, failed: ids.length - sent };
    },
    onSuccess: ({ sent, failed }) => {
      if (sent) toast.success(`“${form.name}” sent to ${sent} client${sent === 1 ? '' : 's'}.`);
      if (failed) toast.error(`${failed} client${failed === 1 ? '' : 's'} could not be sent - they may already have this form.`);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not send the form.'),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-foreground/[0.08] bg-popover shadow-2xl"
        style={{ maxHeight: '86vh' }}
      >
        <header className="border-b border-foreground/[0.06] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-teal-100 text-teal-700 dark:bg-teal-500/[0.15] dark:text-teal-200">
              <Send className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Send form</div>
              <div className="truncate text-base font-extrabold tracking-tight">{form.name}</div>
            </div>
            <button type="button" onClick={onClose} className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]" aria-label="Close">✕</button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search clients by name or email"
              className="w-full rounded-2xl border border-foreground/10 bg-foreground/[0.03] py-2.5 pl-9 pr-3 text-sm focus:border-teal-400/60 focus:outline-none"
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {clientsQ.isLoading ? (
            <div className="grid place-items-center py-12 text-foreground/50"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="grid place-items-center gap-2 py-12 text-center text-foreground/50">
              <Users className="h-5 w-5" />
              <span className="text-sm">{clients.length === 0 ? 'No clients yet.' : 'No clients match your search.'}</span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleAllShown}
                className="mb-1 w-full px-3 py-1.5 text-left text-[11px] font-medium text-teal-600 hover:underline dark:text-teal-300"
              >
                {allShownSelected ? 'Clear selection' : `Select all ${filtered.length}`}
              </button>
              {filtered.map((c) => {
                const on = selected.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]"
                  >
                    <span className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-md border transition-colors ${on ? 'border-transparent bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white' : 'border-foreground/25'}`}>
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-xs font-semibold text-foreground/70">
                      {(c.name ?? c.email ?? '?').slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{c.name || c.email || 'Client'}</span>
                      {c.name && c.email && <span className="block truncate text-xs text-foreground/50">{c.email}</span>}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-foreground/[0.06] px-5 py-3">
          <span className="text-xs text-foreground/55">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => sendMut.mutate()}
            disabled={selected.size === 0 || sendMut.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100"
          >
            {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send{selected.size ? ` to ${selected.size}` : ''}
          </button>
        </footer>
      </div>
    </div>
  );
}

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName, initials };
}
