import { Link } from 'react-router-dom';
import { Video, Phone, MapPin, ArrowUpRight } from 'lucide-react';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import type { Appointment } from '../types';
import { KIND_META, TYPE_META, clockOf, dayLabel, initialsOf } from '../helpers';

interface AppointmentCardProps {
  appt: Appointment;
  /** Show full date or just time */
  variant?: 'today' | 'upcoming';
}

const ACCENT_DOT: Record<string, string> = {
  sage:   'bg-emerald-400',
  indigo: 'bg-indigo-400',
  sand:   'bg-amber-300',
  coral:  'bg-rose-400',
};

export function AppointmentCard({ appt, variant = 'upcoming' }: AppointmentCardProps) {
  const TypeIcon = appt.type === 'video' ? Video : appt.type === 'phone' ? Phone : MapPin;
  const kindMeta = KIND_META[appt.kind];

  return (
    <Link to={`/appointments/${appt.id}`} className="group block">
      <Glass interactive className="p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500/30 to-emerald-400/20 text-xs font-medium">
            {appt.kind === 'group' ? '👥' : initialsOf(appt.clientName)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-white">{appt.clientName}</span>
              <span className="flex-shrink-0 text-[11px] tabular-nums text-white/55">
                {variant === 'today' ? clockOf(appt.startAt) : dayLabel(appt.startAt) + ' · ' + clockOf(appt.startAt)}
              </span>
            </div>

            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/45">
              <span className={cn('h-1.5 w-1.5 rounded-full', ACCENT_DOT[kindMeta.accent])} />
              <span>{kindMeta.label}</span>
              <span className="text-white/25">·</span>
              <span className="truncate">{appt.program}</span>
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
                  TYPE_META[appt.type].chip,
                )}
              >
                <TypeIcon className="h-2.5 w-2.5" />
                {TYPE_META[appt.type].label} · {appt.durationMin}m
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 text-white/30 transition-colors group-hover:text-white" />
            </div>
          </div>
        </div>
      </Glass>
    </Link>
  );
}
