import { useMemo, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Check, ClipboardList, FileEdit, Layers, Loader2, Pencil, Plus, Search, Send, Sparkles, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { optimistic } from '@/lib/optimistic';
import { cn } from '@/lib/utils';
import { clientsApi, type AssessmentForm, type ClientListItem } from '@/modules/workspace/api/clients';

export default function OwnerAssessments() {
  const workspace = readWorkspace();
  const qc = useQueryClient();
  const [sendForm, setSendForm] = useState<AssessmentForm | null>(null);

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

  // Honest counts derived from the already-fetched forms — no extra fetch.
  const publishedCount = forms.filter((f) => f.status !== 'draft').length;
  const draftCount = forms.length - publishedCount;

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      topbarContext="Assessments"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-7 md:px-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageHeader
            eyebrow="Clients · Assessments"
            title="Assessment forms"
            description="Build your intake questionnaires once - then assign them to any client. One form, reusable across your whole practice."
          />
          <div className="flex flex-wrap items-center gap-2">
            {starters.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => installMut.mutate(s.key)}
                disabled={installMut.isPending}
                title={`${s.description} - ${s.fieldCount} questions. Added as an editable draft.`}
                className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-100 px-4 py-2 text-sm font-bold text-teal-700 transition-colors hover:bg-teal-200/70 disabled:opacity-50 dark:border-teal-500/20 dark:bg-teal-500/[0.12] dark:text-teal-200 dark:hover:bg-teal-500/[0.2]"
              >
                {installMut.isPending && installMut.variables === s.key
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Sparkles className="h-4 w-4" />}
                Add {s.name}
              </button>
            ))}
            <Link
              to="/assessments/new"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" /> New form
            </Link>
          </div>
        </div>

        {forms.length > 0 && (
          <div className="mt-6 grid grid-cols-3 gap-3">
            <StatCard tint="teal" icon={Layers} label="Total forms" value={forms.length} />
            <StatCard tint="emerald" icon={CheckCircle2} label="Published" value={publishedCount} />
            <StatCard tint="amber" icon={FileEdit} label="Drafts" value={draftCount} />
          </div>
        )}

        <div className="mt-7">
          {formsQ.isLoading ? (
            <div className="grid place-items-center py-16 text-foreground/50">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : forms.length === 0 ? (
            <div className="grid place-items-center gap-3 rounded-3xl border border-foreground/[0.06] bg-card px-6 py-16 text-center shadow-sm">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300">
                <ClipboardList className="h-6 w-6" />
              </span>
              <div className="text-base font-extrabold text-foreground">No assessment forms yet</div>
              <p className="max-w-sm text-xs text-foreground/60">
                Build a form once - questions you choose (scale, yes/no, number, text, choices) - and reuse it for every client. Their answers auto-generate a report.
              </p>
              <Link
                to="/assessments/new"
                className="mt-1 inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.02] px-4 py-2 text-sm font-bold transition-colors hover:bg-foreground/[0.05]"
              >
                <Plus className="h-4 w-4" /> Build your first form
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {forms.map((f) => {
                const draft = f.status === 'draft';
                return (
                <div key={f.id} className="flex flex-col rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <span className={cn('grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl', draft ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.15] dark:text-amber-200' : 'bg-teal-100 text-teal-700 dark:bg-teal-500/[0.15] dark:text-teal-200')}>
                      <ClipboardList className="h-5 w-5" />
                    </span>
                    <div className="flex items-center gap-0.5">
                      <Link
                        to={`/assessments/${f.id}/edit`}
                        className="grid h-8 w-8 place-items-center rounded-xl text-foreground/35 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                        aria-label="View or edit form"
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
                        className="grid h-8 w-8 place-items-center rounded-xl text-foreground/35 transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-40"
                        aria-label="Remove form"
                      >
                        {deleteMut.isPending && deleteMut.variables === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', draft ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.15] dark:text-amber-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/[0.15] dark:text-emerald-200')}>
                      {draft ? 'Draft' : 'Published'}
                    </span>
                  </div>
                  <Link to={`/assessments/${f.id}/edit`} className="mt-2 block text-[15px] font-extrabold tracking-tight text-foreground hover:underline">{f.name}</Link>
                  {f.description && <div className="mt-1 line-clamp-2 text-xs text-foreground/60">{f.description}</div>}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {[...new Set(f.questions.map((q) => q.type))].map((t) => (
                      <span key={t} className="rounded-full bg-foreground/[0.05] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/60">{t}</span>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] font-medium text-foreground/45">
                    {f.questions.length} question{f.questions.length === 1 ? '' : 's'}
                  </div>
                  {draft ? (
                    <div className="mt-auto flex flex-col gap-2 pt-4">
                      <button
                        type="button"
                        onClick={() => publishMut.mutate(f)}
                        disabled={publishMut.isPending}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-400 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.97] disabled:opacity-50"
                      >
                        {publishMut.isPending && publishMut.variables?.id === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Publish
                      </button>
                      <span className="text-center text-[11px] text-foreground/45">Draft - publish to send to clients</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSendForm(f)}
                      className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
                    >
                      <Send className="h-3.5 w-3.5" /> Send to clients
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {sendForm && <SendFormDialog form={sendForm} onClose={() => setSendForm(null)} />}
    </OwnerLayout>
  );
}

/* ── page-own stat card — matches KPICard's tinted wellness look ─────────── */
const STAT_TINT: Record<string, string> = {
  teal: 'bg-teal-100 text-teal-950 border-teal-200/60 dark:bg-teal-500/[0.12] dark:text-teal-50 dark:border-teal-500/20',
  emerald: 'bg-emerald-100 text-emerald-950 border-emerald-200/60 dark:bg-emerald-500/[0.12] dark:text-emerald-50 dark:border-emerald-500/20',
  amber: 'bg-amber-100 text-amber-950 border-amber-200/60 dark:bg-amber-500/[0.12] dark:text-amber-50 dark:border-amber-500/20',
};

function StatCard({ tint, icon: Icon, label, value }: { tint: string; icon: ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl border p-4 shadow-sm', STAT_TINT[tint])}>
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-bold opacity-85">{label}</span>
        <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-white/50 dark:bg-black/20">
          <Icon className="h-4 w-4 opacity-85" />
        </span>
      </div>
      <div className="mt-2 text-[28px] font-extrabold leading-none tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

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
