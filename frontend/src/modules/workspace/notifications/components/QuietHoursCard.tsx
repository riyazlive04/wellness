import { Moon } from 'lucide-react';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import type { QuietHours } from '../types';

interface QuietHoursCardProps {
  value: QuietHours;
  onChange: (next: QuietHours) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }).map((_, i) => i);

export function QuietHoursCard({ value, onChange }: QuietHoursCardProps) {
  function toggleDay(idx: number) {
    const next = value.days.includes(idx)
      ? value.days.filter((d) => d !== idx)
      : [...value.days, idx].sort();
    onChange({ ...value, days: next });
  }

  const overnight = value.startHour > value.endHour;

  return (
    <Glass className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600/20 to-fuchsia-500/15 text-indigo-200">
            <Moon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-white">Quiet hours</div>
            <div className="text-[11px] text-white/45">
              During this window, non-urgent notifications are batched and delivered the next morning.
            </div>
          </div>
        </div>

        <Switch
          checked={value.enabled}
          onChange={(v) => onChange({ ...value, enabled: v })}
        />
      </div>

      {/* Body */}
      <div className={cn('mt-5 space-y-4', !value.enabled && 'pointer-events-none opacity-40')}>
        {/* Time pickers */}
        <div className="grid grid-cols-2 gap-3">
          <TimeField
            label="Start"
            value={value.startHour}
            onChange={(h) => onChange({ ...value, startHour: h })}
          />
          <TimeField
            label="End"
            value={value.endHour}
            onChange={(h) => onChange({ ...value, endHour: h })}
          />
        </div>

        {overnight && (
          <div className="text-[11px] text-indigo-300/80">
            Crosses midnight — quiet from {fmtHour(value.startHour)} through {fmtHour(value.endHour)} next day.
          </div>
        )}

        {/* Day picker */}
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-white/40">Days</div>
          <div className="flex flex-wrap gap-1">
            {DAYS.map((d, idx) => {
              const active = value.days.includes(idx);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    active
                      ? 'border-indigo-400/50 bg-indigo-400/15 text-indigo-100'
                      : 'border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]',
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        <div className="text-[11px] text-white/45">
          Urgent signals (failed payment, urgent client) always come through, regardless of quiet hours.
        </div>
      </div>
    </Glass>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (h: number) => void }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-white/40">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-indigo-400/60 focus:bg-white/[0.06] focus:outline-none"
      >
        {HOURS.map((h) => (
          <option key={h} value={h} className="bg-[#1B1E25]">
            {fmtHour(h)}
          </option>
        ))}
      </select>
    </label>
  );
}

function fmtHour(h: number): string {
  return `${h.toString().padStart(2, '0')}:00`;
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'grid h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-emerald-400' : 'bg-white/15',
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          'block h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}
