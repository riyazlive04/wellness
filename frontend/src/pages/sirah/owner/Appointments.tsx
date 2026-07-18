import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Plus, Calendar, Clock, Users, Video, Phone, MapPin, ChevronLeft, ChevronRight, Loader2, X, Dot, Check,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { clientsApi, type WorkspaceAppointment, type Appointment } from '@/modules/workspace/api/clients';
import { meetingState, canJoin, untilLabel, KIND_LABEL, KIND_DURATION, kindColor } from '@/modules/workspace/appointments/meeting';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const MODE_ICON = { video: Video, phone: Phone, in_person: MapPin } as const;

export default function OwnerAppointments() {
  const workspace = readWorkspace();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [booking, setBooking] = useState(false);
  const now = Date.now();

  const apptsQ = useQuery({
    queryKey: ['workspaces', 'me', 'appointments'],
    queryFn: () => clientsApi.listWorkspaceAppointments(),
    refetchInterval: 30_000, refetchOnWindowFocus: true,
  });
  const appts = apptsQ.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['workspaces', 'me', 'appointments'] });
  const approveMut = useMutation({
    mutationFn: (apptId: string) => clientsApi.approveWorkspaceAppointment(apptId),
    onSuccess: () => { toast.success('Appointment confirmed.'); refresh(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not approve.'),
  });
  const declineMut = useMutation({
    mutationFn: (v: { id: string; reason?: string }) => clientsApi.declineWorkspaceAppointment(v.id, v.reason),
    onSuccess: () => { toast.success('Request declined.'); refresh(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not decline.'),
  });

  const weekEnd = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); return d; }, [weekStart]);
  const inWeek = useMemo(() => appts.filter((a) => { const t = new Date(a.scheduled_at); return t >= weekStart && t < weekEnd; }), [appts, weekStart, weekEnd]);
  const pendingRequests = useMemo(() => appts.filter((a) => a.status === 'pending').sort(byTime), [appts]);
  const today = useMemo(() => appts.filter((a) => isSameDay(a.scheduled_at, new Date()) && a.status !== 'cancelled' && a.status !== 'pending').sort(byTime), [appts]);
  const upcoming = useMemo(() => appts.filter((a) => new Date(a.scheduled_at).getTime() > now && a.status === 'scheduled' && !isSameDay(a.scheduled_at, new Date())).sort(byTime).slice(0, 5), [appts, now]);

  const stats = {
    todayCount: today.length,
    pendingCount: pendingRequests.length,
    weekCount: inWeek.filter((a) => a.status !== 'cancelled' && a.status !== 'pending').length,
    upcomingCount: appts.filter((a) => a.status === 'scheduled' && new Date(a.scheduled_at).getTime() > now).length,
    groupCount: appts.filter((a) => a.kind === 'group_session' && a.status === 'scheduled').length,
  };

  return (
    <OwnerLayout practiceName={workspace.practiceName} ownerName={workspace.ownerName} initials={workspace.initials}
      trialDaysLeft={28} topbarContext={`${stats.todayCount} today · ${stats.weekCount} this week${stats.pendingCount ? ` · ${stats.pendingCount} to approve` : ''}`}>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-6 md:space-y-7">
          <PageHeader
            eyebrow="Engagement · Appointments"
            title="Your week, by the hour"
            description="Calls, consults, and group sessions - join the video room in one tap, right inside SIRAH LIFE."
            action={
              <button type="button" onClick={() => setBooking(true)}
                className="group inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(14,154,168,0.55)] transition-all hover:scale-[1.03] cta-glow active:scale-[0.97] active:scale-[0.98]">
                <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" /> New appointment
              </button>
            }
          />

          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KPICard icon={Clock} label="Today" value={String(stats.todayCount)} hint="appointments" accent="sage" />
            <KPICard icon={Calendar} label="This week" value={String(stats.weekCount)} hint="scheduled" accent="indigo" />
            <KPICard icon={Video} label="Upcoming" value={String(stats.upcomingCount)} hint="ahead of now" accent="sand" />
            <KPICard icon={Users} label="Requests" value={String(stats.pendingCount)} hint="awaiting approval" accent="sand" />
          </motion.div>

          {/* Pending client requests — approve or decline inline */}
          {pendingRequests.length > 0 && (
            <motion.div variants={fadeUp}>
              <Glass className="overflow-hidden border border-amber-400/25">
                <div className="flex items-center justify-between border-b border-amber-400/20 bg-amber-500/[0.06] px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">Appointment requests</span>
                  </div>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    {pendingRequests.length} pending
                  </span>
                </div>
                <div className="divide-y divide-foreground/[0.05]">
                  {pendingRequests.map((a) => (
                    <RequestRow
                      key={a.id}
                      a={a}
                      onOpen={() => navigate(`/appointments/${a.id}`)}
                      onApprove={() => approveMut.mutate(a.id)}
                      onDecline={() => { const r = window.prompt('Decline this request? Add an optional reason for the client:'); if (r !== null) declineMut.mutate({ id: a.id, reason: r || undefined }); }}
                      busy={(approveMut.isPending && approveMut.variables === a.id) || (declineMut.isPending && declineMut.variables?.id === a.id)}
                    />
                  ))}
                </div>
              </Glass>
            </motion.div>
          )}

          {/* Week grid */}
          <motion.div variants={fadeUp}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Week view</div>
                <div className="text-sm font-medium text-foreground">{fmtWeekRange(weekStart)}</div>
              </div>
              <div className="flex items-center gap-1">
                <NavBtn onClick={() => shift(setWeekStart, weekStart, -7)} aria="Previous week"><ChevronLeft className="h-3.5 w-3.5" /></NavBtn>
                <button type="button" onClick={() => setWeekStart(mondayOf(new Date()))}
                  className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.06]">This week</button>
                <NavBtn onClick={() => shift(setWeekStart, weekStart, 7)} aria="Next week"><ChevronRight className="h-3.5 w-3.5" /></NavBtn>
              </div>
            </div>
            <WeekGrid weekStart={weekStart} appts={inWeek} onOpen={(id) => navigate(`/appointments/${id}`)} />
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {Object.entries(KIND_LABEL).map(([k, label]) => (
                <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-foreground/55">
                  <span className={cn('h-2 w-2 rounded-full', kindColor(k).dot)} /> {label}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Today + Upcoming */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Glass className="overflow-hidden">
              <SectionHead label="Today" sub={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })} right={`${stats.todayCount} ${stats.todayCount === 1 ? 'session' : 'sessions'}`} />
              {apptsQ.isLoading ? <Loading /> : today.length === 0 ? (
                <Empty text="Nothing on the calendar today. A quiet day is a good day." />
              ) : (
                <div className="space-y-2 p-3">{today.map((a) => <ApptRow key={a.id} a={a} onOpen={() => navigate(`/appointments/${a.id}`)} onJoin={() => navigate(`/appointments/${a.id}/meet`)} />)}</div>
              )}
            </Glass>

            <Glass className="overflow-hidden">
              <SectionHead label="Coming up" sub="Next sessions" />
              {apptsQ.isLoading ? <Loading /> : upcoming.length === 0 ? (
                <Empty text="No upcoming appointments. Tap “New appointment” to schedule one." />
              ) : (
                <div className="space-y-2 p-3">{upcoming.map((a) => <ApptRow key={a.id} a={a} onOpen={() => navigate(`/appointments/${a.id}`)} onJoin={() => navigate(`/appointments/${a.id}/meet`)} />)}</div>
              )}
            </Glass>
          </motion.div>
        </motion.div>
      </div>

      {booking && <NewAppointmentDialog onClose={() => setBooking(false)} onCreated={(id) => { setBooking(false); navigate(`/appointments/${id}`); }} />}
    </OwnerLayout>
  );
}

// ── Week grid ──────────────────────────────────────────────────────────
function WeekGrid({ weekStart, appts, onOpen }: { weekStart: Date; appts: WorkspaceAppointment[]; onOpen: (id: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
  return (
    <Glass className="overflow-hidden p-0">
      <div className="grid grid-cols-7 divide-x divide-foreground/[0.06]">
        {days.map((day) => {
          const list = appts.filter((a) => isSameDay(a.scheduled_at, day)).sort(byTime);
          const isToday = isSameDay(day.toISOString(), new Date());
          return (
            <div key={day.toISOString()} className="min-h-[180px]">
              <div className={cn('border-b border-foreground/[0.06] px-2 py-2 text-center', isToday && 'bg-teal-500/[0.06]')}>
                <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/50">{day.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                <div className={cn('text-sm font-semibold', isToday ? 'text-teal-600 dark:text-teal-300' : 'text-foreground/80')}>{day.getDate()}</div>
              </div>
              <div className="space-y-1 p-1.5">
                {list.map((a) => {
                  const cancelled = a.status === 'cancelled' || a.status === 'declined';
                  const pending = a.status === 'pending';
                  const color = kindColor(a.kind);
                  return (
                    <button key={a.id} type="button" onClick={() => onOpen(a.id)}
                      className={cn('w-full rounded-lg border px-2 py-1.5 text-left transition-opacity hover:opacity-80',
                        cancelled ? 'border-foreground/5 bg-foreground/[0.02] opacity-50'
                          : pending ? 'border-dashed border-amber-400/50 bg-amber-500/[0.06] text-amber-800 dark:text-amber-200'
                          : color.chip)}>
                      <div className="flex items-center gap-1 text-[10px] font-medium opacity-80">
                        {clockOf(a.scheduled_at)}{pending && <span className="ml-auto rounded-full bg-amber-500/20 px-1 text-[8px] uppercase tracking-wide">req</span>}
                      </div>
                      <div className={cn('truncate text-[11px] font-semibold', cancelled && 'line-through')}>{a.client_name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Glass>
  );
}

// ── Appointment row ──────────────────────────────────────────────────────
function ApptRow({ a, onOpen, onJoin }: { a: WorkspaceAppointment; onOpen: () => void; onJoin: () => void }) {
  const Mode = MODE_ICON[a.mode];
  const state = meetingState(a.scheduled_at, a.duration_minutes, a.status);
  const joinable = a.mode === 'video' && canJoin(state);
  const color = kindColor(a.kind);
  return (
    <div className="group flex items-center gap-3 overflow-hidden rounded-xl border border-foreground/[0.06] bg-foreground/[0.015] p-2.5 transition-colors hover:bg-foreground/[0.04]">
      <span className={cn('-my-2.5 -ml-2.5 mr-0.5 h-[3.25rem] w-1 flex-shrink-0 rounded-r', a.status === 'cancelled' ? 'bg-foreground/15' : color.bar)} />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar name={a.client_name} url={a.client_avatar} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{a.client_name}</span>
            {state === 'live' && <span className="inline-flex items-center rounded-full bg-rose-500/15 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400"><Dot className="-mx-1 h-3 w-3 animate-pulse" />live</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-foreground/55">
            <Mode className="h-3 w-3" /> {KIND_LABEL[a.kind] ?? a.kind} · {clockOf(a.scheduled_at)} · {a.duration_minutes}m
          </div>
        </div>
      </button>
      {a.status === 'scheduled' && (
        joinable ? (
          <button type="button" onClick={onJoin}
            className="flex-shrink-0 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-3 py-1.5 text-xs font-semibold text-white shadow-sm">Join</button>
        ) : a.mode === 'video' ? (
          <span className="flex-shrink-0 text-[10px] text-foreground/45">{untilLabel(a.scheduled_at)}</span>
        ) : null
      )}
      {a.status === 'completed' && <span className="flex-shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Done</span>}
      {a.status === 'cancelled' && <span className="flex-shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] text-foreground/50">Cancelled</span>}
      {a.status === 'no_show' && <span className="flex-shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">No-show</span>}
    </div>
  );
}

// ── Pending request row (approve / decline inline) ───────────────────────
function RequestRow({ a, onOpen, onApprove, onDecline, busy }: { a: WorkspaceAppointment; onOpen: () => void; onApprove: () => void; onDecline: () => void; busy: boolean }) {
  const Mode = MODE_ICON[a.mode];
  return (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.02]">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar name={a.client_name} url={a.client_avatar} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{a.client_name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-foreground/55">
            <Mode className="h-3 w-3" /> {KIND_LABEL[a.kind] ?? a.kind} · {new Date(a.scheduled_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {clockOf(a.scheduled_at)} · {a.duration_minutes}m
          </div>
        </div>
      </button>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <button type="button" onClick={onApprove} disabled={busy}
          className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
        </button>
        <button type="button" onClick={onDecline} disabled={busy}
          className="inline-flex items-center gap-1 rounded-full border border-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:border-rose-400/40 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-50">
          <X className="h-3.5 w-3.5" /> Decline
        </button>
      </div>
    </div>
  );
}

// ── New appointment dialog ───────────────────────────────────────────────
function NewAppointmentDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const clientsQ = useQuery({ queryKey: ['workspaces', 'me', 'clients', 'picker'], queryFn: () => clientsApi.list({ limit: 200 }) });
  const clients = clientsQ.data?.items ?? [];
  const [clientId, setClientId] = useState('');
  const [kind, setKind] = useState<Appointment['kind']>('consultation');
  const [mode, setMode] = useState<Appointment['mode']>('video');
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState<number>(KIND_DURATION.consultation);
  const [notes, setNotes] = useState('');

  const createMut = useMutation({
    mutationFn: () => clientsApi.createWorkspaceAppointment({
      client_id: clientId, scheduled_at: new Date(when).toISOString(), duration_minutes: duration, kind, mode, notes: notes.trim() || undefined,
    }),
    onSuccess: (row) => { qc.invalidateQueries({ queryKey: ['workspaces', 'me', 'appointments'] }); toast.success('Appointment scheduled.'); onCreated(row.id); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not schedule.'),
  });

  function submit() {
    if (!clientId) return toast.error('Pick a client.');
    if (!when || Number.isNaN(new Date(when).getTime())) return toast.error('Pick a date & time.');
    if (new Date(when).getTime() < Date.now() - 60_000) return toast.error('Pick a future time.');
    createMut.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-h-[92svh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-foreground/10 bg-canvas p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">New appointment</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-foreground/50 hover:bg-foreground/[0.06]"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3.5">
          <Field label="Client" labelled={false}>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger aria-label="Client" className={selectTriggerCls}>
                <SelectValue placeholder={clientsQ.isLoading ? 'Loading…' : 'Select a client'} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}{c.email ? ` · ${c.email}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Type" labelled={false}>
            <Select value={kind} onValueChange={(v) => { const k = v as Appointment['kind']; setKind(k); setDuration(KIND_DURATION[k] ?? 30); }}>
              <SelectTrigger aria-label="Type" className={selectTriggerCls}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_LABEL).map(([k, label]) => <SelectItem key={k} value={k} className="text-sm">{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Mode">
            <div className="grid grid-cols-3 gap-2">
              {(['video', 'phone', 'in_person'] as const).map((m) => {
                const Icon = MODE_ICON[m];
                return (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={cn('flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-medium capitalize',
                      mode === m ? 'border-teal-400/60 bg-teal-500/10 text-teal-700 dark:text-teal-200' : 'border-foreground/10 text-foreground/65 hover:bg-foreground/[0.04]')}>
                    <Icon className="h-3.5 w-3.5" /> {m === 'in_person' ? 'In person' : m}
                  </button>
                );
              })}
            </div>
            {mode === 'video' && <p className="mt-1 text-[11px] text-foreground/45">A private video room is created automatically.</p>}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="When"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></Field>
            <Field label="Duration (min)"><input type="number" min={15} max={240} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputCls} /></Field>
          </div>

          <Field label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Agenda, prep, things to cover…" className={cn(inputCls, 'resize-none')} />
          </Field>
        </div>

        <button type="button" onClick={submit} disabled={createMut.isPending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Schedule appointment
        </button>
      </motion.div>
    </div>
  );
}

// ── small bits ───────────────────────────────────────────────────────────
const inputCls = 'h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 text-sm focus:border-teal-400/60 focus:outline-none';
// The SelectTrigger supplies its own border + focus ring, so the bare `border`
// word and the focus utilities are dropped from the shared input classes.
const selectTriggerCls = 'h-10 w-full rounded-xl border-foreground/10 bg-foreground/[0.02] px-3 text-sm';

/**
 * `labelled={false}` renders a <div> instead of a <label>. <button> is a
 * labelable element, so a wrapping <label> forwards its click to a Radix
 * SelectTrigger on top of the trigger's own click — the menu opens and
 * instantly closes. Those fields carry an aria-label on the trigger instead.
 */
function Field({ label, children, labelled = true }: { label: string; children: React.ReactNode; labelled?: boolean }) {
  const Tag = labelled ? 'label' : 'div';
  return <Tag className="block"><span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/50">{label}</span>{children}</Tag>;
}
function NavBtn({ onClick, aria, children }: { onClick: () => void; aria: string; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-label={aria} className="grid h-8 w-8 place-items-center rounded-lg border border-foreground/10 bg-foreground/[0.03] text-foreground/70 hover:bg-foreground/[0.06]">{children}</button>;
}
function SectionHead({ label, sub, right }: { label: string; sub: string; right?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{label}</div>
        <div className="text-sm font-medium text-foreground">{sub}</div>
      </div>
      {right && <span className="text-xs text-foreground/75 dark:text-foreground/60">{right}</span>}
    </div>
  );
}
function Loading() { return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-foreground/40" /></div>; }
function Empty({ text }: { text: string }) { return <div className="px-5 py-10 text-center text-sm text-foreground/55">{text}</div>; }
function Avatar({ name, url }: { name: string; url: string | null }) {
  return url
    ? <img src={url} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
    : <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-xs font-semibold text-teal-700 dark:text-teal-200">{initialsOf(name)}</div>;
}

// ── helpers ────────────────────────────────────────────────────────────
function byTime(a: WorkspaceAppointment, b: WorkspaceAppointment) { return +new Date(a.scheduled_at) - +new Date(b.scheduled_at); }
function mondayOf(d: Date): Date { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - day); return x; }
function shift(set: (d: Date) => void, from: Date, days: number) { const d = new Date(from); d.setDate(d.getDate() + days); set(d); }
function isSameDay(a: string | Date, b: string | Date): boolean { const da = new Date(a), db = new Date(b); return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate(); }
function clockOf(iso: string): string { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function initialsOf(name: string): string { return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }
function fmtWeekRange(monday: Date): string {
  const end = new Date(monday); end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${monday.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`;
}

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  try { const raw = localStorage.getItem('sirah:workspace:draft'); if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; } } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials };
}
