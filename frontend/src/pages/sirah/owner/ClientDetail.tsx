import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Phone, Mail, MessageCircle, Activity, ClipboardList,
  CalendarDays, CalendarRange, Camera, Ruler, Loader2, Target, Flame,
  ClipboardCheck, Brain, Moon, Plus, X, CheckCircle2,
  StickyNote, FolderOpen, Upload, Download, Trash2, Pencil, FileText,
  ArrowDown, ArrowUp,
  Cake, UserRound, Droplets, Dumbbell, HeartPulse, Salad, ShieldAlert, Utensils, Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { clientsApi, clientSlug, clientIdFragment, type ClientListItem, type AssessmentCard, type ClientNote, type FileItem, type ListClientsResult } from '@/modules/workspace/api/clients';
import { programEngineApi } from '@/modules/workspace/api/programEngine';
import { MealPlanTab } from '@/modules/workspace/mealPlans/MealPlanTab';
import { useOwnerIdentity } from '@/hooks/useOwnerIdentity';
import { useScope } from '@/hooks/useScope';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { optimistic } from '@/lib/optimistic';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'plan' | 'meals' | 'measurements' | 'assessments' | 'files' | 'notes';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview',     label: 'Overview',     icon: Activity },
  // "Plan" is what the nutritionist prescribes; "Meals" is what the client
  // actually logged. Adjacent on purpose — the whole job is comparing them.
  { id: 'plan',         label: 'Meal plan',    icon: CalendarRange },
  { id: 'meals',        label: 'Meals',        icon: ClipboardList },
  { id: 'measurements', label: 'Measurements', icon: Ruler },
  { id: 'assessments',  label: 'Assessments',  icon: ClipboardCheck },
  { id: 'files',        label: 'Files',        icon: FolderOpen },
  { id: 'notes',        label: 'Notes',        icon: StickyNote },
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

  // The header "Program" reflects the Program Engine assignment (program_assignments),
  // not the legacy clients.program_type — so a program assigned via /programs shows here.
  const assignmentsQ = useQuery({ queryKey: ['programs', 'assignments'], queryFn: () => programEngineApi.listAssignments() });
  const activeProgramName = (() => {
    if (!client) return null;
    const mine = (assignmentsQ.data ?? []).filter((a) => a.client_id === client.id);
    if (!mine.length) return null;
    return (mine.find((a) => a.status === 'active') ?? mine[0]).name;
  })();

  // Canonical, pretty URL for this client (name + short id).
  const slug = client ? clientSlug(client.display_name || client.name || client.email, client.id) : id;

  // Per-client "last viewed" timestamp per tab (localStorage) so new-activity
  // badges clear when the nutritionist opens a tab. Per-browser; no DB migration.
  const seenKey = client ? `sirah:tabseen:${client.id}` : '';
  const [seen, setSeen] = useState<Record<string, number>>({});
  const markSeen = (t: Tab) => {
    if (!seenKey) return;
    setSeen((prev) => {
      const next = { ...prev, [t]: Date.now() };
      try { localStorage.setItem(seenKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  // On load, hydrate seen-times and mark the tab we land on as viewed.
  useEffect(() => {
    if (!seenKey) return;
    let stored: Record<string, number> = {};
    try { stored = JSON.parse(localStorage.getItem(seenKey) || '{}'); } catch { /* ignore */ }
    const next = { ...stored, [tab]: Date.now() };
    try { localStorage.setItem(seenKey, JSON.stringify(next)); } catch { /* ignore */ }
    setSeen(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seenKey]);

  // Keep the URL in sync with the active tab: /clients/<slug> for Overview,
  // /clients/<slug>/<tab> otherwise — clean, shareable, no query string.
  const selectTab = (t: Tab) => {
    setTab(t);
    markSeen(t);
    navigate(t === 'overview' ? `/clients/${slug}` : `/clients/${slug}/${t}`, { replace: true });
  };

  // Normalise a raw-UUID or stale slug in the address bar to the canonical slug.
  useEffect(() => {
    if (client && id !== slug) {
      navigate(tab === 'overview' ? `/clients/${slug}` : `/clients/${slug}/${tab}`, { replace: true });
    }
  }, [client, id, slug, tab, navigate]);

  const layoutProps = { practiceName, ownerName, initials: ownerInitials, trialDaysLeft: null as number | null };

  // Count recent client uploads so the Files tab can show a badge even from
  // other tabs. Same query key as FilesTab → fetched once, shared cache.
  const filesQ = useQuery({
    queryKey: ['client', client?.id ?? '', 'files'],
    queryFn: () => clientsApi.clientWorkspaceFiles(client!.id),
    enabled: !!client?.id,
  });
  const mealsQ = useQuery({
    queryKey: ['client', client?.id ?? '', 'meals'],
    queryFn: () => clientsApi.clientWorkspaceMeals(client!.id, 30),
    enabled: !!client?.id,
  });
  const measurementsQ = useQuery({
    queryKey: ['client', client?.id ?? '', 'measurements'],
    queryFn: () => clientsApi.clientWorkspaceMeasurements(client!.id),
    enabled: !!client?.id,
  });
  const assessBadgeQ = useQuery({
    queryKey: ['client', client?.id ?? '', 'assessments'],
    queryFn: () => clientsApi.clientAssessments(client!.id),
    enabled: !!client?.id,
  });
  // A tab's badge counts items newer than when it was last opened (or 3 days ago
  // if never opened), so opening the tab clears the count. Assessments is a
  // to-do count (awaiting review) — it clears only when actually reviewed.
  const RECENT_MS = 3 * 86_400_000;
  const newerThan = (iso: string, t: Tab) => new Date(iso).getTime() > (seen[t] ?? Date.now() - RECENT_MS);
  const tabBadges: Partial<Record<Tab, number>> = {
    files: (filesQ.data ?? []).filter((f) => f.uploaded_by === 'client' && newerThan(f.created_at, 'files')).length,
    meals: (mealsQ.data ?? []).filter((m) => newerThan(m.logged_at, 'meals')).length,
    measurements: (measurementsQ.data ?? []).filter((m) => newerThan(m.recorded_at, 'measurements')).length,
    assessments: (assessBadgeQ.data ?? []).filter((a) => a.reviewed_at == null).length,
  };

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
          <Link to="/clients" className="mt-4 inline-flex items-center gap-2 rounded-full border border-foreground/[0.06] bg-card px-4 py-2 text-sm font-medium text-foreground/70 shadow-sm transition-colors hover:bg-foreground/[0.04]">
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
            <Glass className="rounded-3xl border-foreground/[0.06] p-6 shadow-sm">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.16)] text-lg font-extrabold text-[hsl(var(--brand-blue))]">
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
                      <h1 className="text-2xl font-extrabold tracking-tight">{name}</h1>
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
                <Fact label="Program" value={activeProgramName || client.program_type || 'Not assigned'} />
                <Fact label="Target" value={client.target_kcal ? `${client.target_kcal} kcal` : '-'} />
                <Fact label="Last weight" value={client.last_weight ? `${client.last_weight} kg` : '-'} />
                <Fact label="Last active" value={presenceOf(client.last_active_at).text} />
              </div>

              <CoachAssignment client={client} />
            </Glass>
          </motion.div>

          {/* Tabs */}
          <motion.div variants={fadeUp}>
            <div className="flex gap-1 overflow-x-auto rounded-full border border-foreground/[0.06] bg-card p-1.5 shadow-sm">
              {TABS.map((t) => {
                const active = t.id === tab;
                const Icon = t.icon;
                return (
                  <button key={t.id} type="button" onClick={() => selectTab(t.id)}
                    className={cn('relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors',
                      active ? 'text-white' : 'text-foreground/75 dark:text-foreground/55 hover:text-foreground/85')}>
                    {active && (
                      <motion.span layoutId="client-tab" className="absolute inset-0 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] shadow-[0_8px_20px_-8px_rgba(14,154,168,0.6)]"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                    )}
                    <span className="relative inline-flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />{t.label}
                      {(tabBadges[t.id] ?? 0) > 0 && (
                        <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold leading-none text-white">
                          {(tabBadges[t.id] ?? 0) > 9 ? '9+' : tabBadges[t.id]}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Tab content */}
          <motion.div variants={fadeUp}>
            {tab === 'overview' && <OverviewTab clientId={client.id} />}
            {tab === 'plan' && (
              <MealPlanTab
                clientId={client.id}
                clientName={client.name}
                clientProfile={[
                  { label: 'Name', value: client.display_name || client.name },
                  client.email ? { label: 'Email', value: client.email } : null,
                  client.phone ? { label: 'Phone', value: client.phone } : null,
                  client.program_type ? { label: 'Program', value: client.program_type } : null,
                  client.target_kcal ? { label: 'Daily calorie target', value: `${client.target_kcal.toLocaleString('en-IN')} kcal` } : null,
                  client.last_weight ? { label: 'Latest weight', value: `${client.last_weight} kg` } : null,
                  { label: 'Client since', value: new Date(client.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
                ].filter((r): r is { label: string; value: string } => r !== null)}
              />
            )}
            {tab === 'meals' && <MealsTab clientId={client.id} />}
            {tab === 'measurements' && <MeasurementsTab clientId={client.id} />}
            {tab === 'assessments' && <AssessmentsTab clientId={client.id} clientName={name} />}
            {tab === 'files' && <FilesTab clientId={client.id} clientName={name} />}
            {tab === 'notes' && <NotesTab clientId={client.id} />}
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
      <Glass className="rounded-3xl border-foreground/[0.06] p-5 shadow-sm">
        <CardHead icon={Flame} title="Nutrition" color="orange"
          right={<span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Last 14 days</span>} />
        {trends.length === 0 ? (
          <Empty text="No meals logged yet" />
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <MetricStat icon={Flame} value={String(avgKcal)} label="avg kcal/day" color="orange" />
            <MetricStat icon={Zap} value={`${avgProtein}g`} label="avg protein" color="violet" />
            <MetricStat icon={Utensils} value={String(totalMeals)} label="meals logged" color="teal" />
          </div>
        )}
      </Glass>

      <Glass className="rounded-3xl border-foreground/[0.06] p-5 shadow-sm">
        <CardHead icon={HeartPulse} title="Daily habits" color="sky"
          right={<span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Latest day</span>} />
        {!latestHabit ? (
          <Empty text="No habit data yet" />
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <MetricStat icon={Droplets} value={`${(latestHabit.water_ml / 1000).toFixed(1)}L`} label="water" color="sky" />
            <MetricStat icon={Moon} value={latestHabit.sleep_hours != null ? `${latestHabit.sleep_hours}h` : '-'} label="sleep" color="indigo" />
            <MetricStat icon={Dumbbell} value={`${latestHabit.exercise_minutes}m`} label="exercise" color="emerald" />
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
      <Glass className="rounded-3xl border-foreground/[0.06] p-5 shadow-sm">
        <CardHead icon={ClipboardCheck} title="Profile & health" color="teal" />
        <div className="mt-4"><CardSpinner /></div>
      </Glass>
    );
  }
  if (!p) return null;

  const fmt = (v: unknown) => {
    const s = v == null ? '' : String(v).trim();
    return s === '' ? '-' : s;
  };
  const cap = (v: string | null) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : '-');

  return (
    <Glass className="rounded-3xl border-foreground/[0.06] p-5 shadow-sm">
      <CardHead
        icon={ClipboardCheck}
        title="Profile & health"
        color="teal"
        right={p.updated_at ? (
          <span className="rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[10px] text-foreground/50">
            Updated {relativeTime(p.updated_at)}
          </span>
        ) : null}
      />

      {/* Quick demographics */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <InfoTile icon={Cake}      label="Age"           value={fmt(p.age)} color="slate" />
        <InfoTile icon={UserRound} label="Gender"        value={cap(p.gender)} color="indigo" />
        <InfoTile icon={Ruler}     label="Height"        value={p.height_cm ? `${p.height_cm} cm` : '-'} color="sky" />
        <InfoTile icon={Target}    label="Primary goal"  value={fmt(p.goals)} color="violet" />
        <InfoTile icon={Activity}  label="Activity"      value={cap(p.activity_level)} color="amber" />
      </div>

      {/* Free-text health profile */}
      <div className="mt-2.5 grid grid-cols-1 gap-2.5 md:grid-cols-3">
        <HealthField icon={ShieldAlert} label="Allergies"          value={fmt(p.allergies)} color="rose" />
        <HealthField icon={HeartPulse}  label="Medical conditions" value={fmt(p.medical_conditions)} color="amber" />
        <HealthField icon={Salad}       label="Food preferences"   value={fmt(p.food_preferences)} color="emerald" />
      </div>
    </Glass>
  );
}

/** Shared metric palette — tinted icon chip + accent, works in light & dark. */
const METRIC_COLORS: Record<string, { tint: string; fg: string; barL: string }> = {
  slate:   { tint: 'bg-slate-100 dark:bg-slate-500/[0.14]',     fg: 'text-slate-600 dark:text-slate-300',     barL: 'border-l-slate-400/50' },
  sky:     { tint: 'bg-sky-100 dark:bg-sky-500/[0.14]',         fg: 'text-sky-600 dark:text-sky-400',         barL: 'border-l-sky-400/60' },
  indigo:  { tint: 'bg-indigo-100 dark:bg-indigo-500/[0.14]',   fg: 'text-indigo-600 dark:text-indigo-400',   barL: 'border-l-indigo-400/60' },
  violet:  { tint: 'bg-violet-100 dark:bg-violet-500/[0.14]',   fg: 'text-violet-600 dark:text-violet-400',   barL: 'border-l-violet-400/60' },
  teal:    { tint: 'bg-teal-100 dark:bg-teal-500/[0.14]',       fg: 'text-teal-600 dark:text-teal-400',       barL: 'border-l-teal-400/60' },
  emerald: { tint: 'bg-emerald-100 dark:bg-emerald-500/[0.14]', fg: 'text-emerald-600 dark:text-emerald-400', barL: 'border-l-emerald-400/60' },
  amber:   { tint: 'bg-amber-100 dark:bg-amber-500/[0.14]',     fg: 'text-amber-600 dark:text-amber-400',     barL: 'border-l-amber-400/60' },
  orange:  { tint: 'bg-orange-100 dark:bg-orange-500/[0.14]',   fg: 'text-orange-600 dark:text-orange-400',   barL: 'border-l-orange-400/60' },
  rose:    { tint: 'bg-rose-100 dark:bg-rose-500/[0.14]',       fg: 'text-rose-600 dark:text-rose-400',       barL: 'border-l-rose-400/60' },
};

/** Card section header: tinted icon chip + title, with optional right-aligned meta. */
function CardHead({ icon: Icon, title, color, right }: {
  icon: React.ComponentType<{ className?: string }>; title: string; color: string; right?: React.ReactNode;
}) {
  const c = METRIC_COLORS[color] ?? METRIC_COLORS.slate;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <div className={cn('grid h-9 w-9 place-items-center rounded-xl', c.tint, c.fg)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm font-extrabold tracking-tight text-foreground">{title}</div>
      </div>
      {right}
    </div>
  );
}

/** Compact demographic tile: icon chip + label/value. */
function InfoTile({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; color: string;
}) {
  const c = METRIC_COLORS[color] ?? METRIC_COLORS.slate;
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-foreground/[0.06] bg-card px-3 py-2.5 shadow-sm">
      <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', c.tint, c.fg)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/45">{label}</div>
        <div className="truncate text-sm font-bold text-foreground" title={value}>{value}</div>
      </div>
    </div>
  );
}

/** Free-text health card: colored left accent + icon, muted empty state. */
function HealthField({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; color: string;
}) {
  const c = METRIC_COLORS[color] ?? METRIC_COLORS.slate;
  const empty = value === '-';
  return (
    <div className={cn(
      'rounded-2xl border border-l-[3px] bg-card p-3.5 shadow-sm',
      empty ? 'border-foreground/[0.06] border-l-foreground/10' : cn('border-foreground/[0.06]', c.barL),
    )}>
      <div className="flex items-center gap-2">
        <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-xl',
          empty ? 'bg-foreground/[0.05] text-foreground/40' : cn(c.tint, c.fg))}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className={cn('text-[10px] font-bold uppercase tracking-[0.14em]', empty ? 'text-foreground/40' : c.fg)}>
          {label}
        </div>
      </div>
      <div className={cn('mt-2 whitespace-pre-wrap break-words text-sm',
        empty ? 'italic text-foreground/40' : 'font-medium text-foreground/90')}>
        {empty ? 'None recorded' : value}
      </div>
    </div>
  );
}

// ─── Meals ───────────────────────────────────────────────────────────────

function MealsTab({ clientId }: { clientId: string }) {
  const q = useQuery({ queryKey: ['client', clientId, 'meals'], queryFn: () => clientsApi.clientWorkspaceMeals(clientId, 30) });
  if (q.isLoading) return <CardSpinner />;
  const meals = q.data ?? [];
  return (
    <Glass className="overflow-hidden rounded-3xl border-foreground/[0.06] shadow-sm">
      <div className="border-b border-foreground/[0.06] px-5 py-4 text-sm font-bold">Recent meals · last 30 days</div>
      {meals.length === 0 ? (
        <Empty text="No meals logged yet" pad />
      ) : (
        <ul className="divide-y divide-foreground/[0.04]">
          {meals.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3">
              <div className="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-xl border border-foreground/[0.06] bg-foreground/[0.03]">
                {m.photo_url
                  ? <img src={m.photo_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  : <Utensils className="h-4 w-4 text-foreground/35" />}
              </div>
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

const MEASUREMENT_METRICS = [
  { key: 'chest_inches', label: 'Chest' },
  { key: 'waist_inches', label: 'Waist' },
  { key: 'hip_inches', label: 'Hip' },
  { key: 'arm_inches', label: 'Arm' },
  { key: 'thigh_inches', label: 'Thigh' },
] as const;

function MeasurementsTab({ clientId }: { clientId: string }) {
  const q = useQuery({ queryKey: ['client', clientId, 'measurements'], queryFn: () => clientsApi.clientWorkspaceMeasurements(clientId) });
  if (q.isLoading) return <CardSpinner />;
  const rows = q.data ?? []; // newest first

  return (
    <Glass className="overflow-hidden rounded-3xl border-foreground/[0.06] shadow-sm">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <span className="text-sm font-bold">Body measurements</span>
        <span className="text-[11px] text-foreground/45">
          inches{rows.length > 0 ? ` · ${rows.length} record${rows.length === 1 ? '' : 's'}` : ''}
        </span>
      </div>
      {rows.length === 0 ? (
        <Empty text="No measurements recorded yet" pad />
      ) : (
        <div className="divide-y divide-foreground/[0.05]">
          {rows.map((r, i) => {
            const prev = rows[i + 1]; // the older record, for change vs previous
            return (
              <div key={r.id} className="px-5 py-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="text-sm font-medium">
                    {new Date(r.recorded_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  {i === 0 && (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700 dark:bg-teal-500/[0.18] dark:text-teal-200">Latest</span>
                  )}
                  {prev && (
                    <span className="text-[11px] text-foreground/40">
                      vs {new Date(prev.recorded_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                  {MEASUREMENT_METRICS.map((m) => {
                    const val = r[m.key];
                    const prevVal = prev?.[m.key] ?? null;
                    const delta = val != null && prevVal != null ? Math.round((val - prevVal) * 10) / 10 : null;
                    return (
                      <div key={m.key} className="rounded-2xl border border-foreground/[0.06] bg-card p-3 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/50">{m.label}</div>
                        <div className="mt-1 text-lg font-extrabold tabular-nums">
                          {val != null ? <>{val}<span className="ml-0.5 text-[10px] font-normal text-foreground/45">in</span></> : <span className="text-foreground/30">-</span>}
                        </div>
                        {delta != null && delta !== 0 ? (
                          <div className={cn(
                            'mt-0.5 inline-flex items-center gap-0.5 text-[11px] tabular-nums',
                            delta < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                          )}>
                            {delta < 0 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                            {Math.abs(delta)} in
                          </div>
                        ) : delta === 0 ? (
                          <div className="mt-0.5 text-[11px] text-foreground/35">no change</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {r.notes && <div className="mt-2 rounded-lg bg-foreground/[0.03] px-3 py-2 text-[11px] text-foreground/65">{r.notes}</div>}
              </div>
            );
          })}
        </div>
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
  const notesKey = ['client', clientId, 'notes'];

  const addMut = useMutation({
    mutationFn: (content: string) => clientsApi.addClientNote(clientId, content),
    ...optimistic<ClientNote[], string>(
      qc,
      notesKey,
      (old, content) => [
        ...old,
        { id: `temp-${Date.now()}`, content, admin_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ],
      { errorMessage: 'Could not save note.' },
    ),
    onSuccess: () => setDraft(''),
  });
  const editMut = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => clientsApi.updateClientNote(clientId, id, content),
    ...optimistic<ClientNote[], { id: string; content: string }>(
      qc,
      notesKey,
      (old, v) => old.map((n) => (n.id === v.id ? { ...n, content: v.content, updated_at: new Date().toISOString() } : n)),
      { errorMessage: 'Could not update note.' },
    ),
    onSuccess: () => setEditingId(null),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => clientsApi.deleteClientNote(clientId, id),
    ...optimistic<ClientNote[], string>(
      qc,
      notesKey,
      (old, id) => old.filter((n) => n.id !== id),
      { errorMessage: 'Could not delete note.' },
    ),
  });

  const notes = q.data ?? [];

  return (
    <div className="space-y-4">
      <Glass className="rounded-3xl border-foreground/[0.06] p-5 shadow-sm">
        <div className="flex items-center gap-2.5 text-sm font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/[0.14] dark:text-amber-300">
            <StickyNote className="h-4 w-4" />
          </span>
          Private notes
        </div>
        <p className="mt-1 text-xs text-foreground/55">Only your team can see these - never shown to the client.</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Add a note about this client…"
          className="mt-3 w-full rounded-2xl border border-foreground/10 bg-card px-3.5 py-2.5 text-sm placeholder:text-foreground/40 focus:border-teal-400/50 focus:outline-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={addMut.isPending || !draft.trim()}
            onClick={() => addMut.mutate(draft)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-bold text-white shadow-[0_10px_30px_-10px_rgba(14,154,168,0.55)] transition-transform hover:scale-[1.03] cta-glow active:scale-[0.97] disabled:opacity-50"
          >
            {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add note
          </button>
        </div>
      </Glass>

      <Glass className="overflow-hidden rounded-3xl border-foreground/[0.06] shadow-sm">
        <div className="border-b border-foreground/[0.06] px-5 py-4 text-sm font-bold">Notes</div>
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
                      className="w-full rounded-2xl border border-foreground/10 bg-card px-3.5 py-2.5 text-sm focus:border-teal-400/50 focus:outline-none"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-full border border-foreground/[0.08] px-3.5 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/[0.05]">Cancel</button>
                      <button
                        type="button"
                        disabled={editMut.isPending || !editText.trim()}
                        onClick={() => editMut.mutate({ id: n.id, content: editText })}
                        className="rounded-full bg-foreground/[0.06] px-3.5 py-1.5 text-xs font-bold hover:bg-foreground/[0.1] disabled:opacity-50"
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
                      <button type="button" onClick={() => { setEditingId(n.id); setEditText(n.content); }} className="grid h-8 w-8 place-items-center rounded-xl text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" disabled={delMut.isPending} onClick={() => delMut.mutate(n.id)} className="grid h-8 w-8 place-items-center rounded-xl text-foreground/50 hover:bg-rose-500/10 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
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
    ...optimistic<FileItem[], string>(
      qc,
      ['client', clientId, 'files'],
      (old, id) => old.filter((f) => f.id !== id),
      { errorMessage: 'Could not delete file.' },
    ),
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast.error('File too large - keep it under 25 MB.'); return; }
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
      <Glass className="rounded-3xl border-foreground/[0.06] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 text-sm font-bold">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-500/[0.14] dark:text-sky-300">
                <FolderOpen className="h-4 w-4" />
              </span>
              Files
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
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-bold text-white shadow-[0_10px_30px_-10px_rgba(14,154,168,0.55)] transition-transform hover:scale-[1.03] cta-glow active:scale-[0.97] disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Share a file
          </button>
        </div>
      </Glass>

      <Glass className="overflow-hidden rounded-3xl border-foreground/[0.06] shadow-sm">
        <div className="border-b border-foreground/[0.06] px-5 py-4 text-sm font-bold">All files</div>
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
  // Flag recent client uploads so the nutritionist notices new documents.
  const isNew = fromClient && Date.now() - new Date(file.created_at).getTime() < 3 * 86_400_000;

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
    <li className={cn('flex items-center gap-3 px-5 py-3 transition-colors', isNew && 'bg-emerald-500/[0.05]')}>
      <span className={cn(
        'grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl',
        isNew ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/[0.16] dark:text-emerald-300' : 'bg-sky-100 text-sky-600 dark:bg-sky-500/[0.14] dark:text-sky-300',
      )}>
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{file.file_name}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-foreground/55">
          <span>{new Date(file.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {file.file_size ? <><span className="text-foreground/30">•</span><span>{formatBytes(file.file_size)}</span></> : null}
        </div>
      </div>
      {isNew && (
        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:bg-emerald-500/[0.18] dark:text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> New
        </span>
      )}
      <span className={cn(
        'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]',
        fromClient ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/[0.18] dark:text-sky-200' : 'bg-teal-100 text-teal-700 dark:bg-teal-500/[0.18] dark:text-teal-200',
      )}>
        {fromClient ? 'From client' : 'Shared'}
      </span>
      <button type="button" onClick={open} disabled={busy} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50" title="Download">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
      <button type="button" onClick={onDelete} disabled={deleting} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl text-foreground/60 hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50" title="Delete">
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
  sleep_card:        { label: 'Sleep diary',       icon: Moon,          tone: 'text-teal-600 dark:text-teal-300' },
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

  const assessKey = ['client', clientId, 'assessments'];
  const tempCard = (card_type: AssessmentCard['card_type']): AssessmentCard => ({
    id: `temp-${Date.now()}`,
    card_type,
    generated_content: {},
    status: 'sent',
    workflow_stage: '',
    sent_at: new Date().toISOString(),
    reviewed_at: null,
    notes: null,
    created_at: new Date().toISOString(),
    has_responses: false,
  });
  const assignMut = useMutation({
    mutationFn: (type: 'health' | 'stress' | 'sleep') => clientsApi.assignAssessment(clientId, type),
    ...optimistic<AssessmentCard[], 'health' | 'stress' | 'sleep'>(
      qc,
      assessKey,
      (old, type) => [...old, tempCard(type === 'stress' ? 'stress_card' : type === 'sleep' ? 'sleep_card' : 'health_assessment')],
      { errorMessage: 'Could not send assessment.' },
    ),
    onSuccess: () => toast.success('Assessment sent to client'),
  });
  const assignFormMut = useMutation({
    mutationFn: (templateId: string) => clientsApi.assignAssessmentForm(clientId, templateId),
    ...optimistic<AssessmentCard[], string>(
      qc,
      assessKey,
      (old) => [...old, tempCard('custom_form')],
      { errorMessage: 'Could not send form.' },
    ),
    onSuccess: () => toast.success('Form sent to client'),
  });

  const cards = q.data ?? [];

  return (
    <div className="space-y-4">
      {/* Assign */}
      <Glass className="rounded-3xl border-foreground/[0.06] p-5 shadow-sm">
        <div className="flex items-center gap-2.5 text-sm font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-100 text-teal-600 dark:bg-teal-500/[0.14] dark:text-teal-300">
            <Plus className="h-4 w-4" />
          </span>
          Assign an assessment
        </div>
        <p className="mt-1 text-xs text-foreground/55">Send {clientName.split(' ')[0] || 'the client'} a questionnaire to fill in from their portal.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ASSIGNABLE.map((a) => (
            <button
              key={a.type}
              type="button"
              disabled={assignMut.isPending}
              onClick={() => assignMut.mutate(a.type)}
              className="group flex items-center gap-3 rounded-2xl border border-foreground/[0.06] bg-card px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-px hover:bg-foreground/[0.03] disabled:opacity-50"
            >
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.16)] to-[hsl(var(--brand-magenta)_/_0.16)] text-[hsl(var(--brand-blue))]">
                <a.icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-bold">{a.label}</span>
              {assignMut.isPending && assignMut.variables === a.type && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />}
            </button>
          ))}
        </div>

        {/* Custom forms - workspace-authored, reusable */}
        <div className="mt-5 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Your custom forms</div>
          <Link to="/assessments" className="inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] bg-card px-3 py-1 text-xs font-medium shadow-sm hover:bg-foreground/[0.05]">
            <Plus className="h-3 w-3" /> Build &amp; manage
          </Link>
        </div>
        {(formsQ.data ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-foreground/45">
            No forms yet - <Link to="/assessments" className="text-teal-600 hover:underline dark:text-teal-300">build one in Assessments</Link> to reuse across clients.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(formsQ.data ?? []).map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={assignFormMut.isPending}
                onClick={() => assignFormMut.mutate(f.id)}
                className="flex items-center gap-3 rounded-2xl border border-foreground/[0.06] bg-card px-3 py-2 text-left shadow-sm transition-all hover:bg-foreground/[0.03] disabled:opacity-50"
              >
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-600 dark:bg-teal-500/[0.14] dark:text-teal-300">
                  <ClipboardList className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{f.name}</span>
                  <span className="block text-[11px] text-foreground/45">{f.questions.length} question{f.questions.length === 1 ? '' : 's'}</span>
                </span>
                {assignFormMut.isPending && assignFormMut.variables === f.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </button>
            ))}
          </div>
        )}
      </Glass>

      {/* Assigned list */}
      <Glass className="overflow-hidden rounded-3xl border-foreground/[0.06] shadow-sm">
        <div className="border-b border-foreground/[0.06] px-5 py-4 text-sm font-bold">Assigned assessments</div>
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
                  <span className={cn('grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-foreground/[0.04]', meta.tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{meta.label}</div>
                    <div className="text-[11px] text-foreground/55">Sent {when}</div>
                  </div>
                  {isReviewed ? (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700 dark:bg-teal-500/[0.18] dark:text-teal-200">Reviewed</span>
                  ) : c.has_responses ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:bg-emerald-500/[0.18] dark:text-emerald-200">Completed</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:bg-amber-500/[0.18] dark:text-amber-200">Awaiting</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewing(c)}
                    className="rounded-full border border-foreground/[0.08] bg-card px-3.5 py-1.5 text-xs font-bold text-foreground/80 shadow-sm hover:bg-foreground/[0.05]"
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
    ...optimistic<AssessmentCard[], void>(
      qc,
      ['client', clientId, 'assessments'],
      (old) => old.map((cc) => (cc.id === card.id
        ? {
            ...cc,
            reviewed_at: new Date().toISOString(),
            generated_content: {
              ...cc.generated_content,
              review: {
                ...(cc.generated_content as { review?: Record<string, unknown> }).review,
                note: note.trim() || null,
                reviewed_at: new Date().toISOString(),
              },
            },
          }
        : cc)),
      { errorMessage: 'Could not save your review.', also: [['assessments', 'recent']] },
    ),
    onSuccess: (updated) => {
      const rev = (updated?.generated_content as { review?: { note?: string | null; reviewed_at?: string } })?.review ?? null;
      const wasReviewed = !!savedReview?.reviewed_at;
      setSavedReview(rev);
      if (rev?.note) setNote(rev.note);
      toast.success(wasReviewed ? 'Review updated - your client will see the change.' : 'Marked as reviewed - your client will see this.');
    },
  });

  const fmt = (v: unknown): string => {
    if (v == null || v === '') return '-';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-foreground/[0.08] bg-popover shadow-2xl"
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
              <span className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/[0.18] dark:text-emerald-200">
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
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">{qq.question}</div>
                  <div className="h-px flex-1 bg-foreground/[0.10]" />
                </div>
              ) : (
                <div key={qq.id} className="rounded-2xl border border-foreground/[0.06] bg-card p-3.5 shadow-sm">
                  <div className="text-xs font-bold text-foreground/70">{qq.question}</div>
                  <div className={cn('mt-1 text-sm', card.has_responses ? 'text-foreground' : 'text-foreground/40')}>
                    {fmt(responses[qq.id])}
                  </div>
                </div>
              )
            ))
          )}
        </div>

        {/* Review - feedback the client will see */}
        <div className="border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-4">
          {savedReview?.reviewed_at && (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/[0.18] dark:text-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              Reviewed {new Date(savedReview.reviewed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          )}
          <label className="mb-1.5 block text-xs font-medium text-foreground/70">
            Review note <span className="font-normal text-foreground/45">- your client will see this</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Feedback for your client - what looks good, what to focus on next…"
            className="w-full resize-none rounded-2xl border border-foreground/10 bg-card px-3.5 py-2.5 text-sm outline-none focus:border-teal-400/60"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            {savedReview?.reviewed_at && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-foreground/[0.08] bg-card px-4 py-2 text-sm font-medium text-foreground/80 shadow-sm hover:bg-foreground/[0.05]"
              >
                Done
              </button>
            )}
            <button
              type="button"
              onClick={() => reviewMut.mutate()}
              disabled={reviewMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-bold text-white shadow-[0_10px_30px_-10px_rgba(14,154,168,0.55)] transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-50"
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

// ─── Small building blocks ───────────────────────────────────────────────

function ActionPill({ icon: Icon, label, onClick, primary }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all',
        primary ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-[0_10px_30px_-10px_rgba(14,154,168,0.55)] hover:scale-[1.03] cta-glow active:scale-[0.97]' : 'border border-foreground/[0.08] bg-card text-foreground/80 shadow-sm hover:bg-foreground/[0.04]')}>
      <Icon className="h-3.5 w-3.5" />{label && label}
    </button>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-foreground/[0.06] bg-card px-3.5 py-2.5 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">{label}</div>
      <div className="mt-1 truncate text-sm font-bold capitalize text-foreground">{value}</div>
    </div>
  );
}

/** Stands in for the empty value: coach ids are UUIDs, so this cannot collide. */
const UNASSIGNED = '__unassigned__';

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
    ...optimistic<ListClientsResult, string | null>(
      qc,
      ['clients', 'all'],
      (old, coachUserId) => ({
        ...old,
        items: old.items.map((c) => (c.id === client.id ? { ...c, assigned_coach_user_id: coachUserId } : c)),
      }),
      { errorMessage: 'Could not update the coach.', also: [['clients']] },
    ),
    onSuccess: () => toast.success('Coach updated.'),
  });

  if (!canAssign) return null;

  return (
    <div className="mt-5 flex flex-col gap-2 border-t border-foreground/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Assigned coach</div>
        <div className="mt-0.5 text-xs text-foreground/60">Coaches only see the clients assigned to them.</div>
      </div>
      {/* "Unassigned" is a real choice (it clears the coach), not a placeholder,
          so it needs a sentinel - Radix throws on <SelectItem value="">. The
          sentinel is mapped back to null at the boundary, so the value sent to
          the API is exactly what the native <select> sent before. */}
      <Select
        value={client.assigned_coach_user_id ?? UNASSIGNED}
        disabled={assign.isPending || coachesQ.isLoading}
        onValueChange={(v) => assign.mutate(v === UNASSIGNED ? null : v)}
      >
        <SelectTrigger
          aria-label="Assigned coach"
          className="w-auto rounded-xl border-foreground/[0.08] bg-card px-3 py-2 text-sm text-foreground shadow-sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED} className="text-sm">Unassigned (whole team)</SelectItem>
          {(coachesQ.data ?? []).map((c) => (
            <SelectItem key={c.user_id} value={c.user_id} className="text-sm">
              {c.name}{c.role === 'coach' ? '' : ` (${c.role})`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MetricStat({ icon: Icon, value, label, color }: {
  icon: React.ComponentType<{ className?: string }>; value: string; label: string; color: string;
}) {
  const c = METRIC_COLORS[color] ?? METRIC_COLORS.slate;
  return (
    <div className="rounded-2xl border border-foreground/[0.06] bg-card p-3.5 text-center shadow-sm transition-colors hover:bg-foreground/[0.03]">
      <div className={cn('mx-auto grid h-10 w-10 place-items-center rounded-xl', c.tint, c.fg)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 text-xl font-extrabold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/50">{label}</div>
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
    active:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/[0.18] dark:text-emerald-200',
    completed: 'bg-sky-100 text-sky-700 dark:bg-sky-500/[0.18] dark:text-sky-200',
    paused:    'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.18] dark:text-amber-200',
    pending:   'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.18] dark:text-amber-200',
    archived:  'bg-foreground/[0.06] text-foreground/50',
  };
  return (
    <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] capitalize',
      styles[status] ?? 'bg-foreground/[0.06] text-foreground/50')}>
      {status}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '-';
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
