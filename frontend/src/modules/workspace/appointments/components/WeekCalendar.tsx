import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

import { cn } from '@/lib/utils';
import type { Appointment } from '../types';
import { KIND_META, TYPE_META } from '../helpers';
import { Video, Phone, MapPin } from 'lucide-react';

interface WeekCalendarProps {
  weekStart: Date;            // expected: Monday
  appointments: Appointment[];
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const START_HOUR = 8;          // 8 AM
const END_HOUR = 21;           // 9 PM
const PX_PER_HOUR = 56;        // controls visual density
const ROW_COUNT = END_HOUR - START_HOUR;

const ACCENT_TO_CLASS = {
  sage:   { border: 'border-emerald-400/45', bg: 'bg-emerald-400/[0.08]', text: 'text-emerald-200', dot: 'bg-emerald-400' },
  indigo: { border: 'border-violet-400/45',  bg: 'bg-violet-400/[0.08]',  text: 'text-violet-200',  dot: 'bg-violet-400' },
  sand:   { border: 'border-amber-300/45',   bg: 'bg-amber-300/[0.08]',   text: 'text-amber-200',   dot: 'bg-amber-300' },
  coral:  { border: 'border-rose-400/45',    bg: 'bg-rose-400/[0.08]',    text: 'text-rose-200',    dot: 'bg-rose-400' },
} as const;

export function WeekCalendar({ weekStart, appointments }: WeekCalendarProps) {
  // Group appointments by day index (0..6)
  const grouped = useMemo(() => {
    const map: Record<number, Appointment[]> = {};
    for (const appt of appointments) {
      const d = new Date(appt.startAt);
      const start = new Date(weekStart);
      const dayIndex = Math.floor((+d - +start) / (1000 * 60 * 60 * 24));
      if (dayIndex < 0 || dayIndex > 6) continue;
      (map[dayIndex] ??= []).push(appt);
    }
    return map;
  }, [appointments, weekStart]);

  const now = new Date();
  const nowDayIndex = Math.floor((+now - +weekStart) / (1000 * 60 * 60 * 24));
  const nowHourPos = (now.getHours() - START_HOUR) + now.getMinutes() / 60;
  const showNowLine = nowDayIndex >= 0 && nowDayIndex <= 6 && nowHourPos >= 0 && nowHourPos <= ROW_COUNT;

  return (
    <div className="rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02]">
      {/* Day headers */}
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-foreground/[0.06]">
        <div />
        {DAYS.map((d, i) => {
          const dDate = new Date(weekStart);
          dDate.setDate(dDate.getDate() + i);
          const isToday = sameYMD(dDate, now);
          return (
            <div key={d} className="px-2 py-3 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{d}</div>
              <div className={cn('mt-1 text-sm tabular-nums', isToday ? 'text-emerald-300' : 'text-foreground/85')}>
                {dDate.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Body grid */}
      <div className="relative overflow-hidden" style={{ height: ROW_COUNT * PX_PER_HOUR }}>
        <div className="grid h-full grid-cols-[56px_repeat(7,1fr)]">
          {/* Time column */}
          <div className="relative border-r border-foreground/[0.04]">
            {Array.from({ length: ROW_COUNT }).map((_, i) => (
              <div
                key={i}
                className="flex items-start justify-end pr-2 text-[10px] tabular-nums text-foreground/35"
                style={{ height: PX_PER_HOUR }}
              >
                <span className="-mt-1.5">{(START_HOUR + i).toString().padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {Array.from({ length: 7 }).map((_, dayIdx) => (
            <div key={dayIdx} className="relative border-r border-foreground/[0.04] last:border-r-0">
              {/* Hour rows */}
              {Array.from({ length: ROW_COUNT }).map((_, h) => (
                <div
                  key={h}
                  className="border-b border-foreground/[0.03] last:border-b-0"
                  style={{ height: PX_PER_HOUR }}
                />
              ))}

              {/* Appointments */}
              {(grouped[dayIdx] ?? []).map((appt) => (
                <AppointmentBlock key={appt.id} appt={appt} />
              ))}
            </div>
          ))}
        </div>

        {/* "Now" line */}
        {showNowLine && (
          <div
            className="pointer-events-none absolute left-[56px] right-0 flex items-center gap-2"
            style={{ top: nowHourPos * PX_PER_HOUR }}
          >
            <div
              className="grid h-full grid-cols-[repeat(7,1fr)]"
              style={{ width: '100%' }}
            >
              <div
                className="col-start-1 row-start-1 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(125,190,157,0.8)]"
                style={{ gridColumn: nowDayIndex + 1 }}
              />
            </div>
            <div
              className="absolute right-0 h-px"
              style={{
                left: `${(nowDayIndex / 7) * 100}%`,
                width: `${((7 - nowDayIndex) / 7) * 100}%`,
                background: 'linear-gradient(90deg, #7DBE9D, rgba(125,190,157,0))',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function AppointmentBlock({ appt }: { appt: Appointment }) {
  const start = new Date(appt.startAt);
  const topPx = ((start.getHours() - START_HOUR) + start.getMinutes() / 60) * PX_PER_HOUR;
  const heightPx = (appt.durationMin / 60) * PX_PER_HOUR - 2;

  const kindMeta = KIND_META[appt.kind];
  const accent = ACCENT_TO_CLASS[kindMeta.accent];

  if (topPx < 0 || topPx > ROW_COUNT * PX_PER_HOUR) return null;

  const TypeIcon = appt.type === 'video' ? Video : appt.type === 'phone' ? Phone : MapPin;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="absolute left-1 right-1"
      style={{ top: topPx + 1, height: heightPx }}
    >
      <Link
        to={`/appointments/${appt.id}`}
        className={cn(
          'group flex h-full min-h-[28px] flex-col gap-0.5 overflow-hidden rounded-lg border px-2 py-1.5 text-left transition-all hover:-translate-y-0.5',
          accent.border,
          accent.bg,
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', accent.dot)} />
          <span className={cn('truncate text-[11px] font-medium', accent.text)}>{appt.clientName}</span>
        </div>
        {heightPx > 36 && (
          <>
            <div className="flex items-center gap-1 text-[10px] text-foreground/55">
              <TypeIcon className="h-2.5 w-2.5" />
              {clockOf(appt.startAt)}
              <span className="text-foreground/35">· {appt.durationMin}m</span>
            </div>
            {heightPx > 60 && (
              <div className="truncate text-[10px] text-foreground/55">{TYPE_META[appt.type].label} · {kindMeta.label}</div>
            )}
          </>
        )}
      </Link>
    </motion.div>
  );
}

// ─── tiny inline helper to avoid import cycle ────────────────────────────

function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function sameYMD(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
