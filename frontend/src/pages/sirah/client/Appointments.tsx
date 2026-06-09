import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar,
  Plus,
  Clock,
  Video,
  Phone,
  MapPin,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type Appointment } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

const KINDS: { value: Appointment['kind']; label: string }[] = [
  { value: 'consultation', label: 'Consultation (45 min)' },
  { value: 'follow_up',    label: 'Follow-up (30 min)' },
  { value: 'check_in',     label: 'Quick check-in (15 min)' },
  { value: 'assessment',   label: 'Assessment (60 min)' },
];

const DURATION_FOR: Record<Appointment['kind'], number> = {
  consultation: 45,
  follow_up: 30,
  check_in: 15,
  assessment: 60,
  group_session: 60,
};

export default function ClientAppointments() {
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const apptsQ = useQuery({
    queryKey: ['me', 'appointments'],
    queryFn: () => clientsApi.myAppointments(),
    retry: 1,
  });
  const [bookOpen, setBookOpen] = useState(false);

  const appts = apptsQ.data ?? [];
  const upcoming = appts.filter((a) => a.status === 'scheduled' && new Date(a.scheduled_at).getTime() > Date.now());
  const past = appts.filter((a) => a.status !== 'scheduled' || new Date(a.scheduled_at).getTime() <= Date.now());

  const cancelMut = useMutation({
    mutationFn: (id: string) => clientsApi.cancelAppointment(id),
    onSuccess: () => {
      toast.success('Appointment cancelled.');
      queryClient.invalidateQueries({ queryKey: ['me', 'appointments'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not cancel.'),
  });

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <motion.div variants={fadeUp} className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Care · Appointments</span>
            <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Appointments</h1>
            <p className="mt-2 max-w-2xl text-sm text-foreground/65">Upcoming sessions and past consultations.</p>
          </div>
          <button
            type="button"
            onClick={() => setBookOpen(true)}
            className="inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)]"
          >
            <Plus className="h-4 w-4" /> Book
          </button>
        </motion.div>

        {/* Stats */}
        <motion.div variants={fadeUp} className="mt-6 grid gap-3 sm:grid-cols-2">
          <Glass className="p-5">
            <Calendar className="h-5 w-5 text-violet-600 dark:text-violet-300" />
            <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-foreground/55">Upcoming</div>
            <div className="mt-1 text-2xl font-semibold">{upcoming.length}</div>
            <div className="mt-1 text-xs text-foreground/55">
              {upcoming[0] ? `Next: ${formatWhen(upcoming[upcoming.length - 1].scheduled_at)}` : 'Nothing booked'}
            </div>
          </Glass>
          <Glass className="p-5">
            <Clock className="h-5 w-5 text-emerald-600" />
            <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-foreground/55">Past</div>
            <div className="mt-1 text-2xl font-semibold">{past.length}</div>
            <div className="mt-1 text-xs text-foreground/55">
              {past.filter((a) => a.status === 'completed').length} completed
            </div>
          </Glass>
        </motion.div>

        {/* Upcoming list */}
        <motion.div variants={fadeUp} className="mt-6">
          <h2 className="mb-3 text-base font-semibold">Upcoming</h2>
          {upcoming.length === 0 ? (
            <Glass className="flex flex-col items-center gap-3 p-8 text-center">
              <Video className="h-6 w-6 text-foreground/35" />
              <div className="text-sm text-foreground/65">No upcoming appointments. Book one when you're ready.</div>
            </Glass>
          ) : (
            <div className="space-y-3">
              {upcoming
                .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
                .map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appt={a}
                    onCancel={() => cancelMut.mutate(a.id)}
                    cancelling={cancelMut.isPending && cancelMut.variables === a.id}
                  />
                ))}
            </div>
          )}
        </motion.div>

        {/* Past list */}
        {past.length > 0 && (
          <motion.div variants={fadeUp} className="mt-6">
            <h2 className="mb-3 text-base font-semibold">History</h2>
            <div className="space-y-3">
              {past
                .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
                .slice(0, 10)
                .map((a) => <AppointmentCard key={a.id} appt={a} compact />)}
            </div>
          </motion.div>
        )}
      </motion.div>

      <AnimatePresence>
        {bookOpen && (
          <BookingDialog
            onClose={() => setBookOpen(false)}
            onBooked={() => {
              setBookOpen(false);
              queryClient.invalidateQueries({ queryKey: ['me', 'appointments'] });
            }}
          />
        )}
      </AnimatePresence>
    </ClientLayout>
  );
}

// ──────────────────────────────────────────────────────────────────

function AppointmentCard({ appt, onCancel, cancelling, compact }: {
  appt: Appointment;
  onCancel?: () => void;
  cancelling?: boolean;
  compact?: boolean;
}) {
  const isUpcoming = appt.status === 'scheduled' && new Date(appt.scheduled_at).getTime() > Date.now();
  const ModeIcon = appt.mode === 'video' ? Video : appt.mode === 'phone' ? Phone : MapPin;

  return (
    <Glass className={cn('p-4', compact && 'p-3')}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl',
          isUpcoming ? 'bg-gradient-to-br from-blue-500/20 to-fuchsia-500/15' : 'bg-foreground/[0.04]',
        )}>
          {appt.status === 'cancelled' ? (
            <XCircle className="h-4 w-4 text-rose-500" />
          ) : appt.status === 'completed' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <ModeIcon className="h-4 w-4 text-violet-700 dark:text-violet-200" />
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium capitalize">
              {appt.kind.replace('_', ' ')}
              <span className="ml-2 text-xs font-normal text-foreground/55">
                · {appt.duration_minutes} min · {appt.mode.replace('_', ' ')}
              </span>
            </div>
            {appt.status === 'cancelled' && (
              <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-200">
                cancelled
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-foreground/65">{formatWhen(appt.scheduled_at)}</div>
          {appt.notes && !compact && (
            <p className="mt-2 text-xs text-foreground/55">{appt.notes}</p>
          )}
          {appt.meeting_url && isUpcoming && (
            <a
              href={appt.meeting_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700"
            >
              <Video className="h-3 w-3" /> Join video call
            </a>
          )}
        </div>

        {isUpcoming && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="flex-shrink-0 rounded-full px-3 py-1 text-xs text-foreground/65 hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-50"
          >
            {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Cancel'}
          </button>
        )}
      </div>
    </Glass>
  );
}

function BookingDialog({ onClose, onBooked }: { onClose: () => void; onBooked: () => void }) {
  const [kind, setKind] = useState<Appointment['kind']>('consultation');
  const [mode, setMode] = useState<Appointment['mode']>('video');
  const [dateStr, setDateStr] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    return tomorrow.toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState('');

  const bookMut = useMutation({
    mutationFn: clientsApi.bookAppointment,
    onSuccess: () => {
      toast.success('Appointment booked!');
      onBooked();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not book.'),
  });

  function submit() {
    const scheduled_at = new Date(dateStr).toISOString();
    bookMut.mutate({
      scheduled_at,
      duration_minutes: DURATION_FOR[kind],
      kind,
      mode,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2"
      >
        <Glass variant="heavy" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-foreground/[0.06] p-4">
            <h2 className="text-base font-semibold">Book appointment</h2>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-foreground/65 hover:bg-foreground/[0.05]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-5">
            <Field label="Type">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Appointment['kind'])}
                className={inputCls}
              >
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </Field>

            <Field label="When">
              <input
                type="datetime-local"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Mode">
              <div className="grid grid-cols-3 gap-2">
                {(['video', 'phone', 'in_person'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-xs font-medium transition-colors',
                      mode === m
                        ? 'border-violet-400/50 bg-violet-500/10 text-foreground'
                        : 'border-foreground/10 text-foreground/65 hover:bg-foreground/[0.04]',
                    )}
                  >
                    {m.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Notes (optional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything your nutritionist should know in advance?"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="flex gap-2 border-t border-foreground/[0.06] p-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-foreground/10 px-4 py-2.5 text-sm font-medium hover:bg-foreground/[0.04]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={bookMut.isPending}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {bookMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm
            </button>
          </div>
        </Glass>
      </motion.div>
    </>
  );
}

const inputCls = 'w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/40 focus:border-violet-400/50 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-foreground/65">{label}</div>
      {children}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}