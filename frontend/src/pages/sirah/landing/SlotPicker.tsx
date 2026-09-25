import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';

import { api } from '@/lib/api';
import { trackButtonClick } from './landingEvents';

/**
 * Pick the demo call's time: a row of dates, then the free half-hours on that
 * date. Everything is shown in IST, because the team calling is in India and a
 * lead reading "3:30 PM" should mean the same to both sides.
 *
 * The server decides what is free (it also re-checks on submit), so a slot
 * someone took a minute ago simply isn't in the list.
 */

const IST = 'Asia/Kolkata';

const dayLabel = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: IST }).format(d);
const dateLabel = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', timeZone: IST }).format(d);
const timeLabel = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST }).format(d);
/** Same-day grouping must use the IST date, not the browser's. */
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(d);

export function SlotPicker({
  value,
  onChange,
  onAvailability,
}: {
  value: string;
  onChange: (iso: string) => void;
  /** Whether there are times to choose from (false when loading failed or none are free). */
  onAvailability?: (hasSlots: boolean) => void;
}) {
  const [slots, setSlots] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [day, setDay] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .get<{ slots: string[] }>('/api/v1/public/leads/slots', { skipAuth: true })
      .then((res) => {
        if (!alive) return;
        setSlots(res?.slots ?? []);
        onAvailability?.((res?.slots ?? []).length > 0);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        onAvailability?.(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const iso of slots ?? []) {
      const key = dayKey(new Date(iso));
      const list = map.get(key);
      if (list) list.push(iso);
      else map.set(key, [iso]);
    }
    return map;
  }, [slots]);

  const days = useMemo(() => [...byDay.keys()], [byDay]);

  // Land on the first day that has slots.
  useEffect(() => {
    if (!day && days.length) setDay(days[0]);
  }, [days, day]);

  if (failed) {
    return (
      <p className="text-sm text-foreground/60">
        We couldn&apos;t load the call times. Book anyway and we&apos;ll call you within one working day.
      </p>
    );
  }

  if (!slots) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-foreground/60">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading available times…
      </p>
    );
  }

  if (!slots.length) {
    return (
      <p className="text-sm text-foreground/60">
        All slots are taken this fortnight. Book anyway and we&apos;ll call you as soon as one frees up.
      </p>
    );
  }

  const times = byDay.get(day) ?? [];

  return (
    <div>
      {/* Dates */}
      <div className="flex gap-2 overflow-x-auto pb-1.5">
        {days.map((key) => {
          const d = new Date(byDay.get(key)![0]);
          const active = key === day;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                trackButtonClick('slot_date_select');
                setDay(key);
              }}
              className={
                'flex min-w-[74px] flex-col items-center rounded-xl border-2 px-3 py-2 text-sm transition-colors ' +
                (active
                  ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-500 dark:bg-teal-600'
                  : 'border-foreground/12 bg-foreground/[0.03] text-foreground/70 hover:border-teal-500/50')
              }
            >
              <span className={active ? 'text-[11px] uppercase tracking-wide text-white/80' : 'text-[11px] uppercase tracking-wide text-foreground/45'}>
                {dayLabel(d)}
              </span>
              <span className="font-semibold">{dateLabel(d)}</span>
            </button>
          );
        })}
      </div>

      {/* Times on the chosen date */}
      <div className="mt-3 flex flex-wrap gap-2">
        {times.map((iso) => {
          const active = iso === value;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => {
                trackButtonClick('slot_time_select');
                onChange(iso);
              }}
              className={
                'rounded-full border-2 px-4 py-2 text-sm font-medium transition-all ' +
                (active
                  ? 'border-teal-700 bg-teal-700 text-white shadow-md dark:border-teal-500 dark:bg-teal-600'
                  : 'border-foreground/12 bg-foreground/[0.03] text-foreground/70 hover:border-teal-500/50')
              }
            >
              {timeLabel(new Date(iso))}
            </button>
          );
        })}
      </div>

      <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-foreground/55">
        <CalendarDays className="h-3.5 w-3.5" />
        {value ? `Your call: ${dateLabel(new Date(value))}, ${timeLabel(new Date(value))} IST (45 minutes)` : 'All times are IST · 45-minute call'}
      </p>
    </div>
  );
}
