import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Phone, Mail, MessageCircle, Activity, ClipboardList,
  CalendarDays, Camera, Ruler, Loader2, Target, Flame,
  ClipboardCheck, Brain, Moon, Plus, X, CheckCircle2,
  StickyNote, FolderOpen, Upload, Download, Trash2, Pencil, FileText,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { clientsApi, clientSlug, clientIdFragment, type ClientListItem, type AssessmentCard } from '@/modules/workspace/api/clients';
import { useOwnerIdentity } from '@/hooks/useOwnerIdentity';
import { useScope } from '@/hooks/useScope';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'meals' | 'measurements' | 'assessments' | 'files' | 'notes' | 'messages';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview',     label: 'Overview',     icon: Activity },
  { id: 'meals',        label: 'Meals',        icon: ClipboardList },
  { id: 'measurements', label: 'Measurements', icon: Ruler },
  { id: 'assessments',  label: 'Assessments',  icon: ClipboardCheck },
  { id: 'files',        label: 'Files',        icon: FolderOpen },
  { id: 'notes',        label: 'Notes',        icon: StickyNote },
  { id: 'messages',     label: 'Messages',     icon: MessageCircle },
];

export default function OwnerClientDetail() {
  const { id = '', tab: tabParam } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const { ownerName, initials: ownerInitials } = useOwnerIdentity();
  const { practiceName } = useWorkspaceBrand();
  const initialTab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'overview';
  const [tab, setTab] = useState<Tab>(initialTab);

  // No single-client endpoint — resolve from the workspace roster. Accept either
  // a raw UUID (legacy links) or a human-readable slug; both key off the id.
  const listQ = useQuery({ queryKey: ['clients', 'all'], queryFn: () => clientsApi.list({ limit: 200 }) });
  const frag = clientIdFragment(id);
  const client = listQ.data?.items.find((c) => c.id === id || c.id.slice(0, 8).toLowerCase() === frag);

  // Canonical, pretty URL for this client (name + short id).
  const slug = client ? clientSlug(client.display_name || client.name || client.email, client.id) : id;

  // Keep the URL in sync with the active tab: /clients/<slug> for Overview,
  // /clients/<slug>/<tab> otherwise — clean, shareable, no query string.
  const selectTab = (t: Tab) => {
    setTab(t);
    navigate(t === 'overview' ? `/clients/${slug}` : `/clients/${slug}/${t}`, { replace: true });
  };

  // Normalise a raw-UUID or stale slug in the address bar to the canonical slug.
  useEffect(() => {
    if (client && id !== slug) {
      navigate(tab === 'overview' ? `/clients/${slug}` : `/clients/${slug}/${tab}`, { replace: true });
    }
  }, [client, id, slug, tab, navigate]);

  const layoutProps = { practiceName, ownerName, initials: ownerInitials, trialDaysLeft: null as number | null };

  if (listQ.isLoading) {
    return (
      <OwnerLayout {...layoutProps}>
        <div className="py-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-foreground/40" /></div>
      </OwnerLayout>
    );
  }

  if (!client) {
    return (
      <OwnerLayout {...layoutProps}>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">Client not found</h1>
          <p className="mt-2 text-sm text-foreground/75 dark:text-foreground/55">That client doesn't exist or was removed.</p>
          <Link to="/clients" className="mt-4 inline-flex items-center gap-2 rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04]">
            <ChevronLeft className="h-4 w-4" /> Back to clients
          </Link>
        </div>
      </OwnerLayout>
    );
  }

  const name = client.display_name || client.name || client.email;

  return (
    <OwnerLayout {...layoutProps} topbarContext={name}>
      <div className="mx-auto w-full max-w-5xl px-6 py-6 md:py-8">
        <motion.div variants={stagger(0.06, 0.04)} initial="initial" animate="animate" className="space-y-6">
          <motion.div variants={fadeUp}>
            <Link to="/clients" className="inline-flex items-center gap-1 text-xs text-foreground/75 dark:text-foreground/55 hover:text-foreground">
              <ChevronLeft className="h-3.5 w-3.5" /> Clients
            </Link>
          </motion.div>

          {/* Header */}
          <motion.div variants={fadeUp}>
            <Glass className="p-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-base font-medium">
                      {client.avatar_url ? (
                        <img src={client.avatar_url} alt={name} className="h-full w-full object-cover" />
                      ) : (
                        initialsOf(name)
                      )}
                    </div>
                    {presenceOf(client.last_active_at).online && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-surface-1 bg-emerald-500" title="Active now" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
                      {client.status && <StatusChip status={client.status} />}
                      <PresenceBadge lastActiveAt={client.last_active_at} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-foreground/75 dark:text-foreground/55">
                      <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                        <Mail className="h-3.5 w-3.5" /> {client.email}
                      </a>
                      {client.phone && (
                        <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                          <Phone className="h-3.5 w-3.5" /> {client.phone}
                        </a>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Joined {new Date(client.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ActionPill icon={Activity} label="Wellness" primary onClick={() => navigate(`/clients/${client.id}/wellness`)} />
                  <ActionPill icon={MessageCircle} label="Message" onClick={() => navigate('/messaging')} />
                </div>
              </div>

              {/* Quick facts */}
              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-foreground/[0.06] pt-5 sm:grid-cols-4">
                <Fact label="Program" value={client.program_type || 'Not assigned'} />
                <Fact label="Target" value={client.target_kcal ? `${client.target_kcal} kcal` : '—'} />
                <Fact label="Last weight" value={client.last_weight ? `${client.last_weight} kg` : '—'} />
                <Fact label="Last active" value={presenceOf(client.last_active_at).text} />
              </div>

              <CoachAssignment client={client} />
            </Glass>
          </motion.div>

          {/* Tabs */}
          <motion.div variants={fadeUp}>
            <div className="flex gap-1 overflow-x-auto rounded-full bg-foreground/[0.03] p-1">
              {TABS.map((t) => {
                const active = t.id === tab;
                const Icon = t.icon;
                return (
                  <button key={t.id} type="button" onClick={() => selectTab(t.id)}
                    className={cn('relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                      active ? 'text-foreground' : 'text-foreground/75 dark:text-foreground/55 hover:text-foreground/85')}>
                    {active && (
                      <motion.span layoutId="client-tab" className="absolute inset-0 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.35)] to-[hsl(var(--brand-magenta)_/_0.25)]"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                    )}
                    <span className="relative inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{t.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Tab content */}
          <motion.div variants={fadeUp}>
            {tab === 'overview' && <OverviewTab clientId={client.id} />}
            {tab === 'meals' && <MealsTab clientId={client.id} />}
            {tab === 'measurements' && <MeasurementsTab clientId={client.id} />}
            {tab === 'assessments' && <AssessmentsTab clientId={client.id} clientName={name} />}
            {tab === 'files' && <FilesTab clientId={client.id} clientName={name} />}
            {tab === 'notes' && <NotesTab clientId={client.id} />}
            {tab === 'messages' && <MessagesTab clientId={client.id} />}
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

// ─── Overview: nutrition trend + latest habits ───────────────────────────

function OverviewTab({ clientId }: { clientId: string }) {
  const trendsQ = useQuery({ queryKey: ['client', clientId, 'trends'], queryFn: () => clientsApi.clientWorkspaceNutritionTrends(clientId, 14) });
  const habitsQ = useQuery({ queryKey: ['client', clientId, 'habits'], queryFn: () => clientsApi.clientWorkspaceHabits(clientId, 7) });

  const trends = trendsQ.data ?? [];
  const avgKcal = trends.length ? Math.round(trends.reduce((s, t) => s + t.total_kcal, 0) / trends.length) : 0;
  const avgProtein = trends.length ? Math.round(trends.reduce((s, t) => s + t.total_protein_g, 0) / trends.length) : 0;
  const totalMeals = trends.reduce((s, t) => s + t.meals_count, 0);
  const latestHabit = (habitsQ.data ?? [])[0];

  if (trendsQ.isLoading || habitsQ.isLoading) return <CardSpinner />;

  return (
    <div className="space-y-4">
      <ProfileCard clientId={clientId} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Glass className="p-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Nutrition · last 14 days</div>
        {trends.length === 0 ? (
          <Empty text="No meals logged yet" />
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat icon={Flame} value={String(avgKcal)} label="avg kcal/day" />
            <Stat icon={Target} value={`${avgProtein}g`} label="avg protein" />
            <Stat icon={ClipboardList} value={String(totalMeals)} label="meals logged" />
          </div>
        )}
      </Glass>

      <Glass className="p-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Latest day · habits</div>
        {!latestHabit ? (
          <Empty text="No habit data yet" />
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat value={`${(latestHabit.water_ml / 1000).toFixed(1)}L`} label="water" />
            <Stat value={latestHabit.sleep_hours != null ? `${latestHabit.sleep_hours}h` : '—'} label="sleep" />
            <Stat value={`${latestHabit.exercise_minutes}m`} label="exercise" />
          </div>
        )}
      </Glass>
      </div>
    </div>
  );
}

// ─── Profile & health (mirrors what the client edits in their Settings) ────

function ProfileCard({ clientId }: { clientId: string }) {
  const q = useQuery({ queryKey: ['client', clientId, 'profile'], queryFn: () => clientsApi.clientWorkspaceProfile(clientId) });
  const p = q.data;

  if (q.isLoading) {
    return (
      <Glass className="p-5">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
          <ClipboardCheck className="h-3.5 w-3.5" /> Profile &amp; health
        </div>
        <div className="mt-4"><CardSpinner /></div>
      </Glass>
    );
  }
  if (!p) return null;

  const fmt = (v: unknown) => {
    const s = v == null ? '' : String(v).trim();
    return s === '' ? '—' : s;
  };
  const cap = (v: string | null) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : '—');

  return (
    <Glass className="p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
          <ClipboardCheck className="h-3.5 w-3.5" /> Profile &amp; health
        </div>
        {p.updated_at && (
          <span className="text-[10px] text-foreground/45">Updated {relativeTime(p.updated_at)}</span>
        )}
      </div>

      {/* Quick demographics */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Age" value={fmt(p.age)} />
        <Field label="Gender" value={cap(p.gender)} />
        <Field label="Height" value={p.height_cm ? `${p.height_cm} cm` : '—'} />
        <Field label="Primary goal" value={fmt(p.goals)} />
        <Field label="Activity level" value={cap(p.activity_level)} />
      </div>

      {/* Free-text health profile */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <LongField label="Allergies" value={fmt(p.allergies)} accent="text-rose-500" />
        <LongField label="Medical conditions" value={fmt(p.medical_conditions)} />
        <LongField label="Food preferences" value={fmt(p.food_preferences)} accent="text-emerald-500" />
      </div>
    </Glass>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-foreground/[0.03] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium" title={value}>{value}</div>
    </div>
  );
}

function LongField({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-3">
      <div className={cn('text-[10px] uppercase tracking-[0.14em] text-foreground/45', accent)}>{label}</div>
      <div className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/85">{value}</div>
    </div>
  );
}

// ─── Meals ───────────────────────────────────────────────────────────────

function MealsTab({ clientId }: { clientId: string }) {
  const q = useQuery({ queryKey: ['client', clientId, 'meals'], queryFn: () => clientsApi.clientWorkspaceMeals(clientId, 30) });
  if (q.isLoading) return <CardSpinner />;
  const meals = q.data ?? [];
  return (
    <Glass className="overflow-hidden">
      <div className="border-b border-foreground/[0.06] px-5 py-4 text-sm font-medium">Recent meals · last 30 days</div>
      {meals.length === 0 ? (
        <Empty text="No meals logged yet" pad />
      ) : (
        <ul className="divide-y divide-foreground/[0.04]">
          {meals.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{m.meal_name || m.detected_name || 'Meal'}</div>
                <div className="text-[11px] capitalize text-foreground/55">{m.meal_type}{m.logged_at ? ` · ${relativeTime(m.logged_at)}` : ''}</div>
              </div>
              {m.kcal != null && <div className="text-sm font-semibold tabular-nums">{Math.round(m.kcal)}<span className="ml-0.5 text-[10px] font-normal text-foreground/55">kcal</span></div>}
            </li>
          ))}
        </ul>
      )}
    </Glass>
  );
}

// ─── Measurements ────────────────────────────────────────────────────────

function MeasurementsTab({ clientId }: { clientId: string }) {
  const q = useQuery({ queryKey: ['client', clientId, 'measurements'], queryFn: () => clientsApi.clientWorkspaceMeasurements(clientId) });
  if (q.isLoading) return <CardSpinner />;
  const rows = q.data ?? [];
  return (
    <Glass className="overflow-hidden">
      <div className="border-b border-foreground/[0.06] px-5 py-4 text-sm font-medium">Body measurements (inches)</div>
      {rows.length === 0 ? (
        <Empty text="No measurements recorded yet" pad />
      ) : (
        <ul className="divide-y divide-foreground/[0.04]">
          {rows.map((r) => (
            <li key={r.id} className="px-5 py-3">
              <div className="text-[11px] text-foreground/55">{new Date(r.recorded_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {r.chest_inches != null && <span>Chest {r.chest_inches}</span>}
                {r.waist_inches != null && <span>Waist {r.waist_inches}</span>}
                {r.hip_inches != null && <span>Hip {r.hip_inches}</span>}
                {r.arm_inches != null && <span>Arm {r.arm_inches}</span>}
                {r.thigh_inches != null && <span>Thigh {r.thigh_inches}</span>}
              </div>
              {r.notes && <div className="mt-1 text-[11px] text-foreground/55">{r.notes}</div>}
            </li>
          ))}
        </ul>
      )}
    </Glass>
  );
}

// ─── Notes (private, nutritionist-only) ──────────────────────────────────

function NotesTab({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const q = useQuery({ queryKey: ['client', clientId, 'notes'], queryFn: () => clientsApi.clientNotes(clientId) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['client', clientId, 'notes'] });

  const addMut = useMutation({
    mutationFn: (content: string) => clientsApi.addClientNote(clientId, content),
    onSuccess: () => { setDraft(''); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not save note.'),
  });
  const editMut = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => clientsApi.updateClientNote(clientId, id, content),
    onSuccess: () => { setEditingId(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not update note.'),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => clientsApi.deleteClientNote(clientId, id),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message ?? 'Could not delete note.'),
  });

  const notes = q.data ?? [];

  return (
    <div className="space-y-4">
      <Glass className="p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <StickyNote className="h-4 w-4 text-amber-600 dark:text-amber-300" /> Private notes
        </div>
        <p className="mt-1 text-xs text-foreground/55">Only your team can see these — never shown to the client.</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Add a note about this client…"
          className="mt-3 w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/40 focus:border-violet-400/50 focus:outline-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={addMut.isPending || !draft.trim()}
            onClick={() => addMut.mutate(draft)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add note
          </button>
        </div>
      </Glass>

      <Glass className="overflow-hidden">
        <div className="border-b border-foreground/[0.06] px-5 py-4 text-sm font-medium">Notes</div>
        {q.isLoading ? (
          <CardSpinner />
        ) : notes.length === 0 ? (
          <Empty text="No notes yet" pad />
        ) : (
          <ul className="divide-y divide-foreground/[0.04]">
            {notes.map((n) => (
              <li key={n.id} className="px-5 py-3">
                {editingId === n.id ? (
                  <div>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm focus:border-violet-400/50 focus:outline-none"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-full border border-foreground/12 px-3 py-1 text-xs text-foreground/70 hover:bg-foreground/[0.05]">Cancel</button>
                      <button
                        type="button"
                        disabled={editMut.isPending || !editText.trim()}
                        onClick={() => editMut.mutate({ id: n.id, content: editText })}
                        className="rounded-full bg-foreground/[0.06] px-3 py-1 text-xs font-medium hover:bg-foreground/[0.1] disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="group flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{n.content}</p>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
                        {relativeTime(n.updated_at)}{n.updated_at !== n.created_at ? ' · edited' : ''}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button type="button" onClick={() => { setEditingId(n.id); setEditText(n.content); }} className="grid h-7 w-7 place-items-center rounded-lg text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" disabled={delMut.isPending} onClick={() => delMut.mutate(n.id)} className="grid h-7 w-7 place-items-center rounded-lg text-foreground/50 hover:bg-rose-500/10 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Glass>
    </div>
  );
}

// ─── Files (client uploads + nutritionist shares) ────────────────────────

function FilesTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const q = useQuery({ queryKey: ['client', clientId, 'files'], queryFn: () => clientsApi.clientWorkspaceFiles(clientId) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['client', clientId, 'files'] });

  const delMut = useMutation({
    mutationFn: (id: string) => clientsApi.deleteClientFile(clientId, id),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message ?? 'Could not delete file.'),
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast.error('File too large — keep it under 25 MB.'); return; }
    setUploading(true);
    try {
      const ticket = await clientsApi.clientFileUploadTicket(clientId, f.name);
      const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await clientsApi.shareClientFile(clientId, { storage_key: ticket.storageKey, file_name: f.name, file_type: f.type || undefined, file_size: f.size });
      toast.success('File shared with client');
      invalidate();
    } catch (err) {
      toast.error((err as Error).message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const files = q.data ?? [];

  return (
    <div className="space-y-4">
      <Glass className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <FolderOpen className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-300" /> Files
            </div>
            <p className="mt-1 text-xs text-foreground/55">
              Reports {clientName.split(' ')[0] || 'the client'} uploaded, and files you've shared with them.
            </p>
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Share a file
          </button>
        </div>
      </Glass>

      <Glass className="overflow-hidden">
        <div className="border-b border-foreground/[0.06] px-5 py-4 text-sm font-medium">All files</div>
        {q.isLoading ? (
          <CardSpinner />
        ) : files.length === 0 ? (
          <Empty text="No files yet" pad />
        ) : (
          <ul className="divide-y divide-foreground/[0.04]">
            {files.map((f) => (
              <OwnerFileRow
                key={f.id}
                clientId={clientId}
                file={f}
                deleting={delMut.isPending}
                onDelete={() => delMut.mutate(f.id)}
              />
            ))}
          </ul>
        )}
      </Glass>
    </div>
  );
}

function OwnerFileRow({
  clientId, file, onDelete, deleting,
}: {
  clientId: string;
  file: import('@/modules/workspace/api/clients').FileItem;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const fromClient = file.uploaded_by === 'client';

  async function open() {
    setBusy(true);
    try {
      const res = await clientsApi.signClientFile(clientId, file.id);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error((e as Error).message ?? 'Could not open file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-foreground/[0.04] text-foreground/60">
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{file.file_name}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-foreground/55">
          <span>{new Date(file.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {file.file_size ? <><span className="text-foreground/30">•</span><span>{formatBytes(file.file_size)}</span></> : null}
        </div>
      </div>
      <span className={cn(
        'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]',
        fromClient ? 'bg-blue-500/15 text-blue-700 dark:text-blue-200' : 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200',
      )}>
        {fromClient ? 'From client' : 'Shared'}
      </span>
      <button type="button" onClick={open} disabled={busy} className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50" title="Download">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
      <button type="button" onClick={onDelete} disabled={deleting} className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-foreground/60 hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50" title="Delete">
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// ─── Assessments (assign + review) ───────────────────────────────────────

const ASSESS_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  health_assessment: { label: 'Health assessment', icon: ClipboardList, tone: 'text-blue-600 dark:text-blue-300' },
  stress_card:       { label: 'Stress check-in',   icon: Brain,         tone: 'text-rose-600 dark:text-rose-300' },
  sleep_card:        { label: 'Sleep diary',       icon: Moon,          tone: 'text-violet-600 dark:text-violet-300' },
  custom_form:       { label: 'Custom form',        icon: ClipboardList, tone: 'text-teal-600 dark:text-teal-300' },
};

const ASSIGNABLE: { type: 'health' | 'stress' | 'sleep'; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'health', label: 'Health', icon: ClipboardList },
  { type: 'stress', label: 'Stress', icon: Brain },
  { type: 'sleep',  label: 'Sleep',  icon: Moon },
];

function AssessmentsTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<AssessmentCard | null>(null);

  const q = useQuery({
    queryKey: ['client', clientId, 'assessments'],
    queryFn: () => clientsApi.clientAssessments(clientId),
  });
  const formsQ = useQuery({
    queryKey: ['assessment-forms'],
    queryFn: () => clientsApi.listAssessmentForms(),
  });

  const assignMut = useMutation({
    mutationFn: (type: 'health' | 'stress' | 'sleep') => clientsApi.assignAssessment(clientId, type),
    onSuccess: () => {
      toast.success('Assessment sent to client');
      qc.invalidateQueries({ queryKey: ['client', clientId, 'assessments'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not send assessment.'),
  });
  const assignFormMut = useMutation({
    mutationFn: (templateId: string) => clientsApi.assignAssessmentForm(clientId, templateId),
    onSuccess: () => {
      toast.success('Form sent to client');
      qc.invalidateQueries({ queryKey: ['client', clientId, 'assessments'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not send form.'),
  });

  const cards = q.data ?? [];

  return (
    <div className="space-y-4">
      {/* Assign */}
      <Glass className="p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Plus className="h-4 w-4 text-violet-600 dark:text-violet-300" /> Assign an assessment
        </div>
        <p className="mt-1 text-xs text-foreground/55">Send {clientName.split(' ')[0] || 'the client'} a questionnaire to fill in from their portal.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ASSIGNABLE.map((a) => (
            <button
              key={a.type}
              type="button"
              disabled={assignMut.isPending}
              onClick={() => assignMut.mutate(a.type)}
              className="group flex items-center gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-3 text-left transition-all hover:-translate-y-px hover:bg-foreground/[0.05] disabled:opacity-50"
            >
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-violet-700 dark:text-violet-300">
                <a.icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium">{a.label}</span>
              {assignMut.isPending && assignMut.variables === a.type && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />}
            </button>
          ))}
        </div>

        {/* Custom forms — workspace-authored, reusable */}
        <div className="mt-5 flex items-center justify-between">
          <div className="text-xs font-medium text-foreground/70">Your custom forms</div>
          <Link to="/assessments" className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1 text-xs font-medium hover:bg-foreground/[0.05]">
            <Plus className="h-3 w-3" /> Build &amp; manage
          </Link>
        </div>
        {(formsQ.data ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-foreground/45">
            No forms yet — <Link to="/assessments" className="text-violet-600 hover:underline dark:text-violet-300">build one in Assessments</Link> to reuse across clients.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(formsQ.data ?? []).map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={assignFormMut.isPending}
                onClick={() => assignFormMut.mutate(f.id)}
                className="flex items-center gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2 text-left transition-all hover:bg-foreground/[0.05] disabled:opacity-50"
              >
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-300">
                  <ClipboardList className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{f.name}</span>
                  <span className="block text-[11px] text-foreground/45">{f.questions.length} question{f.questions.length === 1 ? '' : 's'}</span>
                </span>
                {assignFormMut.isPending && assignFormMut.variables === f.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </button>
            ))}
          </div>
        )}
      </Glass>

      {/* Assigned list */}
      <Glass className="overflow-hidden">
        <div className="border-b border-foreground/[0.06] px-5 py-4 text-sm font-medium">Assigned assessments</div>
        {q.isLoading ? (
          <CardSpinner />
        ) : cards.length === 0 ? (
          <Empty text="No assessments assigned yet" pad />
        ) : (
          <ul className="divide-y divide-foreground/[0.04]">
            {cards.map((c) => {
              const meta = ASSESS_META[c.card_type] ?? ASSESS_META.health_assessment;
              const Icon = meta.icon;
              const when = (c.sent_at ?? c.created_at)
                ? new Date(c.sent_at ?? c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                : '';
              const isReviewed = !!(c.generated_content as { review?: { reviewed_at?: string } })?.review?.reviewed_at;
              return (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn('grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-foreground/[0.04]', meta.tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{meta.label}</div>
                    <div className="text-[11px] text-foreground/55">Sent {when}</div>
                  </div>
                  {isReviewed ? (
                    <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-teal-700 dark:text-teal-200">Reviewed</span>
                  ) : c.has_responses ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-200">Completed</span>
                  ) : (
                    <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">Awaiting</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewing(c)}
                    className="rounded-full border border-foreground/12 px-3 py-1 text-xs text-foreground/80 hover:bg-foreground/[0.05]"
                  >
                    {isReviewed ? 'View' : c.has_responses ? 'Review' : 'View'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Glass>

      {viewing && <AssessmentResponsesDialog clientId={clientId} card={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

interface AQuestion { id: string; question: string; type: string }

function AssessmentResponsesDialog({ clientId, card, onClose }: { clientId: string; card: AssessmentCard; onClose: () => void }) {
  const qc = useQueryClient();
  const c = (card.generated_content ?? {}) as Record<string, unknown>;
  const title = (c.title as string) ?? 'Assessment';
  const rawQs = Array.isArray(c.questions) ? (c.questions as Record<string, unknown>[]) : [];
  const questions: AQuestion[] = rawQs.flatMap((o, i) => {
    const qt = (o.question ?? o.label) as string | undefined;
    if (!qt) return [];
    return [{ id: (o.id ?? `q${i}`) as string, question: qt, type: (o.type as string) ?? 'text' }];
  });
  const responses = (c.client_responses ?? {}) as Record<string, unknown>;
  const report = (c.report ?? null) as { score?: number | null; band?: string | null } | null;
  const hasScore = card.has_responses && report != null && report.score != null;

  const existingReview = (c.review ?? null) as { note?: string | null; reviewed_at?: string } | null;
  // Track the saved review locally so the dialog stays open and reflects the
  // latest state after each save/update (instead of closing).
  const [savedReview, setSavedReview] = useState(existingReview);
  const [note, setNote] = useState(existingReview?.note ?? '');

  const reviewMut = useMutation({
    mutationFn: () => clientsApi.reviewAssessment(clientId, card.id, note.trim() || undefined),
    onSuccess: (updated) => {
      const rev = (updated?.generated_content as { review?: { note?: string | null; reviewed_at?: string } })?.review ?? null;
      const wasReviewed = !!savedReview?.reviewed_at;
      setSavedReview(rev);
      if (rev?.note) setNote(rev.note);
      toast.success(wasReviewed ? 'Review updated — your client will see the change.' : 'Marked as reviewed — your client will see this.');
      qc.invalidateQueries({ queryKey: ['client', clientId, 'assessments'] });
      qc.invalidateQueries({ queryKey: ['assessments', 'recent'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not save your review.'),
  });

  const fmt = (v: unknown): string => {
    if (v == null || v === '') return '—';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
        style={{ maxHeight: '85vh' }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-foreground/[0.06] px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{title}</div>
            <div className="text-[11px] text-foreground/55">
              {card.has_responses ? 'Client responses' : 'Not answered yet'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasScore && (
              <span className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                <span className="text-sm">{report!.score}</span>
                <span className="opacity-70">/ 100{report!.band ? ` · ${report!.band}` : ''}</span>
              </span>
            )}
            <button type="button" onClick={onClose} aria-label="Close"
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {questions.length === 0 ? (
            <div className="text-sm text-foreground/55">No questions found on this card.</div>
          ) : (
            questions.map((qq) => (
              qq.type === 'section' ? (
                <div key={qq.id} className="flex items-center gap-3 pt-2 first:pt-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">{qq.question}</div>
                  <div className="h-px flex-1 bg-foreground/[0.10]" />
                </div>
              ) : (
                <div key={qq.id} className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-3">
                  <div className="text-xs font-medium text-foreground/70">{qq.question}</div>
                  <div className={cn('mt-1 text-sm', card.has_responses ? 'text-foreground' : 'text-foreground/40')}>
                    {fmt(responses[qq.id])}
                  </div>
                </div>
              )
            ))
          )}
        </div>

        {/* Review — feedback the client will see */}
        <div className="border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-4">
          {savedReview?.reviewed_at && (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              Reviewed {new Date(savedReview.reviewed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          )}
          <label className="mb-1.5 block text-xs font-medium text-foreground/70">
            Review note <span className="font-normal text-foreground/45">— your client will see this</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Feedback for your client — what looks good, what to focus on next…"
            className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm outline-none focus:border-violet-400/60"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            {savedReview?.reviewed_at && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-foreground/12 px-4 py-2 text-sm text-foreground/80 hover:bg-foreground/[0.05]"
              >
                Done
              </button>
            )}
            <button
              type="button"
              onClick={() => reviewMut.mutate()}
              disabled={reviewMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {reviewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {savedReview?.reviewed_at ? 'Update review' : 'Mark as reviewed'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Messages (read-only thread) ─────────────────────────────────────────

function MessagesTab({ clientId }: { clientId: string }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['client', clientId, 'thread'], queryFn: () => clientsApi.clientThread(clientId, 100) });
  if (q.isLoading) return <CardSpinner />;
  const msgs = q.data ?? [];
  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <span className="text-sm font-medium">Conversation</span>
        <button type="button" onClick={() => navigate('/messaging')} className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-300">Open in Messaging →</button>
      </div>
      {msgs.length === 0 ? (
        <Empty text="No messages yet" pad />
      ) : (
        <ul className="space-y-2 p-4">
          {msgs.map((m) => {
            const fromClient = m.sender_type === 'client';
            return (
              <li key={m.id} className={cn('flex', fromClient ? 'justify-start' : 'justify-end')}>
                <div className={cn('max-w-[75%] rounded-2xl px-3.5 py-2 text-sm', fromClient ? 'bg-foreground/[0.05]' : 'bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)]')}>
                  {m.content}
                  <div className="mt-0.5 text-[10px] text-foreground/45">{relativeTime(m.created_at)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Glass>
  );
}

// ─── Small building blocks ───────────────────────────────────────────────

function ActionPill({ icon: Icon, label, onClick, primary }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors',
        primary ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white hover:scale-[1.02]' : 'border border-foreground/10 text-foreground/80 hover:bg-foreground/[0.04]')}>
      <Icon className="h-3.5 w-3.5" />{label && label}
    </button>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">{label}</div>
      <div className="mt-1 truncate text-sm font-medium capitalize">{value}</div>
    </div>
  );
}

/**
 * Assigned-coach selector. Owners/nutritionists pick which coach owns this
 * client's caseload; coaches only see clients assigned to them. Hidden for
 * non-managerial roles.
 */
function CoachAssignment({ client }: { client: ClientListItem }) {
  const qc = useQueryClient();
  const { data: scope } = useScope();
  const canAssign =
    scope?.workspaceRole === 'owner' ||
    scope?.workspaceRole === 'nutritionist' ||
    !!scope?.isSuperAdmin;

  const coachesQ = useQuery({
    queryKey: ['workspace', 'coaches'],
    queryFn: clientsApi.listCoaches,
    enabled: canAssign,
  });

  const assign = useMutation({
    mutationFn: (coachUserId: string | null) => clientsApi.assignCoach(client.id, coachUserId),
    onSuccess: () => {
      toast.success('Coach updated.');
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not update the coach.'),
  });

  if (!canAssign) return null;

  return (
    <div className="mt-5 flex flex-col gap-2 border-t border-foreground/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">Assigned coach</div>
        <div className="mt-0.5 text-xs text-foreground/60">Coaches only see the clients assigned to them.</div>
      </div>
      <select
        value={client.assigned_coach_user_id ?? ''}
        disabled={assign.isPending || coachesQ.isLoading}
        onChange={(e) => assign.mutate(e.target.value || null)}
        className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/40 disabled:opacity-50"
      >
        <option value="">Unassigned (whole team)</option>
        {(coachesQ.data ?? []).map((c) => (
          <option key={c.user_id} value={c.user_id}>
            {c.name}{c.role === 'coach' ? '' : ` (${c.role})`}
          </option>
        ))}
      </select>
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon?: React.ComponentType<{ className?: string }>; value: string; label: string }) {
  return (
    <div className="rounded-xl bg-foreground/[0.03] p-3 text-center">
      {Icon && <Icon className="mx-auto mb-1 h-4 w-4 text-foreground/45" />}
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-foreground/55">{label}</div>
    </div>
  );
}

function CardSpinner() {
  return <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>;
}

function Empty({ text, pad }: { text: string; pad?: boolean }) {
  return (
    <div className={cn('text-center text-sm text-foreground/50', pad ? 'px-5 py-10' : 'py-6')}>
      <Camera className="mx-auto mb-2 h-7 w-7 text-foreground/20" />
      {text}
    </div>
  );
}

/** Instagram-style presence from last_active_at: online if seen in the last 2 min. */
function presenceOf(lastActiveAt: string | null): { online: boolean; text: string } {
  if (!lastActiveAt) return { online: false, text: 'Never active' };
  const ts = new Date(lastActiveAt).getTime();
  if (Number.isNaN(ts)) return { online: false, text: 'Never active' };
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 2) return { online: true, text: 'Active now' };
  if (mins < 60) return { online: false, text: `Active ${mins}m ago` };
  const hr = Math.floor(mins / 60);
  if (hr < 24) return { online: false, text: `Active ${hr}h ago` };
  const day = Math.floor(hr / 24);
  return { online: false, text: `Active ${day}d ago` };
}

function PresenceBadge({ lastActiveAt }: { lastActiveAt: string | null }) {
  const p = presenceOf(lastActiveAt);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px]',
      p.online ? 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300' : 'text-foreground/55')}>
      {p.online && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      )}
      {p.text}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:    'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
    completed: 'border-blue-400/40 bg-blue-400/10 text-blue-700 dark:text-blue-200',
    paused:    'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
    pending:   'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
    archived:  'border-foreground/15 bg-foreground/[0.04] text-foreground/50',
  };
  return (
    <span className={cn('rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] capitalize',
      styles[status] ?? 'border-foreground/10 bg-foreground/[0.04] text-foreground/50')}>
      {status}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '–';
}

function relativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
