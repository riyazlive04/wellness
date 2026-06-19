import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Phone, Mail, MessageCircle, Activity, ClipboardList,
  CalendarDays, Camera, Ruler, Loader2, Target, Flame,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { clientsApi, type ClientListItem } from '@/modules/workspace/api/clients';
import { useOwnerIdentity } from '@/hooks/useOwnerIdentity';
import { useScope } from '@/hooks/useScope';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'meals' | 'measurements' | 'messages';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview',     label: 'Overview',     icon: Activity },
  { id: 'meals',        label: 'Meals',        icon: ClipboardList },
  { id: 'measurements', label: 'Measurements', icon: Ruler },
  { id: 'messages',     label: 'Messages',     icon: MessageCircle },
];

export default function OwnerClientDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { ownerName, initials: ownerInitials } = useOwnerIdentity();
  const { practiceName } = useWorkspaceBrand();
  const [tab, setTab] = useState<Tab>('overview');

  // No single-client endpoint — resolve from the workspace roster.
  const listQ = useQuery({ queryKey: ['clients', 'all'], queryFn: () => clientsApi.list({ limit: 200 }) });
  const client = listQ.data?.items.find((c) => c.id === id);

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
                    <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-base font-medium">
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
                  <button key={t.id} type="button" onClick={() => setTab(t.id)}
                    className={cn('relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                      active ? 'text-foreground' : 'text-foreground/75 dark:text-foreground/55 hover:text-foreground/85')}>
                    {active && (
                      <motion.span layoutId="client-tab" className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-600/35 to-fuchsia-500/25"
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
                <div className={cn('max-w-[75%] rounded-2xl px-3.5 py-2 text-sm', fromClient ? 'bg-foreground/[0.05]' : 'bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20')}>
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
        primary ? 'bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white hover:scale-[1.02]' : 'border border-foreground/10 text-foreground/80 hover:bg-foreground/[0.04]')}>
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
