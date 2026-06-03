import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  Building2,
  Check,
  ChevronRight,
  ClipboardList,
  Crown,
  ExternalLink,
  Loader2,
  Trash2,
  Users,
  Utensils,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { adminApi, type AdminWorkspaceDetail } from '@/modules/super-admin/api/admin';

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
          <Link to="/admin/workspaces" className="inline-flex items-center gap-1.5 text-xs text-foreground/60 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> All workspaces
          </Link>
          <div className="flex items-center gap-1.5">
            {ws.status === 'active' && (
              <ActionButton label="Suspend" icon={Ban} tone="warn" onClick={() => suspend.mutate()} loading={suspend.isPending} />
            )}
            {ws.status === 'suspended' && (
              <ActionButton label="Activate" icon={Check} tone="ok" onClick={() => activate.mutate()} loading={activate.isPending} />
            )}
            {ws.status !== 'deleted' && (
              <ActionButton
                label="Soft-delete"
                icon={Trash2}
                tone="danger"
                onClick={() => { if (confirm(`Soft-delete "${ws.name}"?`)) softDelete.mutate(); }}
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
                  trialDaysLeft <= 7 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground/55',
                )}>
                  trial {trialDaysLeft >= 0 ? `${trialDaysLeft}d left` : 'expired'}
                </span>
              )}
            </div>
            <div className="text-sm text-foreground/65">
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

        {/* Counts */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <CountTile icon={Users}         label="Members"      value={ws.counts.members} />
          <CountTile icon={Users}         label="Clients"      value={ws.counts.clients} />
          <CountTile icon={ClipboardList} label="Programs"     value={ws.counts.programs} />
          <CountTile icon={Building2}     label="Appointments" value={ws.counts.appointments} />
          <CountTile icon={Utensils}      label="Meal logs"    value={ws.counts.meal_logs} />
          <CountTile icon={ClipboardList} label="Assessments"  value={ws.counts.assessments} />
        </motion.div>

        {/* Members list */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="border-b border-foreground/[0.06] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-foreground/55">
              Members ({ws.members.length})
            </div>
            <ul className="divide-y divide-foreground/[0.04]">
              {ws.members.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-foreground/55">No members yet.</li>
              )}
              {ws.members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 px-5 py-3">
                  {m.role === 'owner' ? (
                    <Crown className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                  ) : (
                    <Users className="h-4 w-4 text-foreground/55" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.email ?? '(no email)'}</div>
                    <div className="text-[11px] text-foreground/55">
                      {m.role} · {m.status} · joined {new Date(m.joined_at).toLocaleDateString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Glass>
        </motion.div>

        {/* Inspect link */}
        <motion.div variants={fadeUp}>
          <a
            href={`https://supabase.com/dashboard/project/gbpnsdxpbrzmlmrljfmv/sql/new?query=${encodeURIComponent(`SELECT * FROM public.workspaces WHERE id = '${ws.id}'`)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-foreground/55 hover:text-foreground"
          >
            Inspect in Supabase <ExternalLink className="h-3 w-3" />
          </a>
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
      <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/55">{label}</div>
      <div className={cn('text-sm', mono && 'font-mono', !value && 'text-foreground/40')}>
        {value || 'Not set'}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AdminWorkspaceDetail['status'] }) {
  const tone =
    status === 'active'    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200' :
    status === 'suspended' ? 'border-amber-300/40  bg-amber-300/10  text-amber-700 dark:text-amber-200'   :
                             'border-rose-400/40   bg-rose-400/10   text-rose-700 dark:text-rose-200';
  return <span className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]', tone)}>{status}</span>;
}

function CountTile({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <Glass className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
        <Icon className="h-4 w-4 text-violet-700 dark:text-violet-300" />
      </div>
      <div className="mt-3 text-3xl font-semibold leading-none tabular-nums">{value}</div>
    </Glass>
  );
}

function ActionButton({
  icon: Icon, label, tone, onClick, loading,
}: { icon: typeof Ban; label: string; tone: 'ok' | 'warn' | 'danger'; onClick: () => void; loading?: boolean }) {
  const cls = {
    ok:     'border-emerald-400/40 text-emerald-700 hover:bg-emerald-400/10 dark:text-emerald-300',
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
    <div className="mx-auto w-full max-w-6xl px-6 py-16 text-center text-sm text-foreground/55">
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
        <div className="mt-1 text-foreground/65">{message}</div>
        <Link to="/admin/workspaces" className="mt-3 inline-flex items-center gap-1.5 text-xs text-foreground/65 hover:text-foreground">
          <ChevronRight className="h-3 w-3" /> Back to list
        </Link>
      </Glass>
    </div>
  );
}
