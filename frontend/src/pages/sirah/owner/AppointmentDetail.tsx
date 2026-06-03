import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  Video,
  Phone,
  MapPin,
  Sparkles,
  Pencil,
  CheckCircle2,
  XCircle,
  User as UserIcon,
  MessageCircle,
  Calendar,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { MOCK_APPOINTMENTS } from '@/modules/workspace/appointments/data/mockAppointments';
import {
  KIND_META,
  STATUS_META,
  TYPE_META,
  clockOf,
  dayLabel,
  initialsOf,
} from '@/modules/workspace/appointments/helpers';
import { cn } from '@/lib/utils';

export default function OwnerAppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const appt = useMemo(() => MOCK_APPOINTMENTS.find((a) => a.id === id), [id]);
  const workspace = readWorkspace();
  const [notes, setNotes] = useState(appt?.notes ?? '');

  if (!appt) {
    return (
      <OwnerLayout
        practiceName={workspace.practiceName}
        ownerName={workspace.ownerName}
        initials={workspace.initials}
        trialDaysLeft={28}
      >
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">Appointment not found</h1>
          <Link
            to="/appointments"
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04]"
          >
            <ChevronLeft className="h-4 w-4" /> Back to appointments
          </Link>
        </div>
      </OwnerLayout>
    );
  }

  const kindMeta = KIND_META[appt.kind];
  const typeMeta = TYPE_META[appt.type];
  const statusMeta = STATUS_META[appt.status];
  const TypeIcon = appt.type === 'video' ? Video : appt.type === 'phone' ? Phone : MapPin;

  const otherAppointmentsWithClient = appt.clientId
    ? MOCK_APPOINTMENTS.filter((a) => a.clientId === appt.clientId && a.id !== appt.id).slice(0, 3)
    : [];

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-6 md:py-8">
        <motion.div variants={stagger(0.06, 0.04)} initial="initial" animate="animate" className="space-y-6">
          {/* Back */}
          <motion.div variants={fadeUp}>
            <Link to="/appointments" className="inline-flex items-center gap-1 text-xs text-foreground/75 dark:text-foreground/55 hover:text-foreground">
              <ChevronLeft className="h-3.5 w-3.5" />
              Appointments
            </Link>
          </motion.div>

          {/* Header card */}
          <motion.div variants={fadeUp}>
            <Glass className="p-6 md:p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-base font-medium">
                    {appt.kind === 'group' ? '👥' : initialsOf(appt.clientName)}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-semibold tracking-tight">{appt.clientName}</h1>
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em]', statusMeta.chip)}>
                        {statusMeta.label}
                      </span>
                      {appt.kind === 'urgent' && (
                        <span className="rounded-full border border-rose-400/40 bg-rose-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-200">
                          {kindMeta.label}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 text-sm text-foreground/80 dark:text-foreground/65">{appt.program}</div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-foreground/75 dark:text-foreground/55">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {dayLabel(appt.startAt)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {clockOf(appt.startAt)} · {appt.durationMin}m
                      </span>
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]', typeMeta.chip)}>
                        <TypeIcon className="h-3 w-3" />
                        {typeMeta.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {appt.type === 'video' && (
                    <button
                      type="button"
                      onClick={() => toast.success('Opening video room… (Daily.co or Whereby integration goes here.)')}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-foreground transition-transform duration-200 hover:scale-[1.02]"
                    >
                      <Video className="h-3.5 w-3.5" />
                      Join video
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toast.success('Appointment marked complete.')}
                    className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-4 py-2 text-xs text-foreground/85 hover:bg-foreground/[0.06]"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Mark complete
                  </button>
                  <button
                    type="button"
                    onClick={() => toast('Reschedule flow opens when the backend ships.')}
                    className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-4 py-2 text-xs text-foreground/85 hover:bg-foreground/[0.06]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Reschedule
                  </button>
                  <button
                    type="button"
                    onClick={() => toast('Cancel flow opens when the backend ships.')}
                    className="grid h-9 w-9 place-items-center rounded-full border border-foreground/10 text-foreground/75 dark:text-foreground/55 hover:bg-foreground/[0.04] hover:text-rose-700 dark:text-rose-300"
                    aria-label="Cancel"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Glass>
          </motion.div>

          {/* Two-col: AI brief + side rail */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            {/* AI brief */}
            <AIGlow intensity="soft" animated>
              <Glass variant="heavy" className="p-6">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20">
                    <Sparkles className="h-4 w-4 text-violet-700 dark:text-violet-200" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                        Pre-call brief by SIRAH
                      </span>
                      <span className="h-1 w-1 rounded-full bg-foreground/20" />
                      <span className="text-[10px] text-foreground/75 dark:text-foreground/55">Generated 12 min ago</span>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-foreground/85">{appt.aiBrief}</p>

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <BriefStat label="Adherence" value="92%" tone="emerald" />
                      <BriefStat label="Last logged" value="2h ago" tone="neutral" />
                      <BriefStat label="Streak" value="14 days" tone="indigo" />
                    </div>
                  </div>
                </div>

                {/* Talking points */}
                <div className="mt-6 border-t border-foreground/[0.06] pt-5">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                    Talking points
                  </div>
                  <ul className="mt-2 space-y-2 text-sm text-foreground/80">
                    <TalkingPoint text="Acknowledge progress without overpraising — keep them in growth mode." />
                    <TalkingPoint text="Surface this week's specific compliance gap and ask, don't tell." />
                    <TalkingPoint text="Close with one tiny next-step commitment for the next 24 hours." />
                  </ul>
                </div>
              </Glass>
            </AIGlow>

            {/* Side rail: notes + client link + recent appointments */}
            <div className="space-y-4">
              <Glass className="p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                  Your private notes
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Jot anything you want to remember before joining…"
                  rows={5}
                  className="mt-2 w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/75 dark:text-foreground/60 focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
                />
                <div className="mt-2 text-[10px] text-foreground/35">
                  Private to you. Not shared with the client.
                </div>
              </Glass>

              {appt.clientId && (
                <Link
                  to={`/clients/${appt.clientId}`}
                  className="group block"
                >
                  <Glass interactive className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
                        {initialsOf(appt.clientName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">View full profile</div>
                        <div className="text-[11px] text-foreground/75 dark:text-foreground/60">Assessments · Plan · Recent activity</div>
                      </div>
                      <UserIcon className="h-4 w-4 text-foreground/30 transition-colors group-hover:text-foreground" />
                    </div>
                  </Glass>
                </Link>
              )}

              {appt.clientId && (
                <Glass interactive className="cursor-pointer p-4" onClick={() => toast.success('Opening message thread.')}>
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600/25 to-fuchsia-500/20 text-violet-700 dark:text-violet-200">
                      <MessageCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">Open conversation</div>
                      <div className="text-[11px] text-foreground/75 dark:text-foreground/60">2 unread messages</div>
                    </div>
                  </div>
                </Glass>
              )}

              {otherAppointmentsWithClient.length > 0 && (
                <Glass className="overflow-hidden">
                  <div className="border-b border-foreground/[0.06] px-5 py-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                      Other appointments with {appt.clientName.split(' ')[0]}
                    </div>
                  </div>
                  <ul className="divide-y divide-foreground/[0.04]">
                    {otherAppointmentsWithClient.map((a) => (
                      <li key={a.id}>
                        <Link
                          to={`/appointments/${a.id}`}
                          className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs transition-colors hover:bg-foreground/[0.03]"
                        >
                          <span className="text-foreground/80">{KIND_META[a.kind].label}</span>
                          <span className="text-foreground/75 dark:text-foreground/60">{dayLabel(a.startAt)} · {clockOf(a.startAt)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Glass>
              )}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

function BriefStat({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'indigo' | 'neutral' }) {
  const c =
    tone === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'indigo'
        ? 'text-violet-700 dark:text-violet-300'
        : 'text-foreground';
  return (
    <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{label}</div>
      <div className={cn('mt-1 text-base font-semibold tracking-tight', c)}>{value}</div>
    </div>
  );
}

function TalkingPoint({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" />
      {text}
    </li>
  );
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

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

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}
