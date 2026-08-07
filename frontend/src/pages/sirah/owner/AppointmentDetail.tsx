import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ChevronLeft, Video, Phone, MapPin, CheckCircle2, XCircle, UserX, User as UserIcon,
  MessageCircle, Calendar, Clock, Loader2, Pencil, Save, Link2, Dot,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import i18n from '@/i18n';
import { fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { optimistic } from '@/lib/optimistic';
import { clientsApi, type WorkspaceAppointment, type Appointment } from '@/modules/workspace/api/clients';
import { meetingState, canJoin, untilLabel, KIND_LABEL } from '@/modules/workspace/appointments/meeting';
import { cn } from '@/lib/utils';

const MODE_ICON = { video: Video, phone: Phone, in_person: MapPin } as const;

export default function OwnerAppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ws = readWorkspace();
  const { t } = useTranslation('ownerAppointmentDetail');

  const apptQ = useQuery({
    queryKey: ['appt', 'owner', id],
    queryFn: () => clientsApi.getWorkspaceAppointment(id!),
    enabled: !!id, retry: 1, refetchInterval: 30_000,
  });
  const appt = apptQ.data;

  const [notes, setNotes] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState(30);
  useEffect(() => { if (appt) { setNotes(appt.notes ?? ''); setWhen(toLocalInput(appt.scheduled_at)); setDuration(appt.duration_minutes); } }, [appt?.id]); // eslint-disable-line

  // Every action here patches the single cached appointment optimistically and
  // reconciles the detail + list queries on settle. The partial `patch`/status
  // merges straight into the cached row, so the UI moves the instant you click.
  const apptKey = ['appt', 'owner', id];
  const alsoList = [['workspaces', 'me', 'appointments']];
  const updateMut = useMutation({
    mutationFn: (patch: Parameters<typeof clientsApi.updateWorkspaceAppointment>[1]) => clientsApi.updateWorkspaceAppointment(id!, patch),
    ...optimistic<WorkspaceAppointment, Parameters<typeof clientsApi.updateWorkspaceAppointment>[1]>(
      qc, apptKey, (old, patch) => ({ ...old, ...patch }),
      { errorMessage: t('toast.updateError'), also: alsoList },
    ),
  });
  const cancelMut = useMutation({
    mutationFn: (reason?: string) => clientsApi.cancelWorkspaceAppointment(id!, reason),
    ...optimistic<WorkspaceAppointment, string | undefined>(
      qc, apptKey, (old, reason) => ({ ...old, status: 'cancelled', cancel_reason: reason ?? old.cancel_reason }),
      { errorMessage: t('toast.cancelError'), also: alsoList },
    ),
    onSuccess: () => toast.success(t('toast.cancelled')),
  });
  const approveMut = useMutation({
    mutationFn: () => clientsApi.approveWorkspaceAppointment(id!),
    ...optimistic<WorkspaceAppointment, void>(
      qc, apptKey, (old) => ({ ...old, status: 'scheduled' }),
      { errorMessage: t('toast.approveError'), also: alsoList },
    ),
    onSuccess: () => toast.success(t('toast.confirmed')),
  });
  const declineMut = useMutation({
    mutationFn: (reason?: string) => clientsApi.declineWorkspaceAppointment(id!, reason),
    ...optimistic<WorkspaceAppointment, string | undefined>(
      qc, apptKey, (old, reason) => ({ ...old, status: 'declined', cancel_reason: reason ?? old.cancel_reason }),
      { errorMessage: t('toast.declineError'), also: alsoList },
    ),
    onSuccess: () => toast.success(t('toast.declined')),
  });

  if (apptQ.isLoading) return <Shell ws={ws}><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-foreground/40" /></div></Shell>;
  if (apptQ.isError || !appt) {
    return (
      <Shell ws={ws}>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-teal-100 dark:bg-teal-500/[0.12]">
            <Calendar className="h-6 w-6 text-teal-600 dark:text-teal-300" />
          </div>
          <h1 className="text-xl font-extrabold">{t('notFound.title')}</h1>
          <Link to="/appointments" className="mt-5 inline-flex items-center gap-2 rounded-full border border-foreground/[0.08] bg-foreground/[0.03] px-4 py-2 text-sm font-semibold text-foreground/75 transition hover:bg-foreground/[0.06]"><ChevronLeft className="h-4 w-4" /> {t('notFound.back')}</Link>
        </div>
      </Shell>
    );
  }

  const Mode = MODE_ICON[appt.mode];
  const state = meetingState(appt.scheduled_at, appt.duration_minutes, appt.status);
  const joinable = appt.mode === 'video' && canJoin(state);
  const live = state === 'live';
  const active = appt.status === 'scheduled';
  const pending = appt.status === 'pending';

  return (
    <Shell ws={ws}>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8">
        <motion.div variants={stagger(0.06, 0.04)} initial="initial" animate="animate" className="space-y-5">
          <motion.div variants={fadeUp}>
            <Link to="/appointments" className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/75 dark:text-foreground/55 hover:text-[hsl(var(--brand-blue))]"><ChevronLeft className="h-3.5 w-3.5" /> {t('common:nav.appointments')}</Link>
          </motion.div>

          {/* Header */}
          <motion.div variants={fadeUp}>
            <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <Avatar name={appt.client_name} url={appt.client_avatar} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-lg font-extrabold">{appt.client_name}</h1>
                      <StatusChip status={appt.status} />
                      {live && <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:bg-rose-500/[0.15] dark:text-rose-400"><Dot className="-ml-1 h-3.5 w-3.5 animate-pulse" /> {t('liveNow')}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/65">
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {dateLabel(appt.scheduled_at)}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {clockOf(appt.scheduled_at)} · {appt.duration_minutes}m</span>
                      <span className="inline-flex items-center gap-1"><Mode className="h-3.5 w-3.5" /> {KIND_LABEL[appt.kind] ?? appt.kind} · {appt.mode === 'in_person' ? t('mode.inPerson') : appt.mode}</span>
                    </div>
                  </div>
                </div>

                {/* Join */}
                {appt.mode === 'video' && active && (
                  <div className="flex flex-shrink-0 flex-col items-stretch gap-1 md:items-end">
                    <button type="button" onClick={() => navigate(`/appointments/${appt.id}/meet`)} disabled={!joinable}
                      className={cn('inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all',
                        joinable ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-[0_10px_30px_-10px_rgba(14,154,168,0.55)] hover:scale-[1.03] cta-glow active:scale-[0.97]' : 'cursor-not-allowed bg-foreground/[0.06] text-foreground/45')}>
                      <Video className="h-4 w-4" /> {live ? t('join.live') : t('join.video')}
                    </button>
                    {!joinable && <span className="text-[11px] text-foreground/45">{untilLabel(appt.scheduled_at)}</span>}
                  </div>
                )}
              </div>

              {/* Meeting link (video) */}
              {appt.mode === 'video' && appt.meeting_url && active && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl border border-teal-200/60 bg-teal-100 px-3 py-2.5 dark:border-teal-500/15 dark:bg-teal-500/[0.12]">
                  <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-xl bg-white/70 dark:bg-black/20"><Link2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" /></span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-teal-800 dark:text-teal-200">{appt.meeting_url}</span>
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(appt.meeting_url!); toast.success(t('toast.meetingLinkCopied')); }}
                    className="flex-shrink-0 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-teal-700 transition hover:bg-white dark:bg-black/20 dark:text-teal-200 dark:hover:bg-black/30">{t('meetingLink.copy')}</button>
                </div>
              )}

              {/* Pending request — approve or decline */}
              {pending && (
                <div className="mt-4 rounded-2xl border border-amber-300/50 bg-amber-100 p-4 dark:border-amber-500/20 dark:bg-amber-500/[0.08]">
                  <div className="flex items-start gap-2.5">
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-white/60 dark:bg-black/20"><Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-extrabold text-amber-900 dark:text-amber-100">{t('pending.title')}</div>
                      <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/70">
                        {t('pending.description', { name: appt.client_name })}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button type="button" disabled={approveMut.isPending || declineMut.isPending}
                          onClick={() => approveMut.mutate()}
                          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50">
                          {approveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} {t('pending.approve')}
                        </button>
                        <button type="button" disabled={approveMut.isPending || declineMut.isPending}
                          onClick={() => { const r = window.prompt(t('pending.declinePrompt')); if (r !== null) declineMut.mutate(r || undefined); }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-transparent px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 disabled:opacity-50">
                          {declineMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} {t('pending.decline')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              {active && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-foreground/[0.06] pt-4">
                  <ActionBtn onClick={() => setRescheduling((v) => !v)} icon={Pencil}>{t('actions.reschedule')}</ActionBtn>
                  <ActionBtn onClick={() => updateMut.mutate({ status: 'completed' })} icon={CheckCircle2} tone="emerald" loading={updateMut.isPending}>{t('actions.markComplete')}</ActionBtn>
                  <ActionBtn onClick={() => updateMut.mutate({ status: 'no_show' })} icon={UserX} tone="amber">{t('actions.noShow')}</ActionBtn>
                  <ActionBtn onClick={() => { const r = window.prompt(t('actions.cancelPrompt')); if (r !== null) cancelMut.mutate(r || undefined); }} icon={XCircle} tone="rose" loading={cancelMut.isPending}>{t('common:actions.cancel')}</ActionBtn>
                </div>
              )}

              {/* Reschedule panel */}
              {active && rescheduling && (
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-sky-200/60 bg-sky-100 p-3.5 dark:border-sky-500/15 dark:bg-sky-500/[0.10] sm:grid-cols-[1fr_auto_auto]">
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} />
                  <input type="number" min={15} max={240} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={cn(inputCls, 'sm:w-28')} />
                  <button type="button" disabled={updateMut.isPending} onClick={() => { if (!when) return; updateMut.mutate({ scheduled_at: new Date(when).toISOString(), duration_minutes: duration }, { onSuccess: () => { setRescheduling(false); toast.success(t('toast.rescheduled')); } }); }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
                    {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('common:actions.save')}
                  </button>
                </div>
              )}

              {(appt.status === 'cancelled' || appt.status === 'declined') && appt.cancel_reason && (
                <p className="mt-4 rounded-2xl bg-foreground/[0.03] px-3.5 py-2.5 text-xs text-foreground/65">
                  <span className="font-semibold text-foreground/75">{appt.status === 'declined' ? t('reason.declined') : t('reason.cancelled')}</span> - {appt.cancel_reason}
                </p>
              )}
            </div>
          </motion.div>

          {/* Notes + links */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
              <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">{t('notes.title')}</div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder={t('notes.placeholder')}
                className="w-full resize-none rounded-2xl border border-foreground/10 bg-foreground/[0.02] px-3.5 py-3 text-sm focus:border-teal-400/50 focus:outline-none" />
              <div className="mt-2.5 flex justify-end">
                <button type="button" disabled={updateMut.isPending || notes === (appt.notes ?? '')} onClick={() => updateMut.mutate({ notes }, { onSuccess: () => toast.success(t('toast.notesSaved')) })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40">
                  {updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {t('notes.save')}
                </button>
              </div>
            </div>

            <div className="space-y-2 rounded-3xl border border-foreground/[0.06] bg-card p-4 shadow-sm">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">{t('client.title')}</div>
              <Link to={`/clients/${appt.client_id}`} className="flex items-center gap-2.5 rounded-2xl border border-foreground/[0.06] px-3 py-2.5 text-sm font-medium transition-colors hover:bg-foreground/[0.04]"><span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-sky-100 dark:bg-sky-500/[0.14]"><UserIcon className="h-4 w-4 text-sky-600 dark:text-sky-300" /></span> {t('client.viewProfile')}</Link>
              <Link to={`/messaging/${appt.client_id}`} className="flex items-center gap-2.5 rounded-2xl border border-foreground/[0.06] px-3 py-2.5 text-sm font-medium transition-colors hover:bg-foreground/[0.04]"><span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-teal-100 dark:bg-teal-500/[0.14]"><MessageCircle className="h-4 w-4 text-teal-600 dark:text-teal-300" /></span> {t('client.openChat')}</Link>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </Shell>
  );
}

function ActionBtn({ onClick, icon: Icon, children, tone, loading }: { onClick: () => void; icon: typeof Video; children: React.ReactNode; tone?: 'emerald' | 'amber' | 'rose'; loading?: boolean }) {
  const toneCls = tone === 'emerald' ? 'hover:border-emerald-400/40 hover:text-emerald-600 dark:hover:text-emerald-400'
    : tone === 'amber' ? 'hover:border-amber-400/40 hover:text-amber-600 dark:hover:text-amber-400'
    : tone === 'rose' ? 'hover:border-rose-400/40 hover:text-rose-600 dark:hover:text-rose-400' : 'hover:bg-foreground/[0.04]';
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className={cn('inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.02] px-3.5 py-1.5 text-xs font-medium text-foreground/75 transition-colors disabled:opacity-50', toneCls)}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />} {children}
    </button>
  );
}

function StatusChip({ status }: { status: Appointment['status'] }) {
  const { t } = useTranslation('ownerAppointmentDetail');
  const map = {
    pending: [t('status.pending'), 'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.15] dark:text-amber-300'],
    scheduled: [t('status.scheduled'), 'bg-teal-100 text-teal-700 dark:bg-teal-500/[0.15] dark:text-teal-300'],
    completed: [t('status.completed'), 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/[0.15] dark:text-emerald-300'],
    cancelled: [t('status.cancelled'), 'bg-foreground/[0.06] text-foreground/55'],
    no_show: [t('status.noShow'), 'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.15] dark:text-amber-300'],
    declined: [t('status.declined'), 'bg-rose-100 text-rose-700 dark:bg-rose-500/[0.15] dark:text-rose-300'],
  } as const;
  const [label, cls] = map[status];
  return <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-bold', cls)}>{label}</span>;
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url
    ? <img src={url} alt="" className="h-12 w-12 flex-shrink-0 rounded-full object-cover" />
    : <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-sm font-semibold text-teal-700 dark:text-teal-200">{initialsOf(name)}</div>;
}

function Shell({ ws, children }: { ws: WorkspaceSummary; children: React.ReactNode }) {
  return <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials} trialDaysLeft={28}>{children}</OwnerLayout>;
}

const inputCls = 'h-10 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 text-sm focus:border-teal-400/60 focus:outline-none';
function clockOf(iso: string): string { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function dateLabel(iso: string): string { return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
function initialsOf(name: string): string { return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }
function toLocalInput(iso: string): string { const d = new Date(iso); const off = d.getTimezoneOffset(); const local = new Date(d.getTime() - off * 60_000); return local.toISOString().slice(0, 16); }

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WorkspaceSummary {
  let practiceName = i18n.t('ownerAppointmentDetail:workspace.defaultPractice');
  try { const raw = localStorage.getItem('sirah:workspace:draft'); if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; } } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: i18n.t('ownerAppointmentDetail:workspace.ownerName'), initials };
}
