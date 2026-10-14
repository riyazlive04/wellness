import { AlarmClock, Droplets, ListChecks, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { MealSlotEntry } from '../api/mealPlans';
import {
  MAX_CUSTOM, formatTime, mealTimeFor, waterCount, type CustomReminder, type ReminderSettings,
} from '../api/reminders';

const INTERVALS: Array<{ value: ReminderSettings['water_every_minutes']; label: string }> = [
  { value: 30, label: 'Every 30 min' },
  { value: 60, label: 'Every hour' },
  { value: 90, label: 'Every 1.5 hours' },
  { value: 120, label: 'Every 2 hours' },
];

/** One-tap ideas for the daily routine list. */
const IDEAS: CustomReminder[] = [
  { time: '06:30', title: 'Warm water / methi water' },
  { time: '07:00', title: 'Morning walk: 30 minutes' },
  { time: '09:00', title: 'Take your supplements' },
  { time: '16:00', title: 'Stretch for 5 minutes' },
  { time: '22:00', title: 'Wind down: sleep by 10:30 PM' },
];

const inputCls =
  'rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:border-teal-400/60 focus:outline-none';

/**
 * Meal times, water and the nutritionist's own daily reminders — the same
 * editor for a practice sequence and for one client set by hand.
 */
export function ReminderEditor({
  value: s,
  onChange,
  schedule,
}: {
  value: ReminderSettings;
  onChange: (next: ReminderSettings) => void;
  /** The practice's meal times and names. */
  schedule: MealSlotEntry[];
}) {
  const set = (patch: Partial<ReminderSettings>) => onChange({ ...s, ...patch });
  const setCustom = (i: number, patch: Partial<CustomReminder>) =>
    set({ custom: s.custom.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const addCustom = (c: CustomReminder) => s.custom.length < MAX_CUSTOM && set({ custom: [...s.custom, c] });
  const unusedIdeas = IDEAS.filter((idea) => !s.custom.some((c) => c.title === idea.title));
  const waterBad = s.water_start >= s.water_end;

  return (
    <div className="space-y-4">
      <Group
        icon={UtensilsCrossed}
        tint="text-emerald-600 dark:text-emerald-300"
        title="Meal times"
        sub={s.meals_enabled ? `${schedule.length} a day, one for each meal time of your practice` : 'Off'}
        on={s.meals_enabled}
        onToggle={(v) => set({ meals_enabled: v })}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {schedule.map((e) => (
            <label key={e.slot} className="flex items-center justify-between gap-3 rounded-xl bg-foreground/[0.03] px-3 py-2">
              <span className="truncate text-sm">{e.label}</span>
              <input
                type="time"
                value={mealTimeFor(s, e.slot)}
                onChange={(ev) => ev.target.value && set({ meal_times: { ...s.meal_times, [e.slot]: ev.target.value } })}
                className={cn(inputCls, 'w-32 py-1.5')}
              />
            </label>
          ))}
        </div>
      </Group>

      <Group
        icon={Droplets}
        tint="text-sky-600 dark:text-sky-300"
        title="Water"
        sub={s.water_enabled ? `${waterCount(s)} a day, ${formatTime(s.water_start)} to ${formatTime(s.water_end)}` : 'Off'}
        on={s.water_enabled}
        onToggle={(v) => set({ water_enabled: v })}
      >
        <div className="flex flex-wrap items-center gap-2">
          {INTERVALS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => set({ water_every_minutes: o.value })}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium',
                s.water_every_minutes === o.value
                  ? 'border-sky-400/60 bg-sky-400/10 text-sky-700 dark:text-sky-200'
                  : 'border-foreground/10 text-foreground/70 hover:bg-foreground/[0.04]',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            From <input type="time" value={s.water_start} onChange={(e) => e.target.value && set({ water_start: e.target.value })} className={cn(inputCls, 'py-1.5')} />
          </label>
          <label className="flex items-center gap-2">
            until <input type="time" value={s.water_end} onChange={(e) => e.target.value && set({ water_end: e.target.value })} className={cn(inputCls, 'py-1.5')} />
          </label>
        </div>
        {waterBad && <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">Water reminders must end later in the day than they start.</p>}
      </Group>

      <Group
        icon={ListChecks}
        tint="text-violet-600 dark:text-violet-300"
        title="Daily routine"
        sub={
          s.custom_enabled
            ? s.custom.length
              ? `${s.custom.length} of your own reminder${s.custom.length === 1 ? '' : 's'} a day`
              : 'Your own reminders: methi water, a walk, supplements…'
            : 'Off'
        }
        on={s.custom_enabled}
        onToggle={(v) => set({ custom_enabled: v })}
      >
        <div className="space-y-2">
          {s.custom.map((c, i) => (
            <div key={c.id ?? `new-${i}`} className="flex flex-wrap items-start gap-2 rounded-xl bg-foreground/[0.03] p-2">
              <input type="time" value={c.time} onChange={(e) => e.target.value && setCustom(i, { time: e.target.value })} className={cn(inputCls, 'w-32 py-1.5')} aria-label="Time" />
              <div className="min-w-[12rem] flex-1 space-y-1.5">
                <input
                  value={c.title}
                  maxLength={60}
                  onChange={(e) => setCustom(i, { title: e.target.value })}
                  placeholder="What to do, e.g. Methi water"
                  className={cn(inputCls, 'w-full py-1.5')}
                />
                <input
                  value={c.body ?? ''}
                  maxLength={140}
                  onChange={(e) => setCustom(i, { body: e.target.value })}
                  placeholder="Note (optional)"
                  className={cn(inputCls, 'w-full py-1.5 text-xs')}
                />
              </div>
              <button
                type="button"
                onClick={() => set({ custom: s.custom.filter((_, j) => j !== i) })}
                aria-label="Remove reminder"
                className="grid h-9 w-9 place-items-center rounded-lg text-foreground/50 hover:bg-rose-500/10 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={s.custom.length >= MAX_CUSTOM}
            onClick={() => addCustom({ time: '09:00', title: '' })}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-foreground/25 px-3 py-1.5 text-xs font-semibold hover:bg-foreground/[0.04] disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Add reminder
          </button>
          {unusedIdeas.map((idea) => (
            <button
              key={idea.title}
              type="button"
              disabled={s.custom.length >= MAX_CUSTOM}
              onClick={() => addCustom(idea)}
              className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-500/15 disabled:opacity-40 dark:text-violet-200"
            >
              <AlarmClock className="h-3 w-3" /> {formatTime(idea.time)} · {idea.title}
            </button>
          ))}
        </div>
      </Group>
    </div>
  );
}

function Group({
  icon: Icon, tint, title, sub, on, onToggle, children,
}: {
  icon: ComponentType<{ className?: string }>;
  tint: string;
  title: string;
  sub: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-foreground/[0.07] p-4">
      <div className="flex items-center gap-3">
        <span className={cn('grid h-9 w-9 place-items-center rounded-xl bg-foreground/[0.05]', tint)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="truncate text-xs text-foreground/55">{sub}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${title} reminders`}
          onClick={() => onToggle(!on)}
          className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-emerald-500' : 'bg-foreground/20')}
        >
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
        </button>
      </div>
      {on && <div className="mt-4">{children}</div>}
    </section>
  );
}
