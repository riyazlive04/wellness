import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  Check,
  ChevronRight,
  ClipboardList,
  Crown,
  Loader2,
  Sparkles,
  Trash2,
  Users,
  Utensils,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { adminApi, type AdminWorkspaceDetail } from '@/modules/super-admin/api/admin';
import { SetupFeeCard } from './SetupFeeCard';
import { RemindersCard } from './RemindersCard';
import { TrialCard } from './TrialCard';
import { ActivityCard, BillingCard, ClientsCard, EventsCard } from './WorkspaceInsight';

export default function WorkspaceDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: ws, isLoading, error } = useQuery<AdminWorkspaceDetail>({
    queryKey: ['admin', 'workspace', id],
    queryFn: () => adminApi.workspaceDetail(id),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'workspace', id] });
    qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] });
    qc.invalidateQueries({ queryKey: ['admin', 'platform-stats'] });
  };

  const suspend    = useMutation({ mutationFn: () => adminApi.suspend(id),    onSuccess: () => { toast.success('Suspended.'); invalidate(); }, onError: onErr });
  const activate   = useMutation({ mutationFn: () => adminApi.activate(id),   onSuccess: () => { toast.success('Activated.'); invalidate(); }, onError: onErr });
  const softDelete = useMutation({
    mutationFn: () => adminApi.softDelete(id),
    onSuccess: () => { toast.success('Soft-deleted.'); invalidate(); navigate('/admin/workspaces'); },
    onError: onErr,
  });

  const trialDaysLeft = useMemo(() => {
    if (!ws) return null;
    return Math.floor((new Date(ws.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }, [ws]);

  if (isLoading) return <LoadingShell />;
  if (error) return <ErrorShell message={(error as Error).message} />;
  if (!ws) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-8">

        {/* Breadcrumb + actions */}
        <motion.div variants={fadeUp} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/admin/workspaces" className="inline-flex items-center gap-1.5 text-xs text-foreground/75 dark:text-foreground/60 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> All workspaces
          </Link>
          <div className="flex items-center gap-1.5">
            {ws.status === 'active' && (
              <ActionButton label="Suspend" icon={Ban} tone="warn" onClick={() => { if (confirm(`Suspend "${ws.name}"? Everyone in this practice (staff and clients) is locked out until you activate it again.`)) suspend.mutate(); }} loading={suspend.isPending} />
            )}
            {ws.status === 'suspended' && (
              <ActionButton label="Activate" icon={Check} tone="ok" onClick={() => activate.mutate()} loading={activate.isPending} />
            )}
            {ws.status !== 'deleted' && (
              <ActionButton
                label="Soft-delete"
                icon={Trash2}
                tone="danger"
                onClick={() => { if (confirm(`Delete "${ws.name}"? Everyone in this practice (staff and clients) is locked out. Data is kept.`)) softDelete.mutate(); }}
                loading={softDelete.isPending}
              />
            )}
          </div>
        </motion.div>

        {/* Header card */}
        <motion.div variants={fadeUp}>
          <Glass className="p-6 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-balance">{ws.name}</h1>
              <StatusBadge status={ws.status} />
              <span className="rounded-full border border-foreground/10 bg-foreground/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-foreground/70">
                {ws.plan}
              </span>
              {ws.plan === 'trial' && trialDaysLeft !== null && (
                <span className={cn(
                  'text-[10px] tabular-nums',
                  trialDaysLeft <= 7 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground/75 dark:text-foreground/55',
                )}>
                  trial {trialDaysLeft >= 0 ? `${trialDaysLeft}d left` : 'expired'}
                </span>
              )}
            </div>
            <div className="text-sm text-foreground/80 dark:text-foreground/65">
              {ws.slug && <>slug: <code className="font-mono text-xs">{ws.slug}</code> · </>}
              created {new Date(ws.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>

            <div className="grid gap-x-6 gap-y-2 pt-3 text-sm sm:grid-cols-2">
              <Field label="Owner email"   value={ws.owner_email} />
              <Field label="Contact email" value={ws.contact_email} />
              <Field label="Contact phone" value={ws.contact_phone} />
              <Field label="Location"      value={[ws.city, ws.country_code].filter(Boolean).join(', ') || null} />
              <Field label="GSTIN"         value={ws.gstin} mono />
              <Field label="PAN"           value={ws.pan} mono />
            </div>
          </Glass>
        </motion.div>

        <motion.div variants={fadeUp}>
          <SetupFeeCard workspaceId={ws.id} onTrial={ws.plan === 'trial'} />
        </motion.div>

        <motion.div variants={fadeUp}>
          <TrialCard workspaceId={ws.id} trialEndsAt={ws.trial_ends_at} onTrial={ws.plan === 'trial'} />
        </motion.div>

        {ws.plan === 'trial' && (
          <motion.div variants={fadeUp}>
            <RemindersCard workspaceId={ws.id} daysLeft={trialDaysLeft} />
          </motion.div>
        )}

        {/* At a glance — the four things worth knowing before anything else. */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <CountTile icon={Users} label="Clients" value={ws.counts.clients}
            sub={`${ws.activity.clients_active_7d} active this week`} />
          <CountTile icon={Utensils} label="Meals · 7d" value={ws.activity.meals_7d}
            sub={ws.activity.meals_7d === 0 ? 'nothing logged' : 'across all clients'} />
          <CountTile icon={Sparkles} label="AI · 30d" value={ws.activity.ai_calls_30d}
            sub={ws.activity.ai_limit ? `of ${ws.activity.ai_limit}` : 'calls'} />
          <CountTile icon={ClipboardList} label="Assessments" value={ws.counts.assessments}
            sub={`${ws.counts.meal_logs} meal logs all time`} />
        </motion.div>

        {/* Is it being used, and what will it be charged? */}
        <motion.div variants={fadeUp} className="grid gap-4 lg:grid-cols-2">
          <ActivityCard a={ws.activity} counts={ws.counts} />
          <BillingCard b={ws.billing} plan={ws.plan} />
        </motion.div>

        <motion.div variants={fadeUp}>
          <ClientsCard clients={ws.clients_list} />
        </motion.div>

        <motion.div variants={fadeUp}>
          <EventsCard events={ws.events} />
        </motion.div>

        {/* Members list */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="border-b border-foreground/[0.06] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
              Members ({ws.members.length})
            </div>
            <ul className="divide-y divide-foreground/[0.04]">
              {ws.members.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-foreground/75 dark:text-foreground/55">No members yet.</li>
              )}
              {ws.members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 px-5 py-3">
                  {m.role === 'owner' ? (
                    <Crown className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                  ) : (
                    <Users className="h-4 w-4 text-foreground/75 dark:text-foreground/55" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.email ?? '(no email)'}</div>
                    <div className="text-[11px] text-foreground/75 dark:text-foreground/55">
                      {m.role} · {m.status} · joined {new Date(m.joined_at).toLocaleDateString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Glass>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────

function onErr(err: unknown) {
  toast.error(err instanceof ApiError ? err.message : (err as Error).message);
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/75 dark:text-foreground/55">{label}</div>
      <div className={cn('text-sm', mono && 'font-mono', !value && 'text-foreground/40')}>
        {value || 'Not set'}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AdminWorkspaceDetail['status'] }) {
  const tone =
    status === 'active'    ? 'border-teal-400/40 bg-teal-400/10 text-teal-700 dark:text-teal-200' :
    status === 'suspended' ? 'border-amber-300/40  bg-amber-300/10  text-amber-700 dark:text-amber-200'   :
                             'border-rose-400/40   bg-rose-400/10   text-rose-700 dark:text-rose-200';
  return <span className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]', tone)}>{status}</span>;
}

function CountTile({ icon: Icon, label, value, sub }: {
  icon: typeof Users; label: string; value: number;
  /** One line of context under the number, e.g. "3 active this week". */
  sub?: string;
}) {
  return (
    <Glass className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{label}</span>
        <Icon className="h-4 w-4 text-teal-700 dark:text-teal-300" />
      </div>
      <div className="mt-3 text-3xl font-semibold leading-none tabular-nums">{value}</div>
      {sub && <div className="mt-1.5 text-[11.5px] text-foreground/55">{sub}</div>}
    </Glass>
  );
}

function ActionButton({
  icon: Icon, label, tone, onClick, loading,
}: { icon: typeof Ban; label: string; tone: 'ok' | 'warn' | 'danger'; onClick: () => void; loading?: boolean }) {
  const cls = {
    ok:     'border-teal-400/40 text-teal-700 hover:bg-teal-400/10 dark:text-teal-300',
    warn:   'border-amber-300/40   text-amber-700   hover:bg-amber-300/10   dark:text-amber-300',
    danger: 'border-rose-400/40    text-rose-700    hover:bg-rose-400/10    dark:text-rose-300',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50', cls)}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function LoadingShell() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-16 text-center text-sm text-foreground/75 dark:text-foreground/55">
      <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-foreground/40" />
      Loading workspace…
    </div>
  );
}
function ErrorShell({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <Glass className="border-rose-400/40 bg-rose-400/5 p-6 text-sm text-rose-700 dark:text-rose-200">
        <div className="font-medium">Couldn&apos;t load this workspace.</div>
        <div className="mt-1 text-foreground/80 dark:text-foreground/65">{message}</div>
        <Link to="/admin/workspaces" className="mt-3 inline-flex items-center gap-1.5 text-xs text-foreground/80 dark:text-foreground/65 hover:text-foreground">
          <ChevronRight className="h-3 w-3" /> Back to list
        </Link>
      </Glass>
    </div>
  );
}
