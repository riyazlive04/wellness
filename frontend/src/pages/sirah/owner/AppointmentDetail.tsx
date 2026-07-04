import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ChevronLeft, Video, Phone, MapPin, CheckCircle2, XCircle, UserX, User as UserIcon,
  MessageCircle, Calendar, Clock, Loader2, Pencil, Save, Link2, Dot,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { clientsApi, type WorkspaceAppointment, type Appointment } from '@/modules/workspace/api/clients';
import { meetingState, canJoin, untilLabel, KIND_LABEL } from '@/modules/workspace/appointments/meeting';
import { cn } from '@/lib/utils';

const MODE_ICON = { video: Video, phone: Phone, in_person: MapPin } as const;

export default function OwnerAppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ws = readWorkspace();

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

  const refresh = () => { qc.invalidateQueries({ queryKey: ['appt', 'owner', id] }); qc.invalidateQueries({ queryKey: ['workspaces', 'me', 'appointments'] }); };
  const updateMut = useMutation({
    mutationFn: (patch: Parameters<typeof clientsApi.updateWorkspaceAppointment>[1]) => clientsApi.updateWorkspaceAppointment(id!, patch),
    onSuccess: () => { refresh(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not update.'),
  });
  const cancelMut = useMutation({
    mutationFn: (reason?: string) => clientsApi.cancelWorkspaceAppointment(id!, reason),
    onSuccess: () => { toast.success('Appointment cancelled.'); refresh(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not cancel.'),
  });

  if (apptQ.isLoading) return <Shell ws={ws}><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-foreground/40" /></div></Shell>;
  if (apptQ.isError || !appt) {
    return (
      <Shell ws={ws}>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">Appointment not found</h1>
          <Link to="/appointments" className="mt-4 inline-flex items-center gap-2 rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04]"><ChevronLeft className="h-4 w-4" /> Back to appointments</Link>
        </div>
      </Shell>
    );
  }

  const Mode = MODE_ICON[appt.mode];
  const state = meetingState(appt.scheduled_at, appt.duration_minutes, appt.status);
  const joinable = appt.mode === 'video' && canJoin(state);
  const live = state === 'live';
  const active = appt.status === 'scheduled';

  return (
    <Shell ws={ws}>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8">
        <motion.div variants={stagger(0.06, 0.04)} initial="initial" animate="animate" className="space-y-5">
          <motion.div variants={fadeUp}>
            <Link to="/appointments" className="inline-flex items-center gap-1 text-xs text-foreground/75 dark:text-foreground/55 hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Appointments</Link>
          </motion.div>

          {/* Header */}
          <motion.div variants={fadeUp}>
            <Glass className="p-5 md:p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <Avatar name={appt.client_name} url={appt.client_avatar} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-lg font-semibold">{appt.client_name}</h1>
                      <StatusChip status={appt.status} />
                      {live && <span className="inline-flex items-center rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400"><Dot className="-ml-1 h-3.5 w-3.5 animate-pulse" /> Live now</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/65">
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {dateLabel(appt.scheduled_at)}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {clockOf(appt.scheduled_at)} · {appt.duration_minutes}m</span>
                      <span className="inline-flex items-center gap-1"><Mode className="h-3.5 w-3.5" /> {KIND_LABEL[appt.kind] ?? appt.kind} · {appt.mode === 'in_person' ? 'In person' : appt.mode}</span>
                    </div>
                  </div>
                </div>

                {/* Join */}
                {appt.mode === 'video' && active && (
                  <div className="flex flex-shrink-0 flex-col items-stretch gap-1 md:items-end">
                    <button type="button" onClick={() => navigate(`/appointments/${appt.id}/meet`)} disabled={!joinable}
                      className={cn('inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all',
                        joinable ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.55)] hover:scale-[1.03]' : 'cursor-not-allowed bg-foreground/[0.06] text-foreground/45')}>
                      <Video className="h-4 w-4" /> {live ? 'Join — live' : 'Join video'}
                    </button>
                    {!joinable && <span className="text-[11px] text-foreground/45">{untilLabel(appt.scheduled_at)}</span>}
                  </div>
                )}
              </div>

              {/* Meeting link (video) */}
              {appt.mode === 'video' && appt.meeting_url && active && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] px-3 py-2">
                  <Link2 className="h-3.5 w-3.5 flex-shrink-0 text-foreground/45" />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground/60">{appt.meeting_url}</span>
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(appt.meeting_url!); toast.success('Meeting link copied.'); }}
                    className="flex-shrink-0 rounded-full border border-foreground/10 px-2.5 py-1 text-[11px] text-foreground/65 hover:bg-foreground/[0.05]">Copy link</button>
                </div>
              )}

              {/* Actions */}
              {active && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-foreground/[0.06] pt-4">
                  <ActionBtn onClick={() => setRescheduling((v) => !v)} icon={Pencil}>Reschedule</ActionBtn>
                  <ActionBtn onClick={() => updateMut.mutate({ status: 'completed' })} icon={CheckCircle2} tone="emerald" loading={updateMut.isPending}>Mark complete</ActionBtn>
                  <ActionBtn onClick={() => updateMut.mutate({ status: 'no_show' })} icon={UserX} tone="amber">No-show</ActionBtn>
                  <ActionBtn onClick={() => { const r = window.prompt('Cancel this appointment? Add an optional reason:'); if (r !== null) cancelMut.mutate(r || undefined); }} icon={XCircle} tone="rose" loading={cancelMut.isPending}>Cancel</ActionBtn>
                </div>
              )}

              {/* Reschedule panel */}
              {active && rescheduling && (
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-3 sm:grid-cols-[1fr_auto_auto]">
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} />
                  <input type="number" min={15} max={240} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={cn(inputCls, 'sm:w-28')} />
                  <button type="button" disabled={updateMut.isPending} onClick={() => { if (!when) return; updateMut.mutate({ scheduled_at: new Date(when).toISOString(), duration_minutes: duration }, { onSuccess: () => { setRescheduling(false); toast.success('Rescheduled.'); } }); }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 text-sm font-medium text-white disabled:opacity-50">
                    {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                  </button>
                </div>
              )}

              {appt.status === 'cancelled' && appt.cancel_reason && (
                <p className="mt-4 rounded-xl bg-foreground/[0.03] px-3 py-2 text-xs text-foreground/60">Cancelled — {appt.cancel_reason}</p>
              )}
            </Glass>
          </motion.div>

          {/* Notes + links */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Glass className="p-5">
              <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/55">Private notes</div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="Agenda, prep, and post-call notes — visible to your team only."
                className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm focus:border-violet-400/50 focus:outline-none" />
              <div className="mt-2 flex justify-end">
                <button type="button" disabled={updateMut.isPending || notes === (appt.notes ?? '')} onClick={() => updateMut.mutate({ notes }, { onSuccess: () => toast.success('Notes saved.') })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-4 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/[0.1] disabled:opacity-40">
                  {updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save notes
                </button>
              </div>
            </Glass>

            <Glass className="space-y-2 p-4">
              <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-foreground/55">Client</div>
              <Link to={`/clients/${appt.client_id}`} className="flex items-center gap-2 rounded-xl border border-foreground/[0.06] px-3 py-2.5 text-sm hover:bg-foreground/[0.04]"><UserIcon className="h-4 w-4 text-foreground/55" /> View profile</Link>
              <Link to={`/messaging/${appt.client_id}`} className="flex items-center gap-2 rounded-xl border border-foreground/[0.06] px-3 py-2.5 text-sm hover:bg-foreground/[0.04]"><MessageCircle className="h-4 w-4 text-foreground/55" /> Open chat</Link>
            </Glass>
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
  const map = {
    scheduled: ['Scheduled', 'bg-violet-500/10 text-violet-700 dark:text-violet-300'],
    completed: ['Completed', 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'],
    cancelled: ['Cancelled', 'bg-foreground/[0.06] text-foreground/55'],
    no_show: ['No-show', 'bg-amber-500/10 text-amber-600 dark:text-amber-400'],
  } as const;
  const [label, cls] = map[status];
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', cls)}>{label}</span>;
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url
    ? <img src={url} alt="" className="h-12 w-12 flex-shrink-0 rounded-full object-cover" />
    : <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-sm font-semibold text-violet-700 dark:text-violet-200">{initialsOf(name)}</div>;
}

function Shell({ ws, children }: { ws: WorkspaceSummary; children: React.ReactNode }) {
  return <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials} trialDaysLeft={28}>{children}</OwnerLayout>;
}

const inputCls = 'h-10 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 text-sm focus:border-violet-400/60 focus:outline-none';
function clockOf(iso: string): string { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function dateLabel(iso: string): string { return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
function initialsOf(name: string): string { return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }
function toLocalInput(iso: string): string { const d = new Date(iso); const off = d.getTimezoneOffset(); const local = new Date(d.getTime() - off * 60_000); return local.toISOString().slice(0, 16); }

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  try { const raw = localStorage.getItem('sirah:workspace:draft'); if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; } } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials };
}
