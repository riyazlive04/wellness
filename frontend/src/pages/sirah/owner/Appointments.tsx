import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Calendar, Clock, Users, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { WeekCalendar } from '@/modules/workspace/appointments/components/WeekCalendar';
import { AppointmentCard } from '@/modules/workspace/appointments/components/AppointmentCard';
import {
  MOCK_APPOINTMENTS,
  WEEK_ANCHOR,
} from '@/modules/workspace/appointments/data/mockAppointments';
import { isSameDay } from '@/modules/workspace/appointments/helpers';

export default function OwnerAppointments() {
  const workspace = readWorkspace();
  const [weekStart, setWeekStart] = useState<Date>(WEEK_ANCHOR);
  const now = new Date();

  const inWeek = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 7);
    return MOCK_APPOINTMENTS.filter((a) => {
      const t = new Date(a.startAt);
      return t >= weekStart && t < end;
    });
  }, [weekStart]);

  const today = useMemo(() => {
    return MOCK_APPOINTMENTS.filter((a) => isSameDay(a.startAt, now))
      .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  }, [now]);

  const upcoming = useMemo(() => {
    return MOCK_APPOINTMENTS.filter((a) => new Date(a.startAt) > now && !isSameDay(a.startAt, now))
      .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt))
      .slice(0, 4);
  }, [now]);

  const stats = useMemo(() => {
    return {
      todayCount:   today.length,
      weekCount:    inWeek.length,
      urgentCount:  MOCK_APPOINTMENTS.filter((a) => a.kind === 'urgent').length,
      groupCount:   MOCK_APPOINTMENTS.filter((a) => a.kind === 'group').length,
    };
  }, [today, inWeek]);

  function shiftWeek(deltaWeeks: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + deltaWeeks * 7);
    setWeekStart(d);
  }

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${stats.todayCount} today · ${stats.weekCount} this week`}
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-white/40">Appointments</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                Your week, by the hour
              </h1>
              <p className="mt-1 text-sm text-white/55">
                Calls, consults, and group sessions — with an AI-drafted brief for each one.
              </p>
            </div>

            <button
              type="button"
              onClick={() => toast('Booking flow opens when the Appointments backend module ships.')}
              className="inline-flex w-fit items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              New appointment
            </button>
          </motion.div>

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KPICard icon={Clock}          label="Today"      value={String(stats.todayCount)} hint="appointments" accent="sage" />
            <KPICard icon={Calendar}       label="This week"  value={String(stats.weekCount)} hint="scheduled"    accent="indigo" />
            <KPICard icon={AlertTriangle}  label="Urgent"     value={String(stats.urgentCount)} hint="needs attention" accent="sand" />
            <KPICard icon={Users}          label="Group"      value={String(stats.groupCount)} hint="this week"   accent="indigo" />
          </motion.div>

          {/* Week calendar */}
          <motion.div variants={fadeUp}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Week view</div>
                <div className="text-sm font-medium text-white">
                  {fmtWeekRange(weekStart)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => shiftWeek(-1)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 transition-colors hover:bg-white/[0.06]"
                  aria-label="Previous week"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setWeekStart(WEEK_ANCHOR)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/85 hover:bg-white/[0.06]"
                >
                  This week
                </button>
                <button
                  type="button"
                  onClick={() => shiftWeek(1)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 transition-colors hover:bg-white/[0.06]"
                  aria-label="Next week"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <WeekCalendar weekStart={weekStart} appointments={inWeek} />
          </motion.div>

          {/* Today + Upcoming */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Today */}
            <Glass className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Today</div>
                  <div className="text-sm font-medium text-white">
                    {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
                  </div>
                </div>
                <span className="text-xs text-white/45">{stats.todayCount} {stats.todayCount === 1 ? 'session' : 'sessions'}</span>
              </div>

              {today.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-white/45">
                  Nothing on the calendar today. A quiet day is a good day.
                </div>
              ) : (
                <div className="space-y-2 p-3">
                  {today.map((a) => (
                    <AppointmentCard key={a.id} appt={a} variant="today" />
                  ))}
                </div>
              )}
            </Glass>

            {/* Upcoming */}
            <Glass className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Coming up</div>
                  <div className="text-sm font-medium text-white">Next 4 sessions</div>
                </div>
              </div>
              <div className="space-y-2 p-3">
                {upcoming.map((a) => (
                  <AppointmentCard key={a.id} appt={a} />
                ))}
              </div>
            </Glass>
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

function fmtWeekRange(monday: Date): string {
  const end = new Date(monday);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${monday.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`;
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
